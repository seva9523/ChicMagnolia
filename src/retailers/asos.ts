import { extractAsosEmbeddedData } from './asos-embedded';

import {
  canonicalLink,
  coloursMatch,
  decodeHtml,
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
  recordAvailability,
  recordCurrentPriceMinor,
  selectedSizeAvailability,
} from './parser';
import type {
  ProductVariant,
  RetailerAdapter,
  RetailerProductSnapshot,
  RetailerReturnPolicy,
} from './types';
import { visiblePageText } from './variant';

const ASOS_RETURN_POLICY_URL =
  'https://www.asos.com/customer-care/returns-refunds/how-do-i-return-something-to-you-from-the-uk/';

function productIdFromUrl(url: URL): string | null {
  return url.pathname.match(/\/prd\/(\d+)(?:\/|$)/i)?.[1] ?? null;
}

function productCodeFromText(text: string): string | null {
  return text.match(/\bProduct Code\s*:?\s*([A-Z0-9-]+)/i)?.[1] ?? null;
}

function cleanAsosTitle(value: string) {
  return value.replace(/\s*\|\s*ASOS(?:\s.*)?$/i, '').trim();
}

function headingMatches(html: string) {
  return [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)]
    .map((match) => ({
      index: match.index ?? -1,
      text: visiblePageText(match[1] ?? ''),
    }))
    .filter(({ index, text }) => index >= 0 && Boolean(text));
}

function lastRawProductCodeIndex(html: string): number | null {
  const matches = [
    ...html.matchAll(
      /Product(?:\s|&nbsp;|&#0*32;|&#x0*20;|\\u0020){0,8}Code/gi,
    ),
  ];
  return matches.at(-1)?.index ?? null;
}

function asosProductRegionHtml(html: string): string {
  const headings = headingMatches(html);

  for (const heading of [...headings].reverse()) {
    if (/browser is not supported/i.test(heading.text)) continue;
    const region = html.slice(heading.index, heading.index + 250_000);
    if (/\bProduct Code\s*:?\s*[A-Z0-9-]+/i.test(visiblePageText(region))) {
      return region;
    }
  }

  const productCodeIndex = lastRawProductCodeIndex(html);
  if (productCodeIndex !== null) {
    return html.slice(
      Math.max(0, productCodeIndex - 250_000),
      Math.min(html.length, productCodeIndex + 75_000),
    );
  }

  const lastProductHeading = [...headings]
    .reverse()
    .find(({ text }) => !/browser is not supported/i.test(text));
  return lastProductHeading
    ? html.slice(lastProductHeading.index, lastProductHeading.index + 250_000)
    : html;
}

function asosProductTitle(html: string, productHtml: string) {
  const metaTitle = metaContent(html, 'og:title');
  if (metaTitle) return cleanAsosTitle(metaTitle);

  const regionHeading = firstTagText(productHtml, 'h1');
  if (regionHeading && !/browser is not supported/i.test(regionHeading)) {
    return cleanAsosTitle(regionHeading);
  }

  const pageHeading = [...headingMatches(html)]
    .reverse()
    .find(({ text }) => !/browser is not supported/i.test(text))?.text;
  return pageHeading ? cleanAsosTitle(pageHeading) : 'ASOS product';
}

function urlProductTitleCandidate(url: URL): string | null {
  const productPath = url.pathname.split(/\/prd\//i)[0] ?? '';
  const slug = productPath.split('/').filter(Boolean).at(-1);
  return slug ? decodeURIComponent(slug).replaceAll('-', ' ') : null;
}

function lastTextIndex(text: string, candidate: string): number {
  return text.toLowerCase().lastIndexOf(candidate.toLowerCase());
}

function asosProductVisibleText(
  html: string,
  productHtml: string,
  title: string,
  url: URL,
) {
  const fullText = visiblePageText(html);
  const candidates = [title, urlProductTitleCandidate(url)].filter(
    (candidate): candidate is string => Boolean(candidate?.trim()),
  );

  for (const candidate of candidates) {
    const index = lastTextIndex(fullText, candidate);
    if (index >= 0) return fullText.slice(index, index + 20_000);
  }

  const codeMatches = [
    ...fullText.matchAll(/\bProduct Code\s*:?\s*[A-Z0-9-]+/gi),
  ];
  const codeIndex = codeMatches.at(-1)?.index;
  if (codeIndex !== undefined) {
    return fullText.slice(
      Math.max(0, codeIndex - 5_000),
      Math.min(fullText.length, codeIndex + 10_000),
    );
  }

  return visiblePageText(productHtml);
}

function asosProductMarkupWindow(
  html: string,
  productHtml: string,
  title: string,
): string {
  const titleIndex = html.toLowerCase().lastIndexOf(title.toLowerCase());
  if (titleIndex >= 0) {
    return html.slice(
      Math.max(0, titleIndex - 2_000),
      Math.min(html.length, titleIndex + 40_000),
    );
  }

  const productCodeIndex = lastRawProductCodeIndex(html);
  if (productCodeIndex !== null) {
    return html.slice(
      Math.max(0, productCodeIndex - 40_000),
      Math.min(html.length, productCodeIndex + 10_000),
    );
  }

  return productHtml.slice(0, 80_000);
}

function labelledColour(text: string): string | null {
  return (
    text
      .match(
        /\bCOLOU?R\s*:\s*([A-Z0-9][A-Z0-9 /&'’.-]{0,50}?)(?=\s+(?:SIZE|SELECT|NOW|WAS|ADD|PRODUCT|$))/i,
      )?.[1]
      ?.trim() ?? null
  );
}

function titleColourCandidates(title: string): string[] {
  const candidates = [
    title.match(/\s+-\s+([A-Z][A-Z0-9 /&'’.-]{1,40})$/)?.[1],
    title.match(
      /\bin\s+([A-Z0-9][A-Z0-9 /&'’.-]{1,40}?)(?:\s+-\s+[A-Z0-9 /&'’.-]+)?$/i,
    )?.[1],
  ];
  return candidates.filter((candidate): candidate is string =>
    Boolean(candidate?.trim()),
  );
}

function urlColourCandidate(url: URL): string | null {
  const productPath = url.pathname.split(/\/prd\//i)[0] ?? '';
  const slug = productPath.split('/').filter(Boolean).at(-1);
  if (!slug) return null;

  const colourMarker = slug.toLowerCase().lastIndexOf('-in-');
  if (colourMarker < 0) return null;

  return decodeURIComponent(slug.slice(colourMarker + 4)).replaceAll('-', ' ');
}

function pageColourCandidates(
  html: string,
  url: URL,
  title: string,
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
    ...titleColourCandidates(title),
    urlColourCandidate(url),
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

function priceMinorFromValue(value: string): number | null {
  const decoded = decodeHtml(value);
  const match = decoded.match(
    /(?:£|GBP\s*)\s*([0-9]{1,5}(?:[.,][0-9]{1,2})?)/i,
  );
  return match?.[1] ? recordCurrentPriceMinor({ price: `£${match[1]}` }) : null;
}

function attributeProductPriceMinor(productMarkup: string): number | null {
  const preferred: number[] = [];
  const generic: number[] = [];

  for (const match of productMarkup.matchAll(/<[a-z0-9-]+\b([^>]*)>/gi)) {
    const attributes = decodeHtml(match[1] ?? '');
    if (
      /previous|original|regular|rrp|was|old-price|strike/i.test(attributes)
    ) {
      continue;
    }

    const price = priceMinorFromValue(attributes);
    if (price === null) continue;

    if (/current|sale|discount|now|selling/i.test(attributes)) {
      preferred.push(price);
    } else if (/price/i.test(attributes)) {
      generic.push(price);
    }
  }

  return preferred[0] ?? generic[0] ?? null;
}

function pagePriceMinor(
  html: string,
  productMarkup: string,
  productText: string,
  schemaProduct: ReturnType<typeof findSchemaProduct>,
): number | null {
  const metaPrice = metaContent(html, 'product:price:amount');
  return (
    labelledPriceMinor(productText) ??
    elementCurrentPriceMinor(productMarkup) ??
    attributeProductPriceMinor(productMarkup) ??
    schemaProductPriceMinor(schemaProduct) ??
    firstUnlabelledProductPriceMinor(productText) ??
    (metaPrice ? recordCurrentPriceMinor({ price: metaPrice }) : null)
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

export function parseAsosProductHtml(
  html: string,
  url: URL,
  variant: ProductVariant,
): RetailerProductSnapshot {
  const productHtml = asosProductRegionHtml(html);
  const title = asosProductTitle(html, productHtml);
  const productText = asosProductVisibleText(html, productHtml, title, url);
  const productMarkup = asosProductMarkupWindow(html, productHtml, title);
  const urlProductId = productIdFromUrl(url);
  const embedded = extractAsosEmbeddedData(html, url);
  const visibleProductCode = productCodeFromText(productText);
  const embeddedProductCode = firstString(embedded.product, [
    'productCode',
    'sku',
  ]);
  const productCode = embeddedProductCode ?? visibleProductCode;
  const jsonValues = extractJsonScripts(html);
  const productRoots = findProductJsonRoots(
    jsonValues,
    [urlProductId, productCode].filter((identifier): identifier is string =>
      Boolean(identifier),
    ),
  );
  const allProductRoots = [...productRoots, ...embedded.variantRoots];
  const schemaProduct = findSchemaProduct(jsonValues);
  const structuredVariant = findStructuredVariant(allProductRoots, variant);
  const colourMatchesPage = pageMatchesSavedColour(
    pageColourCandidates(html, url, title, productText, allProductRoots),
    variant.colour,
  );

  if (variant.colour && !structuredVariant && !colourMatchesPage) {
    throw new Error('ASOS saved colour does not match the product page.');
  }

  const fallbackPrice = colourMatchesPage
    ? (recordCurrentPriceMinor(embedded.productPrice) ??
      pagePriceMinor(html, productMarkup, productText, schemaProduct))
    : null;
  const amountMinor = structuredVariant?.priceMinor ?? fallbackPrice;
  if (amountMinor === null) {
    throw new Error(
      'ASOS current product price was not found for the saved variant.',
    );
  }

  let inStock: boolean;
  if (variant.size) {
    const pageSizeAvailability = colourMatchesPage
      ? selectedSizeAvailability(productMarkup, variant.size)
      : null;
    inStock = structuredVariant?.inStock ?? pageSizeAvailability ?? false;
  } else {
    inStock = colourMatchesPage
      ? (embedded.productInStock ??
        productLevelInStock(productText, schemaProduct))
      : false;
  }

  return {
    canonicalUrl:
      canonicalLink(html) ?? metaContent(html, 'og:url') ?? url.toString(),
    retailerProductId: productCode ?? urlProductId,
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
      'user-agent':
        'Mozilla/5.0 (compatible; ChicMagnolia/0.1; +https://chic-magnolia.vercel.app)',
    },
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) throw new Error(`ASOS returned HTTP ${response.status}.`);
  return response.text();
}

export const asosAdapter: RetailerAdapter = {
  retailerSlug: 'asos-uk',

  supports(url) {
    return (
      (url.hostname === 'www.asos.com' || url.hostname === 'asos.com') &&
      /\/prd\/\d+(?:\/|$)/i.test(url.pathname)
    );
  },

  async fetchProduct(url, variant) {
    if (!this.supports(url)) throw new Error('Unsupported ASOS URL.');
    return parseAsosProductHtml(await fetchDirectHtml(url), url, variant);
  },

  async fetchReturnPolicy(): Promise<RetailerReturnPolicy> {
    return {
      returnWindowDays: 28,
      sourceUrl: ASOS_RETURN_POLICY_URL,
      checkedAt: new Date(),
    };
  },
};
