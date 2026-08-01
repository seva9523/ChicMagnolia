import type { ReactNode } from 'react';
import Link from 'next/link';

import { SiteFooter } from '@/components/site-footer';

export function LegalPage({
  title,
  intro,
  lastUpdated,
  children,
}: {
  title: string;
  intro: string;
  lastUpdated: string;
  children: ReactNode;
}) {
  return (
    <>
      <main className="min-h-screen px-6 py-10 sm:px-10">
        <article className="mx-auto max-w-3xl">
          <Link className="text-primary text-sm font-semibold" href="/">
            ChicMagnolia
          </Link>
          <h1 className="mt-6 text-4xl font-semibold sm:text-5xl">{title}</h1>
          <p className="text-muted-foreground mt-4 text-lg leading-8">
            {intro}
          </p>
          <p className="text-muted-foreground mt-3 text-sm">
            Last updated {lastUpdated}
          </p>
          <div className="[&_a]:text-primary [&_p]:text-muted-foreground mt-10 space-y-9 leading-7 [&_a]:font-medium [&_a]:underline [&_h2]:text-2xl [&_h2]:font-semibold [&_h3]:text-lg [&_h3]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-2">
            {children}
          </div>
        </article>
      </main>
      <SiteFooter />
    </>
  );
}
