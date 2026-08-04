import { findRetailerAdapter } from './index';
import {
  isSupportedRetailerName,
  SUPPORTED_RETAILER_SLUG_BY_NAME,
  supportedRetailersSentence,
  type SupportedRetailerName,
} from './catalog';

export type ValidRetailerSelection = {
  ok: true;
  retailerName: SupportedRetailerName;
  productUrl: URL;
};

export type InvalidRetailerSelection = {
  ok: false;
  message: string;
};

export type RetailerSelectionResult =
  | ValidRetailerSelection
  | InvalidRetailerSelection;

export function validateRetailerSelection(
  retailerName: string,
  productUrl: string,
): RetailerSelectionResult {
  if (!isSupportedRetailerName(retailerName)) {
    return {
      ok: false,
      message: 'Select a currently supported retailer.',
    };
  }

  let url: URL;
  try {
    url = new URL(productUrl);
  } catch {
    return { ok: false, message: 'Enter a valid product URL.' };
  }

  const adapter = findRetailerAdapter(url);
  if (!adapter) {
    return {
      ok: false,
      message: `ChicMagnolia currently supports ${supportedRetailersSentence()} UK product pages.`,
    };
  }

  if (adapter.retailerSlug !== SUPPORTED_RETAILER_SLUG_BY_NAME[retailerName]) {
    return {
      ok: false,
      message: 'The selected retailer does not match the product URL.',
    };
  }

  return { ok: true, retailerName, productUrl: url };
}
