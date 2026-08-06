// Types for the canonical Norman pricing catalog (norman-2026.catalog.json).
// The catalog is generated from the Norman 2026 Retail Price Guide and every
// price cell is verified against the source PDF text layer.

export type CatalogPriceAxis = "wh" | "width" | "height" | "sqft";
export type CatalogPriceBasis =
  | "suggested_retail"
  | "dealer_net"
  | "manual_required"
  | "unavailable";
export type SurchargeKind = "percent" | "flat";
export type SurchargePer = "unit" | "side" | "foot" | "sqft" | "once";

export type CatalogFabricCollection = {
  category: string;
  fabrics: string[];
};

export type CatalogFabricMetadata = {
  name: string;
  priceGroup: string;
  openness: string;
  rollWidthInches: number | null;
  maxRailroadLengthInches: number | null;
  railroadAllowed: boolean;
  sourcePage: number;
};

export type CatalogGrid = {
  /** Grid column headers, ascending inches. */
  widths: number[];
  /** Grid row headers, ascending inches. Empty for width-only programs. */
  heights: number[];
  /** prices[heightIndex][widthIndex] in whole dollars; null = not available (NA). */
  prices: (number | null)[][];
  /** Internal dealer-net grid. Never include through customer-facing catalog projections. */
  costs?: (number | null)[][];
  /** Source order codes retained for audit and future manufacturer-order tooling. */
  skuCodes?: string[][][];
  /** Source directions such as "Use Two Blinds"; these cells remain unpriced. */
  cellNotes?: (string | null)[][];
};

export type CatalogProgram = {
  id: string;
  name: string;
  priceGroup: string | null;
  /**
   * Stable identity for price-group programs that share one underlying product
   * grid. V2 uses this explicit source metadata to separate the baseline grid
   * from a higher fabric-group delta; it must never infer families from names.
   */
  pricingFamilyId?: string | null;
  /**
   * Exact lowest/base price-group program for this pricing family. Required
   * whenever `priceGroup` represents a fabric upgrade above the base grid.
   */
  baselineProgramId?: string | null;
  priceAxis: CatalogPriceAxis;
  /** Optional program-level override for a product with mixed priceability. */
  priceBasis?: CatalogPriceBasis;
  /** Owner-approved retail override when one program differs from its product family. */
  retailPolicy?: {
    kind: "cost_multiplier";
    value: number;
    confirmedBy: string;
    confirmedDate: string;
  };
  /** Immutable source-manifest identity for this program's price evidence. */
  sourceId?: string;
  grid: CatalogGrid;
  /** For priceAxis "sqft": retail price per square foot. */
  pricePerSqft?: number | null;
  /** For priceAxis "sqft": our cost / wholesale price per square foot. */
  costPerSqft?: number | null;
  /** For priceAxis "sqft": minimum billable square footage (e.g. 8 for shutters). */
  minSqft?: number | null;
  minWidth?: number | null;
  minHeight?: number | null;
  maxWidth: number | null;
  maxHeight: number | null;
  maxAreaSqft: number | null;
  fabricCollections: CatalogFabricCollection[];
  notes: string[];
  sourcePages?: number[];
};

/** Width-graduated surcharge price table (e.g. valances priced by window width). */
export type CatalogWidthGraduated = {
  /** Ascending width breakpoints in inches. */
  widths: number[];
  /** Retail price (whole dollars) at each width breakpoint; null = not available (NA). */
  prices: Array<number | null>;
  /** Dollars added per whole foot of width beyond the largest breakpoint. */
  additionalFootRate: number;
};

export type CatalogHeightGraduated = {
  heights: number[];
  prices: Array<number | null>;
};

export type CatalogSurcharge = {
  id: string;
  name: string;
  kind: SurchargeKind;
  per: SurchargePer;
  value: number | null;
  /** Internal supplier cost when the source does not define customer retail. */
  dealerNetValue?: number | null;
  /** Immutable source-manifest identity for this option's price evidence. */
  sourceId?: string;
  /** Optional dealer-cost multiplier override. `1` means no dealer discount. */
  dealerFactor?: number | null;
  autoUnits?: "width_foot" | "height_foot";
  percentOfSurchargeId?: string;
  minimumCharge?: number;
  /** Multiply the source grid base when this option represents multiple shades. */
  baseQuantityMultiplier?: number;
  /** Derive the source grid base multiplier from the selected surcharge units. */
  baseQuantityFromUnits?: "units" | "units_plus_one";
  /** When present, the charge is looked up by window width (round up) rather than
   *  using a flat `value`. Used for width-graduated valances whose price table
   *  would otherwise sit unused in `notes` and bill $0. */
  widthGraduated?: CatalogWidthGraduated;
  heightGraduated?: CatalogHeightGraduated;
  appliesTo: string;
  notes: string;
  sourceType: string;
  sourcePages?: number[];
};

export type CatalogSourceMetadata = {
  sourceId?: string;
  file: string;
  title: string;
  revision: string;
  effectiveDate: string | null;
  receivedDate: string;
  modifiedDate: string;
  pages: number;
  sha256?: string;
};

export type CatalogFabricByYard = {
  priceGroup: string;
  perYard: number;
  maxYards: number;
};

export type CatalogStockItem = {
  sku: string;
  programId: string;
  description: string;
  width: number;
  height: number | null;
  color: string;
  cartonQty: number;
  dealerNetPrice: number;
  unit: "blind" | "shade" | "valance" | "headrail" | "casepack";
  sourcePage: number;
};

export type CatalogProduct = {
  id: string;
  productType: string;
  name: string;
  manufacturer?: string;
  system?: string;
  priceBasis?: CatalogPriceBasis;
  /** Explicit evidence status; `unverified` forbids treating a stored cost as MSRP. */
  customerRetailStatus?: "verified" | "unverified";
  /** Server-only cost policy. Never include this field in customer projections. */
  dealerFactor?: number | null;
  /**
   * Owner-authorized customer discount policy. Pricing must reject, never
   * clamp, a request above the cap or below the protected dealer-cost floor.
   */
  customerDiscountPolicy?: {
    maxPercent: number;
    floor: "dealer_cost";
    confirmedBy: string;
    confirmedDate: string;
  };
  /**
   * Owner-authorized customer charge applied once by the quote-level engine.
   * This is deliberately separate from manufacturer freight/cost evidence.
   */
  customerOrderChargePolicy?: {
    kind: "flat_once_per_quote";
    surchargeId: string;
    amount: number;
    confirmedBy: string;
    confirmedDate: string;
    policyId: string;
    policySha256: string;
    statement: string;
  };
  /** Owner-approved customer retail policy for a supplier cost catalog. */
  retailPolicy?: {
    kind: "cost_multiplier";
    value: number;
    confirmedBy: string;
    confirmedDate: string;
  };
  freightStatus?: "defined" | "order_level" | "unresolved" | "not_applicable";
  pages: number[];
  /** True when prices are not yet verified against a current price guide. */
  provisional?: boolean;
  /** Provenance, e.g. the guide/file the prices came from. */
  source?: string;
  /** fabric name -> program id. null for products with a single program. */
  fabricRouting: Record<string, string> | null;
  /**
   * Explicit source-defined families whose program grids differ only by a
   * fabric/collection tier. This product-level form avoids duplicating the
   * same immutable family declaration across large vendor books.
   */
  pricingFamilies?: Array<{
    id: string;
    baselineProgramId: string;
    memberProgramIds: string[];
  }>;
  fabricMetadata?: CatalogFabricMetadata[];
  programs: CatalogProgram[];
  surcharges: CatalogSurcharge[];
  fabricByYard: CatalogFabricByYard[];
  notes: string[];
  /** Complete source stock assortment. Server-only; omitted from customer projections. */
  stockItems?: CatalogStockItem[];
};

export type CatalogMotorizationOption = {
  id: string;
  name: string;
  price: number | null;
  /** Source-backed selection role used by product-specific quote validation. */
  role?: "motor" | "control" | "power" | "cable" | "accessory";
  /** Exact source technology family, when the dealer book states one. */
  technology?: "rts" | "standard" | "dct" | "rs485" | "z_wave" | "zigbee" | "poe" | "cmo" | "alpha";
  /** Technology families that the source expressly makes this item compatible with. */
  compatibleTechnologies?: Array<"rts" | "standard" | "dct" | "rs485" | "z_wave" | "zigbee" | "poe" | "cmo" | "alpha">;
  minWidth?: number;
  maxWidth?: number;
  minHeight?: number;
  maxHeight?: number;
  /** Source-mandated separately priced components. */
  requiredOptionIds?: string[];
  /**
   * Per-product retail price (Norman 2026 Retail Guide p7). When present and the product id is
   * a key, this is authoritative — a `null` means NA for that product (not orderable). Product
   * ids not present in the map fall back to the flat `price` (legacy behavior).
   */
  priceByProduct?: Record<string, number | null>;
  notes: string;
  sourcePages?: number[];
};

export type CatalogMotorizationGroup = {
  name: string;
  options: CatalogMotorizationOption[];
  surcharges: CatalogSurcharge[];
  notes: string[];
  sourcePages?: number[];
};

export type Catalog = {
  source: string;
  /** Pinned source-manifest identity when this catalog has one generator source. */
  sourceId?: string;
  /** SHA-256 of the exact source binary accepted by the generator. */
  sourceSha256?: string;
  effectiveDate: string;
  currency: string;
  generatedFrom: string;
  sources?: CatalogSourceMetadata[];
  globalRules: { surcharges: CatalogSurcharge[]; notes: string[] };
  products: CatalogProduct[];
  motorization: Record<string, CatalogMotorizationGroup>;
};
