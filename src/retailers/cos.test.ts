import { describe, expect, it } from 'vitest';

import { cosAdapter, parseCosProductHtml } from './cos';

const productUrl = new URL(
  'https://www.cos.com/en-gb/women/womenswear/tshirts/regular/product/crew-neck-linen-t-shirt-white-brown-striped-1326337004',
);

const saleHtml = `
  <html>
    <head>
      <link rel="canonical" href="${productUrl.toString()}" />
      <meta property="og:title" content="CREW-NECK LINEN T-SHIRT - WHITE / BROWN / STRIPED | COS GB" />
      <meta property="product:price:amount" content="35" />
      <meta property="product:price:currency" content="GBP" />
      <meta property="product:availability" content="in stock" />
    </head>
    <body>
      <h1>CREW-NECK LINEN T-SHIRT</h1>
      <div>£25.00</div>
      <div>Regular price £35.00</div>
      <div>Lowest historical price £21.00</div>
      <div>White / Brown / Striped</div>
      <button data-testid="size-selector-button-XS" value="23639-81493">XS</button>
      <button data-testid="size-selector-button-S" value="23639-81494">S</button>
      <button data-testid="size-selector-button-M" value="23639-81495">M</button>
      <button data-testid="size-selector-button-L" value="23639-81496">L</button>
      <button>Add to bag</button>
      <script id="__NEXT_DATA__" type="application/json">
        {
          "props": {
            "pageProps": {
              "product": {
                "name": "CREW-NECK LINEN T-SHIRT",
                "variantName": "WHITE / BROWN / STRIPED",
                "defaultVariantName": "WHITE / BROWN / STRIPED",
                "product": "23639",
                "sku": "1326337004",
                "price": "£25.00",
                "priceAsNumber": 25,
                "priceBeforeDiscount": "£35.00",
                "priceBeforeDiscountAsNumber": 35,
                "discountPercent": 29,
                "lowestPrice": [
                  {
                    "periodDays": 30,
                    "price": "£21.00",
                    "priceAsNumber": 21,
                    "priceBeforeDiscount": "£35.00"
                  }
                ],
                "showAsOnSale": true,
                "available": true,
                "items": [
                  {
                    "item": "23639-81493",
                    "name": "XS",
                    "sku": "1326337004002",
                    "stock": "yes"
                  },
                  {
                    "item": "23639-81494",
                    "name": "S",
                    "sku": "1326337004003",
                    "stock": "no"
                  },
                  {
                    "item": "23639-81495",
                    "name": "M",
                    "sku": "1326337004004",
                    "stock": "yes"
                  },
                  {
                    "item": "23639-81496",
                    "name": "L",
                    "sku": "1326337004005",
                    "stock": "low",
                    "stockQuantity": 4
                  }
                ]
              }
            }
          }
        }
      </script>
    </body>
  </html>
`;

describe('cosAdapter', () => {
  it('recognises COS UK product URLs only', () => {
    expect(cosAdapter.supports(productUrl)).toBe(true);
    expect(
      cosAdapter.supports(
        new URL(`${productUrl.toString()}?utm_source=newsletter`),
      ),
    ).toBe(true);
    expect(
      cosAdapter.supports(new URL('https://www.cos.com/en-gb/women/new-arrivals')),
    ).toBe(false);
    expect(
      cosAdapter.supports(
        new URL(
          'https://www.cos.com/en-us/women/product/crew-neck-linen-t-shirt-1326337004',
        ),
      ),
    ).toBe(false);
  });

  it('uses the current sale price, not regular or lowest historical price', () => {
    const snapshot = parseCosProductHtml(saleHtml, productUrl, {
      size: 'XS',
      colour: 'White / Brown / Striped',
    });

    expect(snapshot.title).toBe('CREW-NECK LINEN T-SHIRT');
    expect(snapshot.retailerProductId).toBe('1326337004');
    expect(snapshot.price).toEqual({ amountMinor: 2500, currency: 'GBP' });
    expect(snapshot.inStock).toBe(true);
  });

  it('uses only the exact selected COS size stock', () => {
    const unavailable = parseCosProductHtml(saleHtml, productUrl, {
      size: 'S',
      colour: 'WHITE / BROWN / STRIPED',
    });
    const lowStock = parseCosProductHtml(saleHtml, productUrl, {
      size: 'L',
      colour: 'White / Brown / Striped',
    });
    const missing = parseCosProductHtml(saleHtml, productUrl, {
      size: 'XL',
      colour: 'White / Brown / Striped',
    });

    expect(unavailable.inStock).toBe(false);
    expect(lowStock.inStock).toBe(true);
    expect(missing.inStock).toBe(false);
    expect(missing.price.amountMinor).toBe(2500);
  });

  it('rejects another saved colour instead of using the selected page variant', () => {
    expect(() =>
      parseCosProductHtml(saleHtml, productUrl, {
        size: 'XS',
        colour: 'Black',
      }),
    ).toThrow('COS saved colour does not match the product page.');
  });

  it('falls back to the exact rendered size button without borrowing another size', () => {
    const html = `
      <html>
        <head>
          <meta property="og:title" content="COTTON T-SHIRT - BLACK | COS GB" />
          <meta property="product:price:amount" content="29" />
          <meta property="product:price:currency" content="GBP" />
        </head>
        <body>
          <h1>COTTON T-SHIRT</h1>
          <button data-testid="size-selector-button-S" value="1">S</button>
          <button data-testid="size-selector-button-M" aria-disabled="true" value="2">M</button>
        </body>
      </html>
    `;

    expect(
      parseCosProductHtml(html, productUrl, {
        size: 'S',
        colour: 'Black',
      }).inStock,
    ).toBe(true);
    expect(
      parseCosProductHtml(html, productUrl, {
        size: 'M',
        colour: 'Black',
      }).inStock,
    ).toBe(false);
  });

  it('does not treat a lowest historical price as the current price', () => {
    const html = `
      <html>
        <head><meta property="og:title" content="COTTON T-SHIRT - BLACK | COS GB" /></head>
        <body>
          <h1>COTTON T-SHIRT</h1>
          <div>Lowest historical price £21.00</div>
          <button data-testid="size-selector-button-S">S</button>
        </body>
      </html>
    `;

    expect(() =>
      parseCosProductHtml(html, productUrl, {
        size: 'S',
        colour: 'Black',
      }),
    ).toThrow('COS current product price was not found for the saved variant.');
  });

  it('returns the COS UK return window', async () => {
    const policy = await cosAdapter.fetchReturnPolicy();
    expect(policy.returnWindowDays).toBe(30);
    expect(policy.sourceUrl).toContain('/en-gb/customer-service/');
  });
});
