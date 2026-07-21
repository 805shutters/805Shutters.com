import {
  findProductSurcharge,
  getProduct,
  getProgram,
} from "@/lib/quote/catalog";
import {
  priceDealerNetDesign,
  priceDesign,
  type PriceBreakdown,
  type PriceFailure,
  type PriceInput,
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
import { productRuleStatusForSelection, validateSelection } from "./rules";
import { sourceProvenance, type SourceManifestId } from "./source-manifest";
import { rollerMotorChargeForPowerConfiguration } from "./roller-motor";
import {
  canonicalMotorizationPriceSelections,
  canonicalMotorizationSelectionsFromConfiguration,
} from "./roller-motor-contract";
import { rollerComponentOrderWidthsForPricing } from "./roller-matrix";

export type QuoteV2ValidationStatus = "valid" | "blocked";

export type QuoteV2InternalProductCost = {
  basis: "catalog_factor" | "dealer_net";
  productCostUnit: number;
  productCostTotal: number;
  freightAllocated: number;
  oversizeAllocated: number;
  landedCostTotal: number;
  freightStatus: "published" | "estimated" | "unresolved" | "not_applicable";
};

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

export type QuoteV2PriceSuccess = PriceBreakdown & QuoteV2ResultMetadata;
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
  return value
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
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

    const topTreatment = String(details.roller_top_treatment ?? "");
    if (!details.valance) {
      if (topTreatment === "square_fascia") details.valance = "square_fascia";
      else if (topTreatment === "curved_fascia") details.valance = "plain_curved_fascia";
      else if (topTreatment === "fabric_valance") details.valance = "fabric_valance";
      else if (topTreatment === "wood_valance") details.valance = "wood_valance";
      else if (topTreatment === "cassette") details.valance = "cassette";
    }
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

function dealerNetRetail(
  input: PriceInput,
): { result: PriceResult; productCostUnit: number | null; productCostTotal: number | null } {
  if ((input.surcharges?.length ?? 0) > 0 || (input.motorization?.length ?? 0) > 0) {
    return {
      result: {
        ok: false,
        code: "CONFIGURATION_INCOMPLETE",
        error:
          "The dealer-net option charges for this configuration are not fully sourced. V2 will not mark up the base while silently omitting selected options.",
        warnings: [],
      },
      productCostUnit: null,
      productCostTotal: null,
    };
  }

  const cost = priceDealerNetDesign(input);
  if (!cost.ok) return { result: cost, productCostUnit: null, productCostTotal: null };
  const product = getProduct(cost.productId);
  const program = product ? getProgram(product, cost.programId) : undefined;
  const quantity = Math.max(1, Math.floor(Number(input.quantity) || 1));
  const discountPercent = Math.min(100, Math.max(0, Number(input.discountPercent) || 0));
  const undiscountedUnit = roundMoney(cost.dealerNetUnitCost * 2.5);
  const discountAmount = roundMoney(undiscountedUnit * (discountPercent / 100));
  const unitPrice = roundMoney(undiscountedUnit - discountAmount);
  const productCostTotal = roundMoney(cost.dealerNetUnitCost * quantity);
  return {
    result: {
      ok: true,
      productId: cost.productId,
      programId: cost.programId,
      programName: program?.name ?? cost.programId,
      matchedWidth: cost.matchedWidth ?? input.widthInches,
      matchedHeight: cost.matchedHeight,
      base: undiscountedUnit,
      configurationUnits: 1,
      wholesaleBase: cost.dealerNetUnitCost,
      surchargeLines: [],
      unitPrice,
      discountPercent,
      discountAmount,
      wholesaleUnitPrice: cost.dealerNetUnitCost,
      quantity,
      onceTotal: 0,
      total: roundMoney(unitPrice * quantity),
      wholesaleTotal: productCostTotal,
      warnings: ["Customer retail was calculated from the configured dealer pricing policy."],
      costStatus: "complete",
    },
    productCostUnit: cost.dealerNetUnitCost,
    productCostTotal,
  };
}

function selectedNormanDealerScale(selection: SelectionContext): number {
  if (!selection.manufacturerId.toLowerCase().includes("norman")) return 1;
  const selected = Number(selection.options.schedule_discount_percent);
  return selected === 28.5 ? 0.95 : 1;
}

/** Convert every source-backed product and option cost into V2 retail policy. */
function catalogCostRetail(
  source: PriceBreakdown,
  selection: SelectionContext,
): PriceResult {
  if (
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

  const dealerScale = selectedNormanDealerScale(selection);
  const productCostBase = roundMoney(source.wholesaleBase * dealerScale);
  const productCostUnit = roundMoney(source.wholesaleUnitPrice * dealerScale);
  const productCostTotal = roundMoney(source.wholesaleTotal * dealerScale);
  const productCostOnce = roundMoney(
    Math.max(0, productCostTotal - productCostUnit * source.quantity),
  );
  const base = roundMoney(productCostBase * 2.5);
  const undiscountedUnit = roundMoney(productCostUnit * 2.5);
  const discountAmount = roundMoney(
    undiscountedUnit * (source.discountPercent / 100),
  );
  const unitPrice = roundMoney(undiscountedUnit - discountAmount);
  const onceTotal = roundMoney(productCostOnce * 2.5);
  const surchargeLines = source.surchargeLines.map((line) => {
    const wholesaleAmount = roundMoney((line.wholesaleAmount ?? 0) * dealerScale);
    return {
      ...line,
      wholesaleAmount,
      amount: roundMoney(wholesaleAmount * 2.5),
    };
  });
  return {
    ...source,
    base,
    wholesaleBase: productCostBase,
    surchargeLines,
    unitPrice,
    discountAmount,
    wholesaleUnitPrice: productCostUnit,
    onceTotal,
    total: roundMoney(unitPrice * source.quantity + onceTotal),
    wholesaleTotal: productCostTotal,
    warnings: [
      ...source.warnings,
      "Customer retail was calculated from the configured dealer pricing policy.",
    ],
  };
}

function internalCostFromResult(
  result: PriceBreakdown,
  dealerCostOverride?: { unit: number | null; total: number | null },
): QuoteV2InternalProductCost | undefined {
  const unit = dealerCostOverride?.unit ?? result.wholesaleUnitPrice;
  const total = dealerCostOverride?.total ?? result.wholesaleTotal;
  if (unit == null || total == null) return undefined;
  const product = getProduct(result.productId);
  return {
    basis: product?.priceBasis === "dealer_net" ? "dealer_net" : "catalog_factor",
    productCostUnit: unit,
    productCostTotal: total,
    freightAllocated: 0,
    oversizeAllocated: 0,
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
  const dealer = product?.priceBasis === "dealer_net" ? dealerNetRetail(priceInput) : null;
  const sourceResult = dealer?.result ?? priceDesign(priceInput);
  const result =
    !dealer && sourceResult.ok
      ? catalogCostRetail(sourceResult, selection)
      : sourceResult;
  if (!result.ok) {
    return {
      ...result,
      ...metadata(selection, productStatus, issues, false),
    };
  }

  const resultMetadata = metadata(selection, productStatus, issues, true);
  const internalCost = request.includeInternalCost
    ? internalCostFromResult(result, dealer ? { unit: dealer.productCostUnit, total: dealer.productCostTotal } : undefined)
    : undefined;
  return {
    ...result,
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
    surchargeLines: result.surchargeLines.map(({ id, label, amount, kind, detail }) => ({
      id,
      label,
      amount,
      kind,
      ...(detail ? { detail } : {}),
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
    retail: Object.freeze(toCustomerQuotePriceResult(result)),
  });
}
