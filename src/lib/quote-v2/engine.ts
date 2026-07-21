import { getProduct, getProgram } from "@/lib/quote/catalog";
import {
  priceDealerNetDesign,
  priceDesign,
  type PriceBreakdown,
  type PriceFailure,
  type PriceInput,
  type PriceResult,
} from "@/lib/quote/pricing";
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

function priceInputContractIssues(
  selection: SelectionContext,
  input: PriceInput,
): ValidationIssue[] {
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
  if (inputQuantity !== selection.quantity) {
    mismatches.quantity = `${selection.quantity} != ${inputQuantity}`;
  }
  if (
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
  if (Object.keys(mismatches).length === 0) return [];
  return [
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
