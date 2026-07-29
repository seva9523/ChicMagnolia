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

function jsonPriceCandidates(html: string): PriceCandidate[] {
  const keyPriorities: Record<string, number> = {
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

  const candidates: PriceCandidate[] = [];
  const keyPattern = Object.keys(keyPriorities).join('|');
  const patterns = [
    new RegExp(
      `"(${keyPattern})"\\s*:\\s*"?([0-9]{1,5}(?:[.,][0-9]{1,2})?)"?[\\s\\S]{0,160}?"(?:currency|currencyCode)"\\s*:\\s*"(GBP|EUR|USD)"`,
      'gi',
    ),
    new RegExp(
      `"(?:currency|currencyCode)"\\s*:\\s*"(GBP|EUR|USD)"[\\s\\S]{0,160}?"(${keyPattern})"\\s*:\\s*"?([0-9]{1,5}(?:[.,][0-9]{1,2})?)"?`,
      'gi',
    ),
  ];

  for (const match of html.matchAll(patterns[0])) {
    const amount = numericPrice(match[2]);
    if (amount !== null) {
      candidates.push({
        amount,
        currency: match[3].toUpperCase(),
        priority: keyPriorities[match[1]] ?? 3,
      });
    }
  }

  for (const match of html.matchAll(patterns[1])) {
    const amount = numericPrice(match[3]);
    if (amount !== null) {
      candidates.push({
        amount,
        currency: match[1].toUpperCase(),
        priority: keyPriorities[match[2]] ?? 3,
      });
    }
  }

  return candidates;
}

function visiblePriceCandidates(html: string): PriceCandidate[] {
  const text = stripTags(html);
  const candidates: PriceCandidate[] = [];
  const patterns: Array<{ regex: RegExp; currency: string }> = [
    { regex: /£\s*([0-9]{1,5}(?:[.,][0-9]{1,2})?)/gi, currency: 'GBP' },
    { regex: /\bGBP\s*([0-9]{1,5}(?:[.,][0-9]{1,2})?)/gi, currency: 'GBP' },
    { regex: /\b([0-9]{1,5}(?:[.,][0-9]{1,2})?)\s*GBP\b/gi, currency: 'GBP' },
  ];

  for (const { regex, currency } of patterns) {
    for (const match of text.matchAll(regex)) {
      const amount = numericPrice(match[1]);
      if (amount !== null) candidates.push({ amount, currency, priority: 3 });
    }
  }

  return candidates;
}

function currentPrice(html: string): { amount: string; currency: string } | null {
  const candidates = [...jsonPriceCandidates(html), ...visiblePriceCandidates(html)];
  if (candidates.length === 0) return null;

  candidates.sort((left, right) => {
    if (left.priority !== right.priority) return left.priority - right.priority;
    return left.amount - right.amount;
  });

  const selected = candidates[0];
  return { amount: String(selected.amount), currency: selected.currency };
}

function priceToMinorUnits(value: string): number {
  const amount = numericPrice(value);
  if (amount === null) throw new Error('Mango rendered price could not be parsed.');
  return Math.round(amount * 100);
}

export function parseMangoOxylabsHtml(
  html: string,
  url: URL,
  variant: ProductVariant,
): RetailerProductSnapshot {
  const salePrice = currentPrice(html);

  if (salePrice) {
    const text = stripTags(html).toLowerCase();
    return {
      canonicalUrl: url.toString(),
      retailerProductId: productIdFromUrl(url),
      title: titleFromHtml(html),
      price: {
        amountMinor: priceToMinorUnits(salePrice.amount),
        currency: salePrice.currency,
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
