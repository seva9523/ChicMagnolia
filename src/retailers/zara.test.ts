import { describe, expect, it } from 'vitest';

import { parseZaraProductHtml, zaraAdapter } from './zara';

const productUrl = new URL(
  'https://www.zara.com/uk/en/example-product-p01234567.html',
);

const html = `
  <html>
    <head>
      <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@type": "Product",
          "name": "Structured blazer",
          "sku": "01234567",
          "url": "https://www.zara.com/uk/en/example-product-p01234567.html",
          "offers": {
            "@type": "Offer",
            "price": "39.99",
            "priceCurrency": "GBP",
            "availability": "https://schema.org/InStock"
          }
        }
      </script>
    </head>
  </html>
`;

describe('zaraAdapter', () => {
  it('recognises UK Zara product URLs', () => {
    expect(zaraAdapter.supports(productUrl)).toBe(true);
    expect(
      zaraAdapter.supports(new URL('https://www.zara.com/us/en/product.html')),
    ).toBe(false);
  });

  it('parses structured product metadata', () => {
    const snapshot = parseZaraProductHtml(html, productUrl, {
      size: 'M',
      colour: 'Black',
    });

    expect(snapshot.title).toBe('Structured blazer');
    expect(snapshot.retailerProductId).toBe('01234567');
    expect(snapshot.price).toEqual({ amountMinor: 3999, currency: 'GBP' });
    expect(snapshot.inStock).toBe(true);
    expect(snapshot.variant).toEqual({ size: 'M', colour: 'Black' });
  });

  it('fails clearly when product metadata is unavailable', () => {
    expect(() =>
      parseZaraProductHtml('<html></html>', productUrl, {
        size: null,
        colour: null,
      }),
    ).toThrow('Zara product metadata was not found.');
  });
});
