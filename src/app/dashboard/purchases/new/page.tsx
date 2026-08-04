import Link from 'next/link';
import { redirect } from 'next/navigation';

import { SupportedRetailers } from '@/components/supported-retailers';
import { Button } from '@/components/ui/button';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { SUPPORTED_RETAILER_NAMES } from '@/retailers/catalog';
import {
  getUserSubscription,
  hasMonitoringAccess,
} from '@/services/subscription-access';

import { createPurchase } from '../actions';

const inputClassName =
  'border-input bg-background h-11 w-full rounded-md border px-3 py-2 text-sm outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-ring';

export default async function NewPurchasePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  let subscription;
  try {
    subscription = await getUserSubscription(supabase, user.id);
  } catch {
    redirect(
      '/dashboard/billing?message=We could not confirm your subscription access.',
    );
  }
  if (!hasMonitoringAccess(subscription)) {
    redirect(
      '/dashboard/billing?message=Subscribe to Chic Magnolia before adding a monitored purchase.',
    );
  }

  const params = await searchParams;

  return (
    <main className="min-h-screen px-6 py-8 sm:px-10">
      <div className="mx-auto max-w-3xl">
        <Link
          className="text-muted-foreground text-sm hover:underline"
          href="/dashboard"
        >
          ← Back to dashboard
        </Link>

        <div className="bg-card mt-6 rounded-3xl border p-6 shadow-sm sm:p-10">
          <p className="text-primary text-sm font-semibold">Chic Magnolia</p>
          <h1 className="mt-2 text-3xl font-semibold">Add a purchase</h1>
          <p className="text-muted-foreground mt-3">
            Add the details from your order confirmation so Chic Magnolia can
            track the item.
          </p>

          <SupportedRetailers
            className="mt-6 rounded-2xl border p-4"
            heading="You can currently add purchases from"
          />

          {params.error ? (
            <p className="mt-6 rounded-xl bg-red-50 p-3 text-sm text-red-700">
              {params.error}
            </p>
          ) : null}

          <form
            action={createPurchase}
            className="mt-8 grid gap-6 sm:grid-cols-2"
          >
            <label className="grid gap-2 text-sm font-medium">
              Retailer
              <select
                className={inputClassName}
                name="retailerName"
                required
                defaultValue=""
              >
                <option disabled value="">
                  Select a supported retailer
                </option>
                {SUPPORTED_RETAILER_NAMES.map((retailer) => (
                  <option key={retailer} value={retailer}>
                    {retailer}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-2 text-sm font-medium">
              Product name
              <input
                className={inputClassName}
                name="productName"
                required
                maxLength={200}
              />
            </label>

            <label className="grid gap-2 text-sm font-medium sm:col-span-2">
              Product URL
              <input
                className={inputClassName}
                name="productUrl"
                required
                type="url"
                placeholder="https://www.zara.com/..."
              />
            </label>

            <label className="grid gap-2 text-sm font-medium">
              Purchase price (£)
              <input
                className={inputClassName}
                min="0.01"
                name="purchasePrice"
                required
                step="0.01"
                type="number"
              />
            </label>

            <label className="grid gap-2 text-sm font-medium">
              Purchase date
              <input
                className={inputClassName}
                name="purchaseDate"
                required
                type="date"
              />
            </label>

            <label className="grid gap-2 text-sm font-medium">
              Return deadline
              <input
                className={inputClassName}
                name="returnDeadline"
                required
                type="date"
              />
            </label>

            <label className="grid gap-2 text-sm font-medium">
              Size{' '}
              <span className="text-muted-foreground font-normal">
                (optional)
              </span>
              <input className={inputClassName} maxLength={50} name="size" />
            </label>

            <label className="grid gap-2 text-sm font-medium sm:col-span-2">
              Colour{' '}
              <span className="text-muted-foreground font-normal">
                (optional)
              </span>
              <input className={inputClassName} maxLength={50} name="colour" />
            </label>

            <div className="flex gap-3 sm:col-span-2">
              <Button type="submit">Add purchase</Button>
              <Button asChild type="button" variant="outline">
                <Link href="/dashboard">Cancel</Link>
              </Button>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}
