import { describe, expect, it } from 'vitest';

import { resolveAuthRequestOrigin, safeAuthNextPath } from './auth-redirects';

const canonicalOrigin = 'https://chic-magnolia.vercel.app';

describe('resolveAuthRequestOrigin', () => {
  it('keeps a Vercel preview callback on the origin that initiated PKCE', () => {
    expect(
      resolveAuthRequestOrigin({
        canonicalOrigin,
        forwardedHost:
          'chic-magnolia-git-sprint-7-privacy-beta-launch-seva9523s-projects.vercel.app',
        forwardedProto: 'https',
      }),
    ).toBe(
      'https://chic-magnolia-git-sprint-7-privacy-beta-launch-seva9523s-projects.vercel.app',
    );
  });

  it('uses the first forwarded host and protocol value', () => {
    expect(
      resolveAuthRequestOrigin({
        canonicalOrigin,
        forwardedHost: 'www.chicmagnolia.com, proxy.internal',
        forwardedProto: 'https, http',
      }),
    ).toBe('https://www.chicmagnolia.com');
  });

  it('supports local development', () => {
    expect(
      resolveAuthRequestOrigin({
        canonicalOrigin,
        host: 'localhost:3000',
        forwardedProto: 'http',
      }),
    ).toBe('http://localhost:3000');
  });

  it('falls back to the canonical origin for untrusted hosts', () => {
    for (const forwardedHost of [
      'attacker.example',
      'attacker-project.vercel.app',
    ]) {
      expect(
        resolveAuthRequestOrigin({
          canonicalOrigin,
          forwardedHost,
          forwardedProto: 'https',
        }),
      ).toBe(canonicalOrigin);
    }
  });

  it('falls back when a non-local origin requests insecure HTTP', () => {
    expect(
      resolveAuthRequestOrigin({
        canonicalOrigin,
        forwardedHost: 'chicmagnolia.com',
        forwardedProto: 'http',
      }),
    ).toBe(canonicalOrigin);
  });
});

describe('safeAuthNextPath', () => {
  it('allows local paths and query strings', () => {
    expect(safeAuthNextPath('/reset-password?source=email')).toBe(
      '/reset-password?source=email',
    );
  });

  it('rejects protocol-relative and absolute redirects', () => {
    expect(safeAuthNextPath('//attacker.example')).toBe('/dashboard');
    expect(safeAuthNextPath('https://attacker.example')).toBe('/dashboard');
  });
});
