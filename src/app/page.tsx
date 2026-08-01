import Link from 'next/link';
import { CheckCircle2, ShieldCheck } from 'lucide-react';

import { SiteFooter } from '@/components/site-footer';
import { Button } from '@/components/ui/button';

export default function Home() {
  return (
    <>
      <main className="flex min-h-screen items-center justify-center px-6 py-16">
        <section className="bg-card w-full max-w-2xl rounded-3xl border p-8 shadow-sm sm:p-12">
          <div className="bg-secondary text-secondary-foreground mb-8 inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium">
            <CheckCircle2 aria-hidden="true" className="size-4" />
            Private beta
          </div>

          <p className="text-primary mb-3 text-sm font-semibold tracking-[0.2em] uppercase">
            ChicMagnolia
          </p>
          <h1 className="font-[family-name:var(--font-display)] text-4xl leading-tight font-semibold sm:text-6xl">
            Catch price drops before your return window closes.
          </h1>
          <p className="text-muted-foreground mt-6 max-w-xl text-lg leading-8">
            ChicMagnolia helps UK shoppers monitor eligible purchases and act
            when the same saved colour and size becomes cheaper.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild>
              <Link href="/sign-up">Create account</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/login">Sign in</Link>
            </Button>
          </div>

          <div className="bg-background mt-8 flex gap-3 rounded-2xl border p-4 text-sm">
            <ShieldCheck
              aria-hidden="true"
              className="text-primary mt-0.5 size-5 shrink-0"
            />
            <p className="text-muted-foreground leading-6">
              Private dashboard data is protected by account-level access
              controls. Users can download their data or permanently delete
              their account from Settings. Read the{' '}
              <Link
                className="text-primary font-medium underline"
                href="/privacy"
              >
                Privacy notice
              </Link>{' '}
              and{' '}
              <Link
                className="text-primary font-medium underline"
                href="/terms"
              >
                Terms
              </Link>
              .
            </p>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
