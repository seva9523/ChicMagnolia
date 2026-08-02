import { describe, expect, it } from 'vitest';

import nextConfig from './next.config';

function headerMap(
  headers: Array<{ key: string; value: string }> | undefined,
) {
  return Object.fromEntries(
    (headers ?? []).map(({ key, value }) => [key, value]),
  );
}

describe('Next.js security headers', () => {
  it('protects all routes against common browser risks', async () => {
    const groups = await nextConfig.headers?.();
    const headers = headerMap(groups?.[0]?.headers);

    expect(groups?.[0]?.source).toBe('/(.*)');
    expect(headers['X-Content-Type-Options']).toBe('nosniff');
    expect(headers['X-Frame-Options']).toBe('DENY');
    expect(headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
    expect(headers['Permissions-Policy']).toContain('camera=()');
    expect(headers['Strict-Transport-Security']).toContain('includeSubDomains');
  });

  it('prevents private, authentication and API routes from being indexed', async () => {
    const groups = await nextConfig.headers?.();
    const privateSources = [
      '/api/:path*',
      '/auth/:path*',
      '/dashboard/:path*',
      '/forgot-password',
      '/login',
      '/reset-password',
      '/sign-up',
    ];

    for (const source of privateSources) {
      const group = groups?.find((candidate) => candidate.source === source);
      const headers = headerMap(group?.headers);

      expect(group, source).toBeDefined();
      expect(headers['X-Robots-Tag'], source).toBe(
        'noindex, nofollow, noarchive',
      );
    }
  });

  it('does not apply the private-route noindex header globally', async () => {
    const groups = await nextConfig.headers?.();
    const globalHeaders = headerMap(groups?.[0]?.headers);

    expect(globalHeaders['X-Robots-Tag']).toBeUndefined();
  });
});
