import { describe, expect, it } from 'vitest';

import { CANONICAL_APP_ORIGIN, canonicalUrl } from './canonical-url';

describe('canonical public URLs', () => {
  it('always resolves public metadata against the www production origin', () => {
    expect(CANONICAL_APP_ORIGIN).toBe('https://www.chicmagnolia.com');
    expect(canonicalUrl('/')).toBe('https://www.chicmagnolia.com/');
    expect(canonicalUrl('/support')).toBe(
      'https://www.chicmagnolia.com/support',
    );
  });
});
