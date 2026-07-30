import { isJsonRecord, type JsonRecord } from './parser';

export type AsosEmbeddedData = {
  product: JsonRecord | null;
  productPrice: JsonRecord | null;
  productInStock: boolean | null;
  variantRoots: JsonRecord[];
};

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function readJavascriptString(
  source: string,
  quoteIndex: number,
): { value: string; end: number } | null {
  const quote = source[quoteIndex];
  if (quote !== "'" && quote !== '"') return null;

  let value = '';
  for (let index = quoteIndex + 1; index < source.length; index += 1) {
    const character = source[index];
    if (character === quote) return { value, end: index + 1 };
    if (character !== '\\') {
      value += character;
      continue;
    }

    index += 1;
    if (index >= source.length) return null;
    const escaped = source[index];
    if (escaped === 'n') value += '\n';
    else if (escaped === 'r') value += '\r';
    else if (escaped === 't') value += '\t';
    else if (escaped === 'b') value += '\b';
    else if (escaped === 'f') value += '\f';
    else if (escaped === 'v') value += '\v';
    else if (escaped === '0') value += '\0';
    else if (escaped === 'x') {
      const hexadecimal = source.slice(index + 1, index + 3);
      if (!/^[0-9a-f]{2}$/i.test(hexadecimal)) return null;
      value += String.fromCharCode(Number.parseInt(hexadecimal, 16));
      index += 2;
    } else if (escaped === 'u') {
      const hexadecimal = source.slice(index + 1, index + 5);
      if (!/^[0-9a-f]{4}$/i.test(hexadecimal)) return null;
      value += String.fromCharCode(Number.parseInt(hexadecimal, 16));
      index += 4;
    } else {
      value += escaped;
    }
  }

  return null;
}

function readBalancedJson(
  source: string,
  startIndex: number,
): { value: string; end: number } | null {
  const opening = source[startIndex];
  if (opening !== '{' && opening !== '[') return null;
  const closing = opening === '{' ? '}' : ']';
  let depth = 0;
  let quote: string | null = null;
  let escaped = false;

  for (let index = startIndex; index < source.length; index += 1) {
    const character = source[index];

    if (quote) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) quote = null;
      continue;
    }

    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === opening) depth += 1;
    else if (character === closing) {
      depth -= 1;
      if (depth === 0) {
        return {
          value: source.slice(startIndex, index + 1),
          end: index + 1,
        };
      }
    }
  }

  return null;
}

function assignedJsonValues(source: string, assignment: string): unknown[] {
  const values: unknown[] = [];
  const pattern = new RegExp(`${escapeRegExp(assignment)}\\s*=\\s*`, 'gi');

  for (const match of source.matchAll(pattern)) {
    let index = (match.index ?? 0) + match[0].length;
    while (/\s/.test(source[index] ?? '')) index += 1;

    const character = source[index];
    if (character === "'" || character === '"') {
      const literal = readJavascriptString(source, index);
      if (!literal) continue;
      try {
        values.push(JSON.parse(literal.value));
      } catch {
        // Ignore assignments whose string contents are not JSON.
      }
      continue;
    }

    if (character === '{' || character === '[') {
      const balanced = readBalancedJson(source, index);
      if (!balanced) continue;
      try {
        values.push(JSON.parse(balanced.value));
      } catch {
        // ASOS also assigns small JavaScript object literals that are not JSON.
      }
    }
  }

  return values;
}

function identifier(value: unknown): string | null {
  return typeof value === 'string' || typeof value === 'number'
    ? String(value)
    : null;
}

function productIdFromUrl(url: URL): string | null {
  return url.pathname.match(/\/prd\/(\d+)(?:\/|$)/i)?.[1] ?? null;
}

function colourWayIdFromUrl(url: URL): string | null {
  return (
    url.hash.match(/^#colourWayId-(\d+)$/i)?.[1] ??
    url.searchParams.get('colourWayId')
  );
}

function records(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.filter(isJsonRecord) : [];
}

function firstMatchingProduct(
  values: unknown[],
  productId: string | null,
): JsonRecord | null {
  const candidates = values.flatMap((value) =>
    Array.isArray(value)
      ? value.filter(isJsonRecord)
      : isJsonRecord(value)
        ? [value]
        : [],
  );

  return (
    candidates.find((candidate) => {
      const id = identifier(candidate.id ?? candidate.productId);
      return Boolean(productId && id === productId);
    }) ?? null
  );
}

function matchingStockVariant(
  stockProduct: JsonRecord | null,
  variantId: string | null,
): JsonRecord | null {
  if (!variantId) return null;
  return (
    records(stockProduct?.variants).find(
      (variant) => identifier(variant.id ?? variant.variantId) === variantId,
    ) ?? null
  );
}

function booleanValue(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

export function extractAsosEmbeddedData(
  html: string,
  url: URL,
): AsosEmbeddedData {
  const productId = productIdFromUrl(url);
  const colourWayId = colourWayIdFromUrl(url);
  const productValues = assignedJsonValues(
    html,
    'window.asos.pdp.config.product',
  );
  const stockValues = assignedJsonValues(
    html,
    'window.asos.pdp.config.stockPriceResponse',
  );
  const product = firstMatchingProduct(productValues, productId);
  const stockProduct = firstMatchingProduct(stockValues, productId);
  const productPrice = isJsonRecord(stockProduct?.productPrice)
    ? stockProduct.productPrice
    : null;
  const hasMultiplePrices = stockProduct?.hasMultiplePricesInStock === true;

  const variantRoots = records(product?.variants)
    .filter((variant) => {
      if (!colourWayId) return true;
      return identifier(variant.colourWayId) === colourWayId;
    })
    .map((variant) => {
      const variantId = identifier(variant.variantId ?? variant.id);
      const stockVariant = matchingStockVariant(stockProduct, variantId);
      const variantPrice = isJsonRecord(stockVariant?.price)
        ? stockVariant.price
        : !hasMultiplePrices
          ? productPrice
          : null;
      const stockAvailability = booleanValue(stockVariant?.isInStock);
      const configuredAvailability = booleanValue(variant.isAvailable);

      return {
        ...variant,
        price: variantPrice,
        isInStock: stockAvailability ?? configuredAvailability,
      };
    });

  return {
    product,
    productPrice,
    productInStock: booleanValue(stockProduct?.isInStock),
    variantRoots,
  };
}
