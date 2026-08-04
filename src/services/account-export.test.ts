import { describe, expect, it } from 'vitest';

import { buildAccountExport } from './account-export';

describe('account export', () => {
  it('includes user-owned records without exposing internal access identifiers', () => {
    const exported = buildAccountExport({
      exportedAt: '2026-08-04T10:00:00.000Z',
      account: {
        id: 'user-1',
        email: 'shopper@example.com',
        createdAt: '2026-07-01T10:00:00.000Z',
        lastSignInAt: '2026-08-04T09:00:00.000Z',
      },
      profile: { full_name: 'Shopper' },
      legalAcceptances: [{ terms_version: '2026-08-04' }],
      purchases: [{ id: 'purchase-1' }],
      priceChecks: [{ id: 'check-1' }],
      notifications: [{ id: 'notification-1' }],
      subscription: {
        status: 'active',
        cancel_at_period_end: false,
        current_period_end: '2026-08-31T10:00:00.000Z',
        stripe_customer_id: 'cus_secret',
        stripe_subscription_id: 'sub_secret',
        stripe_price_id: 'price_secret',
        last_event_created: 123,
      },
      betaAccess: {
        starts_at: '2026-08-04T10:00:00.000Z',
        expires_at: null,
        revoked_at: null,
        created_at: '2026-08-04T10:00:00.000Z',
        invite_id: 'invite-secret',
      },
    });

    expect(exported.format_version).toBe(2);
    expect(exported.account.email).toBe('shopper@example.com');
    expect(exported.tracked_purchases).toEqual([{ id: 'purchase-1' }]);
    expect(exported.subscription).toMatchObject({
      status: 'active',
      current_period_end: '2026-08-31T10:00:00.000Z',
    });
    expect(exported.private_beta_access).toMatchObject({
      starts_at: '2026-08-04T10:00:00.000Z',
      revoked_at: null,
    });
    expect(JSON.stringify(exported)).not.toContain('cus_secret');
    expect(JSON.stringify(exported)).not.toContain('sub_secret');
    expect(JSON.stringify(exported)).not.toContain('price_secret');
    expect(JSON.stringify(exported)).not.toContain('last_event_created');
    expect(JSON.stringify(exported)).not.toContain('invite-secret');
  });
});
