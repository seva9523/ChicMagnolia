import { describe, expect, it } from 'vitest';

import { redactAnalyticsUrl } from './analytics';

describe('privacy-safe analytics', () => {
  it('removes query strings and fragments from tracked URLs', () => {
    expect(
      redactAnalyticsUrl(
        '/dashboard?message=Price%20check%20failed%3A%20retailer%20details#purchase',
      ),
    ).toBe('/dashboard');
    expect(redactAnalyticsUrl('/privacy')).toBe('/privacy');
  });
});
