import { NextResponse } from 'next/server';

import { parseHmProductHtml } from '@/retailers/hm';
import { parseMangoOxylabsHtml } from '@/retailers/mango-oxylabs';
import { parseNextProductHtml } from '@/retailers/next';
import { fetchOxylabsHtml } from '@/retailers/oxylabs';
import { visiblePageText } from '@/retailers/variant';

export const runtime = 'nodejs';
export const maxDuration = 60;

type Fixture = {
  url: string;
  size: string;
  colour: string;
  parse: (
    html: string,
    url: URL,
    variant: { size: string; colour: string },
  ) => unknown;
};

const fixtures = {
  next: {
    url: 'https://www.next.co.uk/style/sv098626/v86409',
    size: '14',
    colour: 'Green',
    parse: parseNextProductHtml,
  },
  mango: {
    url: 'https://shop.mango.com/gb/en/p/women/dresses-and-jumpsuits/dresses/flared-sleeve-satin-dress/27019066/79/00',
    size: 'L',
    colour: 'Russet',
    parse: parseMangoOxylabsHtml,
  },
  hm: {
    url: 'https://www2.hm.com/en_gb/productpage.1265326001.html',
    size: 'S',
    colour: 'Black',
    parse: parseHmProductHtml,
  },
} as const satisfies Record<string, Fixture>;

function compact(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function contexts(text: string, pattern: RegExp, radius = 180) {
  const matches: string[] = [];
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    matches.push(
      compact(
        text.slice(Math.max(0, index - radius), Math.min(text.length, index + radius)),
      ),
    );
  }
  return [...new Set(matches)].slice(0, 20);
}

function elementEvidence(html: string, token: string) {
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(
    `<(?:button|li|option|div|span)\\b[^>]*>[\\s\\S]{0,1200}?(?:^|[^a-z0-9])${escaped}(?=$|[^a-z0-9])[\\s\\S]{0,1200}?<\\/(?:button|li|option|div|span)>`,
    'gi',
  );

  return [...html.matchAll(pattern)]
    .map((match) => compact(match[0]).slice(0, 1200))
    .slice(0, 20);
}

export async function GET(request: Request) {
  if (process.env.VERCEL_ENV !== 'preview') {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  const key = new URL(request.url).searchParams.get('retailer') ?? '';
  const fixture = fixtures[key as keyof typeof fixtures];
  if (!fixture) {
    return NextResponse.json(
      { error: 'Use retailer=next, mango or hm.' },
      { status: 400 },
    );
  }

  const url = new URL(fixture.url);
  const variant = { size: fixture.size, colour: fixture.colour };
  const html = await fetchOxylabsHtml(url, undefined, 55_000);
  const visible = visiblePageText(html);
  const snapshot = fixture.parse(html, url, variant);

  return NextResponse.json(
    {
      fixture: key,
      url: fixture.url,
      variant,
      htmlLength: html.length,
      snapshot,
      visiblePriceEvidence: contexts(visible, /(?:Now\s*)?£\s*[0-9]+(?:\.[0-9]{1,2})?/gi),
      sizeTextEvidence: contexts(visible, new RegExp(`(?:^|[^a-z0-9])${fixture.size}(?=$|[^a-z0-9])`, 'gi')),
      sizeElementEvidence: elementEvidence(html, fixture.size),
      unavailableEvidence: contexts(visible, /not available|unavailable|out of stock|sold out|notify me|i want it/gi),
    },
    {
      headers: {
        'cache-control': 'no-store',
        'x-robots-tag': 'noindex, nofollow, noarchive',
      },
    },
  );
}
