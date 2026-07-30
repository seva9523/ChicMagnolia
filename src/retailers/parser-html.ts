import { visiblePageText } from './variant';

export type JsonRecord = Record<string, unknown>;

const productIdentifierFields = [
  'id',
  'productId',
  'productID',
  'productCode',
  'sku',
  'styleId',
  'styleCode',
] as const;

export function isJsonRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function decodeHtml(value: string) {
  let decoded = value;

  for (let pass = 0; pass < 3; pass += 1) {
    const next = decoded
      .replace(/&amp;/gi, '&')
      .replace(/&pound;/gi, '£')
      .replace(/&#x0*a3;/gi, '£')
      .replace(/&#0*163;/g, '£')
      .replace(/\\u00a3/gi, '£')
      .replace(/\\u0026pound;/gi, '&pound;')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;|&apos;/gi, "'")
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&nbsp;/gi, ' ');

    if (next === decoded) break;
    decoded = next;
  }

  return decoded;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function metaContent(html: string, key: string): string | null {
  const escaped = escapeRegExp(key);
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`,
      'i',
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`,
      'i',
    ),
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return decodeHtml(match[1].trim());
  }

  return null;
}

export function canonicalLink(html: string): string | null {
  const patterns = [
    /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["'][^>]*>/i,
    /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["'][^>]*>/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return decodeHtml(match[1].trim());
  }

  return null;
}

export function firstTagText(html: string, tagName: string): string | null {
  const escaped = escapeRegExp(tagName);
  const match = html.match(
    new RegExp(`<${escaped}\\b[^>]*>([\\s\\S]*?)<\\/${escaped}>`, 'i'),
  );
  const text = visiblePageText(match?.[1] ?? '');
  return text || null;
}

export function productRegionHtml(html: string): string {
  const headingIndex = html.search(/<h1\b/i);
  return headingIndex >= 0
    ? html.slice(headingIndex, headingIndex + 50_000)
    : html;
}

export function extractJsonScripts(html: string): unknown[] {
  const values: unknown[] = [];
  const scriptPattern = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;

  for (const match of html.matchAll(scriptPattern)) {
    const attributes = match[1] ?? '';
    const body = (match[2] ?? '').trim();
    const isJsonScript =
      /type=["']application\/(?:ld\+)?json["']/i.test(attributes) ||
      /id=[#']__NEXT_DATA__["']/i.test(attributes);

    let candidate = body;
    if (!isJsonScript) {
      const assignment = body.match(
        /^(?:window\.)?[A-Za-z0-9_$.[\]"']+\s*=\s*([\s\S]+?)\s*;?$/,
      );
      candidate = assignment?.[1]?.trim() ?? '';
    }

    if (
      !candidate ||
      (!candidate.startsWith('{') && !candidate.startsWith('['))
    )
      continue;

    try {
      values.push(JSON.parse(candidate));
    } catch {
      // Retailer pages contain executable scripts as well as JSON. Ignore non-JSON bodies.
    }
  }

  return values;
}

export function firstString(
  record: JsonRecord | null,
  fields: readonly string[],
): string | null {
  if (!record) return null;

  for (const field of fields) {
    const value = record[field];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value))
      return String(value);
  }

  return null;
}

function normalizedIdentifier(value: string) {
  return value
    .toLowerCase()
    .replace(/^e(?=\d)/, '')
    .replace(/[^a-z0-9]/g, '');
}

function recordIdentifiers(record: JsonRecord): string[] {
  return productIdentifierFields.flatMap((field) => {
    const value = record[field];
    return typeof value === 'string' || typeof value === 'number'
      ? [String(value)]
      : [];
  });
}

export function findProductJsonRoots(
  values: unknown[],
  identifiers: string[],
): JsonRecord[] {
  const normalizedIdentifiers = new Set(
    identifiers
      .filter(Boolean)
      .map((identifier) => normalizedIdentifier(identifier)),
  );
  const matched: JsonRecord[] = [];
  const schemaProducts: JsonRecord[] = [];

  function visit(value: unknown) {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!isJsonRecord(value)) return;

    const type = value['@type'];
    const types = Array.isArray(type) ? type : [type];
    if (types.some((entry) => String(entry).toLowerCase() === 'product')) {
      schemaProducts.push(value);
    }

    if (
      normalizedIdentifiers.size > 0 &&
      recordIdentifiers(value).some((identifier) =>
        normalizedIdentifiers.has(normalizedIdentifier(identifier)),
      )
    ) {
      matched.push(value);
    }

    Object.values(value).forEach(visit);
  }

  values.forEach(visit);
  const roots = matched.length > 0 ? matched : schemaProducts;
  return [...new Set(roots)];
}

export function findSchemaProduct(values: unknown[]): JsonRecord | null {
  return findProductJsonRoots(values, [])[0] ?? null;
}
