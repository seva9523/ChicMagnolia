import { describe, expect, it } from 'vitest';

import { parseMangoOxylabsHtml } from './mango-oxylabs';

const mangoUrl = new URL(
  'https://shop.mango.com/gb/en/p/women/dresses-and-jumpsuits/dresses/flared-sleeve-satin-dress/27019066/79/00',
);

const palePinkMangoUrl = new URL(
  'https://shop.mango.com/gb/en/p/women/dresses-and-jumpsuits/dresses/flared-sleeve-satin-dress/27019066/83/00',
);

describe('parseMangoOxylabsHtml', () => {
  it('uses Mango current-price text while applying selected-size stock', () => {
    const html = `
      <html>
        <head>
          <title>Flared-sleeve satin dress | MANGO</title>
          <meta property="product:price:amount" content="69.99">
        </head>
        <body>
          <div>
            Initial price struck through [£ 69.99 ] £69.99
            Current price [£ 35.99 ] £35.99
          </div>
          <div>Russet</div>
          <div>12 (EUR L) NOT AVAILABLE. I WANT IT!</div>
          <section>Complete the look £9.99</section>
        </body>
      </html>
    `;

    const snapshot = parseMangoOxylabsHtml(html, mangoUrl, {
      size: 'L',
      colour: 'Russet',
    });

    expect(snapshot.price.amountMinor).toBe(3599);
    expect(snapshot.inStock).toBe(false);
  });

  it('handles Mango accessibility markup that repeats the original price', () => {
    const html = `
      <html>
        <head><title>Flared-sleeve satin dress | MANGO</title></head>
        <body>
          <h1>Flared-sleeve satin dress</h1>
          <div>
            <span>£69.99</span>
            <span aria-hidden="true">£69.99</span>
            <span>£35.99</span>
          </div>
          <div>12 (EUR L) NOT AVAILABLE. I WANT IT!</div>
          <section>Complete the look £9.99</section>
        </body>
      </html>
    `;

    const snapshot = parseMangoOxylabsHtml(html, mangoUrl, {
      size: 'L',
      colour: 'Russet',
    });

    expect(snapshot.price.amountMinor).toBe(3599);
    expect(snapshot.inStock).toBe(false);
  });

  it('treats Mango size rows without an unavailable suffix as in stock', () => {
    const html = `
      <html>
        <head><title>Flared-sleeve satin dress | MANGO</title></head>
        <body>
          <h1>Flared-sleeve satin dress</h1>
          <div>Initial price £69.99 Current price £35.99</div>
          <div>Pale Pink</div>
          <div>
            6 (EUR XS) NOT AVAILABLE. I WANT IT!
            8 (EUR S) NOT AVAILABLE. I WANT IT!
            10 (EUR M) NOT AVAILABLE. I WANT IT!
            12 (EUR L)
            14 (EUR XL)
          </div>
          <button>ADD</button>
        </body>
      </html>
    `;

    const numericXl = parseMangoOxylabsHtml(html, palePinkMangoUrl, {
      size: '14',
      colour: 'white',
    });
    const letterXl = parseMangoOxylabsHtml(html, palePinkMangoUrl, {
      size: 'XL',
      colour: 'white',
    });
    const letterL = parseMangoOxylabsHtml(html, palePinkMangoUrl, {
      size: 'L',
      colour: 'white',
    });
    const unavailableM = parseMangoOxylabsHtml(html, palePinkMangoUrl, {
      size: 'M',
      colour: 'white',
    });

    expect(numericXl.price.amountMinor).toBe(3599);
    expect(numericXl.inStock).toBe(true);
    expect(letterXl.inStock).toBe(true);
    expect(letterL.inStock).toBe(true);
    expect(unavailableM.inStock).toBe(false);
  });
});
