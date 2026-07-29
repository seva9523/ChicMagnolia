import type { ProductVariant, RetailerProductSnapshot } from './types';
import { parseMangoProductHtml } from './mango';

function decodeHtml(value: string) {
  return value
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&nbsp;', ' ');
}

function stripTags(html: string) {
  return decodeHtml(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  );
}

function productIdFromUrl(url: URL): string | null {
  const segments = url.pathname.split('/').filter(Boolean);
  return segments.find((segment) => /^\d{8}$/.test(segment)) ?? null;
}

function titleFromHtml(html: string): string {
  const heading = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
  if (heading) {
    const value = stripTags(heading);
    if (value) return value;
  }

  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  if (title) {
    const value = stripTags(title).replace(/\s*\|\s*MANGO.*$/i, '').trim();
    if (value) return value;
  }

  return 'Mango product';
}

type PriceCandidate = {
  amount: number;
  currency: string;
  priority: number;
};

function numericPrice(value: string): number | null {
  const amount = Number(value.replace(',', '.'));
  return Number.isFinite(amount) && amount > 0 && amount < 100_000 ? amount : null;
}

function visibleProductSection(html: string): string | null {
  const heading = html.match(/<h1\b[^>]*>[\s\S]*?<\/h1>/i);
  if (!heading || heading.index === undefined) return null;

  return html.slice(heading.index, heading.index + 8_000);
}

function visibleProductPrice(html: string): PriceCandidate | null {
  const section = visibleProductSection(html);
  if (!section) return null;

  const text = stripTags(section);
  const matches = [...text.matchAll(/£\s*([0-9]{1,5}(?:[.,][0-9]{1,2})?)/gi)]
    .slice(0, 3)
    .map((match) => numericPrice(match[1]))
    .filter((amount): amount is number => amount !== null);

  if (matches.length === 0) return null;

  // Mango places the original and current prices together immediately after the
  // product heading. Restricting extraction to this section avoids prices from
  // recommendations and promotional content elsewhere on the page.
  return { amount: Math.min(...matches), currency: 'GBP', priority: 0 };
}

function productJsonScopes(html: string, productId: string): string[] {
  const scopes: string[] = [];
  let start = 0;

  while (start < html.length) {
    const index = html.indexOf(productId, start);
    if (index < 0) break;
    scopes.push(html.slice(Math.max(0, index - 5_000), Math.min(html.length, index + 12_000)));
    start = index + productId.length;
  }

  return scopes;
}

function scopedJsonPrice(html: string, productId: string): PriceCandidate | null {
  const priorities: Record<string, number> = {
    salePrice: 0,
    discountedPrice: 0,
    discountPrice: 0,
    finalPrice: 1,
    currentPrice: 1,
    offerPrice: 1,
    price: 2,
    originalPrice: 4,
    listPrice: 4,
    regularPrice: 4,
    rrp: 4,
  };
  const keyPattern = Object.keys(priorities).join('|');
  const candidates: PriceCandidate[] = [];

  for (const scope of productJsonScopes(html, productId)) {
    const pattern = new RegExp(
      `"(${keyPattern})"\\s*:\\s*"?([0-9]{1,5}(?:[.,][0-9]{1,2})?)"?`,
      'gi',
    );

    for (const match of scope.matchAll(pattern)) {
      const amount = numericPrice(match[2]);
      if (amount !== null) {
        candidates.push({
          amount,
          currency: 'GBP',
          priority: priorities[match[1]] ?? 3,
        });
      }
    }
  }

  if (candidates.length === 0) return null;
  candidates.sort((left, right) => {
    if (left.priority !== right.priority) return left.priority - right.priority;
    return left.amount - right.amount;
  });
  return candidates[0];
}

function currentProductPrice(html: string, url: URL): PriceCandidate | null {
  const visible = visibleProductPrice(html);
  if (visible) return visible;

  const productId = productIdFromUrl(url);
  return productId ? scopedJsonPrice(html, productId) : null;
}

export function parseMangoOxylabsHtml(
  html: string,
  url: URL,
  variant: ProductVariant,
): RetailerProductSnapshot {
  const currentPrice = currentProductPrice(html, url);

  if (currentPrice) {
    const text = stripTags(html).toLowerCase();
    return {
      canonicalUrl: url.toString(),
      retailerProductId: productIdFromUrl(url),
      title: titleFromHtml(html),
      price: {
        amountMinor: Math.round(currentPrice.amount * 100),
        currency: currentPrice.currency,
      },
      variant,
      inStock:
        !text.includes('out of stock') &&
        !text.includes('sold out') &&
        !text.includes('currently unavailable'),
      checkedAt: new Date(),
    };
  }

  return parseMangoProductHtml(html, url, variant);
}
