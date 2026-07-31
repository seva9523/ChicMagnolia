export function accountDeletionConfirmed(
  confirmation: string,
  accountEmail: string | null | undefined,
): boolean {
  const expected = accountEmail?.trim().toLowerCase();
  return Boolean(expected && confirmation.trim().toLowerCase() === expected);
}

export function isStripeResourceMissing(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  return 'code' in error && error.code === 'resource_missing';
}
