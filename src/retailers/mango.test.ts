import { describe, expect, it } from 'vitest';

import { mangoAdapter, parseMangoProductHtml } from './mango';

const productUrl = new URL(
  'https://shop.mango.com/gb/en/p/women/dresses-and-jumpsuits/dresses/flared-sleeve-satin-dress/27019066/79/00',
);

const html = `
  <html>
    <head>
      <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@type": "Product",
          "name": "Flared sleeve satin dress",
          "sku": "27019066",
          "url": "https://shop.mango.com/gb/en/p/women/dresses-and-jumpsuits/dresses/flared-sleeve-satin-dress/27019066/79/00",
          "offers": {
            "@type": "Offer",
            "price": "59.99",
            "priceCurrency": "GBP",
            "availability": "https://schema.org/InStock"
          }
        }
      </script>
    </head>
  </html>
`;

describe('mangoAdapter', () => {
  it('recognises UK Mango product URLs', () => {
    expect(mangoAdapter.supports(productUrl)).toBe(true);
    expect(
      mangoAdapter.supports(
        new URL('https://shop.mango.com/us/en/p/women/example/27019066'),
      ),
    ).toBe(false);
  });

  it('parses structured product metadata', () => {
    const snapshot = parseMangoProductHtml(html, productUrl, {
      size: 'M',
      colour: 'Red',
    });

    expect(snapshot.title).toBe('Flared sleeve satin dress');
    expect(snapshot.retailerProductId).toBe('27019066');
    expect(snapshot.price).toEqual({ amountMinor: 5999, currency: 'GBP' });
    expect(snapshot.inStock).toBe(true);
    expect(snapshot.variant).toEqual({ size: 'M', colour: 'Red' });
  });

  it('fails clearly when product metadata is unavailable', () => {
    expect(() =>
      parseMangoProductHtml('<html></html>', productUrl, {
        size: null,
        colour: null,
      }),
    ).toThrow('Mango product metadata was not found.');
  });
});
