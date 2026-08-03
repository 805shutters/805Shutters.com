import { getProduct, getProgram } from "@/lib/quote/catalog";
import type { CatalogProduct, CatalogProgram } from "@/lib/quote/catalog/types";
import type { PriceBreakdown, PriceLine } from "@/lib/quote/pricing";
import type {
  SelectionContext,
  SelectionValue,
  SourceProvenance,
  ValidationIssue,
} from "./core";
import { sourceProvenance } from "./source-manifest";

export const PRICE_COMPONENT_CATEGORIES = [
  "base_grid",
  "fabric_upgrade",
  "accessory",
  "operating_system",
  "order_charge",
] as const;

export type PriceComponentCategory =
  (typeof PRICE_COMPONENT_CATEGORIES)[number];

export type PriceComponentStatus = "priced" | "included";

export type PriceComponentBasis =
  | "grid_cell"
  | "grid_delta"
  | "flat"
  | "percent"
  | "width_ladder"
  | "height_ladder"
  | "square_foot"
  | "included";

export type PriceComponentBillingScope = "per_window" | "once_per_line";

export type PriceComponentMotorRole =
  | "base_motor"
  | "controller"
  | "hub"
  | "sensor"
  | "power_supply"
  | "accessory";

export type PriceComponentSelectionBinding = Readonly<{
  field: string;
  value: SelectionValue;
}>;

/**
 * One source-addressable amount in the authoritative V2 price ledger.
 *
 * `catalogAmount` is the untouched price-book amount. `wholesaleAmount` is the
 * eligible dealer-net amount after the selected dealer schedule. `customerAmount`
 * is the amount produced by the configured retail policy. Customer projections
 * must explicitly omit `wholesaleAmount`.
 */
export type AuthoritativePriceComponent = Readonly<{
  id: string;
  category: PriceComponentCategory;
  label: string;
  status: PriceComponentStatus;
  basis: PriceComponentBasis;
  selectionBindings: readonly PriceComponentSelectionBinding[];
  source: SourceProvenance;
  catalogAmount: number;
  wholesaleAmount: number;
  customerAmount: number;
  units: number;
  billingScope: PriceComponentBillingScope;
  priceLineId?: string;
  motorRole?: PriceComponentMotorRole;
}>;

/** Explicit, already-priced baseline lookup performed by the authoritative engine. */
export type PriceComponentBaseline = Readonly<{
  programId: string;
  matchedWidth: number | null;
  matchedHeight: number | null;
  /** Ordered grid-width cells for a documented multi-panel assembly. */
  componentMatchedWidths?: readonly number[];
  catalogAmount: number;
  wholesaleAmount: number;
  customerAmount: number;
  source: SourceProvenance | null;
}>;

/**
 * A selected option that must occupy exactly one ledger row. An included option
 * deliberately has no `priceLineId`; a priced option must identify exactly one
 * line in both the untouched source result and the converted retail result.
 */
export type PriceComponentOptionInput = Readonly<{
  id: string;
  label: string;
  category: "accessory" | "operating_system" | "order_charge";
  status: PriceComponentStatus;
  basis: Exclude<PriceComponentBasis, "grid_cell" | "grid_delta">;
  selectionBindings: readonly PriceComponentSelectionBinding[];
  source: SourceProvenance | null;
  priceLineId?: string;
  units?: number;
  billingScope: PriceComponentBillingScope;
}>;

/** Structural subset of the canonical Roller motor contract. */
export type PriceComponentMotorSelection = Readonly<{
  groupId: string;
  optionId: string;
  role: PriceComponentMotorRole;
  units: number;
}>;

export type BuildAuthoritativePriceComponentsInput = Readonly<{
  selection: SelectionContext;
  /** Result directly from the source catalog, before dealer/retail conversion. */
  sourceResult: PriceBreakdown;
  /** Result after dealer schedule and customer-retail policy conversion. */
  retailResult: PriceBreakdown;
  /** Optional dependency injection for deterministic tests. */
  product?: CatalogProduct;
  baseline: PriceComponentBaseline | null;
  selectedProgramSource: SourceProvenance | null;
  contractSource?: SourceProvenance | null;
  /** Explicit accessory coverage; pass an included `none` row when none apply. */
  accessories: readonly PriceComponentOptionInput[];
  /** Explicit operating-system coverage, including standard/included systems. */
  operatingSystem: PriceComponentOptionInput | null;
  canonicalMotorization?: readonly PriceComponentMotorSelection[];
  /** Keyed by `motor:<groupId>:<optionId>`. */
  motorSources?: Readonly<Record<string, SourceProvenance | null>>;
}>;

export type AuthoritativePriceComponentTotals = Readonly<{
  catalogPerWindow: number;
  wholesalePerWindow: number;
  customerPerWindow: number;
  catalogOncePerLine: number;
  wholesaleOncePerLine: number;
  customerOncePerLine: number;
}>;

export type AuthoritativePriceComponentsResult =
  | Readonly<{
      ok: true;
      components: readonly AuthoritativePriceComponent[];
      totals: AuthoritativePriceComponentTotals;
    }>
  | Readonly<{
      ok: false;
      issues: readonly ValidationIssue[];
    }>;

type ProgramWithPriceComposition = CatalogProgram & {
  pricingFamilyId?: string | null;
  baselineProgramId?: string | null;
};

type ProgramPriceCompositionResolution =
  | Readonly<{
      ok: true;
      standalone: boolean;
      pricingFamilyId: string | null;
      baselineProgramId: string;
      metadataScope: "program" | "product" | "standalone";
    }>
  | Readonly<{
      ok: false;
      reason: "incomplete" | "missing" | "ambiguous" | "conflict";
      matchingFamilyIds: readonly string[];
    }>;

const FALLBACK_ISSUE_SOURCE = sourceProvenance(
  "norman-retail-guide-2026-07",
);

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function sameMoney(left: number, right: number): boolean {
  return Math.round(left * 100) === Math.round(right * 100);
}

function populatedText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isMoney(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function validSource(value: unknown): value is SourceProvenance {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const source = value as Partial<SourceProvenance>;
  return Boolean(
    populatedText(source.sourceId) &&
      populatedText(source.fileName) &&
      populatedText(source.revision) &&
      populatedText(source.sha256),
  );
}

function issueSource(input: BuildAuthoritativePriceComponentsInput): SourceProvenance {
  if (validSource(input.contractSource)) return input.contractSource;
  if (validSource(input.selectedProgramSource)) return input.selectedProgramSource;
  if (validSource(input.baseline?.source)) return input.baseline.source;
  return FALLBACK_ISSUE_SOURCE;
}

function hardBlock(
  input: BuildAuthoritativePriceComponentsInput,
  ruleId: string,
  selectedValues: Record<string, SelectionValue>,
  explanation: string,
): ValidationIssue {
  return {
    severity: "hard_block",
    ruleId,
    source: issueSource(input),
    selectedValues,
    explanation,
  };
}

function priceLineMap(
  input: BuildAuthoritativePriceComponentsInput,
  lines: readonly PriceLine[],
  side: "source" | "retail",
  issues: ValidationIssue[],
): Map<string, PriceLine> {
  const result = new Map<string, PriceLine>();
  for (const line of lines) {
    if (!populatedText(line.id) || result.has(line.id)) {
      issues.push(
        hardBlock(
          input,
          "price_components.price_line_duplicate",
          { side, priceLineId: populatedText(line.id) },
          "Every authoritative price line must have one unique, nonempty catalog identity.",
        ),
      );
      continue;
    }
    result.set(line.id, line);
  }
  return result;
}

function validBindings(
  input: BuildAuthoritativePriceComponentsInput,
  option: PriceComponentOptionInput,
  issues: ValidationIssue[],
): boolean {
  if (
    option.selectionBindings.length > 0 &&
    option.selectionBindings.every((binding) => populatedText(binding.field))
  ) {
    return true;
  }
  issues.push(
    hardBlock(
      input,
      "price_components.selection_binding_missing",
      { componentId: option.id },
      `Price component '${option.label}' is not bound to an exact selected field and value.`,
    ),
  );
  return false;
}

function componentFromOption(
  input: BuildAuthoritativePriceComponentsInput,
  option: PriceComponentOptionInput,
  sourceLines: ReadonlyMap<string, PriceLine>,
  retailLines: ReadonlyMap<string, PriceLine>,
  consumed: Set<string>,
  issues: ValidationIssue[],
  motorRole?: PriceComponentMotorRole,
): AuthoritativePriceComponent | null {
  if (!populatedText(option.id) || !populatedText(option.label)) {
    issues.push(
      hardBlock(
        input,
        "price_components.identity_missing",
        { componentId: populatedText(option.id), label: populatedText(option.label) },
        "Every authoritative price component requires a stable ID and readable label.",
      ),
    );
    return null;
  }
  const bindingsValid = validBindings(input, option, issues);
  if (!validSource(option.source)) {
    issues.push(
      hardBlock(
        input,
        "price_components.provenance_missing",
        { componentId: option.id },
        `Price component '${option.label}' has no immutable source provenance.`,
      ),
    );
  }
  if (
    (option.category === "order_charge") !==
    (option.billingScope === "once_per_line")
  ) {
    issues.push(
      hardBlock(
        input,
        "price_components.billing_scope_mismatch",
        { componentId: option.id, category: option.category, billingScope: option.billingScope },
        "Order charges must be once-per-line and every once-per-line component must be categorized as an order charge.",
      ),
    );
  }
  const units = Number(option.units ?? 1);
  if (!Number.isInteger(units) || units < 1) {
    issues.push(
      hardBlock(
        input,
        "price_components.units_invalid",
        { componentId: option.id, units: Number.isFinite(units) ? units : null },
        "Every authoritative price component requires a positive whole-number unit count.",
      ),
    );
  }

  if (option.status === "included") {
    if (option.priceLineId) {
      issues.push(
        hardBlock(
          input,
          "price_components.included_line_mismatch",
          { componentId: option.id, priceLineId: option.priceLineId },
          "An explicitly included option cannot also consume a priced catalog line.",
        ),
      );
    }
    if (!bindingsValid || !validSource(option.source)) return null;
    return {
      id: option.id,
      category: option.category,
      label: option.label,
      status: "included",
      basis: "included",
      selectionBindings: option.selectionBindings,
      source: option.source,
      catalogAmount: 0,
      wholesaleAmount: 0,
      customerAmount: 0,
      units: Number.isInteger(units) && units > 0 ? units : 1,
      billingScope: option.billingScope,
      ...(motorRole ? { motorRole } : {}),
    };
  }

  const priceLineId = populatedText(option.priceLineId);
  if (!priceLineId) {
    issues.push(
      hardBlock(
        input,
        "price_components.price_line_missing",
        { componentId: option.id },
        `Priced component '${option.label}' does not identify its exact catalog price line.`,
      ),
    );
    return null;
  }
  if (consumed.has(priceLineId)) {
    issues.push(
      hardBlock(
        input,
        "price_components.price_line_consumed_twice",
        { componentId: option.id, priceLineId },
        `Catalog price line '${priceLineId}' was assigned to more than one component.`,
      ),
    );
    return null;
  }
  const sourceLine = sourceLines.get(priceLineId);
  const retailLine = retailLines.get(priceLineId);
  if (!sourceLine || !retailLine) {
    issues.push(
      hardBlock(
        input,
        "price_components.price_line_pair_missing",
        { componentId: option.id, priceLineId },
        `Catalog price line '${priceLineId}' is not present in both the untouched source result and converted retail result.`,
      ),
    );
    return null;
  }
  if (
    !isMoney(sourceLine.amount) ||
    !isMoney(retailLine.amount) ||
    !isMoney(retailLine.wholesaleAmount)
  ) {
    issues.push(
      hardBlock(
        input,
        "price_components.amount_missing",
        { componentId: option.id, priceLineId },
        `Catalog, wholesale, and customer amounts are required for '${option.label}'.`,
      ),
    );
    return null;
  }
  const declaredPercent = option.basis === "percent";
  if (
    (sourceLine.kind === "percent") !== declaredPercent ||
    retailLine.kind !== sourceLine.kind
  ) {
    issues.push(
      hardBlock(
        input,
        "price_components.basis_mismatch",
        {
          componentId: option.id,
          priceLineId,
          declaredBasis: option.basis,
          sourceKind: sourceLine.kind,
          retailKind: retailLine.kind,
        },
        `The declared calculation basis for '${option.label}' does not match its source and retail price lines.`,
      ),
    );
    return null;
  }
  if (!bindingsValid || !validSource(option.source)) return null;
  consumed.add(priceLineId);
  return {
    id: option.id,
    category: option.category,
    label: option.label,
    status: "priced",
    basis: option.basis,
    selectionBindings: option.selectionBindings,
    source: option.source,
    catalogAmount: roundMoney(sourceLine.amount),
    wholesaleAmount: roundMoney(retailLine.wholesaleAmount),
    customerAmount: roundMoney(retailLine.amount),
    units: Number.isInteger(units) && units > 0 ? units : 1,
    billingScope: option.billingScope,
    priceLineId,
    ...(motorRole ? { motorRole } : {}),
  };
}

function componentTotals(
  components: readonly AuthoritativePriceComponent[],
): AuthoritativePriceComponentTotals {
  const sum = (
    scope: PriceComponentBillingScope,
    key: "catalogAmount" | "wholesaleAmount" | "customerAmount",
  ) =>
    roundMoney(
      components
        .filter((component) => component.billingScope === scope)
        .reduce((total, component) => total + component[key], 0),
    );
  return {
    catalogPerWindow: sum("per_window", "catalogAmount"),
    wholesalePerWindow: sum("per_window", "wholesaleAmount"),
    customerPerWindow: sum("per_window", "customerAmount"),
    catalogOncePerLine: sum("once_per_line", "catalogAmount"),
    wholesaleOncePerLine: sum("once_per_line", "wholesaleAmount"),
    customerOncePerLine: sum("once_per_line", "customerAmount"),
  };
}

function expectedWholesaleOnce(result: PriceBreakdown): number | null {
  if (result.wholesaleUnitPrice == null || result.wholesaleTotal == null) return null;
  return roundMoney(
    result.wholesaleTotal - result.wholesaleUnitPrice * result.quantity,
  );
}

function resolveProgramPriceComposition(
  product: CatalogProduct,
  program: ProgramWithPriceComposition,
): ProgramPriceCompositionResolution {
  const programFamilyId = populatedText(program.pricingFamilyId);
  const programBaselineId = populatedText(program.baselineProgramId);
  const matchingFamilies = (product.pricingFamilies ?? []).filter((family) =>
    family.memberProgramIds.includes(program.id),
  );
  const matchingFamilyIds = matchingFamilies.map((family) => family.id);

  if ((programFamilyId === null) !== (programBaselineId === null)) {
    return { ok: false, reason: "incomplete", matchingFamilyIds };
  }
  if (matchingFamilies.length > 1) {
    return { ok: false, reason: "ambiguous", matchingFamilyIds };
  }
  if (programFamilyId && programBaselineId) {
    const productFamily = matchingFamilies[0];
    if (
      productFamily &&
      (productFamily.id !== programFamilyId ||
        productFamily.baselineProgramId !== programBaselineId)
    ) {
      return { ok: false, reason: "conflict", matchingFamilyIds };
    }
    return {
      ok: true,
      standalone: false,
      pricingFamilyId: programFamilyId,
      baselineProgramId: programBaselineId,
      metadataScope: "program",
    };
  }

  const productFamily = matchingFamilies[0];
  if (productFamily) {
    const familyId = populatedText(productFamily.id);
    const baselineProgramId = populatedText(productFamily.baselineProgramId);
    if (
      !familyId ||
      !baselineProgramId ||
      !productFamily.memberProgramIds.includes(baselineProgramId)
    ) {
      return { ok: false, reason: "incomplete", matchingFamilyIds };
    }
    return {
      ok: true,
      standalone: false,
      pricingFamilyId: familyId,
      baselineProgramId,
      metadataScope: "product",
    };
  }

  if (program.priceGroup === null) {
    return {
      ok: true,
      standalone: true,
      pricingFamilyId: null,
      baselineProgramId: program.id,
      metadataScope: "standalone",
    };
  }
  return { ok: false, reason: "missing", matchingFamilyIds };
}

/**
 * Build and reconcile the authoritative V2 component ledger. This function is
 * deliberately pure: no UI state, stored price, or inferred program-name token
 * can authorize a component or baseline.
 */
export function buildAuthoritativePriceComponents(
  input: BuildAuthoritativePriceComponentsInput,
): AuthoritativePriceComponentsResult {
  const issues: ValidationIssue[] = [];
  const product = input.product ?? getProduct(input.selection.productId);
  if (!product || product.id !== input.selection.productId) {
    return {
      ok: false,
      issues: [
        hardBlock(
          input,
          "price_components.product_missing",
          { productId: input.selection.productId },
          "The authoritative price-component contract cannot resolve the selected catalog product.",
        ),
      ],
    };
  }

  const selectedProgramId = input.selection.programId;
  const selectedProgram = selectedProgramId
    ? (getProgram(product, selectedProgramId) as
        | ProgramWithPriceComposition
        | undefined)
    : undefined;
  if (
    !selectedProgram ||
    input.sourceResult.productId !== input.selection.productId ||
    input.retailResult.productId !== input.selection.productId ||
    input.sourceResult.programId !== selectedProgramId ||
    input.retailResult.programId !== selectedProgramId ||
    input.sourceResult.matchedWidth !== input.retailResult.matchedWidth ||
    input.sourceResult.matchedHeight !== input.retailResult.matchedHeight ||
    input.sourceResult.configurationUnits !==
      input.retailResult.configurationUnits ||
    input.sourceResult.quantity !== input.retailResult.quantity
  ) {
    return {
      ok: false,
      issues: [
        hardBlock(
          input,
          "price_components.program_mismatch",
          {
            selectionProgramId: selectedProgramId,
            selectionProductId: input.selection.productId,
            sourceProductId: input.sourceResult.productId,
            retailProductId: input.retailResult.productId,
            sourceProgramId: input.sourceResult.programId,
            retailProgramId: input.retailResult.programId,
          },
          "The selection, source result, and retail result must use the same exact product, program, grid cell, physical-unit count, and quantity.",
        ),
      ],
    };
  }

  const selectedComposition = resolveProgramPriceComposition(
    product,
    selectedProgram,
  );
  if (!selectedComposition.ok) {
    issues.push(
      hardBlock(
        input,
        selectedComposition.reason === "ambiguous"
          ? "price_components.baseline_metadata_ambiguous"
          : selectedComposition.reason === "conflict"
            ? "price_components.baseline_metadata_conflict"
            : "price_components.baseline_metadata_missing",
        {
          selectedProgramId,
          matchingPricingFamilyIds: selectedComposition.matchingFamilyIds,
        },
        "A price-group program requires one unambiguous explicit pricing family and baseline program. V2 never infers either value from names or IDs.",
      ),
    );
  }

  const standaloneSelfBaseline =
    selectedComposition.ok && selectedComposition.standalone;
  const pricingFamilyId = selectedComposition.ok
    ? selectedComposition.pricingFamilyId
    : null;
  const baselineProgramId = selectedComposition.ok
    ? selectedComposition.baselineProgramId
    : null;

  const baselineProgram = baselineProgramId
    ? (getProgram(product, baselineProgramId) as
        | ProgramWithPriceComposition
        | undefined)
    : undefined;
  if (!baselineProgram) {
    issues.push(
      hardBlock(
        input,
        "price_components.baseline_program_missing",
        { selectedProgramId, baselineProgramId },
        "The explicitly selected baseline program does not exist in this catalog product.",
      ),
    );
  } else if (!standaloneSelfBaseline) {
    const baselineComposition = resolveProgramPriceComposition(
      product,
      baselineProgram,
    );
    if (
      !baselineComposition.ok ||
      baselineComposition.standalone ||
      baselineComposition.pricingFamilyId !== pricingFamilyId ||
      baselineComposition.baselineProgramId !== baselineProgram.id
    ) {
      issues.push(
        hardBlock(
          input,
          "price_components.baseline_family_mismatch",
          {
            selectedProgramId,
            baselineProgramId: baselineProgram.id,
            selectedPricingFamilyId: pricingFamilyId,
            baselinePricingFamilyId: baselineComposition.ok
              ? baselineComposition.pricingFamilyId
              : null,
            baselineResolution: baselineComposition.ok
              ? baselineComposition.metadataScope
              : baselineComposition.reason,
          },
          "The baseline must resolve through explicit program or product metadata to the same pricing family and identify itself as that family's baseline.",
        ),
      );
    }
  }

  const baseline = input.baseline;
  if (
    !baseline ||
    baseline.programId !== baselineProgramId ||
    !isMoney(baseline.catalogAmount) ||
    !isMoney(baseline.wholesaleAmount) ||
    !isMoney(baseline.customerAmount)
  ) {
    issues.push(
      hardBlock(
        input,
        "price_components.baseline_result_missing",
        {
          selectedProgramId,
          expectedBaselineProgramId: baselineProgramId,
          suppliedBaselineProgramId: baseline?.programId ?? null,
        },
        "The engine did not supply a complete authoritative lookup from the explicit baseline program.",
      ),
    );
  } else if (
    baseline.matchedWidth !== input.sourceResult.matchedWidth ||
    baseline.matchedHeight !== input.sourceResult.matchedHeight
  ) {
    issues.push(
      hardBlock(
        input,
        "price_components.baseline_cell_mismatch",
        {
          selectedMatchedWidth: input.sourceResult.matchedWidth,
          selectedMatchedHeight: input.sourceResult.matchedHeight,
          baselineMatchedWidth: baseline.matchedWidth,
          baselineMatchedHeight: baseline.matchedHeight,
        },
        "The base grid and selected fabric grid did not resolve to the same documented size cell.",
      ),
    );
  }
  const selectedComponentMatchedWidths =
    input.sourceResult.componentMatchedWidths;
  const baselineComponentMatchedWidths = baseline?.componentMatchedWidths;
  if (
    (selectedComponentMatchedWidths !== undefined ||
      baselineComponentMatchedWidths !== undefined) &&
    (!selectedComponentMatchedWidths ||
      !baselineComponentMatchedWidths ||
      selectedComponentMatchedWidths.length !==
        baselineComponentMatchedWidths.length ||
      selectedComponentMatchedWidths.some(
        (width, index) => width !== baselineComponentMatchedWidths[index],
      ))
  ) {
    issues.push(
      hardBlock(
        input,
        "price_components.baseline_component_cells_mismatch",
        {
          selectedComponentMatchedWidths:
            selectedComponentMatchedWidths ?? null,
          baselineComponentMatchedWidths:
            baselineComponentMatchedWidths ?? null,
        },
        "Every panel in a multi-panel base grid and selected fabric grid must resolve to the same ordered documented width cell.",
      ),
    );
  }
  if (!validSource(input.selectedProgramSource)) {
    issues.push(
      hardBlock(
        input,
        "price_components.provenance_missing",
        { componentId: "fabric_upgrade", selectedProgramId },
        "The selected program price has no immutable source provenance.",
      ),
    );
  }
  if (!validSource(baseline?.source)) {
    issues.push(
      hardBlock(
        input,
        "price_components.provenance_missing",
        { componentId: "base_grid", baselineProgramId },
        "The baseline grid price has no immutable source provenance.",
      ),
    );
  }
  if (
    !isMoney(input.sourceResult.base) ||
    !isMoney(input.retailResult.base) ||
    !isMoney(input.retailResult.wholesaleBase)
  ) {
    issues.push(
      hardBlock(
        input,
        "price_components.base_amount_missing",
        { selectedProgramId },
        "The selected grid must retain catalog, wholesale, and customer base amounts.",
      ),
    );
  }

  if (issues.length > 0 || !baseline || !validSource(baseline.source) || !validSource(input.selectedProgramSource)) {
    return { ok: false, issues };
  }

  const fabricCatalogAmount = roundMoney(
    input.sourceResult.base - baseline.catalogAmount,
  );
  const fabricWholesaleAmount = roundMoney(
    (input.retailResult.wholesaleBase as number) - baseline.wholesaleAmount,
  );
  const fabricCustomerAmount = roundMoney(
    input.retailResult.base - baseline.customerAmount,
  );
  if (
    fabricCatalogAmount < 0 ||
    fabricWholesaleAmount < 0 ||
    fabricCustomerAmount < 0
  ) {
    return {
      ok: false,
      issues: [
        hardBlock(
          input,
          "price_components.fabric_delta_negative",
          {
            selectedProgramId,
            baselineProgramId,
            catalogDelta: fabricCatalogAmount,
            wholesaleDelta: fabricWholesaleAmount,
            customerDelta: fabricCustomerAmount,
          },
          "The selected fabric grid is below its explicit baseline. The pricing-family metadata or source lookup is invalid.",
        ),
      ],
    };
  }
  const fabricHasAnyAmount =
    fabricCatalogAmount !== 0 ||
    fabricWholesaleAmount !== 0 ||
    fabricCustomerAmount !== 0;

  const components: AuthoritativePriceComponent[] = [
    {
      id: `base_grid:${baseline.programId}`,
      category: "base_grid",
      label: `Base grid — ${baselineProgram?.name ?? baseline.programId}`,
      status: "priced",
      basis: "grid_cell",
      selectionBindings: [
        { field: "baseline_program_id", value: baseline.programId },
        { field: "matched_width", value: baseline.matchedWidth },
        { field: "matched_height", value: baseline.matchedHeight },
        ...(baseline.componentMatchedWidths
          ? [
              {
                field: "component_matched_widths",
                value: baseline.componentMatchedWidths,
              },
            ]
          : []),
      ],
      source: baseline.source,
      catalogAmount: roundMoney(baseline.catalogAmount),
      wholesaleAmount: roundMoney(baseline.wholesaleAmount),
      customerAmount: roundMoney(baseline.customerAmount),
      units: input.retailResult.configurationUnits,
      billingScope: "per_window",
    },
    {
      id: `fabric_upgrade:${selectedProgram.id}`,
      category: "fabric_upgrade",
      label:
        standaloneSelfBaseline
          ? "Fabric upgrade — not applicable"
          : !fabricHasAnyAmount
          ? "Fabric upgrade — included"
          : `Fabric upgrade — ${selectedProgram.name}`,
      status: fabricHasAnyAmount ? "priced" : "included",
      basis: fabricHasAnyAmount ? "grid_delta" : "included",
      selectionBindings: [
        { field: "program_id", value: selectedProgram.id },
        {
          field: "fabric_collection",
          value: input.selection.configuration.fabric_collection ?? null,
        },
        {
          field: "fabric_color_code",
          value: input.selection.configuration.fabric_color_code ?? null,
        },
      ],
      source: input.selectedProgramSource,
      catalogAmount: fabricCatalogAmount,
      wholesaleAmount: fabricWholesaleAmount,
      customerAmount: fabricCustomerAmount,
      units: input.retailResult.configurationUnits,
      billingScope: "per_window",
    },
  ];

  const sourceLines = priceLineMap(
    input,
    input.sourceResult.surchargeLines,
    "source",
    issues,
  );
  const retailLines = priceLineMap(
    input,
    input.retailResult.surchargeLines,
    "retail",
    issues,
  );
  const sourceIds = [...sourceLines.keys()].sort();
  const retailIds = [...retailLines.keys()].sort();
  if (JSON.stringify(sourceIds) !== JSON.stringify(retailIds)) {
    issues.push(
      hardBlock(
        input,
        "price_components.price_line_set_mismatch",
        { sourcePriceLineIds: sourceIds, retailPriceLineIds: retailIds },
        "The source and converted retail results do not contain the same exact option-price identities.",
      ),
    );
  }

  const consumed = new Set<string>();
  const canonical = input.canonicalMotorization ?? [];
  const canonicalBaseMotors = canonical.filter(
    (selection) => selection.role === "base_motor",
  );
  if (canonicalBaseMotors.length > 1) {
    issues.push(
      hardBlock(
        input,
        "price_components.motor_base_duplicate",
        { baseMotorCount: canonicalBaseMotors.length },
        "Exactly one canonical base motor may represent the operating-system charge.",
      ),
    );
  }

  const operation = input.operatingSystem;
  if (!operation || operation.category !== "operating_system") {
    issues.push(
      hardBlock(
        input,
        "price_components.operating_coverage_missing",
        { liftSystem: input.selection.configuration.lift_system ?? null },
        "Every selected design requires one explicit operating-system component, including a documented $0 included system.",
      ),
    );
  } else {
    const baseMotor = canonicalBaseMotors[0];
    const baseMotorLineId = baseMotor
      ? `motor:${baseMotor.groupId}:${baseMotor.optionId}`
      : null;
    if (
      baseMotorLineId &&
      (operation.status !== "priced" ||
        operation.priceLineId !== baseMotorLineId)
    ) {
      issues.push(
        hardBlock(
          input,
          "price_components.motor_operating_mismatch",
          {
            expectedPriceLineId: baseMotorLineId,
            suppliedPriceLineId: operation.priceLineId ?? null,
          },
          "The canonical base motor must be the exact price line represented by the operating-system component.",
        ),
      );
    }
    const component = componentFromOption(
      input,
      operation,
      sourceLines,
      retailLines,
      consumed,
      issues,
      baseMotor?.role,
    );
    if (component) components.push(component);
  }

  for (const motor of canonical.filter((selection) => selection.role !== "base_motor")) {
    const priceLineId = `motor:${motor.groupId}:${motor.optionId}`;
    const sourceLine = sourceLines.get(priceLineId);
    const component = componentFromOption(
      input,
      {
        id: priceLineId,
        label: sourceLine?.label ?? `${motor.groupId} ${motor.optionId}`,
        category: "accessory",
        status: "priced",
        basis: "flat",
        selectionBindings: [
          {
            field: "motorization_selections",
            value: `${motor.groupId}/${motor.optionId}`,
          },
          { field: "motorization_role", value: motor.role },
        ],
        source: input.motorSources?.[priceLineId] ?? null,
        priceLineId,
        units: motor.units,
        billingScope: "per_window",
      },
      sourceLines,
      retailLines,
      consumed,
      issues,
      motor.role,
    );
    if (component) components.push(component);
  }

  for (const accessory of input.accessories) {
    if (accessory.category === "operating_system") {
      issues.push(
        hardBlock(
          input,
          "price_components.accessory_category_invalid",
          { componentId: accessory.id },
          "The accessory list may contain only accessory or order-charge components.",
        ),
      );
      continue;
    }
    const component = componentFromOption(
      input,
      accessory,
      sourceLines,
      retailLines,
      consumed,
      issues,
    );
    if (component) components.push(component);
  }

  if (!components.some((component) => component.category === "accessory")) {
    issues.push(
      hardBlock(
        input,
        "price_components.accessory_coverage_missing",
        { productId: input.selection.productId },
        "Accessory pricing must be explicit. Supply priced selections or a source-backed $0 'none selected' component.",
      ),
    );
  }

  for (const priceLineId of new Set([...sourceIds, ...retailIds])) {
    if (consumed.has(priceLineId)) continue;
    issues.push(
      hardBlock(
        input,
        "price_components.price_line_unclassified",
        { priceLineId },
        `Catalog price line '${priceLineId}' is not represented as an accessory, operating-system, or order-charge component.`,
      ),
    );
  }

  const ids = new Set<string>();
  for (const component of components) {
    if (ids.has(component.id)) {
      issues.push(
        hardBlock(
          input,
          "price_components.component_duplicate",
          { componentId: component.id },
          "Every authoritative component must have one unique ledger identity.",
        ),
      );
    }
    ids.add(component.id);
    if (!validSource(component.source)) {
      issues.push(
        hardBlock(
          input,
          "price_components.provenance_missing",
          { componentId: component.id },
          `Price component '${component.label}' has no immutable source provenance.`,
        ),
      );
    }
  }

  const totals = componentTotals(components);
  const expectedCatalogPerWindow = roundMoney(
    input.sourceResult.unitPrice + input.sourceResult.discountAmount,
  );
  const expectedCustomerPerWindow = roundMoney(
    input.retailResult.unitPrice + input.retailResult.discountAmount,
  );
  const expectedWholesalePerWindow = input.retailResult.wholesaleUnitPrice;
  const expectedWholesaleOncePerLine = expectedWholesaleOnce(
    input.retailResult,
  );

  if (!sameMoney(totals.catalogPerWindow, expectedCatalogPerWindow)) {
    issues.push(
      hardBlock(
        input,
        "price_components.catalog_sum_mismatch",
        {
          componentTotal: totals.catalogPerWindow,
          authoritativeTotal: expectedCatalogPerWindow,
        },
        "Catalog component amounts do not add to the authoritative source-book price before discount.",
      ),
    );
  }
  if (
    expectedWholesalePerWindow == null ||
    !sameMoney(totals.wholesalePerWindow, expectedWholesalePerWindow)
  ) {
    issues.push(
      hardBlock(
        input,
        "price_components.wholesale_sum_mismatch",
        {
          componentTotal: totals.wholesalePerWindow,
          authoritativeTotal: expectedWholesalePerWindow,
        },
        "Wholesale component amounts do not add to the authoritative product cost before freight.",
      ),
    );
  }
  if (!sameMoney(totals.customerPerWindow, expectedCustomerPerWindow)) {
    issues.push(
      hardBlock(
        input,
        "price_components.customer_sum_mismatch",
        {
          componentTotal: totals.customerPerWindow,
          authoritativeTotal: expectedCustomerPerWindow,
        },
        "Customer component amounts do not add to the authoritative unit price before discount.",
      ),
    );
  }
  if (
    !sameMoney(totals.catalogOncePerLine, input.sourceResult.onceTotal) ||
    !sameMoney(totals.customerOncePerLine, input.retailResult.onceTotal) ||
    expectedWholesaleOncePerLine == null ||
    !sameMoney(totals.wholesaleOncePerLine, expectedWholesaleOncePerLine)
  ) {
    issues.push(
      hardBlock(
        input,
        "price_components.once_sum_mismatch",
        {
          catalogComponentTotal: totals.catalogOncePerLine,
          catalogAuthoritativeTotal: input.sourceResult.onceTotal,
          wholesaleComponentTotal: totals.wholesaleOncePerLine,
          wholesaleAuthoritativeTotal: expectedWholesaleOncePerLine,
          customerComponentTotal: totals.customerOncePerLine,
          customerAuthoritativeTotal: input.retailResult.onceTotal,
        },
        "Once-per-line components do not reconcile to the authoritative source, wholesale, and customer totals.",
      ),
    );
  }

  if (issues.length > 0) return { ok: false, issues };
  return {
    ok: true,
    components: Object.freeze(components.map((component) => Object.freeze(component))),
    totals: Object.freeze(totals),
  };
}
