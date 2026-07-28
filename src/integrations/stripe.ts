import 'server-only';

import Stripe from 'stripe';

import { serverEnv } from '@/lib/env/server';

let stripeClient: Stripe | undefined;

export function getStripeClient() {
  stripeClient ??= new Stripe(serverEnv.STRIPE_SECRET_KEY);
  return stripeClient;
}
