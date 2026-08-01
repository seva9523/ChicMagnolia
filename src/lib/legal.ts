export const LEGAL_OPERATOR_NAME = 'ChicMagnolia';
export const LEGAL_CONTACT_PATH = '/support';
export const TERMS_VERSION = '2026-08-01';
export const PRIVACY_VERSION = '2026-08-01';
export const LEGAL_LAST_UPDATED = '1 August 2026';

export function legalAcceptanceConfirmed(value: unknown): boolean {
  return value === 'on' || value === 'true' || value === true;
}
