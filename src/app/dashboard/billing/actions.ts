'use server';

import { redirect } from 'next/navigation';

import { getStripeClient } from '@/integrations/stripe';
import { clientEnv } from '@/lib/env/client';
import { serverEnv } from '@/lib/env/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import {
  canStartCheckout,
  getUserSubscription,
} from '@/services/subscription-access';
import { buildCheckoutSessionParams } from '@/services/stripe-billing';

function billingRedirect(message: string): never {
  redirect(`/dashboard/billing?message=${encodeURIComponent(message)}`);
}

export async function startSubscriptionCheckout() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');
  if (!user.email_confirmed_at) {
    billingRedirect('Confirm your email before starting a subscription.');
  }
  if (!user.email) billingRedirect('Your account does not have a billing email.');
  if (!serverEnv.STRIPE_PRICE_ID) billingRedirect('Stripe pricing is not configured yet.');

  let subscription;
  try {
    subscription = await getUserSubscription(supabase, user.id);
  } catch {
    billingRedirect('We could not load your billing status.');
  }

  if (!canStartCheckout(subscription)) {
    billingRedirect('Use Manage billing to update the subscription already linked to this account.');
  }

  const stripe = getStripeClient();
  let customerId = subscription?.stripe_customer_id ?? null;

  if (!customerId) {
    try {
      const customer = await stripe.customers.create(
        {
          email: user.email,
          name: String(user.user_metadata.full_name ?? '').trim() || undefined,
          metadata: { user_id: user.id },
        },
        { idempotencyKey: `chicmagnolia-customer-${user.id}` },
      );
      customerId = customer.id;

      const admin = createSupabaseAdminClient();
      const { error } = await admin.from('subscriptions').upsert(
        {
          user_id: user.id,
          stripe_customer_id: customerId,
          status: 'inactive',
        },
        { onConflict: 'user_id' },
      );
      if (error) throw new Error(error.message);
    } catch {
      billingRedirect('We could not create your Stripe customer. Please try again.');
    }
  }

  let checkoutUrl: string | null = null;
  try {
    const minuteBucket = Math.floor(Date.now() / 60_000);
    const session = await stripe.checkout.sessions.create(
      buildCheckoutSessionParams({
        userId: user.id,
        customerId,
        priceId: serverEnv.STRIPE_PRICE_ID,
        appUrl: clientEnv.NEXT_PUBLIC_APP_URL,
      }),
      {
        idempotencyKey: `chicmagnolia-checkout-${user.id}-${serverEnv.STRIPE_PRICE_ID}-${minuteBucket}`,
      },
    );
    checkoutUrl = session.url;
  } catch {
    billingRedirect('We could not start Stripe Checkout. Please try again.');
  }

  if (!checkoutUrl) billingRedirect('Stripe Checkout did not return a payment URL.');
  redirect(checkoutUrl);
}

export async function openCustomerPortal() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  let customerId: string | null = null;
  try {
    const subscription = await getUserSubscription(supabase, user.id);
    customerId = subscription?.stripe_customer_id ?? null;
  } catch {
    billingRedirect('We could not load your billing account.');
  }

  if (!customerId) billingRedirect('No Stripe billing account is linked yet.');

  let portalUrl: string | null = null;
  try {
    const session = await getStripeClient().billingPortal.sessions.create({
      customer: customerId,
      return_url: new URL('/dashboard/billing', clientEnv.NEXT_PUBLIC_APP_URL).toString(),
    });
    portalUrl = session.url;
  } catch {
    billingRedirect('We could not open the Stripe Customer Portal.');
  }

  redirect(portalUrl);
}
