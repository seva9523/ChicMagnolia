import { describe, expect, it } from 'vitest';

import { parseMangoOxylabsHtml } from './mango-oxylabs';

const mangoUrl = new URL(
  'https://shop.mango.com/gb/en/p/women/dresses-and-jumpsuits/dresses/flared-sleeve-satin-dress/27019066/79/00',
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
});
