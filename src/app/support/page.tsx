import type { Metadata } from 'next';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { SUPPORT_TOPICS } from '@/services/support-requests';

import { submitSupportRequest } from './actions';

export const metadata: Metadata = {
  title: 'Support | ChicMagnolia',
  description:
    'Contact ChicMagnolia about an account, billing, retailer check or privacy request.',
};

export default async function SupportPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const defaultName = String(user?.user_metadata.full_name ?? '').trim();
  const defaultEmail = user?.email ?? '';

  return (
    <main className="min-h-screen px-6 py-10 sm:px-10">
      <div className="mx-auto max-w-3xl">
        <Link className="text-primary text-sm font-semibold" href="/">
          ChicMagnolia
        </Link>

        <div className="mt-6">
          <h1 className="text-4xl font-semibold sm:text-5xl">Support</h1>
          <p className="text-muted-foreground mt-4 max-w-2xl text-lg leading-8">
            Send an account, billing, retailer, privacy or security question.
            Include the product URL, saved colour and saved size when reporting
            a retailer check.
          </p>
        </div>

        {params.error ? (
          <p className="mt-6 rounded-xl bg-red-50 p-4 text-sm text-red-700">
            {params.error}
          </p>
        ) : null}
        {params.message ? (
          <p className="bg-secondary mt-6 rounded-xl p-4 text-sm">
            {params.message}
          </p>
        ) : null}

        <section className="bg-card mt-8 rounded-3xl border p-6 shadow-sm sm:p-8">
          <form action={submitSupportRequest} className="space-y-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <label className="block text-sm font-medium" htmlFor="name">
                Name
                <input
                  autoComplete="name"
                  className="mt-2 w-full rounded-xl border bg-transparent px-4 py-3"
                  defaultValue={defaultName}
                  id="name"
                  maxLength={100}
                  name="name"
                  required
                />
              </label>

              <label className="block text-sm font-medium" htmlFor="email">
                Email
                <input
                  autoComplete="email"
                  className="mt-2 w-full rounded-xl border bg-transparent px-4 py-3"
                  defaultValue={defaultEmail}
                  id="email"
                  maxLength={320}
                  name="email"
                  required
                  type="email"
                />
              </label>
            </div>

            <label className="block text-sm font-medium" htmlFor="topic">
              Topic
              <select
                className="mt-2 w-full rounded-xl border bg-transparent px-4 py-3"
                defaultValue=""
                id="topic"
                name="topic"
                required
              >
                <option disabled value="">
                  Select a topic
                </option>
                {SUPPORT_TOPICS.map((topic) => (
                  <option key={topic.value} value={topic.value}>
                    {topic.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm font-medium" htmlFor="message">
              Message
              <textarea
                className="mt-2 min-h-48 w-full rounded-xl border bg-transparent px-4 py-3"
                id="message"
                maxLength={5000}
                minLength={20}
                name="message"
                placeholder="Explain what happened, what you expected and any relevant product URL or billing detail. Do not include passwords or full card information."
                required
              />
            </label>

            <div
              aria-hidden="true"
              className="absolute top-auto -left-[10000px] h-px w-px overflow-hidden"
            >
              <label htmlFor="website">
                Website
                <input
                  autoComplete="off"
                  id="website"
                  name="website"
                  tabIndex={-1}
                />
              </label>
            </div>

            <div className="flex flex-col justify-between gap-4 border-t pt-5 sm:flex-row sm:items-center">
              <p className="text-muted-foreground max-w-xl text-sm leading-6">
                Your request is stored securely for support and audit purposes.
                See the{' '}
                <Link className="text-primary underline" href="/privacy">
                  Privacy notice
                </Link>{' '}
                for retention and rights information.
              </p>
              <Button type="submit">Send request</Button>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}
