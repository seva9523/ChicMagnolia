import { afterEach, describe, expect, it } from 'vitest';

import { GET } from './route';

const originalCommitSha = process.env.VERCEL_GIT_COMMIT_SHA;
const originalTargetEnvironment = process.env.VERCEL_TARGET_ENV;

afterEach(() => {
  if (originalCommitSha === undefined) {
    delete process.env.VERCEL_GIT_COMMIT_SHA;
  } else {
    process.env.VERCEL_GIT_COMMIT_SHA = originalCommitSha;
  }

  if (originalTargetEnvironment === undefined) {
    delete process.env.VERCEL_TARGET_ENV;
  } else {
    process.env.VERCEL_TARGET_ENV = originalTargetEnvironment;
  }
});

describe('health endpoint', () => {
  it('returns the deployed release without allowing cached health responses', async () => {
    process.env.VERCEL_GIT_COMMIT_SHA =
      '1234567890abcdef1234567890abcdef12345678';
    process.env.VERCEL_TARGET_ENV = 'preview';

    const response = GET();
    const body = (await response.json()) as Record<string, string>;

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(body).toMatchObject({
      status: 'ok',
      service: 'chicmagnolia',
      release: '1234567890abcdef1234567890abcdef12345678',
      environment: 'preview',
    });
    expect(new Date(body.timestamp).toString()).not.toBe('Invalid Date');
  });
});
