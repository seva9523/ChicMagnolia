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

import { mangoAdapter } from './mango';
import { parseMangoOxylabsHtml } from './mango-oxylabs';
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

type RetailerConfiguration = {
  adapter: RetailerAdapter;
  parseProductHtml: ProductParser;
};

const retailerConfigurations: readonly RetailerConfiguration[] = [
  { adapter: nextAdapter, parseProductHtml: parseNextProductHtml },
  { adapter: mangoAdapter, parseProductHtml: parseMangoOxylabsHtml },
  { adapter: zaraAdapter, parseProductHtml: parseZaraOxylabsHtml },
];

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

export const retailerAdapters = retailerConfigurations.map(({ adapter, parseProductHtml }) =>
  withOxylabsFallback(adapter, parseProductHtml),
);

export function findRetailerAdapter(url: URL) {
  return retailerAdapters.find((adapter) => adapter.supports(url)) ?? null;
}

export async function fetchProductForDailyMonitoring(
  url: URL,
  variant: ProductVariant,
): Promise<RetailerProductSnapshot> {
  const configuration = retailerConfigurations.find(({ adapter }) => adapter.supports(url));
  if (!configuration) throw new Error('This retailer is not supported yet.');

  // The interactive adapters first try direct and Browserless requests. Those are
  // useful for manual checks, but can consume almost the entire 60-second Vercel
  // function window before reaching the working Oxylabs fallback. Scheduled checks
  // go directly to the rendered UK page and leave time to persist results and email.
  const html = await fetchOxylabsHtml(url, undefined, 42_000);
  return configuration.parseProductHtml(html, url, variant);
}
