import type { PreparedSalesQuoteV2PricingBatch } from "@/lib/crm/sales-quote-v2-price-save";

type JsonRecord = Record<string, unknown>;

export type MobileQuotePreviewLineResponse = Readonly<{
  lineItemId: string;
  status: "authoritative" | "blocked" | "unpriceable";
  price: JsonRecord;
  blockedReason: string | null;
  requiresManualPricing: boolean;
}>;

export type MobileQuotePreviewResponse = Readonly<{
  backend: "authoritative_v2";
  verifiedAt: string;
  status: "authoritative" | "partial";
  total: number | null;
  authoritativeSubtotal: number;
  lines: readonly MobileQuotePreviewLineResponse[];
}>;

const SAFE_CONFIGURATION_REASONS: Readonly<Record<string, string>> = {
  "norman.shutter.frame_pricing.missing_frame_sides":
    "Choose whether this Window Size shutter has three or four framed sides.",
  "norman.shutter.frame_pricing.mount_frame_mismatch":
    "The selected Norman frame is not compatible with the selected mount type.",
};

function record(value: unknown): JsonRecord | null {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function validation(line: PreparedSalesQuoteV2PricingBatch["prepared"][number]) {
  const rpcResult = record(line.rpcResult);
  const snapshot = record(rpcResult?.validationSnapshot);
  const productStatus = typeof snapshot?.productStatus === "string"
    ? snapshot.productStatus
    : null;
  const issues = Array.isArray(snapshot?.issues)
    ? snapshot.issues.map(record).filter((issue): issue is JsonRecord => issue !== null)
    : [];
  return { productStatus, issues };
}

export function mobileQuotePreviewLineResponse(
  line: PreparedSalesQuoteV2PricingBatch["prepared"][number],
): MobileQuotePreviewLineResponse {
  const { productStatus, issues } = validation(line);
  const safeConfigurationReason = issues
    .map((issue) => typeof issue.ruleId === "string" ? SAFE_CONFIGURATION_REASONS[issue.ruleId] : undefined)
    .find((reason): reason is string => Boolean(reason));
  const requiresManualPricing =
    line.priceStatus !== "authoritative" &&
    issues.length === 0 &&
    (productStatus === "manual_quote_required" || productStatus === "restriction_source_incomplete");
  const customerError = typeof line.customerPrice.error === "string"
    ? line.customerPrice.error
    : null;

  return {
    lineItemId: line.lineItemId,
    status: line.priceStatus,
    price: line.customerPrice,
    blockedReason: line.priceStatus === "authoritative"
      ? null
      : safeConfigurationReason ?? (requiresManualPricing
          ? "This complete configuration requires manual pricing in the quote editor."
          : customerError ?? "Pricing is unavailable until this configuration is complete."),
    requiresManualPricing,
  };
}

export function buildMobileQuotePreviewResponse(
  batch: PreparedSalesQuoteV2PricingBatch,
  verifiedAt = new Date().toISOString(),
): MobileQuotePreviewResponse {
  const lines = batch.prepared.map(mobileQuotePreviewLineResponse);
  const allAuthoritative = lines.every((line) => line.status === "authoritative");
  const authoritativeSubtotal = lines.reduce((total, line) => {
    const value = line.status === "authoritative" ? Number(line.price.total) : 0;
    return total + (Number.isFinite(value) ? value : 0);
  }, 0);

  return {
    backend: "authoritative_v2",
    verifiedAt,
    status: allAuthoritative ? "authoritative" : "partial",
    total: allAuthoritative ? batch.repriced.total : null,
    authoritativeSubtotal: Math.round(authoritativeSubtotal * 100) / 100,
    lines,
  };
}
