import { decodeHtml, isJsonRecord, type JsonRecord } from './parser-html';
import { visiblePageText } from './variant';

function parseMoneyPrimitive(value: unknown): number | null {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value <= 0) return null;
    return Number.isInteger(value) && value >= 1000
      ? value
      : Math.round(value * 100);
  }

  if (typeof value !== 'string') return null;
  const decoded = decodeHtml(value).trim();
  const match = decoded.match(/(?:£|GBP\s*)?([0-9]{1,5}(?:[.,][0-9]{1,2})?)/i);
  if (!match?.[1]) return null;

  const amount = Number(match[1].replace(',', '.'));
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const explicitlyMajor = /[£.,]|GBP/i.test(decoded);
  return !explicitlyMajor && Number.isInteger(amount) && amount >= 1000
    ? amount
    : Math.round(amount * 100);
}

function keyIsReferencePrice(key: string) {
  return /original|regular|list|was|rrp|compare|lowest|previous|reference/i.test(
    key,
  );
}

function keyIsNonPriceMetric(key: string) {
  return /percent|percentage|rate|saving|installment|instalment/i.test(key);
}

function keyIsPreferredCurrentPrice(key: string) {
  return /sale|current|promo|offer|now|discounted|selling/i.test(key);
}

function priceValues(value: unknown, depth = 0): number[] {
  const primitive = parseMoneyPrimitive(value);
  if (primitive !== null) return [primitive];
  if (depth >= 4) return [];

  if (Array.isArray(value))
    return value.flatMap((entry) => priceValues(entry, depth + 1));
  if (!isJsonRecord(value)) return [];

  const preferred: number[] = [];
  const generic: number[] = [];

  for (const [key, child] of Object.entries(value)) {
    if (keyIsReferencePrice(key) || keyIsNonPriceMetric(key)) continue;
    if (keyIsPreferredCurrentPrice(key)) {
      preferred.push(...priceValues(child, depth + 1));
    } else if (/price|amount|value/i.test(key)) {
      generic.push(...priceValues(child, depth + 1));
    }
  }

  return preferred.length > 0 ? preferred : generic;
}

export function recordCurrentPriceMinor(
  record: JsonRecord | null,
): number | null {
  if (!record) return null;

  const preferred: number[] = [];
  const generic: number[] = [];
  for (const [key, value] of Object.entries(record)) {
    if (keyIsReferencePrice(key) || keyIsNonPriceMetric(key)) continue;
    if (/offers?/i.test(key) && Array.isArray(value) && value.length !== 1)
      continue;

    if (keyIsPreferredCurrentPrice(key)) {
      preferred.push(...priceValues(value));
    } else if (/price|amount/i.test(key)) {
      generic.push(...priceValues(value));
    }
  }

  const prices = preferred.length > 0 ? preferred : generic;
  return prices.length > 0 ? Math.min(...prices) : null;
}

export function elementCurrentPriceMinor(html: string): number | null {
  const pattern =
    /<([a-z0-9]+)\b([^>]*(?:(?:current|sale|discount)[-_ ]?price|price[-_ ]?(?:current|sale|discount))[^>]*)>([\s\S]*?)<\/\1>/gi;

  for (const match of html.matchAll(pattern)) {
    const text = visiblePageText(match[3] ?? '');
    const price = firstUnlabelledProductPriceMinor(text);
    if (price !== null) return price;
  }

  return null;
}

function availabilityValue(value: unknown, depth = 0): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value > 0;
  if (typeof value === 'string') {
    const normalized = value
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .toLowerCase()
      .replace(/[_-]+/g, ' ');
    if (
      /out of stock|sold out|unavailable|not available|no stock/.test(
        normalized,
      )
    )
      return false;
    if (/in stock|low stock|available/.test(normalized)) return true;
  }
  if (depth >= 2) return null;

  if (Array.isArray(value)) {
    for (const entry of value) {
      const parsed = availabilityValue(entry, depth + 1);
      if (parsed !== null) return parsed;
    }
  } else if (isJsonRecord(value)) {
    for (const child of Object.values(value)) {
      const parsed = availabilityValue(child, depth + 1);
      if (parsed !== null) return parsed;
    }
  }

  return null;
}

export function recordAvailability(record: JsonRecord | null): boolean | null {
  if (!record) return null;
  const fields = [
    'isInStock',
    'inStock',
    'isAvailable',
    'available',
    'availability',
    'stockStatus',
    'stockState',
    'quantity',
    'stock',
  ] as const;

  for (const field of fields) {
    if (!(field in record)) continue;
    const parsed = availabilityValue(record[field]);
    if (parsed !== null) return parsed;
  }

  return null;
}

export function labelledPriceMinor(text: string): number | null {
  const match = text.match(
    /\b(?:now|sale price|current price|our price)\s*:?\s*[\-–]?\s*£\s*([0-9]{1,5}(?:[.,][0-9]{1,2})?)/i,
  );
  return match?.[1] ? parseMoneyPrimitive(`£${match[1]}`) : null;
}

export function firstUnlabelledProductPriceMinor(text: string): number | null {
  const cleaned = text
    .replace(
      /30[- ]day lowest price\s*:?\s*[\-–]?\s*£\s*[0-9]+(?:[.,][0-9]{1,2})?/gi,
      ' ',
    )
    .replace(
      /\b(?:was|original price|regular price|rrp|save|saving)\s*:?\s*[\-–]?\s*£\s*[0-9]+(?:[.,][0-9]{1,2})?/gi,
      ' ',
    );
  const match = cleaned.match(/£\s*([0-9]{1,5}(?:[.,][0-9]{1,2})?)/);
  return match?.[1] ? parseMoneyPrimitive(`£${match[1]}`) : null;
}
