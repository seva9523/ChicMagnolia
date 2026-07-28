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

  const productId = productIdFromUrl(url);
  const variantId = url.searchParams.get('v1');

  const code = `
    export default async ({ page, context }) => {
      const productId = context.productId;
      const variantId = context.variantId;
      const captured = [];

      const walk = (value, path = '', depth = 0) => {
        if (depth > 10 || value == null) return [];
        const results = [];
        if (Array.isArray(value)) {
          for (let index = 0; index < value.length; index += 1) {
            results.push(...walk(value[index], path + '[' + index + ']', depth + 1));
          }
          return results;
        }
        if (typeof value !== 'object') return results;

        const entries = Object.entries(value);
        const text = JSON.stringify(value).slice(0, 120000);
        const matchesProduct =
          (productId && text.includes(productId)) ||
          (variantId && text.includes(variantId));

        if (matchesProduct) {
          const priceKeys = [
            'price',
            'currentPrice',
            'salePrice',
            'amount',
            'value',
            'priceValue',
          ];
          for (const key of priceKeys) {
            const candidate = value[key];
            if (typeof candidate === 'number' || typeof candidate === 'string') {
              const numeric = Number(String(candidate).replace(/[^0-9.]/g, ''));
              if (Number.isFinite(numeric) && numeric > 0) {
                results.push({
                  price: numeric,
                  currency: value.currency || value.currencyCode || 'GBP',
                  title: value.name || value.title || null,
                  inStock:
                    value.availability !== 'OUT_OF_STOCK' &&
                    value.availability !== 'out_of_stock' &&
                    value.inStock !== false,
                  path: path + '.' + key,
                });
              }
            }
          }
        }

        for (const [key, child] of entries) {
          results.push(...walk(child, path ? path + '.' + key : key, depth + 1));
        }
        return results;
      };

      page.on('response', async (response) => {
        try {
          const contentType = response.headers()['content-type'] || '';
          if (!contentType.includes('json')) return;
          const responseUrl = response.url();
          if (!responseUrl.includes('zara.com')) return;
          const json = await response.json();
          captured.push(...walk(json));
        } catch {}
      });

      await page.setExtraHTTPHeaders({ 'accept-language': 'en-GB,en;q=0.9' });
      await page.goto(context.url, { waitUntil: 'domcontentloaded', timeout: 40000 });
      await new Promise((resolve) => setTimeout(resolve, 7000));

      const dom = await page.evaluate(() => {
        const clean = (value) => value?.replace(/\\s+/g, ' ').trim() || null;
        const meta = (key) =>
          document.querySelector('meta[property="' + key + '"],meta[name="' + key + '"]')?.getAttribute('content')?.trim() || null;
        const body = clean(document.body?.innerText) || '';
        const priceMatch = body.match(/£\\s*([0-9]+(?:[.,][0-9]{2})?)/);
        return {
          title: clean(document.querySelector('h1')?.textContent) || meta('og:title'),
          canonicalUrl:
            document.querySelector('link[rel="canonical"]')?.getAttribute('href') ||
            meta('og:url') ||
            location.href,
          price: meta('product:price:amount') || meta('og:price:amount') || priceMatch?.[1] || null,
          currency: meta('product:price:currency') || meta('og:price:currency') || 'GBP',
          inStock: !body.toLowerCase().includes('out of stock'),
        };
      });

      const sensible = captured
        .filter((item) => item.price >= 1 && item.price <= 100000)
        .sort((a, b) => {
          const aDecimal = Number.isInteger(a.price) ? 1 : 0;
          const bDecimal = Number.isInteger(b.price) ? 1 : 0;
          return aDecimal - bDecimal;
        });

      const network = sensible[0] || null;
      const normalizedNetworkPrice = network
        ? network.price > 1000 && Number.isInteger(network.price)
          ? network.price / 100
          : network.price
        : null;

      const data = {
        title: network?.title || dom.title,
        canonicalUrl: dom.canonicalUrl,
        price: normalizedNetworkPrice || dom.price,
        currency: network?.currency || dom.currency || 'GBP',
        inStock: network ? network.inStock : dom.inStock,
      };

      return { data, type: 'application/json' };
    };
  `;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      code,
      context: {
        url: url.toString(),
        productId,
        variantId,
      },
    }),
    cache: 'no-store',
    signal: AbortSignal.timeout(60_000),
  });

  if (!response.ok) {
    throw new Error(`Browserless returned HTTP ${response.status}.`);
  }

  const payload = (await response.json()) as BrowserlessProduct;
  if (!payload.price) {
    throw new Error('Browserless could not find Zara product data in network responses.');
  }

  return {
    canonicalUrl:
      typeof payload.canonicalUrl === 'string' ? payload.canonicalUrl : url.toString(),
    retailerProductId: productId,
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
