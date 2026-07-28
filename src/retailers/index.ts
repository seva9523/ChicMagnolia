export type {
  Money,
  ProductVariant,
  RetailerAdapter,
  RetailerProductSnapshot,
  RetailerReturnPolicy,
} from './types';

export { mangoAdapter } from './mango';
export { nextAdapter } from './next';
export { zaraAdapter } from './zara';

import { mangoAdapter, parseMangoProductHtml } from './mango';
import { nextAdapter, parseNextProductHtml } from './next';
import { fetchOxylabsHtml } from './oxylabs';
import type { ProductVariant, RetailerAdapter, RetailerProductSnapshot } from './types';
import { zaraAdapter } from './zara';
import { parseZaraOxylabsHtml } from './zara-oxylabs';

type ProductParser = (
  html: string,
  url: URL,
  variant: ProductVariant,
) => RetailerProductSnapshot;

function withOxylabsFallback(
  adapter: RetailerAdapter,
  parseProductHtml: ProductParser,
): RetailerAdapter {
  return {
    ...adapter,
    async fetchProduct(url, variant) {
      try {
        return await adapter.fetchProduct(url, variant);
      } catch (primaryError) {
        try {
          return parseProductHtml(await fetchOxylabsHtml(url), url, variant);
        } catch (oxylabsError) {
          const primaryMessage =
            primaryError instanceof Error ? primaryError.message : 'Primary retailer request failed.';
          const oxylabsMessage =
            oxylabsError instanceof Error ? oxylabsError.message : 'Oxylabs fallback failed.';
          throw new Error(`${primaryMessage} Oxylabs fallback: ${oxylabsMessage}`);
        }
      }
    },
  };
}

export const retailerAdapters = [
  withOxylabsFallback(nextAdapter, parseNextProductHtml),
  withOxylabsFallback(mangoAdapter, parseMangoProductHtml),
  withOxylabsFallback(zaraAdapter, parseZaraOxylabsHtml),
] as const;

export function findRetailerAdapter(url: URL) {
  return retailerAdapters.find((adapter) => adapter.supports(url)) ?? null;
}
