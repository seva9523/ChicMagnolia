import { describe, expect, it } from 'vitest';

import { nextAdapter, parseNextProductHtml } from './next';

const productUrl = new URL('https://www.next.co.uk/style/sv098626/v86409');

const html = `
  <html>
    <head>
      <meta property="og:title" content="White Stuff Green Olivia Jersey Dress" />
      <meta property="og:url" content="https://www.next.co.uk/style/sv098626/v86409" />
    </head>
    <body>
      <h1>White Stuff Green Olivia Jersey Dress</h1>
      <div>Now £21</div>
      <div>Was £55</div>
      <div>Product Code: V86-409</div>
      <button>Size 10</button>
    </body>
  </html>
`;

describe('nextAdapter', () => {
  it('recognises Next UK product URLs', () => {
    expect(nextAdapter.supports(productUrl)).toBe(true);
    expect(nextAdapter.supports(new URL('https://www.next.co.uk/shop/gender-women'))).toBe(false);
    expect(nextAdapter.supports(new URL('https://www.nextdirect.com/style/test'))).toBe(false);
  });

  it('parses the current price before the previous price', () => {
    const snapshot = parseNextProductHtml(html, productUrl, {
      size: '10',
      colour: 'Green',
    });

    expect(snapshot.title).toBe('White Stuff Green Olivia Jersey Dress');
    expect(snapshot.retailerProductId).toBe('V86-409');
    expect(snapshot.price).toEqual({ amountMinor: 2100, currency: 'GBP' });
    expect(snapshot.inStock).toBe(true);
    expect(snapshot.variant).toEqual({ size: '10', colour: 'Green' });
  });

  it('fails clearly when price data is unavailable', () => {
    expect(() =>
      parseNextProductHtml('<html></html>', productUrl, {
        size: null,
        colour: null,
      }),
    ).toThrow('Next product metadata was not found.');
  });
});
