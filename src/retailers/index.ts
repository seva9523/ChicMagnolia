export type {
  Money,
  ProductVariant,
  RetailerAdapter,
  RetailerProductSnapshot,
  RetailerReturnPolicy,
} from './types';

export { asosAdapter } from './asos';
export { mangoAdapter } from './mango';
export { nextAdapter } from './next';
export { uniqloAdapter } from './uniqlo';
export { zaraAdapter } from './zara';

import { asosAdapter, parseAsosProductHtml } from './asos';
import {
  fetchAsosProductInteractive,
  fetchAsosProductViaOxylabs,
} from './asos-oxylabs';
import { mangoAdapter } from './mango';
import { parseMangoOxylabsHtml } from './mango-oxylabs';
import { nextAdapter, parseNextProductHtml } from './next';
import { fetchOxylabsHtml } from './oxylabs';
import type {
  ProductVariant,
  RetailerAdapter,
  RetailerProductSnapshot,
} from './types';
import { parseUniqloProductHtml, uniqloAdapter } from './uniqlo';
import { zaraAdapter } from './zara';
import { parseZaraOxylabsHtml } from './zara-oxylabs';

type ProductParser = (
  html: string,
  url: URL,
  variant: ProductVariant,
) => RetailerProductSnapshot;

type ProductFetcher = (
  url: URL,
  variant: ProductVariant,
) => Promise<RetailerProductSnapshot>;

type RetailerConfiguration = {
  adapter: RetailerAdapter;
  parseProductHtml: ProductParser;
  fetchInteractive?: ProductFetcher;
  fetchScheduled?: ProductFetcher;
};

const retailerConfigurations: readonly RetailerConfiguration[] = [
  {
    adapter: asosAdapter,
    parseProductHtml: parseAsosProductHtml,
    fetchInteractive: fetchAsosProductInteractive,
    fetchScheduled: fetchAsosProductViaOxylabs,
  },
  { adapter: uniqloAdapter, parseProductHtml: parseUniqloProductHtml },
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
            primaryError instanceof Error
              ? primaryError.message
              : 'Primary retailer request failed.';
          const oxylabsMessage =
            oxylabsError instanceof Error
              ? oxylabsError.message
              : 'Oxylabs fallback failed.';
          throw new Error(
            `${primaryMessage} Oxylabs fallback: ${oxylabsMessage}`,
          );
        }
      }
    },
  };
}

function registeredAdapter(
  configuration: RetailerConfiguration,
): RetailerAdapter {
  if (configuration.fetchInteractive) {
    return {
      ...configuration.adapter,
      fetchProduct: configuration.fetchInteractive,
    };
  }

  return withOxylabsFallback(
    configuration.adapter,
    configuration.parseProductHtml,
  );
}

export const retailerAdapters = retailerConfigurations.map(registeredAdapter);

export function findRetailerAdapter(url: URL) {
  return retailerAdapters.find((adapter) => adapter.supports(url)) ?? null;
}

export async function fetchProductForDailyMonitoring(
  url: URL,
  variant: ProductVariant,
): Promise<RetailerProductSnapshot> {
  const configuration = retailerConfigurations.find(({ adapter }) =>
    adapter.supports(url),
  );
  if (!configuration) throw new Error('This retailer is not supported yet.');

  if (configuration.fetchScheduled) {
    return configuration.fetchScheduled(url, variant);
  }

  // Scheduled monitoring uses the rendered UK Oxylabs route immediately so
  // persistence and email work remain inside the Vercel function window.
  const html = await fetchOxylabsHtml(url, undefined, 42_000);
  return configuration.parseProductHtml(html, url, variant);
}
