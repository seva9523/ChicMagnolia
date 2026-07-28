import type { ProductVariant, RetailerProductSnapshot } from './types';
import { parseZaraProductHtml } from './zara';

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
  return url.pathname.match(/-p(\d+)\.html/i)?.[1] ?? null;
}

function titleFromHtml(html: string): string {
  const heading = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
  if (heading) {
    const value = stripTags(heading);
    if (value) return value;
  }

  const text = stripTags(html);
  const productName = text.match(/([A-Z][A-Z\s-]{5,80})\s+\d{1,4}(?:[.,]\d{2})\s*(?:GBP|£)/)?.[1];
  return productName?.trim() || 'Zara product';
}

function renderedPrice(html: string): { amount: string; currency: string } | null {
  const text = stripTags(html);
  const patterns: Array<{ regex: RegExp; currency: string }> = [
    { regex: /\b([0-9]{1,4}(?:[.,][0-9]{2}))\s*GBP\b/i, currency: 'GBP' },
    { regex: /£\s*([0-9]{1,4}(?:[.,][0-9]{2})?)/i, currency: 'GBP' },
    { regex: /\bGBP\s*([0-9]{1,4}(?:[.,][0-9]{2})?)/i, currency: 'GBP' },
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
    throw new Error('Zara rendered price could not be parsed.');
  }
  return Math.round(amount * 100);
}

export function parseZaraOxylabsHtml(
  html: string,
  url: URL,
  variant: ProductVariant,
): RetailerProductSnapshot {
  try {
    return parseZaraProductHtml(html, url, variant);
  } catch {
    const price = renderedPrice(html);
    if (!price) throw new Error('Zara product metadata was not found.');

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
      inStock: !text.includes('out of stock') && !text.includes('currently unavailable'),
      checkedAt: new Date(),
    };
  }
}
