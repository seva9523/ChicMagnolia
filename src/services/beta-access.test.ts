import { describe, expect, it } from 'vitest';

import {
  betaAccessStatusLabel,
  betaInviteErrorMessage,
  hashBetaInviteToken,
  hasPrivateBetaAccess,
  isBetaInviteToken,
  normalizeBetaEmail,
  type BetaAccessGrant,
} from './beta-access';

const now = new Date('2026-08-04T12:00:00.000Z');

function grant(overrides: Partial<BetaAccessGrant> = {}): BetaAccessGrant {
  return {
    user_id: '00000000-0000-4000-8000-000000000001',
    invite_id: '00000000-0000-4000-8000-000000000002',
    starts_at: '2026-08-04T10:00:00.000Z',
    expires_at: null,
    revoked_at: null,
    ...overrides,
  };
}

describe('private beta access', () => {
  it('accepts strong URL-safe tokens and hashes them deterministically', () => {
    const token = 'a'.repeat(43);

    expect(isBetaInviteToken(token)).toBe(true);
    expect(isBetaInviteToken('short')).toBe(false);
    expect(isBetaInviteToken(`${token}!`)).toBe(false);
    expect(hashBetaInviteToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashBetaInviteToken(token)).toBe(hashBetaInviteToken(token));
  });

  it('normalizes invitation email addresses', () => {
    expect(normalizeBetaEmail(' Shopper@Example.COM ')).toBe(
      'shopper@example.com',
    );
  });

  it('allows active grants and rejects future, expired or revoked grants', () => {
    expect(hasPrivateBetaAccess(grant(), now)).toBe(true);
    expect(
      hasPrivateBetaAccess(
        grant({ starts_at: '2026-08-05T10:00:00.000Z' }),
        now,
      ),
    ).toBe(false);
    expect(
      hasPrivateBetaAccess(
        grant({ expires_at: '2026-08-04T11:59:59.000Z' }),
        now,
      ),
    ).toBe(false);
    expect(
      hasPrivateBetaAccess(
        grant({ revoked_at: '2026-08-04T11:00:00.000Z' }),
        now,
      ),
    ).toBe(false);
  });

  it('returns clear private beta status and invitation messages', () => {
    expect(betaAccessStatusLabel(grant(), now)).toBe('Private beta access');
    expect(betaAccessStatusLabel(null, now)).toBe('No private beta access');
    expect(betaInviteErrorMessage('email_mismatch')).toContain(
      'email address that received',
    );
    expect(betaInviteErrorMessage('expired')).toContain('expired');
  });
});
