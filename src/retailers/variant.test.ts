import { describe, expect, it } from 'vitest';

import { variantInStock, variantPriceMinor } from './variant';

describe('variant helpers', () => {
  it('marks the selected unavailable size out of stock', () => {
    const html = `
      <h1>Flared-sleeve satin dress</h1>
      <p><s>£69.99</s> £35.99</p>
      <div>10 (EUR M) Available</div>
      <div>12 (EUR L) NOT AVAILABLE. I WANT IT!</div>
    `;

    expect(variantInStock(html, { size: 'L', colour: 'Russet' }, true)).toBe(false);
    expect(variantInStock(html, { size: 'M', colour: 'Russet' }, false)).toBe(true);
  });

  it('matches a numeric UK size without borrowing another size status', () => {
    const html = `
      <div>UK 12 Add to bag</div>
      <div>UK 14 Sold out</div>
    `;

    expect(variantInStock(html, { size: '12', colour: null }, false)).toBe(true);
    expect(variantInStock(html, { size: '14', colour: null }, true)).toBe(false);
  });

  it('uses a price shown in the selected variant context', () => {
    const html = `
      <div>Black</div>
      <div>Size M £49.99 Add to bag</div>
      <div>Size L £35.99 Add to bag</div>
    `;

    expect(variantPriceMinor(html, { size: 'L', colour: 'Black' })).toBe(3599);
  });

  it('does not invent a variant price when the selected option is absent', () => {
    const html = '<h1>Dress</h1><p>£35.99</p>';

    expect(variantPriceMinor(html, { size: 'L', colour: 'Russet' })).toBeNull();
    expect(variantInStock(html, { size: 'L', colour: 'Russet' }, true)).toBe(true);
  });
});
