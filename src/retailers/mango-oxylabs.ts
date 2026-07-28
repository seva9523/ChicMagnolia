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

function jsonPrice(html: string): { amount: string; currency: string } | null {
  const patterns = [
    /"(?:price|currentPrice|salePrice|finalPrice)"\s*:\s*"?([0-9]{1,5}(?:[.,][0-9]{1,2})?)"?[\s\S]{0,120}?"(?:currency|currencyCode)"\s*:\s*"(GBP|EUR|USD)"/i,
    /"(?:currency|currencyCode)"\s*:\s*"(GBP|EUR|USD)"[\s\S]{0,120}?"(?:price|currentPrice|salePrice|finalPrice)"\s*:\s*"?([0-9]{1,5}(?:[.,][0-9]{1,2})?)"?/i,
  ];

  const first = html.match(patterns[0]);
  if (first?.[1] && first[2]) return { amount: first[1], currency: first[2].toUpperCase() };

  const second = html.match(patterns[1]);
  if (second?.[1] && second[2]) return { amount: second[2], currency: second[1].toUpperCase() };

  return null;
}

function renderedPrice(html: string): { amount: string; currency: string } | null {
  const embedded = jsonPrice(html);
  if (embedded) return embedded;

  const text = stripTags(html);
  const patterns: Array<{ regex: RegExp; currency: string }> = [
    { regex: /£\s*([0-9]{1,5}(?:[.,][0-9]{1,2})?)/i, currency: 'GBP' },
    { regex: /\bGBP\s*([0-9]{1,5}(?:[.,][0-9]{1,2})?)/i, currency: 'GBP' },
    { regex: /\b([0-9]{1,5}(?:[.,][0-9]{1,2})?)\s*GBP\b/i, currency: 'GBP' },
  ];

  for (const { regex, currency } of patterns) {
    const match = text.match(regex);
    if (match?.[1]) return { amount: match[1], currency };
  }

  return null;
}

function priceToMinorUnits(value: string): number {
  const normalized = value.replace(',', '.');
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Mango rendered price could not be parsed.');
  }
  return Math.round(amount * 100);
}

export function parseMangoOxylabsHtml(
  html: string,
  url: URL,
  variant: ProductVariant,
): RetailerProductSnapshot {
  try {
    return parseMangoProductHtml(html, url, variant);
  } catch {
    const price = renderedPrice(html);
    if (!price) throw new Error('Mango product metadata was not found.');

    const text = stripTags(html).toLowerCase();
    return {
      canonicalUrl: url.toString(),
      retailerProductId: productIdFromUrl(url),
      title: titleFromHtml(html),
      price: {
        amountMinor: priceToMinorUnits(price.amount),
        currency: price.currency,
      },
      variant,
      inStock:
        !text.includes('out of stock') &&
        !text.includes('sold out') &&
        !text.includes('currently unavailable'),
      checkedAt: new Date(),
    };
  }
}
