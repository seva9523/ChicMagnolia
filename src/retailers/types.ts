export type Money = {
  amountMinor: number;
  currency: string;
};

export type ProductVariant = {
  size: string | null;
  colour: string | null;
};

export type RetailerProductSnapshot = {
  canonicalUrl: string;
  retailerProductId: string | null;
  title: string;
  price: Money;
  variant: ProductVariant;
  inStock: boolean;
  checkedAt: Date;
};

export type RetailerReturnPolicy = {
  returnWindowDays: number;
  sourceUrl: string;
  checkedAt: Date;
};

export interface RetailerAdapter {
  readonly retailerSlug: string;
  supports(url: URL): boolean;
  fetchProduct(
    url: URL,
    variant: ProductVariant,
  ): Promise<RetailerProductSnapshot>;
  fetchReturnPolicy(): Promise<RetailerReturnPolicy>;
}
