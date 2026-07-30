import type { ProductVariant } from './types';
import { isJsonRecord, type JsonRecord } from './parser-html';
import { recordAvailability, recordCurrentPriceMinor } from './parser-money';
import { coloursMatch, normalizeColour, sizesMatch } from './parser-selection';

export type StructuredVariantMatch = {
  colours: string[];
  size: string;
  priceMinor: number | null;
  inStock: boolean | null;
};

type VariantContext = {
  colours: string[];
  priceMinor: number | null;
  inStock: boolean | null;
};

type CollectionHint = 'colour' | 'size' | null;

const colourFieldNames = [
  'colour',
  'color',
  'colourName',
  'colorName',
  'colourDescription',
  'colorDescription',
  'selectedColour',
  'selectedColor',
  'displayColour',
  'displayColor',
] as const;

const sizeFieldNames = [
  'size',
  'sizeName',
  'brandSize',
  'displaySize',
  'sizeDisplay',
  'sizeLabel',
] as const;

function stringsForFields(
  record: JsonRecord,
  fields: readonly string[],
): string[] {
  return fields.flatMap((field) => {
    const value = record[field];
    return typeof value === 'string' || typeof value === 'number'
      ? [String(value)]
      : [];
  });
}

function genericHintStrings(record: JsonRecord): string[] {
  return stringsForFields(record, [
    'name',
    'label',
    'displayName',
    'displayCode',
    'code',
  ]);
}

function collectionHint(key: string): CollectionHint {
  if (/colou?rs?|swatches?/i.test(key)) return 'colour';
  if (/sizes?|variants?size/i.test(key)) return 'size';
  return null;
}

export function collectStructuredVariants(
  values: unknown[],
): StructuredVariantMatch[] {
  const candidates: StructuredVariantMatch[] = [];

  function visit(
    value: unknown,
    context: VariantContext,
    hint: CollectionHint,
  ) {
    if (Array.isArray(value)) {
      for (const entry of value) {
        if (
          (typeof entry === 'string' || typeof entry === 'number') &&
          hint === 'size'
        ) {
          candidates.push({
            colours: context.colours,
            size: String(entry),
            priceMinor: context.priceMinor,
            inStock: context.inStock,
          });
        } else {
          visit(entry, context, hint);
        }
      }
      return;
    }
    if (!isJsonRecord(value)) return;

    const ownColours = [
      ...stringsForFields(value, colourFieldNames),
      ...(hint === 'colour' ? genericHintStrings(value) : []),
    ];
    const ownSizes = [
      ...stringsForFields(value, sizeFieldNames),
      ...(hint === 'size' ? genericHintStrings(value) : []),
    ];
    const ownPriceMinor = recordCurrentPriceMinor(value);
    const ownAvailability = recordAvailability(value);
    const startsColourScope = ownColours.length > 0;
    const nextContext: VariantContext = {
      colours: startsColourScope ? [...new Set(ownColours)] : context.colours,
      // A price from one colour must never leak into another colour. A size can
      // safely inherit its exact colour's price when all sizes share that price.
      priceMinor: startsColourScope
        ? ownPriceMinor
        : (ownPriceMinor ?? context.priceMinor),
      // Product- or colour-level availability does not prove a saved size is in stock.
      inStock: ownAvailability,
    };

    for (const size of [...new Set(ownSizes)]) {
      candidates.push({
        colours: nextContext.colours,
        size,
        priceMinor: nextContext.priceMinor,
        inStock: ownAvailability,
      });
    }

    for (const [key, child] of Object.entries(value)) {
      if (typeof child !== 'object' || child === null) continue;
      visit(child, nextContext, collectionHint(key));
    }
  }

  values.forEach((value) =>
    visit(value, { colours: [], priceMinor: null, inStock: null }, null),
  );
  return candidates;
}

export function findStructuredVariant(
  values: unknown[],
  variant: ProductVariant,
): StructuredVariantMatch | null {
  if (!variant.size) return null;

  const sizeMatches = collectStructuredVariants(values).filter((candidate) =>
    sizesMatch(candidate.size, variant.size!),
  );
  const matches = variant.colour
    ? sizeMatches.filter((candidate) =>
        candidate.colours.some((colour) =>
          coloursMatch(colour, variant.colour!),
        ),
      )
    : sizeMatches;

  if (!variant.colour) {
    const distinctColours = new Set(
      matches
        .flatMap((candidate) => candidate.colours.map(normalizeColour))
        .filter(Boolean),
    );
    if (distinctColours.size > 1) return null;
  }

  return (
    matches.sort((left, right) => {
      const leftScore =
        Number(left.priceMinor !== null) + Number(left.inStock !== null);
      const rightScore =
        Number(right.priceMinor !== null) + Number(right.inStock !== null);
      return rightScore - leftScore;
    })[0] ?? null
  );
}
