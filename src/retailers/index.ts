export type {
  Money,
  ProductVariant,
  RetailerAdapter,
  RetailerProductSnapshot,
  RetailerReturnPolicy,
} from './types';

export { zaraAdapter } from './zara';

import { zaraAdapter } from './zara';

export const retailerAdapters = [zaraAdapter] as const;

export function findRetailerAdapter(url: URL) {
  return retailerAdapters.find((adapter) => adapter.supports(url)) ?? null;
}
