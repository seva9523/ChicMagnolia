import { timingSafeEqual } from 'node:crypto';

import { NextResponse } from 'next/server';

import { serverEnv } from '@/lib/env/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import {
  monitorTrackedPurchase,
  type TrackedPurchaseForCheck,
} from '@/services/price-monitoring';
import {
  hasMonitoringAccess,
  type SubscriptionRecord,
} from '@/services/subscription-access';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BATCH_SIZE = 3;
const MAX_BETA_PURCHASES = 500;

function authorized(request: Request) {
  const expected = serverEnv.CRON_SECRET;
  if (!expected) return false;

  const header = request.headers.get('authorization') ?? '';
  const provided = header.replace(/^Bearer\s+/i, '');
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);

  return (
    expectedBuffer.length === providedBuffer.length &&
    timingSafeEqual(expectedBuffer, providedBuffer)
  );
}

function dueDateBounds(now: Date) {
  const today = now.toISOString().slice(0, 10);
  return {
    today,
    startOfToday: `${today}T00:00:00.000Z`,
  };
}

export async function POST(request: Request) {
  if (!serverEnv.CRON_SECRET || !serverEnv.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: 'Daily monitoring is not configured.' },
      { status: 503 },
    );
  }
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const now = new Date();
  const { today, startOfToday } = dueDateBounds(now);
  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase
    .from('tracked_purchases')
    .select(
      'id, user_id, retailer_name, product_name, product_url, purchase_price_pence, currency, return_deadline, size, colour, status',
    )
    .eq('status', 'tracking')
    .gte('return_deadline', today)
    .or(`last_checked_at.is.null,last_checked_at.lt.${startOfToday}`)
    .order('last_checked_at', { ascending: true, nullsFirst: true })
    .limit(MAX_BETA_PURCHASES);

  if (error) {
    return NextResponse.json(
      { error: `Could not load purchases: ${error.message}` },
      { status: 500 },
    );
  }

  const duePurchases = (data ?? []) as TrackedPurchaseForCheck[];
  const dueUserIds = [
    ...new Set(duePurchases.map((purchase) => purchase.user_id)),
  ];
  const subscriptions = new Map<string, SubscriptionRecord>();

  if (dueUserIds.length > 0) {
    const { data: subscriptionRows, error: subscriptionError } = await supabase
      .from('subscriptions')
      .select(
        'user_id, stripe_customer_id, stripe_subscription_id, stripe_price_id, status, cancel_at_period_end, current_period_start, current_period_end, trial_end, ended_at, last_event_created',
      )
      .in('user_id', dueUserIds);

    if (subscriptionError) {
      return NextResponse.json(
        {
          error: `Could not load subscription access: ${subscriptionError.message}`,
        },
        { status: 500 },
      );
    }

    for (const subscription of (subscriptionRows ??
      []) as SubscriptionRecord[]) {
      subscriptions.set(subscription.user_id, subscription);
    }
  }

  const eligibleDuePurchases = duePurchases.filter((purchase) =>
    hasMonitoringAccess(subscriptions.get(purchase.user_id), now),
  );
  const purchases = eligibleDuePurchases.slice(0, BATCH_SIZE);
  const userIds = [...new Set(purchases.map((purchase) => purchase.user_id))];
  const emails = new Map<string, string>();
  let profileLookupError: string | null = null;

  if (userIds.length > 0) {
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, email')
      .in('id', userIds);

    if (profilesError) {
      profileLookupError = profilesError.message;
    } else {
      for (const profile of profiles ?? []) {
        if (profile.email) emails.set(profile.id, profile.email);
      }
    }
  }

  const outcomes = await Promise.all(
    purchases.map((purchase) =>
      monitorTrackedPurchase(
        supabase,
        purchase,
        emails.get(purchase.user_id) ?? null,
        now,
      ),
    ),
  );

  const response = {
    processed: purchases.length,
    succeeded: outcomes.filter((outcome) => outcome.check === 'succeeded')
      .length,
    failed: outcomes.filter((outcome) => outcome.check === 'failed').length,
    alertsSent: outcomes.filter((outcome) => outcome.alert === 'sent').length,
    duplicateAlertsSkipped: outcomes.filter(
      (outcome) => outcome.alert === 'duplicate',
    ).length,
    alertsNotEligible: outcomes.filter(
      (outcome) => outcome.alert === 'not_eligible',
    ).length,
    missingEmail: outcomes.filter(
      (outcome) => outcome.alert === 'missing_email',
    ).length,
    alertFailures: outcomes.filter((outcome) => outcome.alert === 'failed')
      .length,
    billingIneligibleSkipped: duePurchases.length - eligibleDuePurchases.length,
    remaining: Math.max(0, eligibleDuePurchases.length - purchases.length),
    checkedAt: now.toISOString(),
    profileLookupError,
  };

  return NextResponse.json(response, {
    headers: { 'cache-control': 'no-store' },
  });
}
