import { redirect } from 'next/navigation';

import { signOut } from '@/app/auth/actions';
import { Button } from '@/components/ui/button';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ message?: string }> }) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const params = await searchParams;
  const displayName = String(user.user_metadata.full_name ?? user.email ?? 'Shopper');

  return (
    <main className="min-h-screen px-6 py-8 sm:px-10">
      <header className="mx-auto flex max-w-6xl items-center justify-between border-b pb-6">
        <div>
          <p className="text-primary text-sm font-semibold">ChicMagnolia</p>
          <p className="text-muted-foreground text-sm">Post-purchase savings assistant</p>
        </div>
        <form action={signOut}><Button variant="outline" type="submit">Sign out</Button></form>
      </header>

      <section className="mx-auto max-w-6xl py-12">
        {params.message ? <p className="mb-6 rounded-xl bg-green-50 p-3 text-sm text-green-700">{params.message}</p> : null}
        <p className="text-muted-foreground text-sm">Dashboard</p>
        <h1 className="mt-2 text-4xl font-semibold">Welcome, {displayName}</h1>
        <p className="text-muted-foreground mt-3 max-w-2xl">Your account is ready. Purchase tracking will be added in Sprint 2.</p>

        <div className="mt-10 grid gap-5 sm:grid-cols-3">
          {[
            ['Tracked purchases', '0'],
            ['Active price drops', '0'],
            ['Potential savings', '£0.00'],
          ].map(([label, value]) => (
            <article key={label} className="bg-card rounded-2xl border p-6 shadow-sm">
              <p className="text-muted-foreground text-sm">{label}</p>
              <p className="mt-3 text-3xl font-semibold">{value}</p>
            </article>
          ))}
        </div>

        <div className="bg-card mt-8 rounded-3xl border p-8 text-center shadow-sm">
          <h2 className="text-xl font-semibold">No purchases tracked yet</h2>
          <p className="text-muted-foreground mx-auto mt-2 max-w-lg">In the next sprint, you will be able to add an eligible purchase and monitor its price and return deadline.</p>
          <Button className="mt-6" disabled>Add your first purchase</Button>
        </div>
      </section>
    </main>
  );
}
