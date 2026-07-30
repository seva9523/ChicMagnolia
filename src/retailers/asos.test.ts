import { describe, expect, it } from 'vitest';

import { asosAdapter, parseAsosProductHtml } from './asos';

const productUrl = new URL(
  'https://www.asos.com/style-cheat/style-cheat-embellished-blazer-mini-dress-in-bright-pink/prd/203527221',
);
const greyMarlProductUrl = new URL(
  'https://www.asos.com/asos-design/asos-design-contrast-lace-detail-v-neck-cami-in-grey-marl/prd/210111307',
);

const saleHtml = `
  <html>
    <head>
      <meta property="og:url" content="https://www.asos.com/style-cheat/style-cheat-embellished-blazer-mini-dress-in-bright-pink/prd/203527221" />
      <meta property="product:price:amount" content="70.00" />
      <meta property="product:price:currency" content="GBP" />
    </head>
    <body>
      <h1>Style Cheat embellished blazer mini dress in bright pink</h1>
      <div>COLOUR: Bright Pink</div>
      <div><span>Now £43.50</span><span>Was £70.00</span></div>
      <label>SIZE:</label>
      <select>
        <option>UK 8</option>
        <option disabled>UK 10</option>
      </select>
      <button>Add to bag</button>
      <div>Product Code: 121298412</div>
    </body>
  </html>
`;

const longNavigationShell = `
  <nav>
    <div>Sale under &pound;1.00</div>
    <div>Black dresses</div>
    <div>Navigation item</div>
  </nav>
`.repeat(2_500);

const renderedGreyMarlHtml = `
  <html>
    <head>
      <meta property="og:url" content="${greyMarlProductUrl.toString()}" />
      <meta property="product:price:amount" content="12.00" />
      <meta property="product:price:currency" content="GBP" />
    </head>
    <body>
      <h1>your browser is not supported</h1>
      ${longNavigationShell}
      <main>
        <h1>ASOS DESIGN contrast lace detail v neck cami in grey marl</h1>
        <div class="product-price">
          <span data-testid="current-price">&pound;5.99</span>
          <span data-testid="previous-price">&pound;12.00</span>
        </div>
        <label>SIZE:</label>
        <select>
          <option disabled>2XS - UK 4-6</option>
          <option>XS - UK 6-8</option>
          <option>S - UK 8-10</option>
          <option disabled>M - UK 12-14</option>
        </select>
        <button>Add to bag</button>
        <section>
          <h2>Size &amp; Fit</h2>
          <p>Model is wearing: S - UK 8-10</p>
        </section>
        <section>
          <h2>Product Details</h2>
          <p>Product Code: 154233432</p>
        </section>
      </main>
    </body>
  </html>
`;

describe('asosAdapter', () => {
  it('recognises ASOS product URLs and rejects non-product URLs', () => {
    expect(asosAdapter.supports(productUrl)).toBe(true);
    expect(
      asosAdapter.supports(new URL('https://asos.com/test/prd/205272647')),
    ).toBe(true);
    expect(
      asosAdapter.supports(new URL('https://www.asos.com/women/dresses')),
    ).toBe(false);
    expect(
      asosAdapter.supports(new URL('https://example.com/test/prd/205272647')),
    ).toBe(false);
  });

  it('uses the current sale price and the saved size stock only', () => {
    const unavailable = parseAsosProductHtml(saleHtml, productUrl, {
      size: '10',
      colour: 'Bright Pink',
    });
    const available = parseAsosProductHtml(saleHtml, productUrl, {
      size: '8',
      colour: 'Bright Pink',
    });

    expect(unavailable.title).toBe(
      'Style Cheat embellished blazer mini dress in bright pink',
    );
    expect(unavailable.retailerProductId).toBe('121298412');
    expect(unavailable.price).toEqual({ amountMinor: 4350, currency: 'GBP' });
    expect(unavailable.inStock).toBe(false);
    expect(available.inStock).toBe(true);
  });

  it('skips the unsupported-browser shell and parses the actual product region', () => {
    const available = parseAsosProductHtml(
      renderedGreyMarlHtml,
      greyMarlProductUrl,
      {
        size: 'S',
        colour: 'Grey marl',
      },
    );
    const unavailable = parseAsosProductHtml(
      renderedGreyMarlHtml,
      greyMarlProductUrl,
      {
        size: 'M',
        colour: 'Grey marl',
      },
    );

    expect(available.title).toBe(
      'ASOS DESIGN contrast lace detail v neck cami in grey marl',
    );
    expect(available.retailerProductId).toBe('154233432');
    expect(available.price).toEqual({ amountMinor: 599, currency: 'GBP' });
    expect(available.inStock).toBe(true);
    expect(unavailable.price.amountMinor).toBe(599);
    expect(unavailable.inStock).toBe(false);
  });

  it('parses a single current offer from product JSON-LD', () => {
    const html = `
      <html>
        <body>
          <h1>Dress in black - BLACK</h1>
          <div>COLOUR: Black</div>
          <button>UK 8</button>
          <script type="application/ld+json">
            {
              "@context": "https://schema.org",
              "@type": "Product",
              "name": "Dress &quot;Edition&quot; in black",
              "sku": "203527221",
              "offers": {
                "@type": "Offer",
                "price": "39.99",
                "priceCurrency": "GBP",
                "availability": "https://schema.org/InStock"
              }
            }
          </script>
        </body>
      </html>
    `;

    const snapshot = parseAsosProductHtml(html, productUrl, {
      size: '8',
      colour: 'Black',
    });

    expect(snapshot.price.amountMinor).toBe(3999);
  });

  it('uses an explicitly marked current-price element before original metadata', () => {
    const html = `
      <html>
        <head><meta property="product:price:amount" content="70.00" /></head>
        <body>
          <h1>Dress in black - BLACK</h1>
          <div>COLOUR: Black</div>
          <span data-testid="current-price">£43.50</span>
          <span data-testid="previous-price">£70.00</span>
          <button>UK 8</button>
        </body>
      </html>
    `;

    const snapshot = parseAsosProductHtml(html, productUrl, {
      size: '8',
      colour: 'Black',
    });

    expect(snapshot.price.amountMinor).toBe(4350);
  });

  it('does not borrow another size or colour price and stock from structured data', () => {
    const html = `
      <html>
        <body>
          <h1>Structured midi dress in black - BLACK</h1>
          <div>COLOUR: Black</div>
          <div>Now £99.00 Was £120.00</div>
          <div>Product Code: 132578296</div>
          <script id="__NEXT_DATA__" type="application/json">
            {
              "props": {
                "pageProps": {
                  "product": {
                    "id": "203527221",
                    "variants": [
                      {
                        "colour": "Black",
                        "brandSize": "UK 8",
                        "price": { "current": { "value": 38.50 }, "previous": { "value": 55 } },
                        "isInStock": false
                      },
                      {
                        "colour": "Black",
                        "brandSize": "UK 10",
                        "price": { "current": { "value": 29 } },
                        "isInStock": true
                      },
                      {
                        "colour": "Red",
                        "brandSize": "UK 8",
                        "price": { "current": { "value": 19 } },
                        "isInStock": true
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

    const snapshot = parseAsosProductHtml(html, productUrl, {
      size: '8',
      colour: 'Black',
    });

    expect(snapshot.price.amountMinor).toBe(3850);
    expect(snapshot.inStock).toBe(false);
  });

  it('rejects a saved colour that cannot be matched to the page', () => {
    expect(() =>
      parseAsosProductHtml(saleHtml, productUrl, {
        size: '8',
        colour: 'Black',
      }),
    ).toThrow('ASOS saved colour does not match the product page.');
  });

  it('treats a missing saved size as unavailable instead of using another size', () => {
    const snapshot = parseAsosProductHtml(saleHtml, productUrl, {
      size: '12',
      colour: 'Bright Pink',
    });

    expect(snapshot.price.amountMinor).toBe(4350);
    expect(snapshot.inStock).toBe(false);
  });

  it('fails clearly when only the original price is labelled and no current price exists', () => {
    const html = `
      <html>
        <body>
          <h1>Dress in black</h1>
          <div>COLOUR: Black</div>
          <div>Was £70.00</div>
          <button>UK 8</button>
        </body>
      </html>
    `;

    expect(() =>
      parseAsosProductHtml(html, productUrl, {
        size: '8',
        colour: 'Black',
      }),
    ).toThrow(
      'ASOS current product price was not found for the saved variant.',
    );
  });

  it('returns the ASOS UK return window', async () => {
    const policy = await asosAdapter.fetchReturnPolicy();
    expect(policy.returnWindowDays).toBe(28);
    expect(policy.sourceUrl).toContain(
      'asos.com/customer-care/returns-refunds',
    );
  });
});
