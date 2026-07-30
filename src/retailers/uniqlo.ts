import {
  canonicalLink,
  coloursMatch,
  elementCurrentPriceMinor,
  extractJsonScripts,
  findProductJsonRoots,
  findSchemaProduct,
  findStructuredVariant,
  firstString,
  firstTagText,
  firstUnlabelledProductPriceMinor,
  labelledPriceMinor,
  metaContent,
  productRegionHtml,
  recordAvailability,
  recordCurrentPriceMinor,
  selectedSizeAvailability,
  sizesMatch,
} from './parser';
import type {
  ProductVariant,
  RetailerAdapter,
  RetailerProductSnapshot,
  RetailerReturnPolicy,
} from './types';
import { visiblePageText } from './variant';

const UNIQLO_RETURN_POLICY_URL =
  'https://faq-uk.uniqlo.com/articles/en_US/Knowledge/What-is-your-online-returns-policy';
const BROWSERLESS_CONTENT_ENDPOINT =
  'https://production-lon.browserless.io/content';
const CHROME_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36';

function productIdentifiersFromUrl(url: URL): string[] {
  const current = url.pathname.match(
    /\/products\/(E\d{6}-\d{3})(?:\/\d{2})?/i,
  )?.[1];
  const legacy = url.pathname.match(/-(\d{6})\.html$/i)?.[1];
  const identifiers = [current, current?.match(/E(\d{6})/i)?.[1], legacy];
  return identifiers.filter((identifier): identifier is string =>
    Boolean(identifier),
  );
}

function productIdFromText(text: string): string | null {
  return text.match(/\bProduct ID\s*:?\s*(\d{6})/i)?.[1] ?? null;
}

function labelledColour(text: string): string | null {
  return (
    text
      .match(
        /\bCOLOU?R\s*:\s*([A-Z0-9][A-Z0-9 /&'’.-]{0,50}?)(?=\s+(?:WOMEN|MEN|KIDS|BABY|UNISEX|XXXS|XXS|XS|S|M|L|XL|XXL|3XL|4XL|\d{1,2}(?:INCH)?|£|30-DAY|ADD|PRODUCT|$))/i,
      )?.[1]
      ?.trim() ?? null
  );
}

function pageColourCandidates(
  html: string,
  productText: string,
  productRoots: ReturnType<typeof findProductJsonRoots>,
): string[] {
  const structured = productRoots.flatMap((root) => {
    const colour = firstString(root, [
      'colour',
      'color',
      'colourName',
      'colorName',
      'selectedColour',
      'selectedColor',
    ]);
    return colour ? [colour] : [];
  });
  const candidates = [
    metaContent(html, 'product:color'),
    metaContent(html, 'product:colour'),
    labelledColour(productText),
    ...structured,
  ];

  return [
    ...new Set(
      candidates.filter((candidate): candidate is string => Boolean(candidate)),
    ),
  ];
}

function pageMatchesSavedColour(
  candidates: string[],
  colour: string | null,
): boolean {
  if (!colour) return true;
  return candidates.some((candidate) => coloursMatch(candidate, colour));
}

function pagePriceMinor(
  html: string,
  productHtml: string,
  productText: string,
  schemaProduct: ReturnType<typeof findSchemaProduct>,
): number | null {
  const metaPrice = metaContent(html, 'product:price:amount');
  return (
    labelledPriceMinor(productText) ??
    elementCurrentPriceMinor(productHtml) ??
    schemaProductPriceMinor(schemaProduct) ??
    (metaPrice ? recordCurrentPriceMinor({ price: metaPrice }) : null) ??
    firstUnlabelledProductPriceMinor(productText)
  );
}

function schemaProductPriceMinor(
  schemaProduct: ReturnType<typeof findSchemaProduct>,
): number | null {
  const offers = schemaProduct?.offers;
  if (Array.isArray(offers)) {
    return offers.length === 1 && typeof offers[0] === 'object'
      ? recordCurrentPriceMinor(offers[0] as Record<string, unknown>)
      : null;
  }
  if (offers && typeof offers === 'object') {
    const offer = offers as Record<string, unknown>;
    const offerType = String(offer['@type'] ?? '').toLowerCase();
    return offerType === 'aggregateoffer'
      ? null
      : recordCurrentPriceMinor(offer);
  }
  return recordCurrentPriceMinor(schemaProduct);
}

function productLevelInStock(
  productText: string,
  schemaProduct: ReturnType<typeof findSchemaProduct>,
) {
  const structured = recordAvailability(schemaProduct);
  if (structured !== null) return structured;

  const normalized = productText.toLowerCase();
  if (/out of stock|sold out|currently unavailable/.test(normalized))
    return false;
  return /add to (?:bag|basket|cart)/.test(normalized);
}

function attributeValue(attributes: string, name: string) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return (
    attributes.match(
      new RegExp(`\\b${escaped}=["']([^"']*)["']`, 'i'),
    )?.[1] ?? null
  );
}

function isDisabledButton(attributes: string) {
  return (
    /(?:^|\s)disabled(?:\s|=|$)/i.test(attributes) ||
    /\baria-disabled=["']true["']/i.test(attributes) ||
    /\bdata-disabled=["']true["']/i.test(attributes)
  );
}

function sizeButtonLabel(attributes: string, innerHtml: string) {
  const visible = visiblePageText(innerHtml);
  if (visible) return visible;
  return attributeValue(attributes, 'aria-label') ?? '';
}

/**
 * UNIQLO renders online stock as a sibling `strike` overlay rather than by
 * disabling the size button. The useful hydrated buttons also carry their
 * three-digit display code in `value`/`id`; the server skeleton does not.
 */
export function uniqloSelectedSizeAvailability(
  html: string,
  savedSize: string,
): boolean | null {
  const hasLiveSizeMarkup = /\bsize-chip-wrapper\b/i.test(html);
  const liveButtons: Array<{
    label: string;
    available: boolean;
    hydrated: boolean;
  }> = [];

  for (const match of html.matchAll(
    /<button\b([^>]*)>([\s\S]*?)<\/button>/gi,
  )) {
    const attributes = match[1] ?? '';
    const label = sizeButtonLabel(attributes, match[2] ?? '');
    if (!label) continue;

    const index = match.index ?? 0;
    const end = index + match[0].length;
    const nextButtonIndex = html.indexOf('<button', end);
    const tailEnd =
      nextButtonIndex >= 0 && nextButtonIndex - end <= 1_200
        ? nextButtonIndex
        : Math.min(html.length, end + 600);
    const immediateTail = html.slice(end, tailEnd);
    const hydrated =
      attributeValue(attributes, 'value') !== null ||
      /\bid=["'][^"']+-\d{3}-\d+["']/i.test(attributes);
    const struck = /<div\b[^>]*class=["'][^"']*\bstrike\b[^"']*["']/i.test(
      immediateTail,
    );

    liveButtons.push({
      label,
      available: !isDisabledButton(attributes) && !struck,
      hydrated,
    });
  }

  if (hasLiveSizeMarkup) {
    const hydratedButtons = liveButtons.filter(({ hydrated }) => hydrated);
    if (hydratedButtons.length === 0) return null;

    const exact = hydratedButtons.filter(({ label }) =>
      sizesMatch(label, savedSize),
    );
    if (exact.length === 0) return false;
    return exact.every(({ available }) => available);
  }

  return null;
}

export function parseUniqloProductHtml(
  html: string,
  url: URL,
  variant: ProductVariant,
): RetailerProductSnapshot {
  const productHtml = productRegionHtml(html);
  const productText = visiblePageText(productHtml);
  const title =
    firstTagText(productHtml, 'h1') ??
    metaContent(html, 'og:title') ??
    'UNIQLO product';
  const pageProductId = productIdFromText(productText);
  const urlIdentifiers = productIdentifiersFromUrl(url);
  const jsonValues = extractJsonScripts(html);
  const productRoots = findProductJsonRoots(
    jsonValues,
    [...urlIdentifiers, pageProductId].filter(
      (identifier): identifier is string => Boolean(identifier),
    ),
  );
  const schemaProduct = findSchemaProduct(jsonValues);
  const structuredVariant = findStructuredVariant(productRoots, variant);
  const colourMatchesPage = pageMatchesSavedColour(
    pageColourCandidates(html, productText, productRoots),
    variant.colour,
  );

  if (variant.colour && !structuredVariant && !colourMatchesPage) {
    throw new Error('UNIQLO saved colour does not match the product page.');
  }

  const fallbackPrice = colourMatchesPage
    ? pagePriceMinor(html, productHtml, productText, schemaProduct)
    : null;
  const amountMinor = structuredVariant?.priceMinor ?? fallbackPrice;
  if (amountMinor === null) {
    throw new Error(
      'UNIQLO current product price was not found for the saved variant.',
    );
  }

  let inStock: boolean;
  if (variant.size) {
    const liveSizeAvailability = colourMatchesPage
      ? uniqloSelectedSizeAvailability(html, variant.size)
      : null;
    const hasLiveSizeMarkup = /\bsize-chip-wrapper\b/i.test(html);
    if (
      hasLiveSizeMarkup &&
      liveSizeAvailability === null &&
      structuredVariant?.inStock == null
    ) {
      throw new Error('UNIQLO selected-size stock has not loaded yet.');
    }

    const genericSizeAvailability =
      colourMatchesPage && !hasLiveSizeMarkup
        ? selectedSizeAvailability(productHtml, variant.size)
        : null;
    inStock =
      structuredVariant?.inStock ??
      liveSizeAvailability ??
      genericSizeAvailability ??
      false;
  } else {
    inStock = colourMatchesPage
      ? productLevelInStock(productText, schemaProduct)
      : false;
  }

  return {
    canonicalUrl:
      canonicalLink(html) ?? metaContent(html, 'og:url') ?? url.toString(),
    retailerProductId: pageProductId ?? urlIdentifiers.at(-1) ?? null,
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

  if (!response.ok) throw new Error(`UNIQLO returned HTTP ${response.status}.`);
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
      waitForTimeout: 1800,
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

export const uniqloAdapter: RetailerAdapter = {
  retailerSlug: 'uniqlo-uk',

  supports(url) {
    if (url.hostname !== 'www.uniqlo.com' && url.hostname !== 'uniqlo.com')
      return false;
    return (
      /\/uk\/en\/products\/E\d{6}-\d{3}(?:\/\d{2})?\/?$/i.test(url.pathname) ||
      /\/uk\/en\/product\/.+-\d{6}\.html$/i.test(url.pathname)
    );
  },

  async fetchProduct(url, variant) {
    if (!this.supports(url)) throw new Error('Unsupported UNIQLO URL.');

    try {
      return parseUniqloProductHtml(await fetchDirectHtml(url), url, variant);
    } catch (directError) {
      try {
        return parseUniqloProductHtml(
          await fetchBrowserlessHtml(url),
          url,
          variant,
        );
      } catch (browserlessError) {
        const directMessage =
          directError instanceof Error
            ? directError.message
            : 'Direct UNIQLO request failed.';
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
      returnWindowDays: 30,
      sourceUrl: UNIQLO_RETURN_POLICY_URL,
      checkedAt: new Date(),
    };
  },
};
