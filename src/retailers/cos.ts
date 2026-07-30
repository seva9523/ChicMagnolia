import {
  canonicalLink,
  coloursMatch,
  elementCurrentPriceMinor,
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

const COS_RETURN_POLICY_URL =
  'https://www.cos.com/en-gb/customer-service/terms-and-conditions';
const CHROME_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36';

function productIdFromUrl(url: URL): string | null {
  return url.pathname.match(/-(\d{10})\/?$/)?.[1] ?? null;
}

function isBlockedPage(html: string) {
  return (
    /<title>\s*Access Denied\s*<\/title>/i.test(html) ||
    /<h1>\s*Access Denied\s*<\/h1>/i.test(html)
  );
}

function identifier(value: unknown): string | null {
  return typeof value === 'string' || typeof value === 'number'
    ? String(value)
    : null;
}

function findCosProduct(
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

    const sku = identifier(value.sku);
    const exactProduct = Boolean(productId && sku === productId);
    if (exactProduct) {
      const score =
        Number(Array.isArray(value.items)) * 8 +
        Number('variantName' in value) * 4 +
        Number('priceAsNumber' in value || 'price' in value) * 2 +
        Number('name' in value);
      if (!best || score > best.score) best = { record: value, score };
    }

    Object.values(value).forEach(visit);
  }

  values.forEach(visit);
  return (
    (best as { record: JsonRecord; score: number } | null)?.record ?? null
  );
}

function productColour(product: JsonRecord | null): string | null {
  if (!product) return null;
  const value =
    product.variantName ??
    product.defaultVariantName ??
    product.colorName ??
    product.colourName ??
    product.color ??
    product.colour;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function titleColour(title: string | null): string | null {
  return (
    title?.match(/\s+-\s+(.+?)\s*\|\s*COS(?:\s+GB)?$/i)?.[1]?.trim() ??
    null
  );
}

function productPriceMinor(product: JsonRecord | null): number | null {
  if (!product) return null;
  const current = product.priceAsNumber ?? product.price;
  return recordCurrentPriceMinor({ currentPrice: current });
}

function productItems(product: JsonRecord | null): JsonRecord[] {
  return Array.isArray(product?.items)
    ? product.items.filter(isJsonRecord)
    : [];
}

function itemInStock(item: JsonRecord | null): boolean | null {
  if (!item) return null;
  const explicit = recordAvailability(item);
  if (explicit !== null) return explicit;

  const stock = String(item.stock ?? item.stockStatus ?? '')
    .trim()
    .toLowerCase();
  if (/^(?:yes|low|in stock|available)$/.test(stock)) return true;
  if (/^(?:no|none|out|out of stock|sold out|unavailable)$/.test(stock)) {
    return false;
  }
  return null;
}

function renderedSizeAvailability(
  html: string,
  savedSize: string,
): boolean | null {
  const matches: boolean[] = [];

  for (const match of html.matchAll(
    /<button\b([^>]*)data-testid=["']size-selector-button-([^"']+)["']([^>]*)>([\s\S]*?)<\/button>/gi,
  )) {
    const attributes = `${match[1] ?? ''} ${match[3] ?? ''}`;
    const label = visiblePageText(match[4] ?? '') || match[2] || '';
    if (!sizesMatch(label, savedSize)) continue;

    const unavailable =
      /(?:^|\s)disabled(?:\s|=|$)/i.test(attributes) ||
      /\baria-disabled=["']true["']/i.test(attributes) ||
      /disabled|out-of-stock|sold-out|unavailable|cursor-not-allowed/i.test(
        attributes,
      );
    matches.push(!unavailable);
  }

  if (matches.length === 0) return null;
  return matches.every(Boolean);
}

function cleanTitle(value: string) {
  return value.replace(/\s+-\s+.+?\s*\|\s*COS(?:\s+GB)?$/i, '').trim();
}

export function parseCosProductHtml(
  html: string,
  url: URL,
  variant: ProductVariant,
): RetailerProductSnapshot {
  if (isBlockedPage(html)) throw new Error('COS product page was blocked.');

  const productId = productIdFromUrl(url);
  const jsonValues = extractJsonScripts(html);
  const product = findCosProduct(jsonValues, productId);
  const metaTitle = metaContent(html, 'og:title');
  const title =
    (typeof product?.name === 'string' && product.name.trim()
      ? product.name.trim()
      : null) ??
    firstTagText(html, 'h1') ??
    (metaTitle ? cleanTitle(metaTitle) : 'COS product');
  const colourCandidates = [
    productColour(product),
    titleColour(metaTitle),
  ].filter((value): value is string => Boolean(value));
  const colourMatchesPage =
    !variant.colour ||
    colourCandidates.some((colour) => coloursMatch(colour, variant.colour!));

  if (variant.colour && !colourMatchesPage) {
    throw new Error('COS saved colour does not match the product page.');
  }

  const items = productItems(product);
  const exactItem = variant.size
    ? (items.find((item) => {
        const size = item.name ?? item.sizeName ?? item.size;
        return (
          (typeof size === 'string' || typeof size === 'number') &&
          sizesMatch(String(size), variant.size!)
        );
      }) ?? null)
    : null;

  const metaPrice = metaContent(html, 'product:price:amount');
  const amountMinor =
    productPriceMinor(product) ??
    (metaPrice
      ? recordCurrentPriceMinor({ currentPrice: metaPrice })
      : null) ??
    elementCurrentPriceMinor(html);
  if (amountMinor === null) {
    throw new Error(
      'COS current product price was not found for the saved variant.',
    );
  }

  let inStock: boolean;
  if (variant.size) {
    inStock =
      itemInStock(exactItem) ??
      renderedSizeAvailability(html, variant.size) ??
      false;
  } else {
    const states = items
      .map(itemInStock)
      .filter((state): state is boolean => state !== null);
    inStock =
      (states.length > 0 ? states.some(Boolean) : null) ??
      recordAvailability({
        availability: metaContent(html, 'product:availability'),
      }) ??
      /\badd to bag\b/i.test(visiblePageText(html));
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
  if (!response.ok) throw new Error(`COS returned HTTP ${response.status}.`);
  return response.text();
}

export const cosAdapter: RetailerAdapter = {
  retailerSlug: 'cos-uk',

  supports(url) {
    return (
      (url.hostname === 'www.cos.com' || url.hostname === 'cos.com') &&
      /^\/en-gb\/.+\/product\/.+-\d{10}\/?$/i.test(url.pathname)
    );
  },

  async fetchProduct(url, variant) {
    if (!this.supports(url)) throw new Error('Unsupported COS URL.');
    return parseCosProductHtml(await fetchDirectHtml(url), url, variant);
  },

  async fetchReturnPolicy(): Promise<RetailerReturnPolicy> {
    return {
      returnWindowDays: 30,
      sourceUrl: COS_RETURN_POLICY_URL,
      checkedAt: new Date(),
    };
  },
};
