import 'server-only';

import Stripe from 'stripe';

import { serverEnv } from '@/lib/env/server';

let stripeClient: Stripe | undefined;

export function getStripeClient() {
  if (!serverEnv.STRIPE_SECRET_KEY) {
    throw new Error('Stripe is not configured.');
  }

  stripeClient ??= new Stripe(serverEnv.STRIPE_SECRET_KEY);
  return stripeClient;
}
