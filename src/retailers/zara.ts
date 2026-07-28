import type {
  ProductVariant,
  RetailerAdapter,
  RetailerProductSnapshot,
  RetailerReturnPolicy,
} from './types';

const ZARA_RETURN_POLICY_URL =
  'https://www.zara.com/uk/en/help-center/HowToReturn';
const BROWSERLESS_ENDPOINT = 'https://production-lon.browserless.io/unblock';

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

function priceToMinorUnits(value: unknown): number {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error('Zara product price could not be parsed.');
  }
  return Math.round(amount * 100);
}

function productIdFromUrl(url: URL): string | null {
  return url.pathname.match(/-p(\d+)\.html/i)?.[1] ?? null;
}

function parseMetaProduct(
  html: string,
  url: URL,
  variant: ProductVariant,
): RetailerProductSnapshot | null {
  const price =
    metaContent(html, 'product:price:amount') ??
    metaContent(html, 'og:price:amount');
  if (!price) return null;

  const availability =
    metaContent(html, 'product:availability') ??
    metaContent(html, 'og:availability') ??
    '';

  return {
    canonicalUrl: metaContent(html, 'og:url') ?? url.toString(),
    retailerProductId: productIdFromUrl(url),
    title: metaContent(html, 'og:title') ?? 'Zara product',
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

export function parseZaraProductHtml(
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
      const canonicalUrl = String(product.url ?? url.toString());
      const productId = product.sku ?? product.productID ?? productIdFromUrl(url);

      return {
        canonicalUrl,
        retailerProductId: productId ? String(productId) : null,
        title: String(product.name ?? 'Zara product'),
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

  const metaProduct = parseMetaProduct(html, url, variant);
  if (metaProduct) return metaProduct;

  throw new Error('Zara product metadata was not found.');
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

  if (!response.ok) throw new Error(`Zara returned HTTP ${response.status}.`);
  return response.text();
}

export async function fetchBrowserlessHtml(
  url: URL,
  token = process.env.BROWSERLESS_TOKEN,
): Promise<string> {
  if (!token) throw new Error('Browserless is not configured.');

  const endpoint = new URL(BROWSERLESS_ENDPOINT);
  endpoint.searchParams.set('token', token);

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      url: url.toString(),
      content: true,
      cookies: false,
      screenshot: false,
      browserWSEndpoint: false,
    }),
    cache: 'no-store',
    signal: AbortSignal.timeout(45_000),
  });

  if (!response.ok) {
    throw new Error(`Browserless returned HTTP ${response.status}.`);
  }

  const payload = (await response.json()) as { content?: unknown };
  if (typeof payload.content !== 'string' || payload.content.length === 0) {
    throw new Error('Browserless returned no page content.');
  }
  return payload.content;
}

export const zaraAdapter: RetailerAdapter = {
  retailerSlug: 'zara-uk',

  supports(url) {
    return (
      (url.hostname === 'www.zara.com' || url.hostname === 'zara.com') &&
      url.pathname.startsWith('/uk/')
    );
  },

  async fetchProduct(url, variant) {
    if (!this.supports(url)) throw new Error('Unsupported Zara URL.');

    try {
      return parseZaraProductHtml(await fetchDirectHtml(url), url, variant);
    } catch (directError) {
      try {
        return parseZaraProductHtml(await fetchBrowserlessHtml(url), url, variant);
      } catch (browserlessError) {
        const directMessage =
          directError instanceof Error ? directError.message : 'Direct Zara request failed.';
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
      sourceUrl: ZARA_RETURN_POLICY_URL,
      checkedAt: new Date(),
    };
  },
};
