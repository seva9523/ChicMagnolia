import { describe, expect, it } from 'vitest';

import {
  legalAcceptanceConfirmed,
  LEGAL_OPERATOR_NAME,
  PRIVACY_VERSION,
  TERMS_VERSION,
} from './legal';

describe('legal policy versions', () => {
  it('requires an affirmative sign-up acknowledgement', () => {
    expect(legalAcceptanceConfirmed('on')).toBe(true);
    expect(legalAcceptanceConfirmed('true')).toBe(true);
    expect(legalAcceptanceConfirmed(true)).toBe(true);
    expect(legalAcceptanceConfirmed(null)).toBe(false);
    expect(legalAcceptanceConfirmed('false')).toBe(false);
  });

  it('uses explicit date-based versions for the beta policies', () => {
    expect(TERMS_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(PRIVACY_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('identifies the individual operating the private beta', () => {
    expect(LEGAL_OPERATOR_NAME).toBe('Sevinj Ahmadova');
  });
});
