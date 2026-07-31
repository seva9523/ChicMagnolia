export const LEGAL_OPERATOR_NAME = 'ChicMagnolia';
export const LEGAL_CONTACT_EMAIL = 'support@chicmagnolia.com';
export const TERMS_VERSION = '2026-07-31';
export const PRIVACY_VERSION = '2026-07-31';
export const LEGAL_LAST_UPDATED = '31 July 2026';

export function legalAcceptanceConfirmed(value: unknown): boolean {
  return value === 'on' || value === 'true' || value === true;
}
