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

function priceToMinorUnits(value: unknown): number {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error('Zara product price could not be parsed.');
  }
  return Math.round(amount * 100);
}

export function parseZaraProductHtml(
  html: string,
  url: URL,
  variant: ProductVariant,
): RetailerProductSnapshot {
  const product = findProductNode(extractJsonLd(html));
  if (!product) throw new Error('Zara product metadata was not found.');

  const offersValue = product.offers;
  const offer = Array.isArray(offersValue) ? offersValue[0] : offersValue;
  if (!offer || typeof offer !== 'object') {
    throw new Error('Zara product offer metadata was not found.');
  }

  const offerRecord = offer as Record<string, unknown>;
  const availability = String(offerRecord.availability ?? '');
  const canonicalUrl = String(product.url ?? url.toString());
  const productId = product.sku ?? product.productID ?? null;

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

  if (!response.ok) {
    throw new Error(`Zara returned HTTP ${response.status}.`);
  }

  return response.text();
}

export async function fetchBrowserlessHtml(
  url: URL,
  token = process.env.BROWSERLESS_TOKEN,
): Promise<string> {
  if (!token) {
    throw new Error('Browserless is not configured.');
  }

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
      const html = await fetchDirectHtml(url);
      return parseZaraProductHtml(html, url, variant);
    } catch (directError) {
      try {
        const html = await fetchBrowserlessHtml(url);
        return parseZaraProductHtml(html, url, variant);
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
