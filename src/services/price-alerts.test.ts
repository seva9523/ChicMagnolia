import { describe, expect, it } from 'vitest';

import { buildPriceDropEmail, isPriceDropAlertEligible } from './price-alerts';

describe('price-drop alerts', () => {
  it('alerts only for an in-stock price drop inside the return window', () => {
    const now = new Date('2026-07-29T09:00:00.000Z');

    expect(
      isPriceDropAlertEligible(
        {
          purchasePricePence: 6500,
          currentPricePence: 3599,
          currency: 'GBP',
          inStock: true,
          returnDeadline: '2026-08-09',
        },
        now,
      ),
    ).toBe(true);

    expect(
      isPriceDropAlertEligible(
        {
          purchasePricePence: 6500,
          currentPricePence: 3599,
          currency: 'GBP',
          inStock: false,
          returnDeadline: '2026-08-09',
        },
        now,
      ),
    ).toBe(false);

    expect(
      isPriceDropAlertEligible(
        {
          purchasePricePence: 6500,
          currentPricePence: 3599,
          currency: 'GBP',
          inStock: true,
          returnDeadline: '2026-07-28',
        },
        now,
      ),
    ).toBe(false);

    expect(
      isPriceDropAlertEligible(
        {
          purchasePricePence: 3599,
          currentPricePence: 3599,
          currency: 'GBP',
          inStock: true,
          returnDeadline: '2026-08-09',
        },
        now,
      ),
    ).toBe(false);
  });

  it('builds a savings email and escapes user-entered product details', () => {
    const email = buildPriceDropEmail({
      retailerName: 'Mango',
      productName: '<White dress>',
      productUrl: 'https://example.com/product?a=1&b=2',
      dashboardUrl: 'https://chicmagnolia.example/dashboard',
      purchasePricePence: 6500,
      currentPricePence: 3599,
      currency: 'GBP',
      inStock: true,
      returnDeadline: '2026-08-09',
      size: '14',
      colour: 'Pale Pink',
    });

    expect(email.subject).toContain('£29.01');
    expect(email.html).toContain('&lt;White dress&gt;');
    expect(email.html).toContain('Size: 14 · Colour: Pale Pink');
    expect(email.html).toContain('£35.99');
  });
});
