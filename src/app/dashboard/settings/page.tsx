import Link from 'next/link';
import { redirect } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { LEGAL_CONTACT_EMAIL } from '@/lib/legal';
import { createSupabaseServerClient } from '@/lib/supabase/server';

import { deleteAccount } from './actions';

const date = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string }>;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const params = await searchParams;
  const email = user.email ?? '';
  const fullName = String(user.user_metadata.full_name ?? '').trim() || 'Not provided';

  return (
    <main className="min-h-screen px-6 py-8 sm:px-10">
      <div className="mx-auto max-w-4xl">
        <Link className="text-muted-foreground text-sm hover:underline" href="/dashboard">
          ← Back to dashboard
        </Link>

        <div className="mt-6">
          <p className="text-primary text-sm font-semibold">ChicMagnolia settings</p>
          <h1 className="mt-2 text-3xl font-semibold">Account and privacy</h1>
          <p className="text-muted-foreground mt-3 max-w-2xl">
            Review account details, download a portable copy of your data or permanently
            delete the account.
          </p>
        </div>

        {params.message ? (
          <p className="mt-6 rounded-xl bg-secondary p-3 text-sm">{params.message}</p>
        ) : null}

        <div className="mt-8 grid gap-6">
          <section className="rounded-3xl border bg-card p-6 shadow-sm sm:p-8">
            <h2 className="text-xl font-semibold">Account details</h2>
            <dl className="mt-5 grid gap-5 sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground text-sm">Name</dt>
                <dd className="mt-1 font-medium">{fullName}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-sm">Email</dt>
                <dd className="mt-1 font-medium">{email}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-sm">Account created</dt>
                <dd className="mt-1 font-medium">{date.format(new Date(user.created_at))}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-sm">Legal information</dt>
                <dd className="mt-1 flex gap-4">
                  <Link className="font-medium text-primary hover:underline" href="/privacy">
                    Privacy
                  </Link>
                  <Link className="font-medium text-primary hover:underline" href="/terms">
                    Terms
                  </Link>
                </dd>
              </div>
            </dl>
          </section>

          <section className="rounded-3xl border bg-card p-6 shadow-sm sm:p-8">
            <h2 className="text-xl font-semibold">Download your data</h2>
            <p className="text-muted-foreground mt-2 max-w-2xl">
              Download a JSON file containing your account profile, legal acceptance history,
              tracked purchases, price checks, notifications and non-sensitive subscription
              status. Card details and internal Stripe identifiers are not included.
            </p>
            <Button className="mt-5" asChild variant="outline">
              <a href="/api/account/export">Download my data</a>
            </Button>
          </section>

          <section className="rounded-3xl border border-red-200 bg-card p-6 shadow-sm sm:p-8">
            <h2 className="text-xl font-semibold text-red-800">Delete account permanently</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-red-800">
              This removes the Supabase login and user-owned ChicMagnolia data. If a Stripe
              customer is linked, deletion also requests immediate removal of that Stripe
              customer and immediately ends active subscriptions. This cannot be undone.
            </p>
            <p className="text-muted-foreground mt-3 text-sm">
              Billing providers may retain limited historical records where required for
              accounting, fraud prevention or legal obligations. Questions can be sent to{' '}
              <a className="text-primary underline" href={`mailto:${LEGAL_CONTACT_EMAIL}`}>
                {LEGAL_CONTACT_EMAIL}
              </a>
              .
            </p>

            <form action={deleteAccount} className="mt-6 max-w-xl space-y-4">
              <label className="block text-sm font-medium" htmlFor="confirmationEmail">
                Type <span className="font-semibold">{email}</span> to confirm
                <input
                  autoComplete="email"
                  className="mt-2 w-full rounded-xl border bg-transparent px-4 py-3"
                  id="confirmationEmail"
                  name="confirmationEmail"
                  required
                  type="email"
                />
              </label>
              <Button type="submit" variant="destructive">
                Permanently delete my account
              </Button>
            </form>
          </section>
        </div>
      </div>
    </main>
  );
}
