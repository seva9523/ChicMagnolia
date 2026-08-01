export const CANONICAL_APP_ORIGIN = 'https://www.chicmagnolia.com';

export function canonicalUrl(pathname = '/') {
  return new URL(pathname, CANONICAL_APP_ORIGIN).toString();
}
