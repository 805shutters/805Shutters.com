import {
  catalog,
  findProductSurcharge,
  getProduct,
  getProgram,
} from "@/lib/quote/catalog";
import type { CatalogProduct, CatalogProgram } from "@/lib/quote/catalog/types";
import {
  priceDesign,
  type PriceBreakdown,
  type PriceFailure,
  type PriceInput,
  type PriceLine,
  type PriceResult,
  type SurchargeSelection,
} from "@/lib/quote/pricing";
import { deriveAutomaticSurcharges } from "@/lib/quote/automatic-surcharges";
import {
  createSelectionFingerprint,
  hasHardBlock,
  isProductRuleStatusSendable,
  type ProductRuleStatus,
  type SelectionContext,
  type ValidationIssue,
} from "./core";
import {
  NORMAN_805_DEALER_POLICY,
  normanDealerScheduleForSelection,
} from "./norman-dealer-policy";
import { productRuleStatusForSelection, validateSelection } from "./rules";
import { sourceProvenance, type SourceManifestId } from "./source-manifest";
import { rollerMotorChargeForPowerConfiguration } from "./roller-motor";
import {
  canonicalMotorizationPriceSelections,
  canonicalMotorizationSelectionsFromConfiguration,
} from "./roller-motor-contract";
import { rollerComponentOrderWidthsForPricing } from "./roller-matrix";
import {
  buildAuthoritativePriceComponents,
  type AuthoritativePriceComponent,
  type AuthoritativePriceComponentTotals,
  type PriceComponentBaseline,
  type PriceComponentBasis,
  type PriceComponentOptionInput,
} from "./price-components";

export type QuoteV2ValidationStatus = "valid" | "blocked";

export type QuoteV2InternalProductCost = {
  basis: "catalog_factor" | "dealer_net";
  effectiveDealerFactor?: number;
  dealerPolicyId?: string;
  dealerPolicyFixtureId?: string;
  productCostUnit: number;
  productCostTotal: number;
  freightAllocated: number;
  oversizeAllocated: number;
  processingFeeAllocated: number;
  landedCostTotal: number;
  freightStatus: "published" | "estimated" | "unresolved" | "not_applicable";
};

export type QuoteV2DealerPolicySnapshot = Readonly<{
  policyId: string;
  fixtureId: string;
  effectiveDealerFactor: number;
  /** Deterministic signature of every current cost-policy term. */
  revision: string;
}>;

export type QuoteV2ResultMetadata = {
  catalogVersion: string;
  catalogAsOf: string;
  selectionFingerprint: string;
  productStatus: ProductRuleStatus;
  validationStatus: QuoteV2ValidationStatus;
  validationIssues: readonly ValidationIssue[];
  pricedSelectionFingerprint: string | null;
  pricedCatalogVersion: string | null;
  internalCost?: QuoteV2InternalProductCost;
};

export type QuoteV2PriceSuccess = PriceBreakdown &
  QuoteV2ResultMetadata & {
    components: readonly AuthoritativePriceComponent[];
    componentTotals: AuthoritativePriceComponentTotals;
  };
export type QuoteV2PriceFailure = PriceFailure & QuoteV2ResultMetadata;
export type QuoteV2PriceResult = QuoteV2PriceSuccess | QuoteV2PriceFailure;

export type QuoteV2PriceRequest = {
  selection: SelectionContext;
  priceInput: PriceInput;
  includeInternalCost?: boolean;
  /** Quote-wide rules already evaluated against exactly one selected design per line. */
  additionalValidationIssues?: readonly ValidationIssue[];
};

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function moneyCents(value: number): number {
  return Math.round(value * 100);
}

function moneyFromCents(value: number): number {
  return Math.round(value) / 100;
}

function multiplyMoney(value: number, multiplier: number): number {
  return moneyFromCents(Math.round(moneyCents(value) * multiplier));
}

function sumMoney(values: readonly number[]): number {
  return moneyFromCents(
    values.reduce((total, value) => total + moneyCents(value), 0),
  );
}

function currentNormanDealerPolicyRevision(
  effectiveDealerFactor: number,
): string {
  return JSON.stringify({
    policyId: NORMAN_805_DEALER_POLICY.id,
    verifiedOn: NORMAN_805_DEALER_POLICY.verifiedOn,
    fixtureId: NORMAN_805_DEALER_POLICY.runtimeVerification.fixtureId,
    effectiveDealerFactor,
    freight: NORMAN_805_DEALER_POLICY.freight,
    processingFee: NORMAN_805_DEALER_POLICY.processingFee,
  });
}

export function dealerPolicySnapshotFromPriceResult(
  result: QuoteV2PriceResult,
): QuoteV2DealerPolicySnapshot | null {
  if (!result.ok || !result.internalCost) return null;
  const { dealerPolicyId, dealerPolicyFixtureId, effectiveDealerFactor } =
    result.internalCost;
  if (
    !dealerPolicyId ||
    !dealerPolicyFixtureId ||
    typeof effectiveDealerFactor !== "number" ||
    !Number.isFinite(effectiveDealerFactor)
  ) {
    return null;
  }
  return Object.freeze({
    policyId: dealerPolicyId,
    fixtureId: dealerPolicyFixtureId,
    effectiveDealerFactor,
    revision: currentNormanDealerPolicyRevision(effectiveDealerFactor),
  });
}

/**
 * Allocate one portal-rounded group back to its source lines without losing a
 * penny. Each exact fractional-cent share is floored first; remaining cents go
 * to the largest fractional remainders, with original source order as the
 * stable tie-breaker. The output order always matches the input order.
 */
function allocateRoundedMoneyGroup(
  sourceAmounts: readonly number[],
  multiplier: number,
): number[] {
  if (sourceAmounts.length === 0) return [];
  const scale = 1_000_000;
  const scaledMultiplier = Math.round(multiplier * scale);
  const exactNumerators = sourceAmounts.map(
    (amount) => moneyCents(amount) * scaledMultiplier,
  );
  const allocatedCents = exactNumerators.map((numerator) =>
    Math.floor(numerator / scale),
  );
  const targetCents = Math.round(
    exactNumerators.reduce((total, numerator) => total + numerator, 0) /
      scale,
  );
  let centsRemaining =
    targetCents -
    allocatedCents.reduce((total, amount) => total + amount, 0);
  const priority = exactNumerators
    .map((numerator, index) => ({
      index,
      remainder: numerator % scale,
    }))
    .sort(
      (left, right) =>
        right.remainder - left.remainder || left.index - right.index,
    );
  for (let index = 0; index < centsRemaining; index += 1) {
    allocatedCents[priority[index].index] += 1;
  }
  return allocatedCents.map(moneyFromCents);
}

function catalogLinesWithPortalGroupedRounding(
  lines: readonly PriceLine[],
  product: CatalogProduct,
  effectiveDealerFactor: number,
): PriceLine[] {
  if (lines.length === 0) return [];
  const wholesaleAmounts = Array<number>(lines.length).fill(0);
  const indexesByFactor = new Map<number, number[]>();
  lines.forEach((line, index) => {
    // Published freight and other explicitly factored charges retain their
    // documented factor. Product options and motorization inherit the current
    // account schedule selected through the existing interface.
    const factor =
      findProductSurcharge(product, line.id)?.dealerFactor ??
      effectiveDealerFactor;
    const indexes = indexesByFactor.get(factor) ?? [];
    indexes.push(index);
    indexesByFactor.set(factor, indexes);
  });
  for (const [factor, indexes] of indexesByFactor) {
    const allocation = allocateRoundedMoneyGroup(
      indexes.map((index) => lines[index].amount),
      factor,
    );
    indexes.forEach((lineIndex, allocationIndex) => {
      wholesaleAmounts[lineIndex] = allocation[allocationIndex];
    });
  }

  return lines.map((line, index) => ({
    ...line,
    wholesaleAmount: wholesaleAmounts[index],
  }));
}

function metadata(
  selection: SelectionContext,
  productStatus: ProductRuleStatus,
  issues: readonly ValidationIssue[],
  priced: boolean,
): QuoteV2ResultMetadata {
  const fingerprint = createSelectionFingerprint(selection);
  return {
    catalogVersion: selection.catalogVersion,
    catalogAsOf: selection.catalogAsOf,
    selectionFingerprint: fingerprint,
    productStatus,
    validationStatus:
      hasHardBlock(issues) || !isProductRuleStatusSendable(productStatus) ? "blocked" : "valid",
    validationIssues: issues,
    pricedSelectionFingerprint: priced ? fingerprint : null,
    pricedCatalogVersion: priced ? selection.catalogVersion : null,
  };
}

function validationFailure(
  selection: SelectionContext,
  productStatus: ProductRuleStatus,
  issues: readonly ValidationIssue[],
): QuoteV2PriceFailure {
  const firstBlock = issues.find((entry) => entry.severity === "hard_block");
  const statusMessage = !isProductRuleStatusSendable(productStatus)
    ? `Product status '${productStatus}' is not customer-sendable.`
    : null;
  return {
    ok: false,
    code:
      productStatus === "unavailable"
        ? "PRODUCT_UNAVAILABLE"
        : productStatus === "manual_quote_required"
          ? "MANUAL_PRICE_REQUIRED"
          : "CONFIGURATION_INCOMPLETE",
    error:
      firstBlock?.explanation ??
      statusMessage ??
      "This configuration is incomplete or unsupported by the authoritative source.",
    warnings: issues.filter((entry) => entry.severity === "warning").map((entry) => entry.explanation),
    ...metadata(selection, productStatus, issues, false),
  };
}

function contractSourceId(productId: string): SourceManifestId {
  if (productId.startsWith("lotus_")) return "lotus-west-a26-v1";
  if (productId.startsWith("polar_")) {
    return "polar-shades-dealer-book-current-2026-07-18";
  }
  if (productId === "onyx_shutters") return "onyx-reference-guide-2020-2021";
  return "norman-retail-guide-2026-07";
}

type ContractSurchargeSelection = {
  id: string;
  units: number;
};

function positiveWholeUnits(value: unknown): number | null {
  const units = value == null ? 1 : Number(value);
  return Number.isInteger(units) && units > 0 ? units : null;
}

function normalizedAutomaticDetail(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  // The existing Roller interface stores the visible label `Smart Release`,
  // while the source catalog uses the canonical key `smartrelease`. Treat the
  // two spellings as the same configuration so the required operating charge
  // is derived by the backend instead of relying on a manual surcharge.
  return normalized === "smart_release" ? "smartrelease" : normalized;
}

type CanonicalRollerValance =
  | "square_fascia"
  | "plain_curved_fascia"
  | "curved_fascia_with_fabric"
  | "fabric_valance_3_1_2"
  | "fabric_valance_4_1_2"
  | "fabric_valance_6"
  | "fabric_valance_8"
  | "modern_wood_valance_4_1_2"
  | "cassette"
  | "none";

function canonicalRollerValance(value: unknown): CanonicalRollerValance | null {
  const normalized = normalizedAutomaticDetail(value);
  if (typeof normalized !== "string" || !normalized) return null;
  switch (normalized) {
    case "square_fascia":
      return "square_fascia";
    case "curved_fascia":
    case "plain_curved_fascia":
      return "plain_curved_fascia";
    case "curved_fascia_with_fabric":
      return "curved_fascia_with_fabric";
    case "fabric_valance":
    case "3_1_2_fabric_valance":
    case "fabric_valance_3_1_2":
      return "fabric_valance_3_1_2";
    case "4_1_2_fabric_valance":
    case "fabric_valance_4_1_2":
      return "fabric_valance_4_1_2";
    case "6_fabric_valance":
    case "fabric_valance_6":
      return "fabric_valance_6";
    case "8_fabric_valance":
    case "fabric_valance_8":
      return "fabric_valance_8";
    case "wood_valance":
    case "4_1_2_modern_wood_valance":
    case "modern_wood_valance_4_1_2":
      return "modern_wood_valance_4_1_2";
    case "cassette":
      return "cassette";
    case "none":
    case "no_valance":
    case "no_top_treatment":
    case "lightguard_360_housing":
      return "none";
    default:
      return null;
  }
}

function reconciledRollerValance(
  topTreatmentValue: unknown,
  valanceValue: unknown,
): CanonicalRollerValance | null {
  const topTreatment = normalizedAutomaticDetail(topTreatmentValue);
  const selectedValance = canonicalRollerValance(valanceValue);
  if (typeof topTreatment !== "string" || !topTreatment) {
    return selectedValance;
  }

  // The top-treatment class governs which exact dependent options remain
  // valid. Preserve a compatible exact subtype; replace a stale incompatible
  // value with the documented default for the newly selected class.
  switch (topTreatment) {
    case "no_top_treatment":
    case "lightguard_360_housing":
      return "none";
    case "square_fascia":
      return "square_fascia";
    case "curved_fascia":
      return selectedValance === "plain_curved_fascia" ||
        selectedValance === "curved_fascia_with_fabric"
        ? selectedValance
        : "plain_curved_fascia";
    case "fabric_valance":
      return selectedValance === "fabric_valance_3_1_2" ||
        selectedValance === "fabric_valance_4_1_2" ||
        selectedValance === "fabric_valance_6" ||
        selectedValance === "fabric_valance_8"
        ? selectedValance
        : "fabric_valance_3_1_2";
    case "wood_valance":
      return selectedValance === "modern_wood_valance_4_1_2"
        ? selectedValance
        : "modern_wood_valance_4_1_2";
    case "cassette":
      return "cassette";
    default:
      return canonicalRollerValance(topTreatment) ?? selectedValance;
  }
}

/**
 * Derive every configuration-implied surcharge from the same immutable V2
 * selection the rule engine validates. UI adapters may not omit or invent
 * these charges in a separate price payload.
 */
export function authoritativeAutomaticSurchargeSelections(
  selection: SelectionContext,
): SurchargeSelection[] {
  const details: Record<string, unknown> = Object.fromEntries(
    Object.entries(selection.configuration).map(([key, value]) => [
      key,
      normalizedAutomaticDetail(value),
    ]),
  );

  if (selection.productId === "roller") {
    const application = String(
      details.roller_application ?? details.shade_type ?? "",
    );
    const componentCount =
      details.roller_coupling_count ??
      details.coupled_shade_count ??
      details.lightguard_360_shade_count;
    if (application === "dual_roller" || application === "dual_rollers") {
      details.shade_type = "dual_rollers";
    } else if (
      application === "coupled_shades" ||
      application === "independently_operated_coupled_shades"
    ) {
      details.shade_type = "coupled_shades";
      details.coupled_shade_count = componentCount;
    } else if (application === "lightguard_360_with_t_post") {
      details.shade_type = "lightguard_360_with_t_post";
      details.lightguard_360_shade_count = componentCount;
    } else if (application === "lightguard_360") {
      details.light_guard = "lightguard_360";
    }

    if (details.light_guard_rails === "yes" && !details.light_guard) {
      details.light_guard = "basic_light_guard";
    }
    if (details.premium_hardware === "yes") {
      details.hardware_type = "premium";
    }

    const valance = reconciledRollerValance(
      details.roller_top_treatment ?? details.top_treatment_class,
      details.valance,
    );
    if (valance) details.valance = valance;
  }

  return deriveAutomaticSurcharges(selection.productId, details).map(
    (entry) => ({ id: entry.id, units: entry.units ?? 1 }),
  );
}

function surchargeContractIssues(
  selection: SelectionContext,
  input: PriceInput,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const source = sourceProvenance(contractSourceId(selection.productId));
  const product = getProduct(selection.productId);
  const automatic = authoritativeAutomaticSurchargeSelections(selection).map(
    (entry) => ({ id: entry.id, units: positiveWholeUnits(entry.units) ?? 1 }),
  );
  const automaticIds = new Set(automatic.map((entry) => entry.id));
  const actual: ContractSurchargeSelection[] = [];
  const actualIds = new Set<string>();
  const rawActual = input.surcharges as unknown;

  if (rawActual != null && !Array.isArray(rawActual)) {
    issues.push({
      severity: "hard_block",
      ruleId: "engine.surcharge.price_input_invalid",
      source,
      selectedValues: { surcharges: String(rawActual) },
      explanation:
        "The authoritative surcharge price input must be an array of exact catalog IDs and positive whole-number units.",
    });
  } else {
    for (const [index, entry] of (rawActual ?? []).entries()) {
      const id =
        entry && typeof entry === "object" && typeof entry.id === "string"
          ? entry.id.trim()
          : "";
      const units =
        entry && typeof entry === "object"
          ? positiveWholeUnits(entry.units)
          : null;
      if (!id || units === null) {
        issues.push({
          severity: "hard_block",
          ruleId: "engine.surcharge.price_input_invalid",
          source,
          selectedValues: {
            surchargeIndex: index,
            surchargeId: id || null,
            units:
              entry && typeof entry === "object"
                ? String(entry.units ?? 1)
                : null,
          },
          explanation:
            "Every priced surcharge must use one exact catalog ID and a positive whole-number unit count.",
        });
        continue;
      }
      if (actualIds.has(id)) {
        issues.push({
          severity: "hard_block",
          ruleId: "engine.surcharge.duplicate",
          source,
          selectedValues: { surchargeId: id },
          explanation:
            `Surcharge '${id}' was supplied more than once. V2 requires one canonical charge with its complete unit count.`,
        });
      }
      actualIds.add(id);
      actual.push({ id, units });
      if (product && !findProductSurcharge(product, id)) {
        issues.push({
          severity: "hard_block",
          ruleId: "engine.surcharge.unsupported",
          source,
          selectedValues: { surchargeId: id, units },
          explanation:
            `Surcharge '${id}' is not a supported, source-priced option for ${product.name}. It cannot be silently omitted from a V2 quote.`,
        });
      }
    }
  }

  const rawSelected = selection.options.surcharges;
  if (rawSelected != null && !Array.isArray(rawSelected)) {
    issues.push({
      severity: "hard_block",
      ruleId: "engine.surcharge.selection_invalid",
      source,
      selectedValues: { surcharges: String(rawSelected) },
      explanation:
        "The selected V2 surcharges are malformed and cannot be authoritatively priced.",
    });
    return issues;
  }

  const selected: ContractSurchargeSelection[] = [];
  const selectedIds = new Set<string>();
  for (const [index, entry] of (rawSelected ?? []).entries()) {
    const id =
      entry && typeof entry === "object" && !Array.isArray(entry) &&
      typeof entry.id === "string"
        ? entry.id.trim()
        : "";
    const rawUnits =
      entry && typeof entry === "object" && !Array.isArray(entry)
        ? entry.units ?? entry.quantity
        : null;
    const units = positiveWholeUnits(rawUnits);
    if (!id || units === null) {
      issues.push({
        severity: "hard_block",
        ruleId: "engine.surcharge.selection_invalid",
        source,
        selectedValues: {
          surchargeIndex: index,
          surchargeId: id || null,
          units: rawUnits == null ? null : String(rawUnits),
        },
        explanation:
          "Every selected V2 surcharge must use one exact catalog ID and a positive whole-number quantity.",
      });
      continue;
    }
    if (selectedIds.has(id)) {
      issues.push({
        severity: "hard_block",
        ruleId: "engine.surcharge.duplicate",
        source,
        selectedValues: { surchargeId: id },
        explanation:
          `Surcharge '${id}' is selected more than once. V2 cannot merge duplicate option charges implicitly.`,
      });
    }
    selectedIds.add(id);
    selected.push({ id, units });
    if (automaticIds.has(id)) {
      issues.push({
        severity: "hard_block",
        ruleId: "engine.surcharge.automatic_manual_collision",
        source,
        selectedValues: { surchargeId: id, units },
        explanation:
          `Surcharge '${id}' is already required by the selected configuration and cannot also be entered manually.`,
      });
    }
    if (product && !findProductSurcharge(product, id)) {
      issues.push({
        severity: "hard_block",
        ruleId: "engine.surcharge.unsupported",
        source,
        selectedValues: { surchargeId: id, units },
        explanation:
          `Selected surcharge '${id}' is not supported by the source-priced ${product.name} catalog.`,
      });
    }
  }

  const normalized = (entries: readonly ContractSurchargeSelection[]) =>
    [...entries].sort((left, right) =>
      `${left.id}/${left.units}`.localeCompare(`${right.id}/${right.units}`),
    );
  const expected = normalized([
    ...automatic,
    ...selected.filter((entry) => !automaticIds.has(entry.id)),
  ]);
  const priced = normalized(actual);
  if (JSON.stringify(expected) !== JSON.stringify(priced)) {
    issues.push({
      severity: "hard_block",
      ruleId: "engine.surcharge.selection_price_input_mismatch",
      source,
      selectedValues: {
        expectedSurcharges: expected.map(
          (entry) => `${entry.id} x ${entry.units}`,
        ),
        pricedSurcharges: priced.map(
          (entry) => `${entry.id} x ${entry.units}`,
        ),
      },
      explanation:
        "The authoritative price input does not exactly match the configuration-derived and explicitly selected V2 surcharges.",
    });
  }

  return issues;
}

function priceInputContractIssues(
  selection: SelectionContext,
  input: PriceInput,
): ValidationIssue[] {
  const surchargeIssues = surchargeContractIssues(selection, input);
  const inputQuantity = Math.max(1, Math.floor(Number(input.quantity) || 1));
  const mismatches: Record<string, string | number | null> = {};
  if (input.productId !== selection.productId) {
    mismatches.productId = `${selection.productId} != ${input.productId}`;
  }
  if ((input.programId ?? null) !== selection.programId) {
    mismatches.programId = `${selection.programId ?? "null"} != ${input.programId ?? "null"}`;
  }
  if (input.widthInches !== selection.widthInches) {
    mismatches.widthInches = `${selection.widthInches} != ${input.widthInches}`;
  }
  if (input.heightInches !== selection.heightInches) {
    mismatches.heightInches = `${selection.heightInches} != ${input.heightInches}`;
  }
  if (selection.productId === "roller") {
    const expectedComponentWidths =
      rollerComponentOrderWidthsForPricing(selection) ?? [];
    const actualComponentWidths = Array.isArray(input.componentWidthsInches)
      ? input.componentWidthsInches.map(Number)
      : [];
    if (
      JSON.stringify(actualComponentWidths) !==
      JSON.stringify(expectedComponentWidths)
    ) {
      mismatches.componentWidthsInches = `expected [${expectedComponentWidths.join(
        ", ",
      )}], got [${actualComponentWidths.join(", ")}]`;
    }
  }
  if (inputQuantity !== selection.quantity) {
    mismatches.quantity = `${selection.quantity} != ${inputQuantity}`;
  }
  const canonicalRollerMotorization =
    selection.productId === "roller"
      ? canonicalMotorizationSelectionsFromConfiguration(
          selection.configuration,
        )
      : null;
  if (selection.productId === "roller" && canonicalRollerMotorization) {
    const normalizedSelections = (
      entries: readonly {
        groupId: string;
        optionId: string;
        units?: number;
      }[],
    ) =>
      entries
        .map((entry) => ({
          groupId: entry.groupId,
          optionId: entry.optionId,
          units: Number(entry.units ?? 1),
        }))
        .sort((left, right) =>
          `${left.groupId}/${left.optionId}`.localeCompare(
            `${right.groupId}/${right.optionId}`,
          ),
        );
    const expectedMotorization = normalizedSelections(
      canonicalMotorizationPriceSelections(
        canonicalRollerMotorization.selections,
      ),
    );
    const actualMotorization = normalizedSelections(input.motorization ?? []);
    if (
      JSON.stringify(actualMotorization) !==
      JSON.stringify(expectedMotorization)
    ) {
      mismatches.motorization = `expected canonical ${expectedMotorization
        .map(
          (entry) =>
            `${entry.groupId}/${entry.optionId} x ${entry.units}`,
        )
        .join(", ") || "none"}`;
    }
  } else if (
    selection.productId === "roller" &&
    String(selection.configuration.lift_system ?? "")
      .toLowerCase()
      .includes("motor")
  ) {
    const expectedCharge = rollerMotorChargeForPowerConfiguration(
      selection.configuration.roller_power_configuration,
    );
    const baseMotorOptionIds = new Set([
      "motor_rechargeable_battery_pack",
      "low_voltage_dc_motor",
      "motor",
      "autowand",
    ]);
    const chargedMotors = (input.motorization ?? []).filter((entry) =>
      baseMotorOptionIds.has(entry.optionId),
    );
    if (
      !expectedCharge ||
      chargedMotors.length !== 1 ||
      chargedMotors[0].groupId !== expectedCharge.groupId ||
      chargedMotors[0].optionId !== expectedCharge.optionId
    ) {
      mismatches.motorization = expectedCharge
        ? `expected ${expectedCharge.groupId}/${expectedCharge.optionId}`
        : "unsupported power configuration";
    }
  }
  if (Object.keys(mismatches).length === 0) return surchargeIssues;
  return [
    ...surchargeIssues,
    {
      severity: "hard_block",
      ruleId: "engine.selection_price_input.mismatch",
      source: sourceProvenance(contractSourceId(selection.productId)),
      selectedValues: mismatches,
      explanation:
        "The validated selection and price lookup inputs do not describe the same exact product, program, dimensions, and quantity.",
    },
  ];
}

function selectedNormanDealerFactor(
  selection: SelectionContext,
  product: CatalogProduct,
): number | null {
  if (product.manufacturer?.trim().toLowerCase() !== "norman") return null;
  return (
    normanDealerScheduleForSelection(
      selection.options.schedule_discount_percent,
    )?.effectivePortalFactor ?? null
  );
}

/**
 * Preserve authoritative source MSRP/list dollars while deriving protected
 * dealer cost with the selected manufacturer/account schedule.
 */
function catalogCostRetail(
  source: PriceBreakdown,
  selection: SelectionContext,
): PriceResult {
  const product = getProduct(source.productId);
  if (
    !product ||
    source.wholesaleBase == null ||
    source.wholesaleUnitPrice == null ||
    source.wholesaleTotal == null ||
    source.surchargeLines.some((line) => line.wholesaleAmount == null)
  ) {
    return {
      ok: false,
      code: "CUSTOMER_RETAIL_UNDEFINED",
      error:
        "The selected product or option is missing eligible dealer-cost evidence. V2 will not calculate customer retail from an incomplete cost.",
      warnings: source.warnings,
    };
  }

  const normanDealerFactor = selectedNormanDealerFactor(selection, product);
  const onceLineIds = new Set(
    source.surchargeLines
      .filter(
        (line) => findProductSurcharge(product, line.id)?.per === "once",
      )
      .map((line) => line.id),
  );
  const sourcePerWindowLines = source.surchargeLines.filter(
    (line) => !onceLineIds.has(line.id),
  );
  const sourceOnceLines = source.surchargeLines.filter((line) =>
    onceLineIds.has(line.id),
  );
  const convertedBySourceLine = new Map<PriceLine, PriceLine>();
  const convertLines = (lines: readonly PriceLine[]): PriceLine[] => {
    const converted =
      normanDealerFactor == null
        ? lines.map((line) => ({
            ...line,
            wholesaleAmount: line.wholesaleAmount ?? 0,
          }))
        : catalogLinesWithPortalGroupedRounding(
            lines,
            product,
            normanDealerFactor,
          );
    lines.forEach((line, index) => {
      convertedBySourceLine.set(line, converted[index]);
    });
    return converted;
  };
  const perWindowLines = convertLines(sourcePerWindowLines);
  const onceLines = convertLines(sourceOnceLines);
  const surchargeLines = source.surchargeLines.map(
    (line) => convertedBySourceLine.get(line) as PriceLine,
  );

  // Norman portal parity has two merchandise rounding groups: one selected
  // grid and one sum of all per-window option charges. The latter is allocated
  // back to source lines above so the itemized ledger retains provenance while
  // summing to the exact portal subtotal.
  const productCostBase =
    normanDealerFactor == null
      ? source.wholesaleBase
      : multiplyMoney(source.base, normanDealerFactor);
  const productCostUnit = sumMoney([
    productCostBase,
    ...perWindowLines.map((line) => line.wholesaleAmount ?? 0),
  ]);
  const productCostOnce = sumMoney(
    onceLines.map((line) => line.wholesaleAmount ?? 0),
  );
  const productCostTotal = moneyFromCents(
    moneyCents(productCostUnit) * source.quantity +
      moneyCents(productCostOnce),
  );
  return {
    ...source,
    wholesaleBase: productCostBase,
    surchargeLines,
    wholesaleUnitPrice: productCostUnit,
    wholesaleTotal: productCostTotal,
    warnings: [
      ...source.warnings,
      "Customer retail uses the authoritative manufacturer suggested-retail/list amounts.",
    ],
  };
}

type ProgramPriceComposition = {
  familyId: string | null;
  baselineProgramId: string | null;
  standalone: boolean;
};

function programPriceComposition(
  product: CatalogProduct,
  program: CatalogProgram,
): ProgramPriceComposition {
  const directFamily = program.pricingFamilyId?.trim() || null;
  const directBaseline = program.baselineProgramId?.trim() || null;
  if (directFamily || directBaseline) {
    return {
      familyId: directFamily,
      baselineProgramId: directBaseline,
      standalone: false,
    };
  }

  const families = (product.pricingFamilies ?? []).filter((family) =>
    family.memberProgramIds.includes(program.id),
  );
  if (families.length === 1) {
    return {
      familyId: families[0].id,
      baselineProgramId: families[0].baselineProgramId,
      standalone: false,
    };
  }

  // A source program with no price-group identity is one complete construction
  // grid, not an inferred fabric family. Its selected grid is therefore the
  // explicit base and its fabric-upgrade row is $0/not applicable.
  if (families.length === 0 && program.priceGroup == null) {
    return {
      familyId: null,
      baselineProgramId: program.id,
      standalone: true,
    };
  }
  return { familyId: null, baselineProgramId: null, standalone: false };
}

function priceComponentSource(
  product: CatalogProduct,
  program?: CatalogProgram,
) {
  const pages = program?.sourcePages?.length
    ? program.sourcePages
    : product.pages;
  return sourceProvenance(
    contractSourceId(product.id),
    pages.length > 0 ? { pages } : {},
  );
}

function motorPriceComponentSource(priceLineId: string) {
  const [, groupId, optionId] = priceLineId.split(":");
  const group = groupId ? catalog.motorization[groupId] : undefined;
  const option = group?.options.find((entry) => entry.id === optionId);
  const pages = option?.sourcePages?.length
    ? option.sourcePages
    : group?.sourcePages;
  return sourceProvenance(
    "norman-retail-guide-2026-07",
    pages?.length ? { pages } : {},
  );
}

function normalizedComponentIdentity(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function priceComponentBasis(
  product: CatalogProduct,
  priceLineId: string,
  kind: "percent" | "flat",
): Exclude<PriceComponentBasis, "grid_cell" | "grid_delta"> {
  const surcharge = findProductSurcharge(product, priceLineId);
  if (surcharge?.widthGraduated) return "width_ladder";
  if (surcharge?.heightGraduated) return "height_ladder";
  return kind === "percent" ? "percent" : "flat";
}

function baselinePriceComponent(
  selection: SelectionContext,
  priceInput: PriceInput,
  product: CatalogProduct,
  selectedProgram: CatalogProgram,
  sourceResult: PriceBreakdown,
  retailResult: PriceBreakdown,
): PriceComponentBaseline | null {
  const composition = programPriceComposition(product, selectedProgram);
  const baselineProgramId = composition.baselineProgramId;
  if (!baselineProgramId) return null;
  const baselineProgram = getProgram(product, baselineProgramId);
  if (!baselineProgram) return null;
  const source = priceComponentSource(product, baselineProgram);

  if (baselineProgramId === selectedProgram.id) {
    if (
      sourceResult.wholesaleBase == null ||
      retailResult.wholesaleBase == null
    ) {
      return null;
    }
    return {
      programId: baselineProgramId,
      matchedWidth: sourceResult.matchedWidth,
      matchedHeight: sourceResult.matchedHeight,
      ...(sourceResult.componentMatchedWidths
        ? { componentMatchedWidths: sourceResult.componentMatchedWidths }
        : {}),
      catalogAmount: sourceResult.base,
      wholesaleAmount: retailResult.wholesaleBase,
      customerAmount: retailResult.base,
      source,
    };
  }

  if ((baselineProgram.priceBasis ?? product.priceBasis) === "dealer_net") {
    return null;
  }

  const baselineSourceResult = priceDesign({
    ...priceInput,
    programId: baselineProgramId,
  });
  if (!baselineSourceResult.ok) return null;
  const baselineRetailResult = catalogCostRetail(
    baselineSourceResult,
    selection,
  );
  if (
    !baselineRetailResult.ok ||
    baselineRetailResult.wholesaleBase == null
  ) {
    return null;
  }
  return {
    programId: baselineProgramId,
    matchedWidth: baselineSourceResult.matchedWidth,
    matchedHeight: baselineSourceResult.matchedHeight,
    ...(baselineSourceResult.componentMatchedWidths
      ? {
          componentMatchedWidths:
            baselineSourceResult.componentMatchedWidths,
        }
      : {}),
    catalogAmount: baselineSourceResult.base,
    wholesaleAmount: baselineRetailResult.wholesaleBase,
    customerAmount: baselineRetailResult.base,
    source,
  };
}

function priceComponentInputs(
  selection: SelectionContext,
  product: CatalogProduct,
  sourceResult: PriceBreakdown,
) {
  const pricingSource = priceComponentSource(
    product,
    getProgram(product, sourceResult.programId),
  );
  const canonicalContract =
    selection.productId === "roller"
      ? canonicalMotorizationSelectionsFromConfiguration(
          selection.configuration,
        )
      : null;
  const canonicalMotorization = canonicalContract?.selections ?? [];
  const canonicalLineIds = new Set(
    canonicalMotorization.map(
      (entry) => `motor:${entry.groupId}:${entry.optionId}`,
    ),
  );
  const baseMotor = canonicalMotorization.find(
    (entry) => entry.role === "base_motor",
  );
  const baseMotorLineId = baseMotor
    ? `motor:${baseMotor.groupId}:${baseMotor.optionId}`
    : null;
  const liftSystem = selection.configuration.lift_system;
  const normalizedLiftSystem = normalizedComponentIdentity(liftSystem);
  const compactLiftSystem = normalizedLiftSystem.replace(/\s+/g, "");
  const compactCordLoopRelease = normalizedComponentIdentity(
    selection.configuration.cord_loop_release,
  ).replace(/\s+/g, "");
  const rollerSmartReleaseSelected =
    selection.productId === "roller" &&
    (compactLiftSystem === "smartrelease" ||
      ((compactLiftSystem === "continuouscordloop" ||
        compactLiftSystem === "cordloop") &&
        compactCordLoopRelease === "smartrelease"));
  const motorized =
    normalizedLiftSystem.includes("motor") ||
    Boolean(baseMotor);
  const smartReleaseSurchargeId =
    compactLiftSystem === "smartrelease" || rollerSmartReleaseSelected
      ? selection.productId === "roman"
        ? "smartrelease_lift_system"
        : selection.productId === "roller" || selection.productId === "honeycomb"
          ? "smartrelease"
          : null
      : null;
  const operatingSurchargeLine = smartReleaseSurchargeId
    ? sourceResult.surchargeLines.find(
        (line) => line.id === smartReleaseSurchargeId,
      )
    : undefined;
  const fallbackMotorLine = sourceResult.surchargeLines.find((line) =>
    line.id.startsWith("motor:"),
  );
  const operatingPriceLineId =
    baseMotorLineId ??
    operatingSurchargeLine?.id ??
    (motorized ? fallbackMotorLine?.id ?? null : null);
  const operatingPriceLine = operatingPriceLineId
    ? sourceResult.surchargeLines.find(
        (line) => line.id === operatingPriceLineId,
      )
    : null;

  const motorSources = Object.fromEntries(
    sourceResult.surchargeLines
      .filter((line) => line.id.startsWith("motor:"))
      .map((line) => [line.id, motorPriceComponentSource(line.id)]),
  );

  const accessories: PriceComponentOptionInput[] = [];
  for (const line of sourceResult.surchargeLines) {
    if (line.id === operatingPriceLineId || canonicalLineIds.has(line.id)) {
      continue;
    }
    const surcharge = findProductSurcharge(product, line.id);
    const oncePerLine = surcharge?.per === "once";
    const surchargeSource = surcharge?.sourcePages?.length
      ? sourceProvenance(contractSourceId(product.id), {
          pages: surcharge.sourcePages,
        })
      : pricingSource;
    accessories.push({
      id: `${oncePerLine ? "order" : "accessory"}:${line.id}`,
      label: line.label,
      category: oncePerLine ? "order_charge" : "accessory",
      status: "priced",
      basis: priceComponentBasis(product, line.id, line.kind),
      selectionBindings: [
        {
          field: line.id.startsWith("motor:")
            ? "motorization_selections"
            : "surcharges",
          value: line.id,
        },
      ],
      source: line.id.startsWith("motor:")
        ? motorPriceComponentSource(line.id)
        : surchargeSource,
      priceLineId: line.id,
      billingScope: oncePerLine ? "once_per_line" : "per_window",
    });
  }

  const includedSource =
    selection.productId === "roller"
      ? sourceProvenance("norman-roller-guide-2026-07")
      : pricingSource;
  const addIncluded = (
    id: string,
    label: string,
    field: string,
    value: string,
    source = includedSource,
  ) => {
    accessories.push({
      id,
      label,
      category: "accessory",
      status: "included",
      basis: "included",
      selectionBindings: [{ field, value }],
      source,
      billingScope: "per_window",
    });
  };

  if (selection.productId === "roller") {
    const topTreatment = String(
      selection.configuration.roller_top_treatment ??
        selection.configuration.valance ??
        "",
    );
    const normalizedTopTreatment = normalizedComponentIdentity(topTreatment);
    if (
      topTreatment &&
      (normalizedTopTreatment.includes("no top treatment") ||
        normalizedTopTreatment.includes("no valance") ||
        normalizedTopTreatment === "none")
    ) {
      addIncluded(
        "accessory:no_top_treatment",
        "No top treatment — included",
        "roller_top_treatment",
        topTreatment,
      );
    }

    const hemBar = String(selection.configuration.hem_bar ?? "");
    if (normalizedComponentIdentity(hemBar).includes("fabric covered")) {
      addIncluded(
        "accessory:fabric_covered_hem_bar",
        "Fabric-covered hem bar — included",
        "hem_bar",
        hemBar,
      );
    }

    const tube = String(selection.configuration.roller_tube ?? "");
    if (tube) {
      addIncluded(
        `accessory:tube:${normalizedComponentIdentity(tube).replace(/ /g, "_")}`,
        `${tube} — included`,
        "roller_tube",
        tube,
      );
    }

    if (baseMotor?.groupId === "autowand" && baseMotor.optionId === "autowand") {
      addIncluded(
        "accessory:autowand_included_charging_kit",
        "AutoWand charging-kit allocation — included",
        "motorization_selections",
        "autowand/autowand",
        sourceProvenance("norman-motorization-guide-2026-05", {
          page: 83,
        }),
      );
    }
  }

  if (!accessories.some((entry) => entry.category === "accessory")) {
    addIncluded(
      "accessory:none",
      "Accessories — none selected",
      "accessories",
      "none",
      pricingSource,
    );
  }

  const operatingSystem: PriceComponentOptionInput | null = operatingPriceLine
    ? {
        id: `operating:${operatingPriceLine.id}`,
        label: `${operatingPriceLine.label} operating system`,
        category: "operating_system",
        status: "priced",
        basis: priceComponentBasis(
          product,
          operatingPriceLine.id,
          operatingPriceLine.kind,
        ),
        selectionBindings: [
          { field: "lift_system", value: String(liftSystem ?? "Motorized") },
          baseMotor
            ? {
                field: "motorization_selection",
                value: operatingPriceLine.id,
              }
            : {
                field: "operating_surcharge",
                value: operatingPriceLine.id,
              },
        ],
        source: operatingPriceLine.id.startsWith("motor:")
          ? motorPriceComponentSource(operatingPriceLine.id)
          : (() => {
              const surcharge = findProductSurcharge(
                product,
                operatingPriceLine.id,
              );
              return surcharge?.sourcePages?.length
                ? sourceProvenance(contractSourceId(product.id), {
                    pages: surcharge.sourcePages,
                  })
                : pricingSource;
            })(),
        priceLineId: operatingPriceLine.id,
        units: baseMotor?.units ?? 1,
        billingScope: "per_window",
      }
    : motorized
      ? null
      : {
          id: `operating:${normalizedComponentIdentity(liftSystem) || "standard"}`,
          label: `${String(liftSystem ?? "Standard operation")} — included`,
          category: "operating_system",
          status: "included",
          basis: "included",
          selectionBindings: [
            {
              field: "lift_system",
              value: String(liftSystem ?? "standard"),
            },
          ],
          source: includedSource,
          billingScope: "per_window",
        };

  return {
    accessories,
    operatingSystem,
    canonicalMotorization,
    motorSources,
    selectedProgramSource: pricingSource,
    contractSource: pricingSource,
  };
}

function internalCostFromResult(
  result: PriceBreakdown,
  dealerCostOverride?: { unit: number | null; total: number | null },
  dealerPolicy?: {
    effectiveDealerFactor: number;
    policyId: string;
    fixtureId: string;
  },
): QuoteV2InternalProductCost | undefined {
  const unit = dealerCostOverride?.unit ?? result.wholesaleUnitPrice;
  const total = dealerCostOverride?.total ?? result.wholesaleTotal;
  if (unit == null || total == null) return undefined;
  const product = getProduct(result.productId);
  return {
    basis: product?.priceBasis === "dealer_net" ? "dealer_net" : "catalog_factor",
    ...(dealerPolicy
      ? {
          effectiveDealerFactor: dealerPolicy.effectiveDealerFactor,
          dealerPolicyId: dealerPolicy.policyId,
          dealerPolicyFixtureId: dealerPolicy.fixtureId,
        }
      : {}),
    productCostUnit: unit,
    productCostTotal: total,
    freightAllocated: 0,
    oversizeAllocated: 0,
    processingFeeAllocated: 0,
    landedCostTotal: total,
    freightStatus:
      product?.freightStatus === "order_level"
        ? "published"
        : product?.freightStatus === "unresolved"
          ? "unresolved"
          : "not_applicable",
  };
}

/**
 * The single server-authoritative entry point for V2 validation and pricing.
 * No catalog price lookup occurs until all hard restriction evidence passes.
 */
export function priceQuoteV2Selection(request: QuoteV2PriceRequest): QuoteV2PriceResult {
  const { selection, priceInput } = request;
  const issues = [
    ...validateSelection(selection),
    ...priceInputContractIssues(selection, priceInput),
    ...(request.additionalValidationIssues ?? []),
  ];
  const productStatus = productRuleStatusForSelection(selection);
  const pricingForbidden =
    productStatus === "manual_quote_required" || productStatus === "unavailable";
  if (hasHardBlock(issues) || pricingForbidden) {
    return validationFailure(selection, productStatus, issues);
  }

  const product = getProduct(priceInput.productId);
  const selectedProgram = product
    ? getProgram(product, priceInput.programId ?? selection.programId ?? "")
    : undefined;
  const effectivePriceBasis = selectedProgram?.priceBasis ?? product?.priceBasis;
  const sourceResult = priceDesign(priceInput);
  const result =
    effectivePriceBasis === "dealer_net"
      ? sourceResult
      : sourceResult.ok
        ? catalogCostRetail(sourceResult, selection)
        : sourceResult;
  if (!result.ok) {
    return {
      ...result,
      ...metadata(selection, productStatus, issues, false),
    };
  }
  if (!sourceResult.ok || !product) {
    return {
      ok: false,
      code: "CONFIGURATION_INCOMPLETE",
      error:
        "The authoritative source price could not be retained for component reconciliation.",
      warnings: result.warnings,
      ...metadata(selection, productStatus, issues, false),
    };
  }

  const pricedProgram = getProgram(product, result.programId);
  const componentInput = priceComponentInputs(selection, product, sourceResult);
  const componentResult = buildAuthoritativePriceComponents({
    selection,
    sourceResult,
    retailResult: result,
    product,
    baseline: pricedProgram
      ? baselinePriceComponent(
          selection,
          priceInput,
          product,
          pricedProgram,
          sourceResult,
          result,
        )
      : null,
    ...componentInput,
  });
  if (!componentResult.ok) {
    return validationFailure(selection, productStatus, [
      ...issues,
      ...componentResult.issues,
    ]);
  }

  const resultMetadata = metadata(selection, productStatus, issues, true);
  const normanSchedule =
    product?.manufacturer?.trim().toLowerCase() === "norman"
    ? normanDealerScheduleForSelection(
        selection.options.schedule_discount_percent,
      )
    : null;
  const internalCost = request.includeInternalCost
    ? internalCostFromResult(
        result,
        undefined,
        normanSchedule
          ? {
              effectiveDealerFactor:
                normanSchedule.effectivePortalFactor,
              policyId: NORMAN_805_DEALER_POLICY.id,
              fixtureId: normanSchedule.fixtureId,
            }
          : undefined,
      )
    : undefined;
  return {
    ...result,
    components: componentResult.components,
    componentTotals: componentResult.totals,
    ...resultMetadata,
    ...(internalCost ? { internalCost } : {}),
  };
}

/** Strict allowlist for customer-facing API/contract payloads. */
export function toCustomerQuotePriceResult(result: QuoteV2PriceResult): Record<string, unknown> {
  if (!result.ok) {
    return {
      ok: false,
      code: result.code,
      error: result.error,
      validationStatus: result.validationStatus,
      catalogVersion: result.catalogVersion,
    };
  }
  return {
    ok: true,
    productId: result.productId,
    programId: result.programId,
    programName: result.programName,
    matchedWidth: result.matchedWidth,
    matchedHeight: result.matchedHeight,
    ...(result.sqft !== undefined ? { sqft: result.sqft } : {}),
    ...(result.billableSqft !== undefined
      ? { billableSqft: result.billableSqft }
      : {}),
    base: result.base,
    components: result.components.map((component) => ({
      id: component.id,
      category: component.category,
      label: component.label,
      status: component.status,
      basis: component.basis,
      customerAmount: component.customerAmount,
      units: component.units,
      billingScope: component.billingScope,
    })),
    componentTotals: {
      customerPerWindow: result.componentTotals.customerPerWindow,
      customerOncePerLine: result.componentTotals.customerOncePerLine,
    },
    // Source price-line details can contain catalog/dealer formulas such as
    // "$7 x 2". Customer projections retain the authoritative retail amount
    // and structured component basis/units above, but never forward that
    // internal formula text.
    surchargeLines: result.surchargeLines.map(({ id, label, amount, kind }) => ({
      id,
      label,
      amount,
      kind,
    })),
    unitPrice: result.unitPrice,
    discountPercent: result.discountPercent,
    discountAmount: result.discountAmount,
    quantity: result.quantity,
    onceTotal: result.onceTotal,
    total: result.total,
    validationStatus: result.validationStatus,
    catalogVersion: result.catalogVersion,
  };
}

export type ImmutableQuoteV2PriceSnapshot = {
  catalogVersion: string;
  catalogAsOf: string;
  selectionFingerprint: string;
  priceStatus: "authoritative";
  dealerPolicy: QuoteV2DealerPolicySnapshot | null;
  retail: Record<string, unknown>;
};

export function createImmutablePriceSnapshot(
  result: QuoteV2PriceSuccess,
): ImmutableQuoteV2PriceSnapshot {
  return Object.freeze({
    catalogVersion: result.catalogVersion,
    catalogAsOf: result.catalogAsOf,
    selectionFingerprint: result.selectionFingerprint,
    priceStatus: "authoritative" as const,
    dealerPolicy: dealerPolicySnapshotFromPriceResult(result),
    retail: Object.freeze(toCustomerQuotePriceResult(result)),
  });
}
