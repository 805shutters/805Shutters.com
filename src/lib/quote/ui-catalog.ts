// UI-facing projection of the pricing catalog. The builder UI needs flat,
// selectable option lists (products -> programs / fabrics / surcharges /
// motorization) without shipping the full price grids to the browser.

import { catalog } from "./catalog";
import { productImage } from "./product-images";
import { getDetailFieldsForProduct, getMotorizationGroupsForProduct, type QuoteDetailField } from "./product-options";

export const WHOLESALE_REFERENCE_RATE = 0.3;

export type UiProgram = {
  id: string;
  name: string;
  priceGroup: string | null;
  priceAxis: "wh" | "width" | "sqft";
};

export type UiFabric = { name: string; programId: string };

export type UiSurcharge = {
  id: string;
  name: string;
  kind: "percent" | "flat";
  per: "unit" | "side" | "foot" | "sqft" | "once";
  value: number | null;
  /** True when priced by window width (valances) rather than a flat value. */
  widthGraduated: boolean;
};

export type UiDetailField = QuoteDetailField;

export type UiReferenceSurcharge = UiSurcharge & {
  appliesTo: string;
  notes: string;
  sourceType: string;
};

export type UiProduct = {
  id: string;
  name: string;
  productType: string;
  provisional: boolean;
  source: string | null;
  image: string;
  /** Products are chosen by fabric when fabrics is non-empty, else by program. */
  programs: UiProgram[];
  fabrics: UiFabric[];
  details: UiDetailField[];
  motorizationGroups: string[];
  surcharges: UiSurcharge[];
};

export type UiMotorizationGroup = {
  groupId: string;
  name: string;
  options: { id: string; name: string; price: number | null }[];
};

export type UiCatalog = {
  source: string;
  effectiveDate: string;
  products: UiProduct[];
  motorization: UiMotorizationGroup[];
};

export type UiPricingReferenceProgram = {
  productId: string;
  productName: string;
  productType: string;
  provisional: boolean;
  source: string | null;
  programId: string;
  programName: string;
  priceGroup: string | null;
  priceAxis: "wh" | "width" | "sqft";
  maxWidth: number | null;
  maxHeight: number | null;
  minSqft: number | null;
  pricePerSqft: number | null;
  costPerSqft: number | null;
  widths: number[];
  heights: number[];
  prices: Array<Array<number | null>>;
  costs: Array<Array<number | null>>;
  notes: string[];
};

export type UiPricingReferenceProduct = {
  productId: string;
  productName: string;
  productType: string;
  provisional: boolean;
  source: string | null;
  surcharges: UiReferenceSurcharge[];
  notes: string[];
};

export type UiPricingReferenceMotorizationGroup = {
  groupId: string;
  name: string;
  options: { id: string; name: string; price: number | null; notes: string }[];
  surcharges: UiReferenceSurcharge[];
  notes: string[];
};

export type UiPricingReference = {
  source: string;
  effectiveDate: string;
  currency: string;
  programs: UiPricingReferenceProgram[];
  products: UiPricingReferenceProduct[];
  globalSurcharges: UiReferenceSurcharge[];
  motorization: UiPricingReferenceMotorizationGroup[];
};

function projectSurcharge(s: (typeof catalog.products)[number]["surcharges"][number]): UiReferenceSurcharge {
  return {
    id: s.id,
    name: s.name,
    kind: s.kind,
    per: s.per,
    value: s.value,
    widthGraduated: s.widthGraduated != null,
    appliesTo: s.appliesTo,
    notes: s.notes,
    sourceType: s.sourceType,
  };
}

function wholesaleReference(price: number | null | undefined): number | null {
  if (price == null) return null;
  return Math.round(price * WHOLESALE_REFERENCE_RATE);
}

function wholesaleReferenceGrid(prices: Array<Array<number | null>>): Array<Array<number | null>> {
  return prices.map((row) => row.map((price) => wholesaleReference(price)));
}

function referenceCostPerSqft(pricePerSqft: number | null | undefined): number | null {
  if (pricePerSqft == null) return null;
  return Math.round(pricePerSqft * WHOLESALE_REFERENCE_RATE * 100) / 100;
}

export function buildUiCatalog(): UiCatalog {
  const products: UiProduct[] = catalog.products.map((p) => ({
    id: p.id,
    name: p.name,
    productType: p.productType,
    provisional: p.provisional === true,
    source: p.source ?? null,
    image: productImage(p.productType),
    programs: p.programs.map((pr) => ({
      id: pr.id,
      name: pr.name,
      priceGroup: pr.priceGroup,
      priceAxis: pr.priceAxis,
    })),
    fabrics: p.fabricRouting
      ? Object.entries(p.fabricRouting)
          .map(([name, programId]) => ({ name, programId }))
          .sort((a, b) => a.name.localeCompare(b.name))
      : [],
    details: getDetailFieldsForProduct(p.id),
    motorizationGroups: getMotorizationGroupsForProduct(p.id),
    surcharges: p.surcharges.map((s) => ({
      id: s.id,
      name: s.name,
      kind: s.kind,
      per: s.per,
      value: s.value,
      widthGraduated: s.widthGraduated != null,
    })),
  }));

  const motorization: UiMotorizationGroup[] = Object.entries(catalog.motorization).map(
    ([groupId, group]) => ({
      groupId,
      name: group.name,
      options: group.options.map((o) => ({ id: o.id, name: o.name, price: o.price })),
    }),
  );

  return {
    source: catalog.source,
    effectiveDate: catalog.effectiveDate,
    products: products.sort((a, b) => a.name.localeCompare(b.name)),
    motorization,
  };
}

export function buildPricingReference(): UiPricingReference {
  const programs = catalog.products.flatMap((product) =>
    product.programs.map((program) => ({
      productId: product.id,
      productName: product.name,
      productType: product.productType,
      provisional: product.provisional === true,
      source: product.source ?? null,
      programId: program.id,
      programName: program.name,
      priceGroup: program.priceGroup,
      priceAxis: program.priceAxis,
      maxWidth: program.maxWidth ?? null,
      maxHeight: program.maxHeight ?? null,
      minSqft: program.minSqft ?? null,
      pricePerSqft: program.pricePerSqft ?? null,
      costPerSqft: program.costPerSqft ?? referenceCostPerSqft(program.pricePerSqft),
      widths: program.grid.widths,
      heights: program.grid.heights,
      prices: program.grid.prices,
      costs: wholesaleReferenceGrid(program.grid.prices),
      notes: program.notes,
    })),
  );

  const products = catalog.products.map((product) => ({
    productId: product.id,
    productName: product.name,
    productType: product.productType,
    provisional: product.provisional === true,
    source: product.source ?? null,
    surcharges: product.surcharges.map(projectSurcharge),
    notes: product.notes,
  }));

  const motorization = Object.entries(catalog.motorization).map(([groupId, group]) => ({
    groupId,
    name: group.name,
    options: group.options.map((option) => ({
      id: option.id,
      name: option.name,
      price: option.price,
      notes: option.notes,
    })),
    surcharges: group.surcharges.map(projectSurcharge),
    notes: group.notes,
  }));

  return {
    source: catalog.source,
    effectiveDate: catalog.effectiveDate,
    currency: catalog.currency,
    programs,
    products,
    globalSurcharges: catalog.globalRules.surcharges.map(projectSurcharge),
    motorization,
  };
}
