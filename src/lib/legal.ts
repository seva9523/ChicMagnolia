export const LEGAL_OPERATOR_NAME = 'Sevinj Ahmadova';
export const LEGAL_CONTACT_PATH = '/support';
export const TERMS_VERSION = '2026-08-04';
export const PRIVACY_VERSION = '2026-08-04';
export const LEGAL_LAST_UPDATED = '4 August 2026';

export function legalAcceptanceConfirmed(value: unknown): boolean {
  return value === 'on' || value === 'true' || value === true;
}
