import {
  canonicalLink,
  coloursMatch,
  extractJsonScripts,
  firstTagText,
  isJsonRecord,
  metaContent,
  recordAvailability,
  recordCurrentPriceMinor,
  sizesMatch,
  type JsonRecord,
} from './parser';
import type {
  ProductVariant,
  RetailerAdapter,
  RetailerProductSnapshot,
  RetailerReturnPolicy,
} from './types';
import { visiblePageText } from './variant';

const HM_RETURN_POLICY_URL =
  'https://www2.hm.com/en_gb/customer-service/legal-and-privacy/terms-and-conditions.html';
const CHROME_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36';

function productIdFromUrl(url: URL): string | null {
  return url.pathname.match(/productpage\.(\d{10})\.html$/i)?.[1] ?? null;
}

function isBlockedPage(html: string) {
  return (
    /<title>\s*Access Denied\s*<\/title>/i.test(html) ||
    /<h1>\s*Access Denied\s*<\/h1>/i.test(html)
  );
}

function typeIncludesProduct(record: JsonRecord) {
  const type = record['@type'];
  const values = Array.isArray(type) ? type : [type];
  return values.some((value) => String(value).toLowerCase() === 'product');
}

function identifier(value: unknown): string | null {
  return typeof value === 'string' || typeof value === 'number'
    ? String(value)
    : null;
}

function collectHmVariantRecords(
  values: unknown[],
  productId: string | null,
): JsonRecord[] {
  const variants: JsonRecord[] = [];

  function visit(value: unknown) {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!isJsonRecord(value)) return;

    const sku = identifier(value.sku);
    if (
      typeIncludesProduct(value) &&
      typeof value.size === 'string' &&
      typeof value.color === 'string' &&
      (!productId || sku?.startsWith(productId))
    ) {
      variants.push(value);
    }

    Object.values(value).forEach(visit);
  }

  values.forEach(visit);
  return variants;
}

function offerRecord(variant: JsonRecord): JsonRecord | null {
  const offers = variant.offers;
  if (isJsonRecord(offers)) return offers;
  if (Array.isArray(offers) && offers.length === 1 && isJsonRecord(offers[0])) {
    return offers[0];
  }
  return null;
}

function offerPriceMinor(variant: JsonRecord): number | null {
  const offer = offerRecord(variant);
  if (!offer) return null;
  return recordCurrentPriceMinor({ currentPrice: offer.price });
}

function offerInStock(variant: JsonRecord): boolean | null {
  return recordAvailability(offerRecord(variant)) ?? recordAvailability(variant);
}

function findHmProductRecord(
  values: unknown[],
  productId: string | null,
): JsonRecord | null {
  let best: { record: JsonRecord; score: number } | null = null;

  function visit(value: unknown) {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!isJsonRecord(value)) return;

    const identifiers = [
      value.articleCode,
      value.productCode,
      value.code,
      value.id,
      value.sku,
    ]
      .map(identifier)
      .filter((entry): entry is string => Boolean(entry));
    const matchesProduct =
      !productId || identifiers.some((entry) => entry.startsWith(productId));
    if (matchesProduct) {
      const score =
        Number('redPriceValue' in value || 'redPrice' in value) * 4 +
        Number('whitePriceValue' in value || 'whitePrice' in value) * 2 +
        Number(Array.isArray(value.sizes));
      if (score > 0 && (!best || score > best.score)) {
        best = { record: value, score };
      }
    }

    Object.values(value).forEach(visit);
  }

  values.forEach(visit);
  return (
    (best as { record: JsonRecord; score: number } | null)?.record ?? null
  );
}

function productRecordPriceMinor(record: JsonRecord | null): number | null {
  if (!record) return null;
  const salePrice =
    record.redPriceValue ??
    record.redPrice ??
    record.salePriceValue ??
    record.salePrice ??
    record.currentPrice;
  if (salePrice !== undefined) {
    const parsed = recordCurrentPriceMinor({ currentPrice: salePrice });
    if (parsed !== null) return parsed;
  }

  const regularPrice = record.whitePriceValue ?? record.whitePrice ?? record.price;
  return recordCurrentPriceMinor({ currentPrice: regularPrice });
}

function renderedCurrentPriceMinor(html: string): number | null {
  const match = html.match(
    /<([a-z0-9-]+)\b[^>]*data-testid=["']red-price["'][^>]*>([\s\S]*?)<\/\1>/i,
  );
  const text = visiblePageText(match?.[2] ?? '');
  return text ? recordCurrentPriceMinor({ currentPrice: text }) : null;
}

function labelledColour(text: string): string | null {
  return (
    text
      .match(
        /\bCOLOU?R\s*:\s*([A-Z0-9][A-Z0-9 /&'’.-]{0,50}?)(?=\s+(?:SIZE\s+(?:XXXS|XXS|XS|S|M|L|XL|XXL|3XL|4XL)\b|VIEW SIMILAR|XXXS|XXS|XS|S|M|L|XL|XXL|3XL|4XL|SIZE GUIDE|ADD TO BAG|£)|$)/i,
      )?.[1]
      ?.trim() ?? null
  );
}

function pageColourCandidates(
  productText: string,
  variants: JsonRecord[],
): string[] {
  const values = [
    labelledColour(productText),
    ...variants.map((variant) =>
      typeof variant.color === 'string' ? variant.color : null,
    ),
  ];
  return [
    ...new Set(values.filter((value): value is string => Boolean(value))),
  ];
}

function hmRenderedSizeAvailability(
  html: string,
  savedSize: string,
): boolean | null {
  for (const match of html.matchAll(/\baria-label=["']([^"']+)["']/gi)) {
    const label = match[1] ?? '';
    const parsed = label.match(/^Size\s+(.+?):\s*(.+)$/i);
    if (!parsed?.[1] || !parsed[2] || !sizesMatch(parsed[1], savedSize)) {
      continue;
    }

    const status = parsed[2].toLowerCase();
    if (/out of stock|unavailable|not available/.test(status)) return false;
    if (/available|few pieces left|low stock/.test(status)) return true;
  }
  return null;
}

function cleanTitle(value: string) {
  return value
    .replace(/^Women's\s+[A-Z0-9 /&'’.-]+\s+(?=[A-Z])/i, '')
    .replace(/\s*\|\s*H&M(?:\s+GB)?\s*$/i, '')
    .trim();
}

export function parseHmProductHtml(
  html: string,
  url: URL,
  variant: ProductVariant,
): RetailerProductSnapshot {
  if (isBlockedPage(html)) throw new Error('H&M product page was blocked.');

  const productId = productIdFromUrl(url);
  const jsonValues = extractJsonScripts(html);
  const variants = collectHmVariantRecords(jsonValues, productId);
  const productRecord = findHmProductRecord(jsonValues, productId);
  const productText = visiblePageText(html);
  const metaTitle = metaContent(html, 'og:title');
  const title =
    firstTagText(html, 'h1') ??
    (metaTitle ? cleanTitle(metaTitle) : 'H&M product');
  const colourCandidates = pageColourCandidates(productText, variants);
  const colourMatchesPage =
    !variant.colour ||
    colourCandidates.some((colour) => coloursMatch(colour, variant.colour!));

  if (variant.colour && !colourMatchesPage) {
    throw new Error('H&M saved colour does not match the product page.');
  }

  const colourVariants = variant.colour
    ? variants.filter(
        (candidate) =>
          typeof candidate.color === 'string' &&
          coloursMatch(candidate.color, variant.colour!),
      )
    : variants;
  const exactVariant = variant.size
    ? (colourVariants.find(
        (candidate) =>
          typeof candidate.size === 'string' &&
          sizesMatch(candidate.size, variant.size!),
      ) ?? null)
    : null;

  const amountMinor =
    (exactVariant ? offerPriceMinor(exactVariant) : null) ??
    productRecordPriceMinor(productRecord) ??
    renderedCurrentPriceMinor(html);
  if (amountMinor === null) {
    throw new Error(
      'H&M current product price was not found for the saved variant.',
    );
  }

  let inStock: boolean;
  if (variant.size) {
    inStock =
      (exactVariant ? offerInStock(exactVariant) : null) ??
      hmRenderedSizeAvailability(html, variant.size) ??
      false;
  } else {
    const stockStates = colourVariants
      .map(offerInStock)
      .filter((state): state is boolean => state !== null);
    inStock =
      (stockStates.length > 0 ? stockStates.some(Boolean) : null) ??
      /\badd to bag\b/i.test(productText);
  }

  return {
    canonicalUrl:
      canonicalLink(html) ?? metaContent(html, 'og:url') ?? url.toString(),
    retailerProductId: productId,
    title,
    price: {
      amountMinor,
      currency: metaContent(html, 'product:price:currency') ?? 'GBP',
    },
    variant,
    inStock,
    checkedAt: new Date(),
  };
}

async function fetchDirectHtml(url: URL): Promise<string> {
  const response = await fetch(url, {
    headers: {
      accept: 'text/html,application/xhtml+xml',
      'accept-language': 'en-GB,en;q=0.9',
      'user-agent': CHROME_USER_AGENT,
    },
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`H&M returned HTTP ${response.status}.`);
  return response.text();
}

export const hmAdapter: RetailerAdapter = {
  retailerSlug: 'hm-uk',

  supports(url) {
    return (
      (url.hostname === 'www2.hm.com' || url.hostname === 'www.hm.com') &&
      /^\/en_gb\/productpage\.\d{10}\.html$/i.test(url.pathname)
    );
  },

  async fetchProduct(url, variant) {
    if (!this.supports(url)) throw new Error('Unsupported H&M URL.');
    return parseHmProductHtml(await fetchDirectHtml(url), url, variant);
  },

  async fetchReturnPolicy(): Promise<RetailerReturnPolicy> {
    return {
      returnWindowDays: 30,
      sourceUrl: HM_RETURN_POLICY_URL,
      checkedAt: new Date(),
    };
  },
};
