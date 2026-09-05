import { describe, expect, it } from "vitest";
import {
  buildMobileQuotePreviewResponse,
  mobileQuotePreviewLineResponse,
} from "@/lib/crm/mobile-quote-preview-response";
import type {
  PreparedSalesQuoteV2PricingBatch,
  PreparedSalesQuoteV2PricingLine,
} from "@/lib/crm/sales-quote-v2-price-save";

function line(input: {
  status?: "authoritative" | "blocked" | "unpriceable";
  productStatus?: string;
  issues?: unknown[];
} = {}): PreparedSalesQuoteV2PricingLine {
  return {
    lineItemId: "11111111-1111-4111-8111-111111111111",
    designId: "22222222-2222-4222-8222-222222222222",
    priceStatus: input.status ?? "blocked",
    customerPrice: input.status === "authoritative"
      ? { ok: true, total: 125 }
      : { ok: false, error: "Pricing is currently unavailable for this selection." },
    rpcResult: {
      validationSnapshot: {
        productStatus: input.productStatus ?? "restriction_source_incomplete",
        issues: input.issues ?? [],
      },
    },
  };
}

describe("mobile quote preview customer-safe response", () => {
  it.each(["manual_quote_required", "restriction_source_incomplete"])(
    "allows complete %s configurations to continue as manual-pricing drafts",
    (productStatus) => {
      expect(mobileQuotePreviewLineResponse(line({ productStatus }))).toEqual(expect.objectContaining({
        status: "blocked",
        requiresManualPricing: true,
        blockedReason: "This complete configuration requires manual pricing in the quote editor.",
      }));
    },
  );

  it.each([
    [
      "norman.shutter.frame_pricing.missing_frame_sides",
      "Choose whether this Window Size shutter has three or four framed sides.",
    ],
    [
      "norman.shutter.frame_pricing.mount_frame_mismatch",
      "The selected Norman frame is not compatible with the selected mount type.",
    ],
  ])("returns a safe actionable configuration reason for %s", (ruleId, reason) => {
    const response = mobileQuotePreviewLineResponse(line({
      issues: [{
        ruleId,
        explanation: "internal explanation",
        sourceRefs: [{ sourceId: "private-evidence" }],
        selectedValues: { frame_sides: null },
      }],
    }));
    expect(response).toMatchObject({
      requiresManualPricing: false,
      blockedReason: reason,
    });
    expect(JSON.stringify(response)).not.toContain("private-evidence");
    expect(JSON.stringify(response)).not.toContain("internal explanation");
  });

  it("does not classify incomplete manual-required products as manual-ready", () => {
    expect(mobileQuotePreviewLineResponse(line({
      productStatus: "manual_quote_required",
      issues: [{ ruleId: "product.missing_configuration" }],
    })).requiresManualPricing).toBe(false);
  });

  it("keeps quote totals null when a fully configured manual line accompanies an authoritative line", () => {
    const batch = {
      repriced: { total: 125 },
      prepared: [
        { ...line({ status: "authoritative", productStatus: "documented_limited" }), lineItemId: "authoritative" },
        { ...line(), lineItemId: "manual" },
      ],
    } as unknown as PreparedSalesQuoteV2PricingBatch;
    expect(buildMobileQuotePreviewResponse(batch, "2026-09-05T00:00:00.000Z")).toMatchObject({
      status: "partial",
      total: null,
      authoritativeSubtotal: 125,
      lines: [
        { lineItemId: "authoritative", requiresManualPricing: false },
        { lineItemId: "manual", requiresManualPricing: true },
      ],
    });
  });
});
