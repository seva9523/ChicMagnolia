import { describe, expect, it } from 'vitest';

import { parseMangoOxylabsHtml } from './mango-oxylabs';

describe('parseMangoOxylabsHtml', () => {
  it('keeps the product sale price while applying selected-size stock', () => {
    const html = `
      <html>
        <head><title>Flared-sleeve satin dress | MANGO</title></head>
        <body>
          <h1>Flared-sleeve satin dress</h1>
          <div><s>£69.99</s> £35.99</div>
          <div>Russet</div>
          <div>12 (EUR L) NOT AVAILABLE. I WANT IT!</div>
          <section>Complete the look £9.99</section>
        </body>
      </html>
    `;

    const snapshot = parseMangoOxylabsHtml(
      html,
      new URL(
        'https://shop.mango.com/gb/en/p/women/dresses-and-jumpsuits/dresses/flared-sleeve-satin-dress/27019066/79/00',
      ),
      { size: 'L', colour: 'Russet' },
    );

    expect(snapshot.price.amountMinor).toBe(3599);
    expect(snapshot.inStock).toBe(false);
  });
});
