import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const script = readFileSync('scripts/create-beta-invite.mjs', 'utf8');

describe('private beta invite generator', () => {
  it('uses a strong random token and persists only its hash', () => {
    expect(script).toContain('randomBytes(32)');
    expect(script).toContain("createHash('sha256')");
    expect(script).toContain('token_hash: tokenHash');
    expect(script).not.toMatch(/\.insert\(\{[\s\S]*?token:\s*token[,\s}]/);
  });

  it('requires an invited email and a bounded expiry', () => {
    expect(script).toContain('invited_email: email');
    expect(script).toContain('expiresInDays < 1');
    expect(script).toContain('expiresInDays > 90');
  });
});
