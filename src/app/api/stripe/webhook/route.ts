import type Stripe from 'stripe';
import type { SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

import { getStripeClient } from '@/integrations/stripe';
import { serverEnv } from '@/lib/env/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { isStripeResourceMissing } from '@/services/account-lifecycle';
import {
  buildSubscriptionSync,
  checkoutSessionUserId,
  invoiceSubscriptionId,
  stripeObjectId,
  subscriptionMetadataUserId,
  verifyStripeEvent,
} from '@/services/stripe-billing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Stripe webhook processing failed.';
}

async function claimEvent(
  supabase: SupabaseClient,
  event: Stripe.Event,
): Promise<'process' | 'duplicate' | 'in_progress'> {
  const { error: insertError } = await supabase.from('stripe_webhook_events').insert({
    stripe_event_id: event.id,
    event_type: event.type,
    event_created: event.created,
    processing_status: 'processing',
    error_message: null,
    processed_at: null,
  });

  if (!insertError) return 'process';
  if (insertError.code !== '23505') throw new Error(insertError.message);

  const { data: existing, error: existingError } = await supabase
    .from('stripe_webhook_events')
    .select('processing_status, updated_at')
    .eq('stripe_event_id', event.id)
    .single();
  if (existingError) throw new Error(existingError.message);
  if (existing.processing_status === 'processed') return 'duplicate';

  const updatedAt = new Date(existing.updated_at).getTime();
  const recentlyClaimed =
    existing.processing_status === 'processing' &&
    Number.isFinite(updatedAt) &&
    Date.now() - updatedAt < 5 * 60 * 1000;
  if (recentlyClaimed) return 'in_progress';

  const { error: retryError } = await supabase
    .from('stripe_webhook_events')
    .update({
      processing_status: 'processing',
      event_type: event.type,
      event_created: event.created,
      error_message: null,
      processed_at: null,
    })
    .eq('stripe_event_id', event.id);
  if (retryError) throw new Error(retryError.message);

  return 'process';
}

async function markEventProcessed(supabase: SupabaseClient, eventId: string) {
  const { error } = await supabase
    .from('stripe_webhook_events')
    .update({
      processing_status: 'processed',
      processed_at: new Date().toISOString(),
      error_message: null,
    })
    .eq('stripe_event_id', eventId);
  if (error) throw new Error(error.message);
}

async function markEventFailed(supabase: SupabaseClient, eventId: string, message: string) {
  await supabase
    .from('stripe_webhook_events')
    .update({
      processing_status: 'failed',
      processed_at: null,
      error_message: message.slice(0, 1000),
    })
    .eq('stripe_event_id', eventId);
}

async function existingUserId(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.id ?? null;
}

async function linkCheckoutCustomer(
  supabase: SupabaseClient,
  session: Stripe.Checkout.Session,
) {
  const userId = checkoutSessionUserId(session);
  const customerId = stripeObjectId(session.customer);
  if (!userId || !customerId) {
    throw new Error('Checkout Session is missing its trusted user mapping.');
  }

  // A Checkout event can arrive after a user has deleted the account. In that case,
  // acknowledge the signed event without recreating an application record.
  if (!(await existingUserId(supabase, userId))) return;

  const { data: existing, error: existingError } = await supabase
    .from('subscriptions')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle();
  if (existingError) throw new Error(existingError.message);

  const operation = existing
    ? supabase
        .from('subscriptions')
        .update({ stripe_customer_id: customerId })
        .eq('user_id', userId)
    : supabase.from('subscriptions').insert({
        user_id: userId,
        stripe_customer_id: customerId,
        status: 'inactive',
      });

  const { error } = await operation;
  if (error) throw new Error(error.message);
}

async function mappedUserId(
  supabase: SupabaseClient,
  subscription: Stripe.Subscription,
): Promise<string | null> {
  const metadataUserId = subscriptionMetadataUserId(subscription);
  if (metadataUserId) return existingUserId(supabase, metadataUserId);

  const { data: bySubscription, error: subscriptionError } = await supabase
    .from('subscriptions')
    .select('user_id')
    .eq('stripe_subscription_id', subscription.id)
    .maybeSingle();
  if (subscriptionError) throw new Error(subscriptionError.message);
  if (bySubscription?.user_id) {
    return existingUserId(supabase, bySubscription.user_id);
  }

  const customerId = stripeObjectId(subscription.customer);
  if (customerId) {
    const { data: byCustomer, error: customerError } = await supabase
      .from('subscriptions')
      .select('user_id')
      .eq('stripe_customer_id', customerId)
      .maybeSingle();
    if (customerError) throw new Error(customerError.message);
    if (byCustomer?.user_id) return existingUserId(supabase, byCustomer.user_id);
  }

  return null;
}

async function syncSubscription(
  supabase: SupabaseClient,
  subscription: Stripe.Subscription,
  eventCreated: number,
) {
  const userId = await mappedUserId(supabase, subscription);
  if (!userId) return;

  const { error } = await supabase.rpc(
    'sync_stripe_subscription',
    buildSubscriptionSync(subscription, userId, eventCreated),
  );
  if (error) throw new Error(error.message);
}

async function retrieveSubscriptionIfPresent(stripe: Stripe, subscriptionId: string) {
  try {
    return await stripe.subscriptions.retrieve(subscriptionId);
  } catch (error) {
    if (isStripeResourceMissing(error)) return null;
    throw error;
  }
}

async function processEvent(
  event: Stripe.Event,
  stripe: Stripe,
  supabase: SupabaseClient,
) {
  switch (event.type) {
    case 'checkout.session.completed':
      await linkCheckoutCustomer(supabase, event.data.object as Stripe.Checkout.Session);
      return;

    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.paused':
    case 'customer.subscription.resumed': {
      const eventSubscription = event.data.object as Stripe.Subscription;
      const latest = await retrieveSubscriptionIfPresent(stripe, eventSubscription.id);
      if (latest) await syncSubscription(supabase, latest, event.created);
      return;
    }

    case 'customer.subscription.deleted':
      await syncSubscription(supabase, event.data.object as Stripe.Subscription, event.created);
      return;

    case 'invoice.paid':
    case 'invoice.payment_succeeded':
    case 'invoice.payment_failed':
    case 'invoice.payment_action_required': {
      const subscriptionId = invoiceSubscriptionId(event.data.object as Stripe.Invoice);
      if (!subscriptionId) return;
      const latest = await retrieveSubscriptionIfPresent(stripe, subscriptionId);
      if (latest) await syncSubscription(supabase, latest, event.created);
      return;
    }

    default:
      return;
  }
}

export async function POST(request: Request) {
  if (!serverEnv.STRIPE_SECRET_KEY || !serverEnv.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Stripe webhooks are not configured.' }, { status: 503 });
  }

  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing Stripe signature.' }, { status: 400 });
  }

  const payload = await request.text();
  const stripe = getStripeClient();
  let event: Stripe.Event;

  try {
    event = verifyStripeEvent(stripe, payload, signature, serverEnv.STRIPE_WEBHOOK_SECRET);
  } catch {
    return NextResponse.json({ error: 'Invalid Stripe signature.' }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();

  try {
    const claim = await claimEvent(supabase, event);
    if (claim === 'duplicate') {
      return NextResponse.json({ received: true, duplicate: true });
    }
    if (claim === 'in_progress') {
      return NextResponse.json(
        { error: 'Stripe event is already being processed.' },
        { status: 409, headers: { 'retry-after': '60' } },
      );
    }

    await processEvent(event, stripe, supabase);
    await markEventProcessed(supabase, event.id);
    return NextResponse.json({ received: true });
  } catch (error) {
    const message = errorMessage(error);
    await markEventFailed(supabase, event.id, message);
    return NextResponse.json({ error: 'Stripe event processing failed.' }, { status: 500 });
  }
}
