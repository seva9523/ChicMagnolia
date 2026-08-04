import Link from 'next/link';

import { LEGAL_CONTACT_PATH } from '@/lib/legal';

export function SiteFooter() {
  return (
    <footer className="text-muted-foreground border-t px-6 py-8 text-sm">
      <div className="mx-auto flex max-w-6xl flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <p>© {new Date().getUTCFullYear()} Chic Magnolia. Private beta.</p>
        <nav
          aria-label="Legal and support"
          className="flex flex-wrap gap-x-5 gap-y-2"
        >
          <Link
            className="hover:text-foreground hover:underline"
            href="/privacy"
          >
            Privacy
          </Link>
          <Link className="hover:text-foreground hover:underline" href="/terms">
            Terms
          </Link>
          <Link
            className="hover:text-foreground hover:underline"
            href={LEGAL_CONTACT_PATH}
          >
            Support
          </Link>
        </nav>
      </div>
    </footer>
  );
}
