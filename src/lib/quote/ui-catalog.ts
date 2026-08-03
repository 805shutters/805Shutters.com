// UI-facing projection of the pricing catalog. The builder UI needs flat,
// selectable option lists (products -> programs / fabrics / surcharges /
// motorization) without shipping the full price grids to the browser.

import { catalog } from "./catalog";
import { isPolarManufacturer, isPolarProductId } from "./quote-only-policy";
import { productImage } from "./product-images";
import { getProductColorOptions, type ProductColorOption } from "./product-color-options";
import { getDetailFieldsForProduct, getMotorizationGroupsForProduct, type QuoteDetailField } from "./product-options";
import {
  canonicalWholesaleCostGrid,
  canonicalWholesaleCostPerSqft,
  wholesaleLedgerProgramStatus,
  type WholesaleCostBasis,
  type WholesaleLedgerSource,
  type WholesaleProvenanceStatus,
} from "./wholesale-ledger";
import type { WholesaleAuthorityFinding } from "./lotus-authority";
import type { ProductCatalogStatus } from "@/lib/quote-v2/catalog";

export type UiProgram = {
  id: string;
  name: string;
  priceGroup: string | null;
  priceAxis: "wh" | "width" | "height" | "sqft";
  priceBasis: "suggested_retail" | "dealer_net" | "manual_required" | "unavailable" | null;
};

export type UiFabric = { name: string; programId: string };

export type UiFabricColor = Pick<
  ProductColorOption,
  | "id"
  | "productId"
  | "collection"
  | "publicCollection"
  | "fabricType"
  | "colorCode"
  | "colorName"
  | "publicColorName"
  | "frStatus"
  | "imageUrl"
  | "sourcePage"
  | "sourcePageModified"
  | "sourceNote"
  | "programId"
  | "selectionMode"
  | "requiresProgram"
  | "available"
  | "automaticDetails"
  | "searchText"
>;

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
  manufacturer: string | null;
  system: string | null;
  priceBasis: "suggested_retail" | "dealer_net" | "manual_required" | "unavailable";
  provisional: boolean;
  source: string | null;
  image: string;
  /** Products are chosen by fabric when fabrics is non-empty, else by program. */
  programs: UiProgram[];
  fabrics: UiFabric[];
  fabricColors: UiFabricColor[];
  details: UiDetailField[];
  motorizationGroups: string[];
  surcharges: UiSurcharge[];
};

export type UiMotorizationOption = {
  id: string;
  name: string;
  price: number | null;
  priceByProduct?: Record<string, number | null>;
};

export type UiMotorizationGroup = {
  groupId: string;
  name: string;
  options: UiMotorizationOption[];
};

export type UiCatalog = {
  source: string;
  effectiveDate: string;
  products: UiProduct[];
  motorization: UiMotorizationGroup[];
};

export function resolveMotorizationOptionsForProduct(
  group: UiMotorizationGroup,
  productId: string,
): Array<{ id: string; name: string; price: number | null }> {
  return group.options.flatMap((option) => {
    const hasProductPrice = Boolean(option.priceByProduct && productId in option.priceByProduct);
    const mapped = hasProductPrice ? option.priceByProduct?.[productId] : option.price;
    if (hasProductPrice && mapped == null) return [];
    return [{ id: option.id, name: option.name, price: mapped ?? null }];
  });
}

export type UiPricingReferenceProgram = {
  productId: string;
  productName: string;
  productType: string;
  manufacturer: string;
  provisional: boolean;
  source: string | null;
  sourceId: string | null;
  sourceFileName: string | null;
  sourceTitle: string | null;
  sourceRevision: string | null;
  sourceEffectiveDate: string | null;
  sourceSha256: string | null;
  sourcePages: number[];
  provenanceStatus: WholesaleProvenanceStatus;
  productStatus: ProductCatalogStatus;
  customerPriceEligible: boolean;
  authorityFindings: readonly WholesaleAuthorityFinding[];
  priceBasis: "suggested_retail" | "dealer_net" | "manual_required" | "unavailable";
  costBasis: WholesaleCostBasis | null;
  costCoverage: "complete" | "partial" | "missing";
  costCellCount: number;
  totalCellCount: number;
  dealerFactor: number | null;
  programId: string;
  programName: string;
  priceGroup: string | null;
  priceAxis: "wh" | "width" | "height" | "sqft";
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
  manufacturer: string;
  priceBasis: "suggested_retail" | "dealer_net" | "manual_required" | "unavailable";
  provisional: boolean;
  source: string | null;
  surcharges: UiReferenceSurcharge[];
  notes: string[];
};

export type UiPricingReferenceMotorizationGroup = {
  groupId: string;
  name: string;
  options: (UiMotorizationOption & { notes: string })[];
  surcharges: UiReferenceSurcharge[];
  notes: string[];
};

export type UiPricingReference = {
  source: string;
  effectiveDate: string;
  currency: string;
  sources: WholesaleLedgerSource[];
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

function emptyCostGrid(prices: Array<Array<number | null>>): Array<Array<number | null>> {
  return prices.map((row) => row.map(() => null));
}

export function buildUiCatalog(): UiCatalog {
  const products: UiProduct[] = catalog.products.map((p) => {
    const quoteOnly = isPolarManufacturer(p.manufacturer) || isPolarProductId(p.id);
    return {
    id: p.id,
    name: p.name,
    productType: p.productType,
    manufacturer: p.manufacturer ?? (p.id.startsWith("polar_") ? "Polar" : "Norman"),
    system: p.system ?? null,
    priceBasis: quoteOnly ? "manual_required" : p.priceBasis ?? "suggested_retail",
    provisional: p.provisional === true,
    source: p.source ?? null,
    image: productImage(p.productType),
    programs: (quoteOnly ? [] : p.programs).map((pr) => ({
      id: pr.id,
      name: pr.name,
      priceGroup: pr.priceGroup,
      priceAxis: pr.priceAxis,
      priceBasis: pr.priceBasis ?? null,
    })),
    fabrics: !quoteOnly && p.fabricRouting
      ? Object.entries(p.fabricRouting)
          .map(([name, programId]) => ({ name, programId }))
          .sort((a, b) => a.name.localeCompare(b.name))
      : [],
    fabricColors: (quoteOnly ? [] : getProductColorOptions(p.id)).map((row) => ({
      id: row.id,
      productId: row.productId,
      collection: row.collection,
      publicCollection: row.publicCollection,
      fabricType: row.fabricType,
      colorCode: row.colorCode,
      colorName: row.colorName,
      publicColorName: row.publicColorName,
      frStatus: row.frStatus,
      imageUrl: row.imageUrl,
      sourcePage: row.sourcePage,
      sourcePageModified: row.sourcePageModified,
      sourceNote: row.sourceNote,
      programId: row.programId,
      selectionMode: row.selectionMode,
      requiresProgram: row.requiresProgram,
      available: row.available,
      automaticDetails: row.automaticDetails,
      searchText: row.searchText,
    })),
    details: quoteOnly ? [] : getDetailFieldsForProduct(p.id),
    motorizationGroups: quoteOnly ? [] : getMotorizationGroupsForProduct(p.id),
    surcharges: (quoteOnly ? [] : p.surcharges).map((s) => ({
      id: s.id,
      name: s.name,
      kind: s.kind,
      per: s.per,
      value: s.value,
      widthGraduated: s.widthGraduated != null,
    })),
    };
  });

  const motorization: UiMotorizationGroup[] = Object.entries(catalog.motorization)
    .filter(([groupId]) => !groupId.startsWith("polar_"))
    .map(
    ([groupId, group]) => ({
      groupId,
      name: group.name,
      options: group.options.map((o) => ({
        id: o.id,
        name: o.name,
        price: o.price,
        ...(o.priceByProduct ? { priceByProduct: o.priceByProduct } : {}),
      })),
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
  const programs = catalog.products
    .filter((product) => !isPolarManufacturer(product.manufacturer) && !isPolarProductId(product.id))
    .flatMap((product) =>
    product.programs.map((program) => {
      const status = wholesaleLedgerProgramStatus(product, program);
      const squareFootCost = canonicalWholesaleCostPerSqft(product, program);
      return {
        productId: product.id,
        productName: product.name,
        productType: product.productType,
        manufacturer: product.manufacturer ?? "Unknown manufacturer",
        provisional: product.provisional === true,
        source: product.source ?? null,
        sourceId: status.source?.sourceId ?? null,
        sourceFileName: status.source?.fileName ?? null,
        sourceTitle: status.source?.title ?? null,
        sourceRevision: status.source?.revision ?? null,
        sourceEffectiveDate: status.source?.effectiveDate ?? null,
        sourceSha256: status.source?.sha256 ?? null,
        sourcePages: [...(status.source?.pages ?? [])],
        provenanceStatus: status.provenanceStatus,
        productStatus: status.productStatus,
        customerPriceEligible: status.customerPriceEligible,
        authorityFindings: status.authorityFindings,
        priceBasis:
          program.priceBasis ?? product.priceBasis ?? "suggested_retail",
        costBasis: status.basis,
        costCoverage: status.coverage,
        costCellCount: status.costCellCount,
        totalCellCount: status.totalCellCount,
        dealerFactor: product.dealerFactor ?? null,
        programId: program.id,
        programName: program.name,
        priceGroup: program.priceGroup,
        priceAxis: program.priceAxis,
        maxWidth: program.maxWidth ?? null,
        maxHeight: program.maxHeight ?? null,
        minSqft: program.minSqft ?? null,
        pricePerSqft: program.pricePerSqft ?? null,
        costPerSqft: squareFootCost?.amount ?? null,
        widths: program.grid.widths,
        heights: program.grid.heights,
        prices: program.grid.prices,
        costs:
          program.priceAxis === "sqft"
            ? emptyCostGrid(program.grid.prices)
            : canonicalWholesaleCostGrid(product, program),
        notes: program.notes,
      };
    }),
  );

  const products = catalog.products
    .filter((product) => !isPolarManufacturer(product.manufacturer) && !isPolarProductId(product.id))
    .map((product) => ({
    productId: product.id,
    productName: product.name,
    productType: product.productType,
    manufacturer: product.manufacturer ?? "Unknown manufacturer",
    priceBasis: product.priceBasis ?? "suggested_retail",
    provisional: product.provisional === true,
    source: product.source ?? null,
    surcharges: product.surcharges.map(projectSurcharge),
    notes: product.notes,
  }));

  const motorization = Object.entries(catalog.motorization)
    .filter(([groupId]) => !groupId.startsWith("polar_"))
    .map(([groupId, group]) => ({
    groupId,
    name: group.name,
    options: group.options.map((option) => ({
      id: option.id,
      name: option.name,
      price: option.price,
      ...(option.priceByProduct ? { priceByProduct: option.priceByProduct } : {}),
      notes: option.notes,
    })),
    surcharges: group.surcharges.map(projectSurcharge),
    notes: group.notes,
  }));

  const supportedSources = [
    ...new Set(
      [...programs.map((program) => program.source), ...products.map((product) => product.source)]
        .filter((source): source is string => Boolean(source)),
    ),
  ];

  return {
    source: supportedSources.join(" + ") || "Source-backed manufacturer pricing",
    effectiveDate: catalog.effectiveDate,
    currency: catalog.currency,
    sources: [
      ...new Map(
        programs.flatMap((program) =>
          program.sourceId
            ? [[
                program.sourceId,
                {
                  sourceId: program.sourceId,
                  manufacturer: program.manufacturer,
                  fileName: program.sourceFileName ?? "Pinned source",
                  title: program.sourceTitle ?? program.source ?? "Pinned source",
                  revision: program.sourceRevision ?? "Unknown",
                  effectiveDate: program.sourceEffectiveDate,
                  effectiveDateEvidence:
                    program.sourceEffectiveDate == null
                      ? "No effective date is stated in the pinned source."
                      : `Effective ${program.sourceEffectiveDate}.`,
                  sha256: program.sourceSha256 ?? "",
                  pages: program.sourcePages,
                } satisfies WholesaleLedgerSource,
              ] as const]
            : [],
        ),
      ).values(),
    ],
    programs,
    products,
    globalSurcharges: catalog.globalRules.surcharges.map(projectSurcharge),
    motorization,
  };
}
