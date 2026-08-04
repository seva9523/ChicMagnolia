import { describe, expect, it } from 'vitest';

import type { BetaAccessGrant } from './beta-access';
import {
  hasMonitoringEntitlement,
  monitoringAccessSource,
} from './monitoring-access';
import type { SubscriptionRecord } from './subscription-access';

const now = new Date('2026-08-04T12:00:00.000Z');

function subscription(
  overrides: Partial<SubscriptionRecord> = {},
): SubscriptionRecord {
  return {
    user_id: '00000000-0000-4000-8000-000000000001',
    stripe_customer_id: 'cus_test',
    stripe_subscription_id: 'sub_test',
    stripe_price_id: 'price_test',
    status: 'active',
    cancel_at_period_end: false,
    current_period_start: '2026-08-01T00:00:00.000Z',
    current_period_end: '2026-09-01T00:00:00.000Z',
    trial_end: null,
    ended_at: null,
    last_event_created: 1,
    ...overrides,
  };
}

function betaAccess(
  overrides: Partial<BetaAccessGrant> = {},
): BetaAccessGrant {
  return {
    user_id: '00000000-0000-4000-8000-000000000001',
    invite_id: '00000000-0000-4000-8000-000000000002',
    starts_at: '2026-08-04T10:00:00.000Z',
    expires_at: null,
    revoked_at: null,
    ...overrides,
  };
}

describe('monitoring entitlement', () => {
  it('grants monitoring through an active private beta grant without Stripe', () => {
    expect(monitoringAccessSource(null, betaAccess(), now)).toBe(
      'private_beta',
    );
    expect(hasMonitoringEntitlement(null, betaAccess(), now)).toBe(true);
  });

  it('falls back to an active Stripe subscription', () => {
    expect(monitoringAccessSource(subscription(), null, now)).toBe(
      'subscription',
    );
    expect(hasMonitoringEntitlement(subscription(), null, now)).toBe(true);
  });

  it('prefers private beta access when both sources are active', () => {
    expect(
      monitoringAccessSource(subscription(), betaAccess(), now),
    ).toBe('private_beta');
  });

  it('denies access when both sources are inactive', () => {
    expect(
      hasMonitoringEntitlement(
        subscription({ status: 'canceled' }),
        betaAccess({ revoked_at: '2026-08-04T11:00:00.000Z' }),
        now,
      ),
    ).toBe(false);
  });
});
