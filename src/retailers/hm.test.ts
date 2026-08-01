import { describe, expect, it } from 'vitest';

import { hmAdapter, parseHmProductHtml } from './hm';

const productUrl = new URL(
  'https://www2.hm.com/en_gb/productpage.1265326001.html',
);

const saleHtml = `
  <html>
    <head>
      <link rel="canonical" href="https://www2.hm.com/en_gb/productpage.1265326001.html" />
      <meta property="og:title" content="Women's Black Bubble-hem strappy dress | H&amp;M GB" />
      <meta property="product:price:currency" content="GBP" />
    </head>
    <body>
      <h1>Bubble-hem strappy dress</h1>
      <span data-testid="red-price">£14.00</span>
      <del data-testid="line-through-white-price">£22.99</del>
      <section aria-label="Colour"><h2>Colour:</h2><p>Black</p></section>
      <div data-testid="size-selector">
        <div role="radio" aria-label="Size XS: Out of stock. Select to see similar products.">XS</div>
        <div role="radio" aria-label="Size S: Available. Select the size">S</div>
        <div role="radio" aria-label="Size M: Few pieces left. Select this size.">M</div>
      </div>
      <button>Add to bag</button>
      <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@type": "ProductGroup",
          "name": "Bubble-hem strappy dress",
          "hasVariant": [
            {
              "@type": "Product",
              "sku": "1265326001002",
              "name": "Bubble-hem strappy dress - Black",
              "color": "Black",
              "size": "XS",
              "offers": {
                "@type": "Offer",
                "priceCurrency": "GBP",
                "price": 14,
                "priceSpecification": { "price": 22.99 },
                "availability": "https://schema.org/OutOfStock"
              }
            },
            {
              "@type": "Product",
              "sku": "1265326001003",
              "name": "Bubble-hem strappy dress - Black",
              "color": "Black",
              "size": "S",
              "offers": {
                "@type": "Offer",
                "priceCurrency": "GBP",
                "price": 14,
                "priceSpecification": { "price": 22.99 },
                "availability": "https://schema.org/InStock"
              }
            },
            {
              "@type": "Product",
              "sku": "1265326001004",
              "name": "Bubble-hem strappy dress - Black",
              "color": "Black",
              "size": "M",
              "offers": {
                "@type": "Offer",
                "priceCurrency": "GBP",
                "price": 14,
                "priceSpecification": { "price": 22.99 },
                "availability": "https://schema.org/InStock"
              }
            }
          ]
        }
      </script>
      <script id="__NEXT_DATA__" type="application/json">
        {
          "props": {
            "pageProps": {
              "product": {
                "articleCode": "1265326001",
                "redPrice": "£14.00",
                "redPriceValue": "14.0",
                "whitePrice": "£22.99",
                "whitePriceValue": "22.99",
                "productViewPriceType": "SALES_PRICE"
              }
            }
          }
        }
      </script>
    </body>
  </html>
`;

describe('hmAdapter', () => {
  it('recognises H&M UK product URLs only', () => {
    expect(hmAdapter.supports(productUrl)).toBe(true);
    expect(
      hmAdapter.supports(
        new URL(
          'https://www2.hm.com/en_gb/productpage.1265326001.html?utm_source=test',
        ),
      ),
    ).toBe(true);
    expect(
      hmAdapter.supports(new URL('https://www2.hm.com/en_gb/women.html')),
    ).toBe(false);
    expect(
      hmAdapter.supports(
        new URL('https://www2.hm.com/en_us/productpage.1265326001.html'),
      ),
    ).toBe(false);
  });

  it('uses the sale price and exact selected-size stock from H&M product variants', () => {
    const available = parseHmProductHtml(saleHtml, productUrl, {
      size: 'S',
      colour: 'Black',
    });
    const unavailable = parseHmProductHtml(saleHtml, productUrl, {
      size: 'XS',
      colour: 'Black',
    });

    expect(available.title).toBe('Bubble-hem strappy dress');
    expect(available.retailerProductId).toBe('1265326001');
    expect(available.price).toEqual({ amountMinor: 1400, currency: 'GBP' });
    expect(available.inStock).toBe(true);
    expect(unavailable.price.amountMinor).toBe(1400);
    expect(unavailable.inStock).toBe(false);
  });

  it('does not use the original white price or another size stock', () => {
    const missing = parseHmProductHtml(saleHtml, productUrl, {
      size: 'L',
      colour: 'Black',
    });

    expect(missing.price.amountMinor).toBe(1400);
    expect(missing.inStock).toBe(false);
  });

  it('uses rendered H&M size status only for the exact saved size', () => {
    const html = `
      <html>
        <head><meta property="product:price:currency" content="GBP" /></head>
        <body>
          <h1>Ribbed top</h1>
          <span data-testid="red-price">£9.99</span>
          <del data-testid="line-through-white-price">£17.99</del>
          <div>Colour: Dark Red</div>
          <div aria-label="Size XS: Out of stock. Select to see similar products."></div>
          <div aria-label="Size S: Few pieces left. Select this size."></div>
        </body>
      </html>
    `;

    expect(
      parseHmProductHtml(html, productUrl, {
        size: 'XS',
        colour: 'Dark Red',
      }).inStock,
    ).toBe(false);
    expect(
      parseHmProductHtml(html, productUrl, {
        size: 'S',
        colour: 'Dark Red',
      }).inStock,
    ).toBe(true);
  });

  it('rejects another saved colour instead of using the page variant', () => {
    expect(() =>
      parseHmProductHtml(saleHtml, productUrl, {
        size: 'S',
        colour: 'Cream',
      }),
    ).toThrow('H&M saved colour does not match the product page.');
  });

  it('fails clearly when only the original price is present', () => {
    const html = `
      <html>
        <body>
          <h1>Ribbed top</h1>
          <div>Colour: Black</div>
          <del data-testid="line-through-white-price">£17.99</del>
          <div aria-label="Size S: Available. Select the size"></div>
        </body>
      </html>
    `;

    expect(() =>
      parseHmProductHtml(html, productUrl, {
        size: 'S',
        colour: 'Black',
      }),
    ).toThrow('H&M current product price was not found for the saved variant.');
  });

  it('returns the standard H&M UK return window source', async () => {
    const policy = await hmAdapter.fetchReturnPolicy();
    expect(policy.returnWindowDays).toBe(30);
    expect(policy.sourceUrl).toContain('/en_gb/customer-service/');
  });
});
