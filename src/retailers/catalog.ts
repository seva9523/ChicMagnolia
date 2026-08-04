export const SUPPORTED_RETAILER_NAMES = [
  'Zara',
  'Mango',
  'Next',
  'ASOS',
  'UNIQLO',
  'H&M',
  'COS',
] as const;

export type SupportedRetailerName =
  (typeof SUPPORTED_RETAILER_NAMES)[number];

export const SUPPORTED_RETAILER_SLUG_BY_NAME = {
  Zara: 'zara-uk',
  Mango: 'mango-uk',
  Next: 'next-uk',
  ASOS: 'asos-uk',
  UNIQLO: 'uniqlo-uk',
  'H&M': 'hm-uk',
  COS: 'cos-uk',
} as const satisfies Record<SupportedRetailerName, string>;

export function isSupportedRetailerName(
  value: string,
): value is SupportedRetailerName {
  return (SUPPORTED_RETAILER_NAMES as readonly string[]).includes(value);
}

export function supportedRetailersSentence() {
  const names = [...SUPPORTED_RETAILER_NAMES];
  const last = names.pop();
  return `${names.join(', ')} and ${last}`;
}
