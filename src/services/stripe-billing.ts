import type Stripe from 'stripe';

import type { SubscriptionStatus } from './subscription-access';

export type CheckoutSessionInput = {
  userId: string;
  customerId: string;
  priceId: string;
  appUrl: string;
};

export function buildCheckoutSessionParams({
  userId,
  customerId,
  priceId,
  appUrl,
}: CheckoutSessionInput): Stripe.Checkout.SessionCreateParams {
  const successUrl = new URL('/dashboard/billing?checkout=success', appUrl).toString();
  const cancelUrl = new URL('/dashboard/billing?checkout=cancelled', appUrl).toString();

  return {
    mode: 'subscription',
    customer: customerId,
    client_reference_id: userId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: { user_id: userId },
    subscription_data: {
      metadata: { user_id: userId },
    },
  };
}

export function stripeObjectId(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'id' in value) {
    const id = (value as { id?: unknown }).id;
    return typeof id === 'string' ? id : null;
  }
  return null;
}

function numericField(record: Record<string, unknown>, key: string): number | null {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function unixToIso(value: number | null): string | null {
  if (value === null) return null;
  return new Date(value * 1000).toISOString();
}

function subscriptionPeriod(subscription: Stripe.Subscription) {
  const raw = subscription as unknown as Record<string, unknown>;
  const firstItem = subscription.items.data[0] as unknown as Record<string, unknown> | undefined;

  return {
    start: unixToIso(
      numericField(raw, 'current_period_start') ??
        (firstItem ? numericField(firstItem, 'current_period_start') : null),
    ),
    end: unixToIso(
      numericField(raw, 'current_period_end') ??
        (firstItem ? numericField(firstItem, 'current_period_end') : null),
    ),
  };
}

export type StripeSubscriptionSync = {
  p_user_id: string;
  p_stripe_customer_id: string | null;
  p_stripe_subscription_id: string;
  p_stripe_price_id: string | null;
  p_status: SubscriptionStatus;
  p_cancel_at_period_end: boolean;
  p_current_period_start: string | null;
  p_current_period_end: string | null;
  p_trial_end: string | null;
  p_ended_at: string | null;
  p_event_created: number;
};

export function buildSubscriptionSync(
  subscription: Stripe.Subscription,
  userId: string,
  eventCreated: number,
): StripeSubscriptionSync {
  const raw = subscription as unknown as Record<string, unknown>;
  const period = subscriptionPeriod(subscription);
  const status = String(subscription.status) as SubscriptionStatus;

  return {
    p_user_id: userId,
    p_stripe_customer_id: stripeObjectId(subscription.customer),
    p_stripe_subscription_id: subscription.id,
    p_stripe_price_id: subscription.items.data[0]?.price.id ?? null,
    p_status: status,
    p_cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
    p_current_period_start: period.start,
    p_current_period_end: period.end,
    p_trial_end: unixToIso(numericField(raw, 'trial_end')),
    p_ended_at: unixToIso(numericField(raw, 'ended_at')),
    p_event_created: eventCreated,
  };
}

export function checkoutSessionUserId(session: Stripe.Checkout.Session): string | null {
  return session.client_reference_id ?? session.metadata?.user_id ?? null;
}

export function subscriptionMetadataUserId(subscription: Stripe.Subscription): string | null {
  return subscription.metadata.user_id ?? null;
}

export function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const raw = invoice as unknown as Record<string, unknown>;
  const legacy = stripeObjectId(raw.subscription);
  if (legacy) return legacy;

  const parent = raw.parent;
  if (!parent || typeof parent !== 'object') return null;
  const details = (parent as Record<string, unknown>).subscription_details;
  if (!details || typeof details !== 'object') return null;
  return stripeObjectId((details as Record<string, unknown>).subscription);
}

export function verifyStripeEvent(
  stripe: Stripe,
  payload: string,
  signature: string,
  webhookSecret: string,
): Stripe.Event {
  return stripe.webhooks.constructEvent(payload, signature, webhookSecret);
}
