import type { SupabaseClient } from '@supabase/supabase-js';

export const stripeSubscriptionStatuses = [
  'inactive',
  'incomplete',
  'incomplete_expired',
  'trialing',
  'active',
  'past_due',
  'canceled',
  'unpaid',
  'paused',
] as const;

export type SubscriptionStatus = (typeof stripeSubscriptionStatuses)[number];

export type SubscriptionRecord = {
  user_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_price_id: string | null;
  status: SubscriptionStatus;
  cancel_at_period_end: boolean;
  current_period_start: string | null;
  current_period_end: string | null;
  trial_end: string | null;
  ended_at: string | null;
  last_event_created: number;
};

function isFuture(value: string | null, now: Date) {
  if (!value) return false;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) && timestamp > now.getTime();
}

export function hasMonitoringAccess(
  subscription: SubscriptionRecord | null | undefined,
  now = new Date(),
): boolean {
  if (!subscription) return false;

  if (subscription.status === 'trialing') {
    if (subscription.trial_end && !isFuture(subscription.trial_end, now)) return false;
    if (subscription.current_period_end && !isFuture(subscription.current_period_end, now)) {
      return false;
    }
    return true;
  }

  if (subscription.status !== 'active') return false;

  if (subscription.cancel_at_period_end) {
    return isFuture(subscription.current_period_end, now);
  }

  return true;
}

export function canStartCheckout(subscription: SubscriptionRecord | null | undefined): boolean {
  if (!subscription) return true;
  return ['inactive', 'canceled', 'incomplete_expired'].includes(subscription.status);
}

export function subscriptionStatusLabel(
  subscription: SubscriptionRecord | null | undefined,
  now = new Date(),
): string {
  if (!subscription || subscription.status === 'inactive') return 'Not subscribed';

  if (subscription.status === 'trialing') {
    return hasMonitoringAccess(subscription, now) ? 'Trial active' : 'Trial ended';
  }

  if (subscription.status === 'active' && subscription.cancel_at_period_end) {
    return hasMonitoringAccess(subscription, now) ? 'Canceling at period end' : 'Canceled';
  }

  const labels: Record<SubscriptionStatus, string> = {
    inactive: 'Not subscribed',
    incomplete: 'Payment incomplete',
    incomplete_expired: 'Checkout expired',
    trialing: 'Trial active',
    active: 'Active',
    past_due: 'Payment overdue',
    canceled: 'Canceled',
    unpaid: 'Unpaid',
    paused: 'Paused',
  };

  return labels[subscription.status];
}

export async function getUserSubscription(
  supabase: SupabaseClient,
  userId: string,
): Promise<SubscriptionRecord | null> {
  const { data, error } = await supabase
    .from('subscriptions')
    .select(
      'user_id, stripe_customer_id, stripe_subscription_id, stripe_price_id, status, cancel_at_period_end, current_period_start, current_period_end, trial_end, ended_at, last_event_created',
    )
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as SubscriptionRecord | null) ?? null;
}
