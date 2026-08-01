import { describe, expect, it } from 'vitest';

import { publicAuthErrorMessage, safeAuthErrorLog } from './auth-errors';

describe('publicAuthErrorMessage', () => {
  it('replaces an empty upstream SMTP error with an actionable message', () => {
    expect(
      publicAuthErrorMessage(
        {
          name: 'AuthApiError',
          code: 'unexpected_failure',
          status: 500,
          message: '{}',
        },
        'sign-up',
      ),
    ).toMatch(/could not create your account or send the confirmation email/i);
  });

  it('explains authentication-email rate limits', () => {
    expect(
      publicAuthErrorMessage(
        { code: 'over_email_send_rate_limit', status: 429, message: 'rate limited' },
        'sign-up',
      ),
    ).toMatch(/too many authentication emails/i);
  });

  it('keeps a useful non-server authentication error', () => {
    expect(
      publicAuthErrorMessage(
        { code: 'invalid_credentials', status: 400, message: 'Invalid login credentials' },
        'sign-in',
      ),
    ).toBe('Invalid login credentials');
  });
});

describe('safeAuthErrorLog', () => {
  it('keeps diagnostic fields while redacting email addresses', () => {
    expect(
      safeAuthErrorLog({
        name: 'AuthApiError',
        code: 'unexpected_failure',
        status: 500,
        message: 'SMTP failed for shopper@example.com',
      }),
    ).toEqual({
      name: 'AuthApiError',
      code: 'unexpected_failure',
      status: 500,
      message: 'SMTP failed for [redacted-email]',
    });
  });
});
