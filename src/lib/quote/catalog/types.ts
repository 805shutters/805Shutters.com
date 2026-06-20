// Types for the canonical Norman pricing catalog (norman-2026.catalog.json).
// The catalog is generated from the Norman 2026 Retail Price Guide and every
// price cell is verified against the source PDF text layer.

export type CatalogPriceAxis = "wh" | "width" | "sqft";
export type SurchargeKind = "percent" | "flat";
export type SurchargePer = "unit" | "side" | "foot" | "sqft" | "once";

export type CatalogFabricCollection = {
  category: string;
  fabrics: string[];
};

export type CatalogGrid = {
  /** Grid column headers, ascending inches. */
  widths: number[];
  /** Grid row headers, ascending inches. Empty for width-only programs. */
  heights: number[];
  /** prices[heightIndex][widthIndex] in whole dollars; null = not available (NA). */
  prices: (number | null)[][];
};

export type CatalogProgram = {
  id: string;
  name: string;
  priceGroup: string | null;
  priceAxis: CatalogPriceAxis;
  grid: CatalogGrid;
  /** For priceAxis "sqft": retail price per square foot. */
  pricePerSqft?: number | null;
  /** For priceAxis "sqft": minimum billable square footage (e.g. 8 for shutters). */
  minSqft?: number | null;
  maxWidth: number | null;
  maxHeight: number | null;
  maxAreaSqft: number | null;
  fabricCollections: CatalogFabricCollection[];
  notes: string[];
};

/** Width-graduated surcharge price table (e.g. valances priced by window width). */
export type CatalogWidthGraduated = {
  /** Ascending width breakpoints in inches. */
  widths: number[];
  /** Retail price (whole dollars) at each width breakpoint; same length as widths. */
  prices: number[];
  /** Dollars added per whole foot of width beyond the largest breakpoint. */
  additionalFootRate: number;
};

export type CatalogSurcharge = {
  id: string;
  name: string;
  kind: SurchargeKind;
  per: SurchargePer;
  value: number | null;
  /** When present, the charge is looked up by window width (round up) rather than
   *  using a flat `value`. Used for width-graduated valances whose price table
   *  would otherwise sit unused in `notes` and bill $0. */
  widthGraduated?: CatalogWidthGraduated;
  appliesTo: string;
  notes: string;
  sourceType: string;
};

export type CatalogFabricByYard = {
  priceGroup: string;
  perYard: number;
  maxYards: number;
};

export type CatalogProduct = {
  id: string;
  productType: string;
  name: string;
  pages: number[];
  /** True when prices are not yet verified against a current price guide. */
  provisional?: boolean;
  /** Provenance, e.g. the guide/file the prices came from. */
  source?: string;
  /** fabric name -> program id. null for products with a single program. */
  fabricRouting: Record<string, string> | null;
  programs: CatalogProgram[];
  surcharges: CatalogSurcharge[];
  fabricByYard: CatalogFabricByYard[];
  notes: string[];
};

export type CatalogMotorizationOption = {
  id: string;
  name: string;
  price: number | null;
  notes: string;
};

export type CatalogMotorizationGroup = {
  name: string;
  options: CatalogMotorizationOption[];
  surcharges: CatalogSurcharge[];
  notes: string[];
};

export type Catalog = {
  source: string;
  effectiveDate: string;
  currency: string;
  generatedFrom: string;
  globalRules: { surcharges: CatalogSurcharge[]; notes: string[] };
  products: CatalogProduct[];
  motorization: Record<string, CatalogMotorizationGroup>;
};
