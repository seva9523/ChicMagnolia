export const LEGAL_OPERATOR_NAME = 'Sevinj Ahmadova';
export const LEGAL_TRADING_NAME = 'ChicMagnolia';
export const LEGAL_CONTACT_PATH = '/support';
export const TERMS_VERSION = '2026-08-02';
export const PRIVACY_VERSION = '2026-08-02';
export const LEGAL_LAST_UPDATED = '2 August 2026';

export function legalAcceptanceConfirmed(value: unknown): boolean {
  return value === 'on' || value === 'true' || value === true;
}
