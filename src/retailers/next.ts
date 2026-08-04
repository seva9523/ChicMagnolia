import type {
  ProductVariant,
  RetailerAdapter,
  RetailerProductSnapshot,
  RetailerReturnPolicy,
} from './types';

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

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function metaContent(html: string, key: string): string | null {
  const escaped = escapeRegExp(key);
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
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
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

function productHeading(html: string): string | null {
  const heading = stripTags(
    html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? '',
  );
  return heading || null;
}

function productScopedPrice(html: string): string | null {
  const text = stripTags(html);
  const heading = productHeading(html);
  const productCode = productCodeFromHtml(html);
  if (!heading) return null;

  const codeMarker = productCode ? `Product Code: ${productCode}` : null;
  const codeIndex = codeMarker ? text.indexOf(codeMarker) : -1;
  const headingIndex =
    codeIndex >= 0
      ? text.lastIndexOf(heading, codeIndex)
      : text.indexOf(heading);
  if (headingIndex < 0) return null;

  const scopeEnd = codeIndex >= 0 ? codeIndex : headingIndex + 800;
  const scope = text.slice(headingIndex, scopeEnd);
  return (
    scope.match(/\bNow\s*£\s*([0-9]+(?:\.[0-9]{1,2})?)/i)?.[1] ??
    scope.match(/£\s*([0-9]+(?:\.[0-9]{1,2})?)/)?.[1] ??
    null
  );
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

function attributeValue(attributes: string, name: string): string | null {
  const escaped = escapeRegExp(name);
  return (
    attributes.match(new RegExp(`${escaped}=["']([^"']*)["']`, 'i'))?.[1] ??
    null
  );
}

function nextSizeAliases(size: string): string[] {
  const value = size.trim();
  const aliases = new Set([value]);
  const clothingSize = value.toUpperCase().match(/^(?:UK\s*)?(\d{1,2})$/)?.[1];

  if (clothingSize) {
    aliases.add(clothingSize);
    aliases.add(`UK ${clothingSize}`);
  }

  return [...aliases].filter(Boolean);
}

function exactNextSizeAvailability(html: string, size: string): boolean | null {
  const aliases = nextSizeAliases(size);
  const matches: boolean[] = [];

  for (const match of html.matchAll(
    /<button\b([^>]*)>([\s\S]*?)<\/button>/gi,
  )) {
    const attributes = decodeHtml(match[1] ?? '');
    const text = stripTags(match[2] ?? '');
    const ariaLabel = decodeHtml(
      attributeValue(attributes, 'aria-label') ?? '',
    );
    const isExactSize = aliases.some((alias) => {
      const escaped = escapeRegExp(alias);
      return (
        text.trim().toLowerCase() === alias.toLowerCase() ||
        new RegExp(`^${escaped}(?:\\s|$)`, 'i').test(ariaLabel)
      );
    });

    if (!isExactSize) continue;

    const evidence = `${attributes} ${ariaLabel} ${text}`.toLowerCase();
    const unavailable =
      evidence.includes('unavailable') ||
      evidence.includes('out of stock') ||
      evidence.includes('sold out') ||
      /aria-disabled=["']true["']/.test(evidence) ||
      /(?:^|\s)disabled(?:\s|=|$)/.test(evidence);
    matches.push(!unavailable);
  }

  if (matches.length === 0) return null;
  return matches.some(Boolean);
}

function selectedNextColourMatches(html: string, colour: string): boolean {
  const escapedColour = escapeRegExp(colour.trim());
  const text = stripTags(html);
  const explicitColour = new RegExp(
    `\\bColour\\s*:\\s*${escapedColour}(?=$|[\\s,./-])`,
    'i',
  );
  if (explicitColour.test(text)) return true;

  const heading =
    productHeading(html) ?? metaContent(html, 'og:title') ?? '';
  return new RegExp(
    `(?:^|[^a-z0-9])${escapedColour}(?=$|[^a-z0-9])`,
    'i',
  ).test(heading);
}

function exactNextVariantInStock(
  html: string,
  variant: ProductVariant,
  defaultInStock: boolean,
): boolean {
  if (variant.colour && !selectedNextColourMatches(html, variant.colour)) {
    return false;
  }

  if (variant.size) {
    return exactNextSizeAvailability(html, variant.size) ?? false;
  }

  return defaultInStock;
}

export function parseNextProductHtml(
  html: string,
  url: URL,
  variant: ProductVariant,
): RetailerProductSnapshot {
  const price =
    productScopedPrice(html) ??
    metaContent(html, 'product:price:amount') ??
    metaContent(html, 'og:price:amount') ??
    visiblePrice(html);
  if (!price) throw new Error('Next product metadata was not found.');

  const title =
    metaContent(html, 'og:title') ?? productHeading(html) ?? 'Next product';
  const text = stripTags(html).toLowerCase();
  const defaultInStock =
    !text.includes('out of stock') && !text.includes('currently unavailable');
  const basePriceMinor = priceToMinorUnits(price);

  return {
    canonicalUrl: metaContent(html, 'og:url') ?? url.toString(),
    retailerProductId: productCodeFromHtml(html) ?? productIdFromUrl(url),
    title: title || 'Next product',
    price: {
      amountMinor: basePriceMinor,
      currency:
        metaContent(html, 'product:price:currency') ??
        metaContent(html, 'og:price:currency') ??
        'GBP',
    },
    variant,
    inStock: exactNextVariantInStock(html, variant, defaultInStock),
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
