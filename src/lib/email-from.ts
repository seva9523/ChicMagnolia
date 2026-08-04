export const EMAIL_SENDER_NAME = 'Chic Magnolia';

export function brandedEmailFrom(value: string | undefined): string | undefined {
  if (!value) return undefined;

  const trimmed = value.trim();
  const bracketedAddress = trimmed.match(/<\s*([^<>]+)\s*>$/)?.[1];
  const address = (bracketedAddress ?? trimmed).trim();

  return `${EMAIL_SENDER_NAME} <${address}>`;
}
