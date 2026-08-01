import { describe, expect, it } from 'vitest';

import robots from './robots';
import sitemap from './sitemap';

describe('public metadata routes', () => {
  it('publishes the canonical www sitemap from robots.txt', () => {
    const metadata = robots();

    expect(metadata.sitemap).toBe(
      'https://www.chicmagnolia.com/sitemap.xml',
    );
  });

  it('publishes only canonical www URLs in the public sitemap', () => {
    const urls = sitemap().map((entry) => entry.url);

    expect(urls).toEqual([
      'https://www.chicmagnolia.com/',
      'https://www.chicmagnolia.com/support',
      'https://www.chicmagnolia.com/privacy',
      'https://www.chicmagnolia.com/terms',
    ]);
  });
});
