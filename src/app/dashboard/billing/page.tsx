import Link from 'next/link';
import { redirect } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import {
  canStartCheckout,
  getUserSubscription,
  hasMonitoringAccess,
  subscriptionStatusLabel,
} from '@/services/subscription-access';

import { openCustomerPortal, startSubscriptionCheckout } from './actions';

const date = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string; checkout?: string }>;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const params = await searchParams;
  let subscription = null;
  let loadError: string | null = null;

  try {
    subscription = await getUserSubscription(supabase, user.id);
  } catch {
    loadError =
      'We could not load your billing status. Please refresh the page.';
  }

  const monitoringAccess = hasMonitoringAccess(subscription);
  const status = subscriptionStatusLabel(subscription);
  const periodEnd = subscription?.current_period_end
    ? date.format(new Date(subscription.current_period_end))
    : null;

  const checkoutMessage =
    params.checkout === 'success'
      ? 'Checkout was submitted. Paid access activates only after ChicMagnolia receives and verifies the signed Stripe webhook.'
      : params.checkout === 'cancelled'
        ? 'Checkout was canceled. No subscription access was granted.'
        : null;

  return (
    <main className="min-h-screen px-6 py-8 sm:px-10">
      <div className="mx-auto max-w-4xl">
        <nav className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <Link
            className="text-muted-foreground hover:underline"
            href="/dashboard"
          >
            ← Back to dashboard
          </Link>
          <Link
            className="text-muted-foreground hover:underline"
            href="/dashboard/settings"
          >
            Account and privacy settings
          </Link>
        </nav>

        <div className="bg-card mt-6 rounded-3xl border p-6 shadow-sm sm:p-10">
          <p className="text-primary text-sm font-semibold">
            ChicMagnolia billing
          </p>
          <h1 className="mt-2 text-3xl font-semibold">
            One simple monthly plan
          </h1>
          <p className="text-muted-foreground mt-3 max-w-2xl">
            Track up to 10 active purchases, receive one variant-aware price
            check per day and get an email when a cheaper in-stock price is
            still actionable within the return window.
          </p>

          {params.message ? (
            <p className="bg-secondary mt-6 rounded-xl p-3 text-sm">
              {params.message}
            </p>
          ) : null}
          {checkoutMessage ? (
            <p className="bg-secondary mt-6 rounded-xl p-3 text-sm">
              {checkoutMessage}
            </p>
          ) : null}
          {loadError ? (
            <p className="mt-6 rounded-xl bg-red-50 p-3 text-sm text-red-700">
              {loadError}
            </p>
          ) : null}

          <div className="mt-8 grid gap-5 md:grid-cols-[1.2fr_0.8fr]">
            <section className="rounded-2xl border p-6">
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-semibold">£4.99</span>
                <span className="text-muted-foreground">per month</span>
              </div>
              <p className="text-muted-foreground mt-3 text-sm">
                Monthly GBP subscription. No annual plan, coupon or additional
                tier is included in the MVP.
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                {canStartCheckout(subscription) ? (
                  <form action={startSubscriptionCheckout}>
                    <Button type="submit">Subscribe with Stripe</Button>
                  </form>
                ) : null}
                {subscription?.stripe_customer_id ? (
                  <form action={openCustomerPortal}>
                    <Button type="submit" variant="outline">
                      Manage billing
                    </Button>
                  </form>
                ) : null}
              </div>
            </section>

            <section className="rounded-2xl border p-6">
              <p className="text-muted-foreground text-sm">
                Subscription status
              </p>
              <p className="mt-2 text-2xl font-semibold">{status}</p>
              <p className="text-muted-foreground mt-3 text-sm">
                {monitoringAccess
                  ? 'Purchase creation, manual checks and daily monitoring are enabled.'
                  : 'Your existing purchase history remains visible, but new monitoring is disabled.'}
              </p>
              {periodEnd ? (
                <p className="text-muted-foreground mt-3 text-sm">
                  Current paid period ends {periodEnd}.
                </p>
              ) : null}
              {subscription?.status === 'past_due' ||
              subscription?.status === 'unpaid' ? (
                <p className="mt-3 text-sm text-red-700">
                  Open Manage billing to update the payment method. Monitoring
                  resumes after Stripe confirms an active subscription through
                  the webhook.
                </p>
              ) : null}
            </section>
          </div>

          <p className="text-muted-foreground mt-8 text-sm">
            Payments, invoices, payment-method updates and cancellation are
            handled on Stripe-hosted pages. Returning from Stripe does not
            itself grant access; signed webhook state is the source of truth.
            The recurring plan and cancellation rules are explained in the{' '}
            <Link className="text-primary font-medium underline" href="/terms">
              Terms of service
            </Link>
            .
          </p>
        </div>
      </div>
    </main>
  );
}
