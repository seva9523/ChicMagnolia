import { describe, expect, it } from 'vitest';

import { parseZaraProductHtml } from './zara';

const productUrl = new URL(
  'https://www.zara.com/uk/en/bomber-jacket-with-dots-p08372236.html?v1=545479235&v2=2417772',
);

describe('Zara rendered metadata parser', () => {
  it('parses Open Graph product metadata when JSON-LD is unavailable', () => {
    const html = `
      <html>
        <head>
          <meta property="og:title" content="Bomber Jacket With Dots" />
          <meta property="og:url" content="https://www.zara.com/uk/en/bomber-jacket-with-dots-p08372236.html" />
          <meta property="product:price:amount" content="49.99" />
          <meta property="product:price:currency" content="GBP" />
          <meta property="product:availability" content="in stock" />
        </head>
      </html>
    `;

    const snapshot = parseZaraProductHtml(html, productUrl, {
      size: 'S',
      colour: null,
    });

    expect(snapshot.title).toBe('Bomber Jacket With Dots');
    expect(snapshot.retailerProductId).toBe('08372236');
    expect(snapshot.canonicalUrl).toBe(
      'https://www.zara.com/uk/en/bomber-jacket-with-dots-p08372236.html',
    );
    expect(snapshot.price).toEqual({ amountMinor: 4999, currency: 'GBP' });
    expect(snapshot.inStock).toBe(true);
  });
});
