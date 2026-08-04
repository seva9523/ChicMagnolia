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
      <div>Colour: Green</div>
      <div data-testid="size-chips-button-group">
        <button class="unavailable" aria-label="10 unavailable">10</button>
        <button class="round" aria-label="14">14</button>
        <button class="round" aria-label="22">22</button>
      </div>
      <button>Add to Bag</button>
    </body>
  </html>
`;

const livePageShape = `
  <html>
    <head>
      <meta property="og:title" content="Buy White Stuff Green Olivia Jersey Dress from the Next UK online shop" />
      <meta property="og:url" content="https://www.next.co.uk/style/sv098626/v86409" />
    </head>
    <body>
      <section data-testid="recommendation-ribbon">
        <div>White Stuff Navy Lucy Cord Dress was £79 now £39</div>
        <div data-index="14">White Stuff Coral Blue Megan Jersey Dress was £65 now £32</div>
      </section>
      <main>
        <h1>White Stuff Green Olivia Jersey Dress</h1>
        <div>Now £21</div>
        <div>Was £55</div>
        <div>4.5 (42)</div>
        <div>Product Code: V86-409</div>
        <div>Colour:Green</div>
        <div role="group" data-testid="size-chips-button-group">
          <button class="unavailable round" aria-label="6 unavailable">6</button>
          <button class="unavailable round" aria-label="8 unavailable">8</button>
          <button class="unavailable round" aria-label="10 unavailable">10</button>
          <button class="unavailable round" aria-label="12 unavailable">12</button>
          <button class="round" aria-label="14">14</button>
          <button class="unavailable round" aria-label="16 unavailable">16</button>
          <button class="unavailable round" aria-label="18 unavailable">18</button>
          <button class="unavailable round" aria-label="20 unavailable">20</button>
          <button class="round" aria-label="22">22</button>
          <button class="unavailable round" aria-label="24 unavailable">24</button>
        </div>
        <button>Add to Bag</button>
      </main>
    </body>
  </html>
`;

describe('nextAdapter', () => {
  it('recognises Next UK product URLs', () => {
    expect(nextAdapter.supports(productUrl)).toBe(true);
    expect(
      nextAdapter.supports(new URL('https://www.next.co.uk/shop/gender-women')),
    ).toBe(false);
    expect(
      nextAdapter.supports(new URL('https://www.nextdirect.com/style/test')),
    ).toBe(false);
  });

  it('parses the current product price and exact available size', () => {
    const snapshot = parseNextProductHtml(html, productUrl, {
      size: '14',
      colour: 'Green',
    });

    expect(snapshot.title).toBe('White Stuff Green Olivia Jersey Dress');
    expect(snapshot.retailerProductId).toBe('V86-409');
    expect(snapshot.price).toEqual({ amountMinor: 2100, currency: 'GBP' });
    expect(snapshot.inStock).toBe(true);
    expect(snapshot.variant).toEqual({ size: '14', colour: 'Green' });
  });

  it('does not use another size or recommendation price', () => {
    const snapshot = parseNextProductHtml(livePageShape, productUrl, {
      size: '14',
      colour: 'Green',
    });

    expect(snapshot.price).toEqual({ amountMinor: 2100, currency: 'GBP' });
    expect(snapshot.inStock).toBe(true);
  });

  it('reports the exact unavailable size as out of stock', () => {
    const snapshot = parseNextProductHtml(livePageShape, productUrl, {
      size: '12',
      colour: 'Green',
    });

    expect(snapshot.price.amountMinor).toBe(2100);
    expect(snapshot.inStock).toBe(false);
  });

  it('does not use another colour variant stock', () => {
    const snapshot = parseNextProductHtml(livePageShape, productUrl, {
      size: '14',
      colour: 'Blue',
    });

    expect(snapshot.price.amountMinor).toBe(2100);
    expect(snapshot.inStock).toBe(false);
  });

  it('fails closed when the selected size is not present', () => {
    const snapshot = parseNextProductHtml(livePageShape, productUrl, {
      size: '26',
      colour: 'Green',
    });

    expect(snapshot.inStock).toBe(false);
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
