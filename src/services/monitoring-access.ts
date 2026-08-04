import type { SupabaseClient } from '@supabase/supabase-js';

import {
  getUserBetaAccess,
  hasPrivateBetaAccess,
  type BetaAccessGrant,
} from '@/services/beta-access';
import {
  getUserSubscription,
  hasMonitoringAccess,
  type SubscriptionRecord,
} from '@/services/subscription-access';

export type MonitoringAccessSource = 'private_beta' | 'subscription' | null;

export function monitoringAccessSource(
  subscription: SubscriptionRecord | null | undefined,
  betaAccess: BetaAccessGrant | null | undefined,
  now = new Date(),
): MonitoringAccessSource {
  if (hasPrivateBetaAccess(betaAccess, now)) return 'private_beta';
  if (hasMonitoringAccess(subscription, now)) return 'subscription';
  return null;
}

export function hasMonitoringEntitlement(
  subscription: SubscriptionRecord | null | undefined,
  betaAccess: BetaAccessGrant | null | undefined,
  now = new Date(),
) {
  return monitoringAccessSource(subscription, betaAccess, now) !== null;
}

export async function getUserMonitoringEntitlement(
  supabase: SupabaseClient,
  userId: string,
  now = new Date(),
) {
  const [subscription, betaAccess] = await Promise.all([
    getUserSubscription(supabase, userId),
    getUserBetaAccess(supabase, userId),
  ]);
  const source = monitoringAccessSource(subscription, betaAccess, now);

  return {
    subscription,
    betaAccess,
    source,
    hasAccess: source !== null,
  };
}
