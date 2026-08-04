import { describe, expect, it } from 'vitest';

import { validateRetailerSelection } from './selection';

describe('retailer selection validation', () => {
  it('accepts a supported retailer whose URL uses its adapter', () => {
    const result = validateRetailerSelection(
      'Next',
      'https://www.next.co.uk/style/sv098626/v86409',
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.retailerName).toBe('Next');
      expect(result.productUrl.hostname).toBe('www.next.co.uk');
    }
  });

  it('rejects names that are not actually implemented', () => {
    expect(
      validateRetailerSelection(
        'Massimo Dutti',
        'https://www.massimodutti.com/gb/example-product-l00000000',
      ),
    ).toEqual({
      ok: false,
      message: 'Select a currently supported retailer.',
    });
  });

  it('rejects a valid URL from an unsupported retailer', () => {
    const result = validateRetailerSelection(
      'COS',
      'https://www.stories.com/en_gbp/clothing/dresses/example.html',
    );

    expect(result).toEqual({
      ok: false,
      message:
        'ChicMagnolia currently supports Zara, Mango, Next, ASOS, UNIQLO, H&M and COS UK product pages.',
    });
  });

  it('rejects a supported URL when the selected retailer is different', () => {
    expect(
      validateRetailerSelection(
        'Zara',
        'https://www.asos.com/asos-design/example/prd/210111307',
      ),
    ).toEqual({
      ok: false,
      message: 'The selected retailer does not match the product URL.',
    });
  });

  it('rejects malformed URLs', () => {
    expect(validateRetailerSelection('ASOS', 'not-a-url')).toEqual({
      ok: false,
      message: 'Enter a valid product URL.',
    });
  });
});
