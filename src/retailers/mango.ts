import type {
  ProductVariant,
  RetailerAdapter,
  RetailerProductSnapshot,
  RetailerReturnPolicy,
} from './types';

const MANGO_RETURN_POLICY_URL =
  'https://shop.mango.com/gb/en/help/returns/return-conditions';
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

function extractJsonLd(html: string): unknown[] {
  return [
    ...html.matchAll(
      /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
    ),
  ].flatMap((match) => {
    try {
      const parsed = JSON.parse(match[1]);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      return [];
    }
  });
}

function findProductNode(nodes: unknown[]): Record<string, unknown> | null {
  const queue = [...nodes];
  while (queue.length > 0) {
    const value = queue.shift();
    if (!value || typeof value !== 'object') continue;
    const node = value as Record<string, unknown>;
    if (node['@type'] === 'Product') return node;
    const graph = node['@graph'];
    if (Array.isArray(graph)) queue.push(...graph);
  }
  return null;
}

function priceToMinorUnits(value: unknown): number {
  const normalized = String(value).replace(/[^0-9.,]/g, '').replace(',', '.');
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error('Mango product price could not be parsed.');
  }
  return Math.round(amount * 100);
}

function productIdFromUrl(url: URL): string | null {
  const segments = url.pathname.split('/').filter(Boolean);
  const productIndex = segments.findIndex((segment) => /^\d{8}$/.test(segment));
  return productIndex >= 0 ? segments[productIndex] : null;
}

export function parseMangoProductHtml(
  html: string,
  url: URL,
  variant: ProductVariant,
): RetailerProductSnapshot {
  const product = findProductNode(extractJsonLd(html));
  if (product) {
    const offersValue = product.offers;
    const offer = Array.isArray(offersValue) ? offersValue[0] : offersValue;
    if (offer && typeof offer === 'object') {
      const offerRecord = offer as Record<string, unknown>;
      const availability = String(offerRecord.availability ?? '');
      return {
        canonicalUrl: String(product.url ?? url.toString()),
        retailerProductId: String(
          product.sku ?? product.productID ?? productIdFromUrl(url) ?? '',
        ) || null,
        title: String(product.name ?? 'Mango product'),
        price: {
          amountMinor: priceToMinorUnits(offerRecord.price),
          currency: String(offerRecord.priceCurrency ?? 'GBP'),
        },
        variant,
        inStock: !availability.toLowerCase().includes('outofstock'),
        checkedAt: new Date(),
      };
    }
  }

  const price =
    metaContent(html, 'product:price:amount') ??
    metaContent(html, 'og:price:amount');
  if (!price) throw new Error('Mango product metadata was not found.');

  const availability =
    metaContent(html, 'product:availability') ??
    metaContent(html, 'og:availability') ??
    '';

  return {
    canonicalUrl: metaContent(html, 'og:url') ?? url.toString(),
    retailerProductId: productIdFromUrl(url),
    title: metaContent(html, 'og:title') ?? 'Mango product',
    price: {
      amountMinor: priceToMinorUnits(price),
      currency:
        metaContent(html, 'product:price:currency') ??
        metaContent(html, 'og:price:currency') ??
        'GBP',
    },
    variant,
    inStock: !availability.toLowerCase().includes('out'),
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

  if (!response.ok) throw new Error(`Mango returned HTTP ${response.status}.`);
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
      gotoOptions: { waitUntil: 'networkidle2', timeout: 40000 },
      waitForTimeout: 2000,
    }),
    cache: 'no-store',
    signal: AbortSignal.timeout(50_000),
  });

  if (!response.ok) {
    throw new Error(`Browserless returned HTTP ${response.status}.`);
  }
  const html = await response.text();
  if (!html) throw new Error('Browserless returned no page content.');
  return html;
}

export const mangoAdapter: RetailerAdapter = {
  retailerSlug: 'mango-uk',

  supports(url) {
    return (
      url.hostname === 'shop.mango.com' &&
      url.pathname.startsWith('/gb/en/p/')
    );
  },

  async fetchProduct(url, variant) {
    if (!this.supports(url)) throw new Error('Unsupported Mango URL.');

    try {
      return parseMangoProductHtml(await fetchDirectHtml(url), url, variant);
    } catch (directError) {
      try {
        return parseMangoProductHtml(
          await fetchBrowserlessHtml(url),
          url,
          variant,
        );
      } catch (browserlessError) {
        const directMessage =
          directError instanceof Error ? directError.message : 'Direct Mango request failed.';
        const browserlessMessage =
          browserlessError instanceof Error
            ? browserlessError.message
            : 'Browserless fallback failed.';
        throw new Error(`${directMessage} Browserless fallback: ${browserlessMessage}`);
      }
    }
  },

  async fetchReturnPolicy(): Promise<RetailerReturnPolicy> {
    return {
      returnWindowDays: 30,
      sourceUrl: MANGO_RETURN_POLICY_URL,
      checkedAt: new Date(),
    };
  },
};
