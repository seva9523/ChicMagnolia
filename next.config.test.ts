import { describe, expect, it } from 'vitest';

import nextConfig from './next.config';

describe('Next.js security headers', () => {
  it('protects all routes against common browser risks', async () => {
    const groups = await nextConfig.headers?.();
    const headers = Object.fromEntries(
      (groups?.[0]?.headers ?? []).map(({ key, value }) => [key, value]),
    );

    expect(groups?.[0]?.source).toBe('/(.*)');
    expect(headers['X-Content-Type-Options']).toBe('nosniff');
    expect(headers['X-Frame-Options']).toBe('DENY');
    expect(headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
    expect(headers['Permissions-Policy']).toContain('camera=()');
    expect(headers['Strict-Transport-Security']).toContain('includeSubDomains');
  });
});
