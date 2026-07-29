import Stripe from 'stripe';
import { describe, expect, it } from 'vitest';

import {
  buildCheckoutSessionParams,
  buildSubscriptionSync,
  invoiceSubscriptionId,
  verifyStripeEvent,
} from './stripe-billing';

describe('Stripe billing helpers', () => {
  it('builds hosted subscription Checkout from trusted server values', () => {
    const params = buildCheckoutSessionParams({
      userId: '00000000-0000-4000-8000-000000000001',
      customerId: 'cus_test',
      priceId: 'price_monthly',
      appUrl: 'https://chicmagnolia.com',
    });

    expect(params.mode).toBe('subscription');
    expect(params.customer).toBe('cus_test');
    expect(params.client_reference_id).toBe('00000000-0000-4000-8000-000000000001');
    expect(params.line_items).toEqual([{ price: 'price_monthly', quantity: 1 }]);
    expect(params.subscription_data?.metadata?.user_id).toBe(
      '00000000-0000-4000-8000-000000000001',
    );
    expect(params.success_url).toContain('/dashboard/billing?checkout=success');
    expect(params.cancel_url).toContain('/dashboard/billing?checkout=cancelled');
  });

  it('normalizes subscription periods from current Stripe subscription-item fields', () => {
    const subscription = {
      id: 'sub_test',
      status: 'active',
      customer: 'cus_test',
      cancel_at_period_end: true,
      metadata: { user_id: '00000000-0000-4000-8000-000000000001' },
      trial_end: null,
      ended_at: null,
      items: {
        data: [
          {
            current_period_start: 1782864000,
            current_period_end: 1785542400,
            price: { id: 'price_monthly' },
          },
        ],
      },
    } as unknown as Stripe.Subscription;

    const sync = buildSubscriptionSync(
      subscription,
      '00000000-0000-4000-8000-000000000001',
      1785340000,
    );

    expect(sync.p_status).toBe('active');
    expect(sync.p_stripe_customer_id).toBe('cus_test');
    expect(sync.p_stripe_price_id).toBe('price_monthly');
    expect(sync.p_cancel_at_period_end).toBe(true);
    expect(sync.p_current_period_start).toBe('2026-07-01T00:00:00.000Z');
    expect(sync.p_current_period_end).toBe('2026-08-01T00:00:00.000Z');
  });

  it('supports the current invoice parent subscription reference', () => {
    const invoice = {
      parent: {
        subscription_details: {
          subscription: 'sub_current',
        },
      },
    } as unknown as Stripe.Invoice;

    expect(invoiceSubscriptionId(invoice)).toBe('sub_current');
  });

  it('rejects an invalid Stripe webhook signature', () => {
    const stripe = new Stripe('sk_test_placeholder');
    const payload = JSON.stringify({ id: 'evt_test', object: 'event' });
    const validHeader = Stripe.webhooks.generateTestHeaderString({
      payload,
      secret: 'whsec_test',
    });

    expect(verifyStripeEvent(stripe, payload, validHeader, 'whsec_test').id).toBe('evt_test');
    expect(() => verifyStripeEvent(stripe, payload, validHeader, 'whsec_wrong')).toThrow();
  });
});
