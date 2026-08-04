import { describe, expect, it } from 'vitest';

import { retailerAdapters } from './index';
import {
  isSupportedRetailerName,
  SUPPORTED_RETAILER_NAMES,
  SUPPORTED_RETAILER_SLUG_BY_NAME,
  supportedRetailersSentence,
} from './catalog';

const sampleUrls = {
  Zara: 'https://www.zara.com/uk/en/bomber-jacket-with-dots-p08372236.html?v1=545479235&v2=2417772',
  Mango:
    'https://shop.mango.com/gb/en/p/women/dresses-and-jumpsuits/dresses/flared-sleeve-satin-dress/27019066/79/00',
  Next: 'https://www.next.co.uk/style/sv098626/v86409',
  ASOS: 'https://www.asos.com/asos-design/asos-design-contrast-lace-detail-v-neck-cami-in-grey-marl/prd/210111307#colourWayId-210111308',
  UNIQLO:
    'https://www.uniqlo.com/uk/en/products/E473791-000/01?colorDisplayCode=65&sizeDisplayCode=002',
  'H&M': 'https://www2.hm.com/en_gb/productpage.1265326001.html',
  COS: 'https://www.cos.com/en-gb/women/womenswear/tshirts/regular/product/crew-neck-linen-t-shirt-black-1326337001',
} as const;

describe('supported retailer catalogue', () => {
  it('contains exactly the seven implemented UK retailers', () => {
    expect(SUPPORTED_RETAILER_NAMES).toEqual([
      'Zara',
      'Mango',
      'Next',
      'ASOS',
      'UNIQLO',
      'H&M',
      'COS',
    ]);

    expect(SUPPORTED_RETAILER_NAMES).not.toContain('Massimo Dutti');
    expect(SUPPORTED_RETAILER_NAMES).not.toContain('& Other Stories');
    expect(SUPPORTED_RETAILER_NAMES).not.toContain('Other');
  });

  it('maps every displayed retailer to a registered adapter and URL', () => {
    const registeredSlugs = new Set(
      retailerAdapters.map((adapter) => adapter.retailerSlug),
    );

    for (const retailer of SUPPORTED_RETAILER_NAMES) {
      const expectedSlug = SUPPORTED_RETAILER_SLUG_BY_NAME[retailer];
      expect(registeredSlugs.has(expectedSlug)).toBe(true);
      expect(
        retailerAdapters.find((adapter) =>
          adapter.supports(new URL(sampleUrls[retailer])),
        )?.retailerSlug,
      ).toBe(expectedSlug);
    }
  });

  it('validates names and writes a human-readable scope sentence', () => {
    expect(isSupportedRetailerName('Next')).toBe(true);
    expect(isSupportedRetailerName('Massimo Dutti')).toBe(false);
    expect(supportedRetailersSentence()).toBe(
      'Zara, Mango, Next, ASOS, UNIQLO, H&M and COS',
    );
  });
});
