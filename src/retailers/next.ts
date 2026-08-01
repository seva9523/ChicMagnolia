import type {
  ProductVariant,
  RetailerAdapter,
  RetailerProductSnapshot,
  RetailerReturnPolicy,
} from './types';
import { variantInStock, variantPriceMinor } from './variant';

const NEXT_RETURN_POLICY_URL = 'https://www.next.co.uk/help/returns';
const BROWSERLESS_CONTENT_ENDPOINT =
  'https://production-lon.browserless.io/content';

function decodeHtml(value: string) {
  return value
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>');
}

function metaContent(html: string, key: string): string | null {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`,
      'i',
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`,
      'i',
    ),
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return decodeHtml(match[1].trim());
  }
  return null;
}

function stripTags(value: string) {
  return decodeHtml(
    value
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  );
}

function priceToMinorUnits(value: unknown): number {
  const normalized = String(value)
    .replace(/[^0-9.,]/g, '')
    .replace(',', '.');
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error('Next product price could not be parsed.');
  }
  return Math.round(amount * 100);
}

function productCodeFromHtml(html: string): string | null {
  const match = stripTags(html).match(/Product Code:\s*([A-Z0-9-]+)/i);
  return match?.[1] ?? null;
}

function productIdFromUrl(url: URL): string | null {
  const segments = url.pathname.split('/').filter(Boolean);
  return segments.at(-1)?.toUpperCase() ?? null;
}

function visiblePrice(html: string): string | null {
  const text = stripTags(html);
  return (
    text.match(/\bNow\s*£\s*([0-9]+(?:\.[0-9]{1,2})?)/i)?.[1] ??
    text.match(/\bPrice\s*£\s*([0-9]+(?:\.[0-9]{1,2})?)/i)?.[1] ??
    text.match(/£\s*([0-9]+(?:\.[0-9]{1,2})?)/)?.[1] ??
    null
  );
}

export function parseNextProductHtml(
  html: string,
  url: URL,
  variant: ProductVariant,
): RetailerProductSnapshot {
  const price =
    metaContent(html, 'product:price:amount') ??
    metaContent(html, 'og:price:amount') ??
    visiblePrice(html);
  if (!price) throw new Error('Next product metadata was not found.');

  const title =
    metaContent(html, 'og:title') ??
    stripTags(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? '') ??
    'Next product';
  const text = stripTags(html).toLowerCase();
  const defaultInStock =
    !text.includes('out of stock') && !text.includes('currently unavailable');
  const basePriceMinor = priceToMinorUnits(price);

  return {
    canonicalUrl: metaContent(html, 'og:url') ?? url.toString(),
    retailerProductId: productCodeFromHtml(html) ?? productIdFromUrl(url),
    title: title || 'Next product',
    price: {
      amountMinor: variantPriceMinor(html, variant) ?? basePriceMinor,
      currency:
        metaContent(html, 'product:price:currency') ??
        metaContent(html, 'og:price:currency') ??
        'GBP',
    },
    variant,
    inStock: variantInStock(html, variant, defaultInStock),
    checkedAt: new Date(),
  };
}

async function fetchDirectHtml(url: URL): Promise<string> {
  const response = await fetch(url, {
    headers: {
      accept: 'text/html,application/xhtml+xml',
      'accept-language': 'en-GB,en;q=0.9',
      'user-agent':
        'Mozilla/5.0 (compatible; ChicMagnolia/0.1; +https://chic-magnolia.vercel.app)',
    },
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) throw new Error(`Next returned HTTP ${response.status}.`);
  return response.text();
}

async function fetchBrowserlessHtml(
  url: URL,
  token = process.env.BROWSERLESS_TOKEN,
): Promise<string> {
  if (!token) throw new Error('Browserless is not configured.');

  const endpoint = new URL(BROWSERLESS_CONTENT_ENDPOINT);
  endpoint.searchParams.set('token', token);
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      url: url.toString(),
      gotoOptions: { waitUntil: 'domcontentloaded', timeout: 40000 },
      waitForTimeout: 1500,
    }),
    cache: 'no-store',
    signal: AbortSignal.timeout(50_000),
  });

  if (!response.ok)
    throw new Error(`Browserless returned HTTP ${response.status}.`);
  const html = await response.text();
  if (!html) throw new Error('Browserless returned no page content.');
  return html;
}

export const nextAdapter: RetailerAdapter = {
  retailerSlug: 'next-uk',

  supports(url) {
    return (
      (url.hostname === 'www.next.co.uk' || url.hostname === 'next.co.uk') &&
      url.pathname.startsWith('/style/')
    );
  },

  async fetchProduct(url, variant) {
    if (!this.supports(url)) throw new Error('Unsupported Next URL.');

    try {
      return parseNextProductHtml(await fetchDirectHtml(url), url, variant);
    } catch (directError) {
      try {
        return parseNextProductHtml(
          await fetchBrowserlessHtml(url),
          url,
          variant,
        );
      } catch (browserlessError) {
        const directMessage =
          directError instanceof Error
            ? directError.message
            : 'Direct Next request failed.';
        const browserlessMessage =
          browserlessError instanceof Error
            ? browserlessError.message
            : 'Browserless fallback failed.';
        throw new Error(
          `${directMessage} Browserless fallback: ${browserlessMessage}`,
        );
      }
    }
  },

  async fetchReturnPolicy(): Promise<RetailerReturnPolicy> {
    return {
      returnWindowDays: 28,
      sourceUrl: NEXT_RETURN_POLICY_URL,
      checkedAt: new Date(),
    };
  },
};
