import { describe, expect, it } from 'vitest';

import {
  canStartCheckout,
  hasMonitoringAccess,
  subscriptionStatusLabel,
  type SubscriptionRecord,
} from './subscription-access';

const now = new Date('2026-07-29T12:00:00.000Z');

function subscription(overrides: Partial<SubscriptionRecord> = {}): SubscriptionRecord {
  return {
    user_id: '00000000-0000-4000-8000-000000000001',
    stripe_customer_id: 'cus_test',
    stripe_subscription_id: 'sub_test',
    stripe_price_id: 'price_test',
    status: 'active',
    cancel_at_period_end: false,
    current_period_start: '2026-07-01T00:00:00.000Z',
    current_period_end: '2026-08-01T00:00:00.000Z',
    trial_end: null,
    ended_at: null,
    last_event_created: 1,
    ...overrides,
  };
}

describe('subscription access', () => {
  it('allows active and trialing subscriptions', () => {
    expect(hasMonitoringAccess(subscription(), now)).toBe(true);
    expect(
      hasMonitoringAccess(
        subscription({ status: 'trialing', trial_end: '2026-08-05T00:00:00.000Z' }),
        now,
      ),
    ).toBe(true);
  });

  it('keeps cancel-at-period-end access only until the paid period ends', () => {
    const canceling = subscription({ cancel_at_period_end: true });
    expect(hasMonitoringAccess(canceling, now)).toBe(true);
    expect(hasMonitoringAccess(canceling, new Date('2026-08-01T00:00:01.000Z'))).toBe(false);
    expect(subscriptionStatusLabel(canceling, now)).toBe('Canceling at period end');
  });

  it('denies monitoring for past-due, unpaid, canceled and incomplete states', () => {
    for (const status of ['past_due', 'unpaid', 'canceled', 'incomplete', 'paused'] as const) {
      expect(hasMonitoringAccess(subscription({ status }), now)).toBe(false);
    }
  });

  it('allows a new checkout only when no live subscription needs recovery or management', () => {
    expect(canStartCheckout(null)).toBe(true);
    expect(canStartCheckout(subscription({ status: 'inactive' }))).toBe(true);
    expect(canStartCheckout(subscription({ status: 'canceled' }))).toBe(true);
    expect(canStartCheckout(subscription({ status: 'incomplete_expired' }))).toBe(true);
    expect(canStartCheckout(subscription({ status: 'active' }))).toBe(false);
    expect(canStartCheckout(subscription({ status: 'past_due' }))).toBe(false);
  });
});
