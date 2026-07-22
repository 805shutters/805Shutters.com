import { sourceProvenance, type SourceManifestId } from "./source-manifest";

type RomanPriceGroup = "group1" | "group2" | "group3";

export interface RomanPriceGroupConflict {
  collection: string;
  colorCode: string;
  romanGuidePriceGroup: RomanPriceGroup;
  julyRetailPriceGroup: RomanPriceGroup;
  restrictionSource: ReturnType<typeof sourceProvenance>;
  pricingSource: ReturnType<typeof sourceProvenance>;
}

const ROMAN_GUIDE_SOURCE: SourceManifestId = "norman-roman-guide-2026-05";
const JULY_RETAIL_SOURCE: SourceManifestId = "norman-retail-guide-2026-07";

/**
 * The ten assignments where the May Roman product guide and July price book
 * disagree. The price book is authoritative for dollars and price groups;
 * the product guide remains authoritative for fabric and restriction data.
 */
export const ROMAN_JULY_PRICE_GROUP_CONFLICTS: readonly RomanPriceGroupConflict[] = [
  {
    collection: "Sheer Elegance",
    colorCode: "F1085",
    romanGuidePriceGroup: "group2",
    julyRetailPriceGroup: "group1",
    restrictionSource: sourceProvenance(ROMAN_GUIDE_SOURCE, { page: 24 }),
    pricingSource: sourceProvenance(JULY_RETAIL_SOURCE, { page: 26 }),
  },
  {
    collection: "Valencia",
    colorCode: "F0255",
    romanGuidePriceGroup: "group2",
    julyRetailPriceGroup: "group1",
    restrictionSource: sourceProvenance(ROMAN_GUIDE_SOURCE, { page: 24 }),
    pricingSource: sourceProvenance(JULY_RETAIL_SOURCE, { page: 26 }),
  },
  ...[
    "F1916",
    "F1917",
    "F1918",
    "F1919",
    "F1920",
    "F1921",
    "F1922",
    "F1923",
  ].map(
    (colorCode): RomanPriceGroupConflict => ({
      collection: "Sierra",
      colorCode,
      romanGuidePriceGroup: "group3",
      julyRetailPriceGroup: "group2",
      restrictionSource: sourceProvenance(ROMAN_GUIDE_SOURCE, { page: 27 }),
      pricingSource: sourceProvenance(JULY_RETAIL_SOURCE, { page: 26 }),
    }),
  ),
] as const;
