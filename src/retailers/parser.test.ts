import { describe, expect, it } from 'vitest';

import {
  coloursMatch,
  findStructuredVariant,
  firstUnlabelledProductPriceMinor,
  recordCurrentPriceMinor,
  selectedSizeAvailability,
  sizesMatch,
} from './parser';

describe('shared retailer parser', () => {
  it('matches retailer size labels exactly without accepting ranges or wrappers', () => {
    expect(sizesMatch('UK 10', '10')).toBe(true);
    expect(sizesMatch('Size S', 'S')).toBe(true);
    expect(sizesMatch('S - UK 8-10', 'S')).toBe(true);
    expect(sizesMatch('2XS - UK 4-6', 'XXS')).toBe(true);
    expect(sizesMatch('34 inches', '34inch')).toBe(true);
    expect(sizesMatch('10-12', '10')).toBe(false);
    expect(sizesMatch('S M L', 'S')).toBe(false);
    expect(sizesMatch('10 Long', '10')).toBe(false);
  });

  it('normalises retailer colour codes but does not accept a different shade', () => {
    expect(coloursMatch('08 DARK GREY', 'Dark Gray')).toBe(true);
    expect(coloursMatch('30 NATURAL', 'Natural')).toBe(true);
    expect(coloursMatch('Dark Grey', 'Grey')).toBe(false);
    expect(coloursMatch('Bright Pink', 'Black')).toBe(false);
  });

  it('prefers current prices and ignores reference-price and percentage fields', () => {
    expect(
      recordCurrentPriceMinor({
        discountPercentage: 40,
        originalPrice: 70,
        currentPrice: 43.5,
      }),
    ).toBe(4350);
    expect(
      recordCurrentPriceMinor({
        offers: [{ price: 19 }, { price: 29 }],
        originalPrice: 40,
      }),
    ).toBe(null);
  });

  it('does not treat savings or a 30-day reference value as the current price', () => {
    expect(
      firstUnlabelledProductPriceMinor(
        'Save £20.00. 30-Day Lowest Price: £29.90. Original Price: £49.90.',
      ),
    ).toBe(null);
  });

  it('uses only the exact colour and size structured variant', () => {
    const values = [
      {
        productId: 'E123456-000',
        colours: [
          {
            colorName: 'BLACK',
            currentPrice: 29,
            sizes: [
              { sizeName: 'S', stockStatus: 'OutOfStock' },
              { sizeName: 'M', currentPrice: 19, stockStatus: 'InStock' },
            ],
          },
          {
            colorName: 'RED',
            currentPrice: 9,
            sizes: [{ sizeName: 'S', stockStatus: 'InStock' }],
          },
        ],
      },
    ];

    expect(
      findStructuredVariant(values, { size: 'S', colour: 'Black' }),
    ).toEqual({
      colours: ['BLACK'],
      size: 'S',
      priceMinor: 2900,
      inStock: false,
    });
  });

  it('does not inherit product-level stock into a selected size', () => {
    const match = findStructuredVariant(
      [
        {
          productId: '123',
          isInStock: true,
          colorName: 'Black',
          currentPrice: 20,
          sizes: [{ sizeName: 'S' }],
        },
      ],
      { size: 'S', colour: 'Black' },
    );

    expect(match?.priceMinor).toBe(2000);
    expect(match?.inStock).toBe(null);
  });

  it('reads the selected size state without a size-list wrapper leaking stock', () => {
    const html = `
      <div class="size-options">
        <button aria-label="Size S, out of stock" aria-disabled="true"></button>
        <button aria-label="Size M, in stock"></button>
      </div>
    `;

    expect(selectedSizeAvailability(html, 'S')).toBe(false);
    expect(selectedSizeAvailability(html, 'M')).toBe(true);
    expect(selectedSizeAvailability(html, 'L')).toBe(null);
  });
});
