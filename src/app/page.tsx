import { CheckCircle2 } from 'lucide-react';

import { Button } from '@/components/ui/button';

export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-16">
      <section className="bg-card w-full max-w-2xl rounded-3xl border p-8 shadow-sm sm:p-12">
        <div className="bg-secondary text-secondary-foreground mb-8 inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium">
          <CheckCircle2 aria-hidden="true" className="size-4" />
          Sprint 0 foundation is running
        </div>

        <p className="text-primary mb-3 text-sm font-semibold tracking-[0.2em] uppercase">
          ChicMagnolia
        </p>
        <h1 className="font-[family-name:var(--font-display)] text-4xl leading-tight font-semibold sm:text-6xl">
          Keep the price. Keep your options open.
        </h1>
        <p className="text-muted-foreground mt-6 max-w-xl text-lg leading-8">
          The project foundation is ready for purchase tracking, daily price
          monitoring, and timely alerts in the sprints ahead.
        </p>

        <Button className="mt-8" asChild>
          <a href="/api/health">View system health</a>
        </Button>
      </section>
    </main>
  );
}
