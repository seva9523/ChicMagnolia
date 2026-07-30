import { describe, expect, it } from 'vitest';

import {
  parseUniqloProductHtml,
  uniqloAdapter,
  uniqloSelectedSizeAvailability,
} from './uniqlo';

const productUrl = new URL(
  'https://www.uniqlo.com/uk/en/products/E479407-000/00?colorDisplayCode=08&sizeDisplayCode=004',
);

const saleHtml = `
  <html>
    <head>
      <link rel="canonical" href="https://www.uniqlo.com/uk/en/products/E479407-000/00" />
      <meta property="product:price:currency" content="GBP" />
    </head>
    <body>
      <h1>Warm Stretch Trousers (Shorter)</h1>
      <div>Colour: 08 DARK GREY</div>
      <div class="prices">
        <span data-testid="current-price">£12.90</span>
        <span data-testid="original-price">£24.90</span>
        <span>30-Day Lowest Price: £19.90</span>
      </div>
      <button data-testid="size-option">XS</button>
      <button data-testid="size-option" aria-disabled="true">S</button>
      <button data-testid="size-option">M</button>
      <button>Add to cart</button>
      <div>Product ID: 479407</div>
    </body>
  </html>
`;

const liveSizeWrapperHtml = `
  <html>
    <head>
      <meta property="product:price:currency" content="GBP" />
    </head>
    <body>
      <h1>Linen Blend Easy Trousers</h1>
      <div>Colour: 65 BLUE</div>
      <span data-testid="current-price">£9.90</span>
      <span data-testid="original-price">£19.90</span>
      <span>30-Day Lowest Price: £14.90</span>
      <div class="size-chip-wrapper">
        <button value="001" id="XXS-001-1" aria-disabled="false">XXS</button>
        <div class=""></div>
      </div>
      <div class="size-chip-wrapper">
        <button value="002" id="XS-002-2" aria-disabled="false">XS</button>
        <div class=""></div>
      </div>
      <div class="size-chip-wrapper">
        <button value="003" id="S-003-3" aria-disabled="false">S</button>
        <div class=""></div>
      </div>
      <div class="size-chip-wrapper">
        <button value="005" id="L-005-5" aria-disabled="false">L</button>
        <div class="strike"></div>
      </div>
      <button>Add to cart</button>
      <div>Product ID: 473791</div>
    </body>
  </html>
`;

describe('uniqloAdapter', () => {
  it('recognises current and legacy UNIQLO UK product URLs', () => {
    expect(uniqloAdapter.supports(productUrl)).toBe(true);
    expect(
      uniqloAdapter.supports(
        new URL('https://www.uniqlo.com/uk/en/product/joggers-466465.html'),
      ),
    ).toBe(true);
    expect(
      uniqloAdapter.supports(new URL('https://www.uniqlo.com/uk/en/women')),
    ).toBe(false);
    expect(
      uniqloAdapter.supports(
        new URL('https://www.uniqlo.com/us/en/products/E479407-000/00'),
      ),
    ).toBe(false);
  });

  it('uses the current sale price, not the original or 30-day reference price', () => {
    const snapshot = parseUniqloProductHtml(saleHtml, productUrl, {
      size: 'S',
      colour: 'Dark Grey',
    });

    expect(snapshot.title).toBe('Warm Stretch Trousers (Shorter)');
    expect(snapshot.canonicalUrl).toBe(
      'https://www.uniqlo.com/uk/en/products/E479407-000/00',
    );
    expect(snapshot.retailerProductId).toBe('479407');
    expect(snapshot.price).toEqual({ amountMinor: 1290, currency: 'GBP' });
    expect(snapshot.inStock).toBe(false);
  });

  it('checks the selected size without borrowing another size stock', () => {
    const available = parseUniqloProductHtml(saleHtml, productUrl, {
      size: 'M',
      colour: '08 Dark Grey',
    });
    const missing = parseUniqloProductHtml(saleHtml, productUrl, {
      size: 'L',
      colour: 'Dark Grey',
    });

    expect(available.inStock).toBe(true);
    expect(missing.inStock).toBe(false);
  });

  it('reads UNIQLO hydrated size wrappers and their strike overlays', () => {
    const url = new URL(
      'https://www.uniqlo.com/uk/en/products/E473791-000/01?colorDisplayCode=65&sizeDisplayCode=002',
    );
    const available = parseUniqloProductHtml(liveSizeWrapperHtml, url, {
      size: 'XS',
      colour: 'Blue',
    });
    const unavailable = parseUniqloProductHtml(liveSizeWrapperHtml, url, {
      size: 'L',
      colour: '65 BLUE',
    });
    const missing = parseUniqloProductHtml(liveSizeWrapperHtml, url, {
      size: 'XL',
      colour: 'Blue',
    });

    expect(uniqloSelectedSizeAvailability(liveSizeWrapperHtml, 'XS')).toBe(
      true,
    );
    expect(uniqloSelectedSizeAvailability(liveSizeWrapperHtml, 'L')).toBe(
      false,
    );
    expect(available.price.amountMinor).toBe(990);
    expect(available.inStock).toBe(true);
    expect(unavailable.inStock).toBe(false);
    expect(missing.inStock).toBe(false);
  });

  it('waits for hydrated UNIQLO stock rather than trusting the server skeleton', () => {
    const unhydrated = liveSizeWrapperHtml
      .replace(/ value="\d{3}"/g, '')
      .replace(/ id="[^"]+"/g, '');

    expect(() =>
      parseUniqloProductHtml(unhydrated, productUrl, {
        size: 'XS',
        colour: 'Blue',
      }),
    ).toThrow('UNIQLO selected-size stock has not loaded yet.');
  });

  it('does not let a size-list wrapper override a disabled selected size', () => {
    const html = `
      <html>
        <body>
          <h1>Warm Stretch Trousers</h1>
          <div>Colour: 08 DARK GREY</div>
          <span data-testid="current-price">£12.90</span>
          <div class="size-options">
            <button aria-label="Size S" aria-disabled="true"></button>
            <button aria-label="Size M"></button>
          </div>
          <div>Product ID: 479407</div>
        </body>
      </html>
    `;

    const unavailable = parseUniqloProductHtml(html, productUrl, {
      size: 'S',
      colour: 'Dark Grey',
    });
    const available = parseUniqloProductHtml(html, productUrl, {
      size: 'M',
      colour: 'Dark Grey',
    });

    expect(unavailable.inStock).toBe(false);
    expect(available.inStock).toBe(true);
  });

  it('keeps the exact colour and size price and stock from structured data', () => {
    const html = `
      <html>
        <body>
          <h1>Warm Stretch Trousers (Shorter)</h1>
          <div>Colour: 08 DARK GREY</div>
          <div><span>£99.90</span><span>£129.90</span></div>
          <div>Product ID: 479407</div>
          <script type="application/json">
            {
              "product": {
                "id": "E479407-000",
                "colours": [
                  {
                    "colorName": "DARK GREY",
                    "price": { "current": { "value": 24.90 }, "original": { "value": 39.90 } },
                    "sizes": [
                      { "sizeName": "S", "stockStatus": "OutOfStock" },
                      { "sizeName": "M", "stockStatus": "InStock", "currentPrice": 22.90 }
                    ]
                  },
                  {
                    "colorName": "BLACK",
                    "price": { "current": { "value": 14.90 } },
                    "sizes": [
                      { "sizeName": "S", "stockStatus": "InStock" }
                    ]
                  }
                ]
              }
            }
          </script>
        </body>
      </html>
    `;

    const snapshot = parseUniqloProductHtml(html, productUrl, {
      size: 'S',
      colour: 'Dark Grey',
    });

    expect(snapshot.price.amountMinor).toBe(2490);
    expect(snapshot.inStock).toBe(false);
  });

  it('matches inch sizes exactly', () => {
    const html = `
      <html>
        <body>
          <h1>Drapey Wide Flare Jeans</h1>
          <div>Colour: 30 NATURAL</div>
          <span data-testid="current-price">£12.90</span>
          <button data-testid="size-option">24inch</button>
          <button data-testid="size-option" disabled>34inch</button>
          <div>Product ID: 477333</div>
        </body>
      </html>
    `;

    const available = parseUniqloProductHtml(html, productUrl, {
      size: '24inch',
      colour: 'Natural',
    });
    const unavailable = parseUniqloProductHtml(html, productUrl, {
      size: '34inch',
      colour: 'Natural',
    });

    expect(available.inStock).toBe(true);
    expect(unavailable.inStock).toBe(false);
  });

  it('rejects a different saved colour instead of using the visible variant', () => {
    expect(() =>
      parseUniqloProductHtml(saleHtml, productUrl, {
        size: 'M',
        colour: 'Black',
      }),
    ).toThrow('UNIQLO saved colour does not match the product page.');
  });

  it('does not treat the 30-day reference price as the current price', () => {
    const html = `
      <html>
        <body>
          <h1>Warm Stretch Trousers (Shorter)</h1>
          <div>Colour: 08 DARK GREY</div>
          <div>30-Day Lowest Price: £19.90</div>
          <button data-testid="size-option">S</button>
        </body>
      </html>
    `;

    expect(() =>
      parseUniqloProductHtml(html, productUrl, {
        size: 'S',
        colour: 'Dark Grey',
      }),
    ).toThrow(
      'UNIQLO current product price was not found for the saved variant.',
    );
  });

  it('returns the UNIQLO UK return window', async () => {
    const policy = await uniqloAdapter.fetchReturnPolicy();
    expect(policy.returnWindowDays).toBe(30);
    expect(policy.sourceUrl).toContain('faq-uk.uniqlo.com');
  });
});
