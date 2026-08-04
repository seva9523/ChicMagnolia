import Link from 'next/link';
import { redirect } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { betaAccessStatusLabel } from '@/services/beta-access';
import { getUserMonitoringEntitlement } from '@/services/monitoring-access';
import {
  canStartCheckout,
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
  let access = null;
  let loadError: string | null = null;

  try {
    access = await getUserMonitoringEntitlement(supabase, user.id);
  } catch {
    loadError =
      'We could not load your access status. Please refresh the page.';
  }

  const subscription = access?.subscription ?? null;
  const betaAccess = access?.betaAccess ?? null;
  const privateBetaActive = access?.source === 'private_beta';
  const monitoringAccess = access?.hasAccess ?? false;
  const status = privateBetaActive
    ? betaAccessStatusLabel(betaAccess)
    : subscriptionStatusLabel(subscription);
  const periodEnd = subscription?.current_period_end
    ? date.format(new Date(subscription.current_period_end))
    : null;
  const betaEnd = betaAccess?.expires_at
    ? date.format(new Date(betaAccess.expires_at))
    : null;

  const checkoutMessage =
    params.checkout === 'success'
      ? 'Checkout was submitted. Paid access activates only after Chic Magnolia receives and verifies the signed Stripe webhook.'
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
            Chic Magnolia access
          </p>
          <h1 className="mt-2 text-3xl font-semibold">
            Private beta and billing
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
              {privateBetaActive ? (
                <>
                  <p className="text-sm font-semibold text-green-800">
                    Invite accepted
                  </p>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-4xl font-semibold">Free</span>
                    <span className="text-muted-foreground">
                      during the private beta
                    </span>
                  </div>
                  <p className="text-muted-foreground mt-3 text-sm">
                    No payment or test card is required. Your personal
                    invitation unlocks purchase creation, manual checks and
                    scheduled daily monitoring.
                  </p>
                </>
              ) : (
                <>
                  <div className="flex items-baseline gap-2">
                    <span className="text-4xl font-semibold">£4.99</span>
                    <span className="text-muted-foreground">per month</span>
                  </div>
                  <p className="text-muted-foreground mt-3 text-sm">
                    Stripe remains in test mode during the private beta. New
                    testers should use a personal invitation rather than a test
                    payment.
                  </p>
                </>
              )}

              <div className="mt-6 flex flex-wrap gap-3">
                {!privateBetaActive && canStartCheckout(subscription) ? (
                  <form action={startSubscriptionCheckout}>
                    <Button type="submit">Open Stripe test checkout</Button>
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
              <p className="text-muted-foreground text-sm">Access status</p>
              <p className="mt-2 text-2xl font-semibold">{status}</p>
              <p className="text-muted-foreground mt-3 text-sm">
                {monitoringAccess
                  ? 'Purchase creation, manual checks and daily monitoring are enabled.'
                  : 'Your existing purchase history remains visible, but new monitoring is disabled.'}
              </p>
              {privateBetaActive && betaEnd ? (
                <p className="text-muted-foreground mt-3 text-sm">
                  Private-beta access ends {betaEnd}.
                </p>
              ) : null}
              {!privateBetaActive && periodEnd ? (
                <p className="text-muted-foreground mt-3 text-sm">
                  Current paid period ends {periodEnd}.
                </p>
              ) : null}
              {!privateBetaActive &&
              (subscription?.status === 'past_due' ||
                subscription?.status === 'unpaid') ? (
                <p className="mt-3 text-sm text-red-700">
                  Open Manage billing to update the payment method. Monitoring
                  resumes after Stripe confirms an active subscription through
                  the webhook.
                </p>
              ) : null}
            </section>
          </div>

          <p className="text-muted-foreground mt-8 text-sm">
            Private-beta access and Stripe subscription access are recorded
            separately. Payments, invoices, payment-method updates and
            cancellation are handled on Stripe-hosted pages. Returning from
            Stripe does not itself grant access; signed webhook state is the
            source of truth. The recurring plan and cancellation rules are
            explained in the{' '}
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
