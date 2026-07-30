import { parseAsosProductHtml } from './asos';
import { fetchOxylabsHtml } from './oxylabs';
import type { ProductVariant, RetailerProductSnapshot } from './types';

export function normaliseAsosRequestUrl(url: URL) {
  const requestUrl = new URL(url.toString());
  const colourWayId = requestUrl.hash.match(/^#colourWayId-(\d+)$/i)?.[1];
  requestUrl.hash = '';
  if (colourWayId && !requestUrl.searchParams.has('colourWayId')) {
    requestUrl.searchParams.set('colourWayId', colourWayId);
  }
  return requestUrl;
}

export function parseAsosOxylabsHtml(
  html: string,
  url: URL,
  variant: ProductVariant,
): RetailerProductSnapshot {
  const snapshot = parseAsosProductHtml(html, url, variant);
  return { ...snapshot, canonicalUrl: url.toString() };
}

export async function fetchAsosProductViaOxylabs(
  url: URL,
  variant: ProductVariant,
  timeoutMs = 42_000,
): Promise<RetailerProductSnapshot> {
  const html = await fetchOxylabsHtml(
    normaliseAsosRequestUrl(url),
    undefined,
    timeoutMs,
  );
  return parseAsosOxylabsHtml(html, url, variant);
}

export async function fetchAsosProductInteractive(
  url: URL,
  variant: ProductVariant,
): Promise<RetailerProductSnapshot> {
  return fetchAsosProductViaOxylabs(url, variant);
}
