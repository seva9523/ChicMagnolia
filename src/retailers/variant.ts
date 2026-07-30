import type { ProductVariant } from './types';

function decodeHtml(value: string) {
  let decoded = value;

  for (let pass = 0; pass < 3; pass += 1) {
    const next = decoded
      .replace(/&amp;/gi, '&')
      .replace(/&pound;/gi, '£')
      .replace(/&#x0*a3;/gi, '£')
      .replace(/&#0*163;/g, '£')
      .replace(/\\u00a3/gi, '£')
      .replace(/\\u0026pound;/gi, '&pound;')
      .replaceAll('&quot;', '"')
      .replaceAll('&#39;', "'")
      .replaceAll('&lt;', '<')
      .replaceAll('&gt;', '>')
      .replaceAll('&nbsp;', ' ');

    if (next === decoded) break;
    decoded = next;
  }

  return decoded;
}

export function visiblePageText(html: string): string {
  return decodeHtml(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  );
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function containsToken(text: string, token: string): boolean {
  const expression = new RegExp(
    `(^|[^a-z0-9])${escapeRegExp(token.trim())}(?=$|[^a-z0-9])`,
    'i',
  );
  return expression.test(text);
}

function optionElementContexts(html: string, token: string): string[] {
  const contexts: string[] = [];
  const elementPattern =
    /<(button|li|option|div|span)\b[^>]*>([\s\S]*?)<\/\1>/gi;

  for (const match of html.matchAll(elementPattern)) {
    const text = visiblePageText(match[0]);
    if (containsToken(text, token)) contexts.push(text);
  }

  return contexts;
}

function tokenContexts(text: string, token: string, radius: number): string[] {
  const normalizedToken = token.trim();
  if (!normalizedToken) return [];

  const expression = new RegExp(
    `(^|[^a-z0-9])${escapeRegExp(normalizedToken)}(?=$|[^a-z0-9])`,
    'gi',
  );
  const contexts: string[] = [];

  for (const match of text.matchAll(expression)) {
    const index = match.index ?? 0;
    contexts.push(
      text.slice(
        Math.max(0, index - radius),
        Math.min(text.length, index + radius),
      ),
    );
  }

  return contexts;
}

function sizeAliases(size: string): string[] {
  const value = size.trim();
  const aliases = new Set([value]);
  const upper = value.toUpperCase();

  const clothingSize = upper.match(/^(?:UK\s*)?(\d{1,2})$/)?.[1];
  if (clothingSize) {
    aliases.add(clothingSize);
    aliases.add(`UK ${clothingSize}`);
  }

  const letter = upper.match(/\b(XXS|XS|S|M|L|XL|XXL|XXXL)\b/)?.[1];
  if (letter) {
    aliases.add(letter);
    aliases.add(`EUR ${letter}`);
    aliases.add(`EU ${letter}`);
  }

  return [...aliases].filter((alias) => alias.length > 0);
}

function contextsForTokens(
  html: string,
  tokens: string[],
  fallbackRadius: number,
): string[] {
  const elementContexts = tokens.flatMap((token) =>
    optionElementContexts(html, token),
  );
  if (elementContexts.length > 0) return [...new Set(elementContexts)];

  const text = visiblePageText(html);
  return tokens.flatMap((token) => tokenContexts(text, token, fallbackRadius));
}

function variantContexts(html: string, variant: ProductVariant): string[] {
  const sizeContexts = variant.size
    ? contextsForTokens(html, sizeAliases(variant.size), 28)
    : [];
  const colourContexts = variant.colour
    ? contextsForTokens(html, [variant.colour], 120)
    : [];

  if (sizeContexts.length > 0 && colourContexts.length > 0) {
    const colour = variant.colour!.toLowerCase();
    const combined = sizeContexts.filter((context) =>
      context.toLowerCase().includes(colour),
    );
    if (combined.length > 0) return combined;
  }

  return sizeContexts.length > 0 ? sizeContexts : colourContexts;
}

const unavailableSignals = [
  'not available',
  'unavailable',
  'out of stock',
  'sold out',
  'notify me',
  'i want it',
];

const availableSignals = [
  'add to bag',
  'add to basket',
  'add to cart',
  'in stock',
  'available',
];

export function variantInStock(
  html: string,
  variant: ProductVariant,
  defaultInStock: boolean,
): boolean {
  if (!variant.size && !variant.colour) return defaultInStock;

  const contexts = variantContexts(html, variant);
  if (contexts.length === 0) return defaultInStock;

  const normalized = contexts.map((context) => context.toLowerCase());
  if (
    normalized.some((context) =>
      unavailableSignals.some((signal) => context.includes(signal)),
    )
  ) {
    return false;
  }
  if (
    normalized.some((context) =>
      availableSignals.some((signal) => context.includes(signal)),
    )
  ) {
    return true;
  }

  return defaultInStock;
}

export function variantPriceMinor(
  html: string,
  variant: ProductVariant,
): number | null {
  // A variant-specific price is trustworthy only when it is printed inside the
  // selected size option itself. Colour/page-level contexts often contain prices
  // for recommendations or promotions and must not override the main product price.
  if (!variant.size) return null;

  const contexts = sizeAliases(variant.size).flatMap((alias) =>
    optionElementContexts(html, alias),
  );
  const prices: number[] = [];

  for (const context of [...new Set(contexts)]) {
    for (const match of context.matchAll(
      /£\s*([0-9]{1,5}(?:[.,][0-9]{1,2})?)/gi,
    )) {
      const amount = Number(match[1].replace(',', '.'));
      if (Number.isFinite(amount) && amount > 0)
        prices.push(Math.round(amount * 100));
    }
  }

  return prices.length > 0 ? Math.min(...prices) : null;
}
