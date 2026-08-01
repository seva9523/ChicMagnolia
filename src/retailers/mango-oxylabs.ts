import type { ProductVariant, RetailerProductSnapshot } from './types';
import { parseMangoProductHtml } from './mango';
import { variantInStock } from './variant';

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
    const value = stripTags(title)
      .replace(/\s*\|\s*MANGO.*$/i, '')
      .trim();
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
  return Number.isFinite(amount) && amount > 0 && amount < 100_000
    ? amount
    : null;
}

function visibleProductSection(html: string): string | null {
  const heading = html.match(/<h1\b[^>]*>[\s\S]*?<\/h1>/i);
  if (!heading || heading.index === undefined) return null;

  return html.slice(heading.index, heading.index + 8_000);
}

function labelledCurrentPrice(html: string): PriceCandidate | null {
  const sources = [
    visibleProductSection(html),
    stripTags(html),
    decodeHtml(html),
  ].filter((source): source is string => Boolean(source));
  const patterns = [
    /\bcurrent\s+price\b[\s\S]{0,160}?£\s*([0-9]{1,5}(?:[.,][0-9]{1,2})?)/i,
    /\b(?:sale|discounted)\s+price\b[\s\S]{0,160}?£\s*([0-9]{1,5}(?:[.,][0-9]{1,2})?)/i,
    /\bnow\b[\s\S]{0,60}?£\s*([0-9]{1,5}(?:[.,][0-9]{1,2})?)/i,
  ];

  for (const source of sources) {
    for (const pattern of patterns) {
      const match = source.match(pattern);
      const amount = match?.[1] ? numericPrice(match[1]) : null;
      if (amount !== null) return { amount, currency: 'GBP', priority: 0 };
    }
  }

  return null;
}

function visibleProductPrice(html: string): PriceCandidate | null {
  const labelled = labelledCurrentPrice(html);
  if (labelled) return labelled;

  const section = visibleProductSection(html);
  if (!section) return null;

  const text = stripTags(section);
  const matches = [...text.matchAll(/£\s*([0-9]{1,5}(?:[.,][0-9]{1,2})?)/gi)]
    .slice(0, 3)
    .map((match) => numericPrice(match[1]))
    .filter((amount): amount is number => amount !== null);

  if (matches.length === 0) return null;

  // Mango can repeat the original price in accessibility text before exposing the
  // sale price. Inspect the first three product-header prices, then ignore every
  // later price because it may belong to recommendations or promotional content.
  return { amount: Math.min(...matches), currency: 'GBP', priority: 0 };
}

function productJsonScopes(html: string, productId: string): string[] {
  const scopes: string[] = [];
  let start = 0;

  while (start < html.length) {
    const index = html.indexOf(productId, start);
    if (index < 0) break;
    scopes.push(
      html.slice(
        Math.max(0, index - 5_000),
        Math.min(html.length, index + 12_000),
      ),
    );
    start = index + productId.length;
  }

  return scopes;
}

function scopedJsonPrice(
  html: string,
  productId: string,
): PriceCandidate | null {
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

const mangoUnavailableSignals = [
  'not available',
  'unavailable',
  'out of stock',
  'sold out',
  'i want it',
  'notify me',
];

function selectedSizeMatches(
  requestedSize: string,
  numericSize: string,
  letterSize: string,
): boolean {
  const normalized = requestedSize.trim().toUpperCase();
  const numeric = normalized.match(/\b(\d{1,2})\b/)?.[1];
  const letter = normalized.match(/\b(XXS|XS|S|M|L|XL|XXL|XXXL)\b/)?.[1];

  return numeric === numericSize || letter === letterSize;
}

function mangoSelectedSizeAvailability(
  html: string,
  size: string | null,
): boolean | null {
  if (!size) return null;

  // Mango's product URL already identifies the selected colour. Its size list uses
  // rows such as "14 (EUR XL)"; unavailable rows append "NOT AVAILABLE. I WANT IT!",
  // while available rows have no unavailability suffix. Parse each row independently
  // so an unavailable XS/S/M cannot make the selected L/XL appear unavailable.
  const section = visibleProductSection(html) ?? html;
  const text = stripTags(section);
  const rowPattern =
    /\b(\d{1,2})\s*\(\s*EUR\s+(XXS|XS|S|M|L|XL|XXL|XXXL)\s*\)/gi;
  const rows = [...text.matchAll(rowPattern)];

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (!selectedSizeMatches(size, row[1], row[2].toUpperCase())) continue;

    const start = row.index ?? 0;
    const end = rows[index + 1]?.index ?? Math.min(text.length, start + 220);
    const rowText = text.slice(start, end).toLowerCase();

    return !mangoUnavailableSignals.some((signal) => rowText.includes(signal));
  }

  return null;
}

function mangoProductInStock(html: string): boolean {
  const text = stripTags(visibleProductSection(html) ?? html).toLowerCase();
  const globalUnavailableSignals = [
    'this item is no longer available',
    'this product is unavailable',
    'product unavailable',
    'not available online',
  ];

  return !globalUnavailableSignals.some((signal) => text.includes(signal));
}

function mangoVariantInStock(html: string, variant: ProductVariant): boolean {
  const selectedSizeAvailability = mangoSelectedSizeAvailability(
    html,
    variant.size,
  );
  if (selectedSizeAvailability !== null) return selectedSizeAvailability;

  return variantInStock(html, variant, mangoProductInStock(html));
}

export function parseMangoOxylabsHtml(
  html: string,
  url: URL,
  variant: ProductVariant,
): RetailerProductSnapshot {
  const currentPrice = currentProductPrice(html, url);

  if (currentPrice) {
    const basePriceMinor = Math.round(currentPrice.amount * 100);

    return {
      canonicalUrl: url.toString(),
      retailerProductId: productIdFromUrl(url),
      title: titleFromHtml(html),
      price: {
        amountMinor: basePriceMinor,
        currency: currentPrice.currency,
      },
      variant,
      inStock: mangoVariantInStock(html, variant),
      checkedAt: new Date(),
    };
  }

  const snapshot = parseMangoProductHtml(html, url, variant);
  return {
    ...snapshot,
    inStock: mangoVariantInStock(html, variant),
  };
}
