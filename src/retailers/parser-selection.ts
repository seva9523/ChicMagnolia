import { decodeHtml } from './parser-html';
import { visiblePageText } from './variant';

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function normalizeColour(value: string): string {
  const normalized = decodeHtml(value)
    .toLowerCase()
    .replace(/^\s*(?:colou?r\s*:?\s*)/i, '')
    .replace(/^\s*\d{1,3}\s+/, '')
    .replace(/\bgray\b/g, 'grey')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  const tokens = normalized.split(' ').filter(Boolean);

  return tokens.length > 1 && tokens.every((token) => token === tokens[0])
    ? (tokens[0] ?? '')
    : normalized;
}

export function coloursMatch(left: string, right: string): boolean {
  const normalizedLeft = normalizeColour(left);
  const normalizedRight = normalizeColour(right);
  return Boolean(
    normalizedLeft && normalizedRight && normalizedLeft === normalizedRight,
  );
}

export function textContainsColour(text: string, colour: string): boolean {
  const normalizedText = normalizeColour(text);
  const normalizedColour = normalizeColour(colour);
  if (!normalizedColour) return false;
  return new RegExp(`(^| )${escapeRegExp(normalizedColour)}(?=$| )`, 'i').test(
    normalizedText,
  );
}

function normalizedLetterSize(value: string): string {
  if (value === '2XS') return 'XXS';
  if (value === '2XL') return 'XXL';
  if (value === '3XL') return 'XXXL';
  return value;
}

function canonicalSize(value: string): string {
  const normalized = decodeHtml(value)
    .toUpperCase()
    .replace(
      /\b(?:OUT OF STOCK|SOLD OUT|LOW STOCK|IN STOCK|UNAVAILABLE|AVAILABLE|NOTIFY ME)\b/g,
      ' ',
    )
    .replace(/^(?:SELECT\s+)?SIZE\s*:?\s*/, '')
    .replace(/^(?:UK|EU|EUR|US)\s+/, '')
    .replace(/\s*INCHES?\b/g, 'INCH')
    .replace(/\s+/g, ' ')
    .replace(/^[,;:|/ -]+|[,;:|/ -]+$/g, '')
    .trim();

  const asosLetterSize = normalized.match(
    /^(2XS|XXS|XS|S|M|L|XL|2XL|XXL|3XL|XXXL)\s*(?:[-–/]|\()\s*UK\b/,
  )?.[1];
  if (asosLetterSize) return normalizedLetterSize(asosLetterSize);

  return normalizedLetterSize(normalized);
}

export function sizesMatch(left: string, right: string): boolean {
  const normalizedLeft = canonicalSize(left);
  const normalizedRight = canonicalSize(right);
  return Boolean(
    normalizedLeft && normalizedRight && normalizedLeft === normalizedRight,
  );
}

function attributeSignalsUnavailable(attributes: string): boolean {
  return (
    /(?:^|\s)disabled(?:\s|=|$)/i.test(attributes) ||
    /aria-disabled\s*=\s*["']?true/i.test(attributes) ||
    /data-(?:is-)?(?:available|in-stock)\s*=\s*["']?false/i.test(attributes) ||
    /(?:class|data-testid)\s*=\s*["'][^"']*(?:disabled|unavailable|out-of-stock|sold-out)[^"']*["']/i.test(
      attributes,
    )
  );
}

function sizeOptionIdentifier(attributes: string) {
  const values = [
    ...attributes.matchAll(/(?:class|data-testid)\s*=\s*["']([^"']+)["']/gi),
  ]
    .map((match) => match[1] ?? '')
    .flatMap((value) => value.split(/\s+/));

  return values.some((value) => {
    const normalized = value.toLowerCase().replace(/_/g, '-');
    return /^(?:size-(?:option|item|button)|option-size)(?:-|$)/.test(
      normalized,
    );
  });
}

function isSizeOptionElement(tag: string, attributes: string) {
  if (tag === 'button' || tag === 'option' || tag === 'li') return true;
  return (
    /role\s*=\s*["'](?:option|radio)["']/i.test(attributes) ||
    /data-size\s*=\s*["'][^"']+["']/i.test(attributes) ||
    sizeOptionIdentifier(attributes)
  );
}

export function selectedSizeAvailability(
  html: string,
  size: string,
): boolean | null {
  const results: boolean[] = [];

  function recordElement(attributes: string, body: string) {
    const text = visiblePageText(body);
    const attributeLabel =
      attributes.match(
        /(?:aria-label|data-size|data-value|value|title)\s*=\s*["']([^"']+)["']/i,
      )?.[1] ?? '';
    const optionText = `${text} ${decodeHtml(attributeLabel)}`.trim();
    if (!optionText || !sizesMatch(optionText, size)) return;

    const unavailableText =
      /out of stock|sold out|unavailable|not available|notify me/i.test(
        optionText,
      );
    results.push(!attributeSignalsUnavailable(attributes) && !unavailableText);
  }

  const pairedPattern = /<(button|option|li)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
  for (const match of html.matchAll(pairedPattern)) {
    recordElement(match[2] ?? '', match[3] ?? '');
  }

  const openingPattern = /<(div|span)\b([^>]*)>/gi;
  for (const match of html.matchAll(openingPattern)) {
    const tag = (match[1] ?? '').toLowerCase();
    const attributes = match[2] ?? '';
    if (!isSizeOptionElement(tag, attributes)) continue;

    const contentStart = (match.index ?? 0) + match[0].length;
    const closingIndex = html.indexOf(`</${tag}>`, contentStart);
    const body = html.slice(
      contentStart,
      closingIndex >= 0
        ? closingIndex
        : Math.min(html.length, contentStart + 500),
    );
    recordElement(attributes, body);
  }

  const inputPattern = /<input\b([^>]+)>/gi;
  for (const match of html.matchAll(inputPattern)) {
    const attributes = match[1] ?? '';
    if (!/type\s*=\s*["']?(?:radio|checkbox)/i.test(attributes)) continue;
    const label =
      attributes.match(
        /(?:aria-label|data-size|value)\s*=\s*["']([^"']+)["']/i,
      )?.[1] ?? '';
    if (!label || !sizesMatch(label, size)) continue;
    results.push(!attributeSignalsUnavailable(attributes));
  }

  if (results.length === 0) return null;
  return results.every(Boolean);
}
