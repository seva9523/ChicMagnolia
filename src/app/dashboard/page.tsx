import Link from 'next/link';
import { redirect } from 'next/navigation';

import { signOut } from '@/app/auth/actions';
import { checkCurrentPrice, updatePurchaseStatus } from '@/app/dashboard/purchases/actions';
import { Button } from '@/components/ui/button';
import { createSupabaseServerClient } from '@/lib/supabase/server';

type Purchase = {
  id: string;
  retailer_name: string;
  product_name: string;
  product_url: string;
  purchase_price_pence: number;
  current_price_pence: number | null;
  current_in_stock: boolean | null;
  last_checked_at: string | null;
  last_check_error: string | null;
  currency: string;
  purchase_date: string;
  return_deadline: string;
  size: string | null;
  colour: string | null;
  status: 'tracking' | 'returned' | 'stopped';
};

const money = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });
const date = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});
const dateTime = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string }>;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: purchases, error } = await supabase
    .from('tracked_purchases')
    .select(
      'id, retailer_name, product_name, product_url, purchase_price_pence, current_price_pence, current_in_stock, last_checked_at, last_check_error, currency, purchase_date, return_deadline, size, colour, status',
    )
    .order('created_at', { ascending: false });

  const params = await searchParams;
  const displayName = String(user.user_metadata.full_name ?? user.email ?? 'Shopper');
  const rows = (purchases ?? []) as Purchase[];
  const activeCount = rows.filter((purchase) => purchase.status === 'tracking').length;
  const potentialSavingsPence = rows.reduce((total, purchase) => {
    if (purchase.status !== 'tracking' || purchase.current_price_pence === null) return total;
    return total + Math.max(0, purchase.purchase_price_pence - purchase.current_price_pence);
  }, 0);

  return (
    <main className="min-h-screen px-6 py-8 sm:px-10">
      <header className="mx-auto flex max-w-6xl items-center justify-between border-b pb-6">
        <div>
          <p className="text-primary text-sm font-semibold">ChicMagnolia</p>
          <p className="text-muted-foreground text-sm">Post-purchase savings assistant</p>
        </div>
        <form action={signOut}>
          <Button variant="outline" type="submit">Sign out</Button>
        </form>
      </header>

      <section className="mx-auto max-w-6xl py-12">
        {params.message ? (
          <p className="mb-6 rounded-xl bg-secondary p-3 text-sm">{params.message}</p>
        ) : null}
        {error ? (
          <p className="mb-6 rounded-xl bg-red-50 p-3 text-sm text-red-700">
            We could not load your purchases. Please try again.
          </p>
        ) : null}

        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <p className="text-muted-foreground text-sm">Dashboard</p>
            <h1 className="mt-2 text-4xl font-semibold">Welcome, {displayName}</h1>
            <p className="text-muted-foreground mt-3 max-w-2xl">
              Track purchases during their return window and check supported retailer prices.
            </p>
          </div>
          <Button asChild><Link href="/dashboard/purchases/new">Add purchase</Link></Button>
        </div>

        <div className="mt-10 grid gap-5 sm:grid-cols-3">
          {[
            ['Tracked purchases', String(rows.length)],
            ['Currently tracking', String(activeCount)],
            ['Potential savings', money.format(potentialSavingsPence / 100)],
          ].map(([label, value]) => (
            <article key={label} className="rounded-2xl border bg-card p-6 shadow-sm">
              <p className="text-muted-foreground text-sm">{label}</p>
              <p className="mt-3 text-3xl font-semibold">{value}</p>
            </article>
          ))}
        </div>

        {rows.length === 0 ? (
          <div className="mt-8 rounded-3xl border bg-card p-8 text-center shadow-sm">
            <h2 className="text-xl font-semibold">No purchases tracked yet</h2>
            <p className="text-muted-foreground mx-auto mt-2 max-w-lg">
              Add a purchase to save its price, product details, and return deadline.
            </p>
            <Button className="mt-6" asChild>
              <Link href="/dashboard/purchases/new">Add your first purchase</Link>
            </Button>
          </div>
        ) : (
          <div className="mt-8 grid gap-5">
            {rows.map((purchase) => {
              const savings = purchase.current_price_pence === null
                ? 0
                : Math.max(0, purchase.purchase_price_pence - purchase.current_price_pence);

              return (
                <article key={purchase.id} className="rounded-3xl border bg-card p-6 shadow-sm">
                  <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-primary">{purchase.retailer_name}</p>
                        <span className="rounded-full bg-secondary px-3 py-1 text-xs font-medium capitalize">
                          {purchase.status}
                        </span>
                        {purchase.current_in_stock !== null ? (
                          <span className="rounded-full bg-secondary px-3 py-1 text-xs font-medium">
                            {purchase.current_in_stock ? 'In stock' : 'Out of stock'}
                          </span>
                        ) : null}
                      </div>
                      <h2 className="mt-2 text-xl font-semibold">{purchase.product_name}</h2>
                      <p className="text-muted-foreground mt-2 text-sm">
                        Purchased {date.format(new Date(`${purchase.purchase_date}T00:00:00Z`))} · Return by{' '}
                        {date.format(new Date(`${purchase.return_deadline}T00:00:00Z`))}
                      </p>
                      {purchase.size || purchase.colour ? (
                        <p className="text-muted-foreground mt-1 text-sm">
                          {[purchase.size ? `Size: ${purchase.size}` : null, purchase.colour ? `Colour: ${purchase.colour}` : null]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      ) : null}
                      <a className="mt-3 inline-block text-sm font-medium text-primary hover:underline" href={purchase.product_url} rel="noreferrer" target="_blank">
                        View retailer page
                      </a>
                    </div>

                    <div className="text-left sm:text-right">
                      <p className="text-muted-foreground text-xs">Purchase price</p>
                      <p className="text-xl font-semibold">{money.format(purchase.purchase_price_pence / 100)}</p>
                      {purchase.current_price_pence !== null ? (
                        <>
                          <p className="text-muted-foreground mt-3 text-xs">Current price</p>
                          <p className="text-2xl font-semibold">{money.format(purchase.current_price_pence / 100)}</p>
                          {savings > 0 ? (
                            <p className="mt-1 text-sm font-semibold text-green-700">
                              Save {money.format(savings / 100)}
                            </p>
                          ) : null}
                        </>
                      ) : null}
                    </div>
                  </div>

                  {purchase.last_check_error ? (
                    <p className="mt-5 rounded-xl bg-red-50 p-3 text-sm text-red-700">
                      Last price check failed: {purchase.last_check_error}
                    </p>
                  ) : null}
                  {purchase.last_checked_at ? (
                    <p className="text-muted-foreground mt-3 text-xs">
                      Last checked {dateTime.format(new Date(purchase.last_checked_at))}
                    </p>
                  ) : null}

                  {purchase.status === 'tracking' ? (
                    <div className="mt-6 flex flex-wrap gap-3 border-t pt-5">
                      <form action={checkCurrentPrice}>
                        <input name="purchaseId" type="hidden" value={purchase.id} />
                        <Button type="submit">Check current price</Button>
                      </form>
                      <form action={updatePurchaseStatus}>
                        <input name="purchaseId" type="hidden" value={purchase.id} />
                        <input name="status" type="hidden" value="returned" />
                        <Button type="submit" variant="outline">Mark as returned</Button>
                      </form>
                      <form action={updatePurchaseStatus}>
                        <input name="purchaseId" type="hidden" value={purchase.id} />
                        <input name="status" type="hidden" value="stopped" />
                        <Button type="submit" variant="outline">Stop tracking</Button>
                      </form>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
