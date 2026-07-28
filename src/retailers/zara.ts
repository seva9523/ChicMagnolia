import type {
  ProductVariant,
  RetailerAdapter,
  RetailerProductSnapshot,
  RetailerReturnPolicy,
} from './types';

const ZARA_RETURN_POLICY_URL =
  'https://www.zara.com/uk/en/help-center/HowToReturn';
const BROWSERLESS_FUNCTION_ENDPOINT =
  'https://production-lon.browserless.io/function';

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
  const normalized = String(value).replace(/[^0-9.,]/g, '').replace(',', '.');
  const amount = Number(normalized);
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

type BrowserlessProduct = {
  title?: unknown;
  canonicalUrl?: unknown;
  price?: unknown;
  currency?: unknown;
  inStock?: unknown;
};

export async function fetchBrowserlessProduct(
  url: URL,
  variant: ProductVariant,
  token = process.env.BROWSERLESS_TOKEN,
): Promise<RetailerProductSnapshot> {
  if (!token) throw new Error('Browserless is not configured.');

  const endpoint = new URL(BROWSERLESS_FUNCTION_ENDPOINT);
  endpoint.searchParams.set('token', token);

  const code = `
    export default async ({ page, context }) => {
      await page.setExtraHTTPHeaders({ 'accept-language': 'en-GB,en;q=0.9' });
      await page.goto(context.url, { waitUntil: 'networkidle2', timeout: 40000 });
      await new Promise((resolve) => setTimeout(resolve, 2500));

      const data = await page.evaluate(() => {
        const meta = (key) =>
          document.querySelector('meta[property="' + key + '"],meta[name="' + key + '"]')?.getAttribute('content')?.trim() || null;
        const clean = (value) => value?.replace(/\\s+/g, ' ').trim() || null;
        const title =
          clean(document.querySelector('h1')?.textContent) ||
          meta('og:title') ||
          clean(document.title.replace(/\\s*\\|\\s*ZARA.*$/i, ''));

        const preferredSelectors = [
          '[data-qa-qualifier="price-amount-current"]',
          '[data-qa-action="product-price"]',
          '.money-amount__main',
          '[class*="price"]',
        ];
        const candidates = [];
        for (const selector of preferredSelectors) {
          for (const element of document.querySelectorAll(selector)) {
            const text = clean(element.textContent);
            if (text && /£\\s*\\d/.test(text) && text.length < 80) candidates.push(text);
          }
        }
        if (candidates.length === 0) {
          const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
          while (walker.nextNode()) {
            const text = clean(walker.currentNode.textContent);
            if (text && /^£\\s*\\d[\\d,.]*$/.test(text)) candidates.push(text);
          }
        }

        const metaPrice = meta('product:price:amount') || meta('og:price:amount');
        const price = metaPrice || candidates[0] || null;
        const bodyText = clean(document.body?.innerText)?.toLowerCase() || '';
        const availability = meta('product:availability') || meta('og:availability') || '';
        const inStock = !availability.toLowerCase().includes('out') &&
          !bodyText.includes('out of stock') &&
          !bodyText.includes('coming soon');

        return {
          title,
          canonicalUrl: document.querySelector('link[rel="canonical"]')?.getAttribute('href') || meta('og:url') || location.href,
          price,
          currency: meta('product:price:currency') || meta('og:price:currency') || 'GBP',
          inStock,
        };
      });

      return { data, type: 'application/json' };
    };
  `;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code, context: { url: url.toString() } }),
    cache: 'no-store',
    signal: AbortSignal.timeout(55_000),
  });

  if (!response.ok) {
    throw new Error(`Browserless returned HTTP ${response.status}.`);
  }

  const payload = (await response.json()) as BrowserlessProduct;
  if (!payload.price) {
    throw new Error('Browserless could not find the Zara product price.');
  }

  return {
    canonicalUrl:
      typeof payload.canonicalUrl === 'string' ? payload.canonicalUrl : url.toString(),
    retailerProductId: productIdFromUrl(url),
    title: typeof payload.title === 'string' ? payload.title : 'Zara product',
    price: {
      amountMinor: priceToMinorUnits(payload.price),
      currency: typeof payload.currency === 'string' ? payload.currency : 'GBP',
    },
    variant,
    inStock: payload.inStock !== false,
    checkedAt: new Date(),
  };
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
        return await fetchBrowserlessProduct(url, variant);
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
