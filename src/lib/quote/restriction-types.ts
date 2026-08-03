export type RestrictionAuthority =
  | "source_backed"
  | "catalog_inherited"
  | "configuration_dependent"
  | "manual_quote"
  | "unavailable";

export type RestrictionLegendRow = {
  id: string;
  manufacturer: string;
  productId: string;
  productName: string;
  scope: "product" | "program" | "fabric" | "configuration";
  programId: string | null;
  programName: string | null;
  fabricId: string | null;
  fabricCollection: string | null;
  fabricType: string | null;
  colorCode: string | null;
  colorName: string | null;
  minWidth: number | null;
  maxWidth: number | null;
  minHeight: number | null;
  maxHeight: number | null;
  maxAreaSqft: number | null;
  fabricRollWidth: number | null;
  maxRailroadLength: number | null;
  railroadAllowed: boolean | null;
  minWidthRange: [number, number] | null;
  maxWidthRange: [number, number] | null;
  minHeightRange: [number, number] | null;
  maxHeightRange: [number, number] | null;
  maxAreaRangeSqft: [number, number] | null;
  conditions: string[];
  warningBehavior: string;
  authority: RestrictionAuthority;
  sourceId: string | null;
  sourceFile: string | null;
  sourceLocation: string | null;
  effectiveDate: string | null;
  notes: string[];
};

export type PricingRestrictionReference = {
  generatedAt: string;
  rows: RestrictionLegendRow[];
  counts: {
    products: number;
    rows: number;
    productRows: number;
    programRows: number;
    fabricRows: number;
    configurationRows: number;
    sourceBackedRows: number;
  };
};
