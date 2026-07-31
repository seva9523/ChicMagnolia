import Link from 'next/link';

import { LEGAL_CONTACT_EMAIL } from '@/lib/legal';

export function SiteFooter() {
  return (
    <footer className="border-t px-6 py-8 text-sm text-muted-foreground">
      <div className="mx-auto flex max-w-6xl flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <p>© {new Date().getUTCFullYear()} ChicMagnolia. Private beta.</p>
        <nav aria-label="Legal and support" className="flex flex-wrap gap-x-5 gap-y-2">
          <Link className="hover:text-foreground hover:underline" href="/privacy">
            Privacy
          </Link>
          <Link className="hover:text-foreground hover:underline" href="/terms">
            Terms
          </Link>
          <a
            className="hover:text-foreground hover:underline"
            href={`mailto:${LEGAL_CONTACT_EMAIL}`}
          >
            Support
          </a>
        </nav>
      </div>
    </footer>
  );
}
