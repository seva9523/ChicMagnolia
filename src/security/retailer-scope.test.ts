import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const purchasePage = readFileSync(
  'src/app/dashboard/purchases/new/page.tsx',
  'utf8',
);
const purchaseActions = readFileSync(
  'src/app/dashboard/purchases/actions.ts',
  'utf8',
);

describe('user-facing retailer scope', () => {
  it('renders the shared supported catalogue rather than a separate list', () => {
    expect(purchasePage).toContain('SUPPORTED_RETAILER_NAMES.map');
    expect(purchasePage).toContain('<SupportedRetailers');
    expect(purchasePage).not.toContain("'Massimo Dutti'");
    expect(purchasePage).not.toContain("'& Other Stories'");
    expect(purchasePage).not.toContain("'Other'");
  });

  it('validates both the selected retailer and its URL before insertion', () => {
    expect(purchaseActions).toContain('validateRetailerSelection(');
    expect(purchaseActions).toContain(
      'retailer_name: retailerSelection.retailerName',
    );
    expect(purchaseActions).toContain(
      'product_url: retailerSelection.productUrl.toString()',
    );
  });
});
