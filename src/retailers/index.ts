export type {
  Money,
  ProductVariant,
  RetailerAdapter,
  RetailerProductSnapshot,
  RetailerReturnPolicy,
} from './types';

export { mangoAdapter } from './mango';
export { zaraAdapter } from './zara';

import { mangoAdapter } from './mango';
import { zaraAdapter } from './zara';

export const retailerAdapters = [mangoAdapter, zaraAdapter] as const;

export function findRetailerAdapter(url: URL) {
  return retailerAdapters.find((adapter) => adapter.supports(url)) ?? null;
}
