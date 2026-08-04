import { NextResponse } from 'next/server';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import { buildAccountExport } from '@/services/account-export';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function missingOptionalRelation(error: { code?: string } | null): boolean {
  return Boolean(error && ['42P01', 'PGRST205'].includes(error.code ?? ''));
}

function throwForError(error: { message: string } | null, context: string) {
  if (error) throw new Error(`${context}: ${error.message}`);
}

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: 'Authentication required.' },
      { status: 401 },
    );
  }

  try {
    const [
      profile,
      legal,
      purchases,
      checks,
      notifications,
      subscription,
      betaAccess,
    ] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, email, full_name, created_at, updated_at')
        .eq('id', user.id)
        .maybeSingle(),
      supabase
        .from('legal_acceptances')
        .select('terms_version, privacy_version, source, accepted_at')
        .eq('user_id', user.id)
        .order('accepted_at', { ascending: true }),
      supabase
        .from('tracked_purchases')
        .select(
          'id, retailer_name, product_name, product_url, purchase_price_pence, current_price_pence, current_in_stock, last_checked_at, last_check_error, currency, purchase_date, return_deadline, size, colour, status, created_at, updated_at',
        )
        .eq('user_id', user.id)
        .order('created_at', { ascending: true }),
      supabase
        .from('price_checks')
        .select(
          'id, purchase_id, price_pence, currency, in_stock, checked_at, error_message',
        )
        .eq('user_id', user.id)
        .order('checked_at', { ascending: true }),
      supabase
        .from('notification_history')
        .select(
          'id, purchase_id, notification_type, channel, status, purchase_price_pence, current_price_pence, savings_pence, error_message, sent_at, created_at',
        )
        .eq('user_id', user.id)
        .order('created_at', { ascending: true }),
      supabase
        .from('subscriptions')
        .select(
          'status, cancel_at_period_end, current_period_start, current_period_end, trial_end, ended_at, created_at, updated_at',
        )
        .eq('user_id', user.id)
        .maybeSingle(),
      supabase
        .from('beta_access_grants')
        .select('starts_at, expires_at, revoked_at, created_at, updated_at')
        .eq('user_id', user.id)
        .maybeSingle(),
    ]);

    throwForError(profile.error, 'Profile export failed');
    if (legal.error && !missingOptionalRelation(legal.error)) {
      throwForError(legal.error, 'Legal acceptance export failed');
    }
    throwForError(purchases.error, 'Purchase export failed');
    throwForError(checks.error, 'Price-check export failed');
    throwForError(notifications.error, 'Notification export failed');
    throwForError(subscription.error, 'Subscription export failed');
    if (betaAccess.error && !missingOptionalRelation(betaAccess.error)) {
      throwForError(betaAccess.error, 'Private beta access export failed');
    }

    const now = new Date();
    const payload = buildAccountExport({
      exportedAt: now.toISOString(),
      account: {
        id: user.id,
        email: user.email ?? null,
        createdAt: user.created_at,
        lastSignInAt: user.last_sign_in_at ?? null,
      },
      profile: profile.data,
      legalAcceptances: legal.error ? [] : (legal.data ?? []),
      purchases: purchases.data ?? [],
      priceChecks: checks.data ?? [],
      notifications: notifications.data ?? [],
      subscription: subscription.data,
      betaAccess: betaAccess.error ? null : betaAccess.data,
    });
    const filename = `chicmagnolia-data-${now.toISOString().slice(0, 10)}.json`;

    return new Response(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: {
        'cache-control': 'private, no-store, max-age=0',
        'content-disposition': `attachment; filename="${filename}"`,
        'content-type': 'application/json; charset=utf-8',
      },
    });
  } catch {
    return NextResponse.json(
      { error: 'Your account data could not be exported. Please try again.' },
      { status: 500, headers: { 'cache-control': 'no-store' } },
    );
  }
}
