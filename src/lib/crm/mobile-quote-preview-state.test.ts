import { describe, expect, it } from "vitest";
import { addMobileQuoteWindow, createMobileQuoteDraft, emptyMobileQuoteDesign, selectMobileQuoteProduct, type MobileQuoteDraft } from "./mobile-quote-draft";
import { applyMobileQuotePreview } from "./mobile-quote-preview-state";
import type { MobileQuotePreviewResponse } from "./mobile-quote-preview-response";

function draft() {
  let result = createMobileQuoteDraft("owner", { kind: "new", jobId: null, name: "Audit", phone: "", email: "", address: "", appointmentDate: null });
  const id = result.windows[0].id;
  result = selectMobileQuoteProduct(result, id, { productId: "roller", productType: "Roller Shades", design: emptyMobileQuoteDesign(id, "Roller Shades") });
  Object.assign(result.windows[0], { room: "Kitchen", widthWhole: 36, heightWhole: 48 });
  return result;
}
function preview(value: MobileQuoteDraft): MobileQuotePreviewResponse {
  return { backend: "authoritative_v2", verifiedAt: "2026-09-10T04:00:00Z", status: "authoritative", total: 125, authoritativeSubtotal: 125,
    lines: [{ lineItemId: value.windows[0].id, status: "authoritative", price: { total: 125 }, blockedReason: null, requiresManualPricing: false }] };
}

describe("mobile price response reconciliation", () => {
  it("accepts a complete response for the unchanged quote", () => {
    const original = draft();
    const next = applyMobileQuotePreview(original, structuredClone(original), preview(original));
    expect(next?.quotePrice).toMatchObject({ status: "authoritative", amount: 125 });
    expect(next?.windows[0].price).toMatchObject({ status: "authoritative", amount: 125 });
    expect(original.quotePrice).toBeNull();
  });
  it("rejects an in-flight subtotal after another window is added", () => {
    const requested = draft(); const current = addMobileQuoteWindow(requested);
    expect(applyMobileQuotePreview(current, requested, preview(requested))).toBe(current);
    expect(current.quotePrice).toBeNull();
  });
  it("rejects prices after a window is removed or its dimensions change", () => {
    const requested = draft(); const edited = structuredClone(requested); edited.windows[0].widthWhole = 50;
    expect(applyMobileQuotePreview(edited, requested, preview(requested))).toBe(edited);
    const removed = structuredClone(requested); removed.windows = [];
    expect(applyMobileQuotePreview(removed, requested, preview(requested))).toBe(removed);
  });
  it("does not let an incomplete window become a priced window while a partial request is pending", () => {
    const requested = addMobileQuoteWindow(draft()); const current = structuredClone(requested);
    Object.assign(current.windows[1], { room: "Office", widthWhole: 48, heightWhole: 48 });
    expect(applyMobileQuotePreview(current, requested, preview(requested))).toBe(current);
  });
  it("marks unchanged partial coverage as blocked instead of a verified quote total", () => {
    const current = addMobileQuoteWindow(draft());
    expect(applyMobileQuotePreview(current, structuredClone(current), preview(current))?.quotePrice?.status).toBe("blocked");
  });
  it("rejects missing, duplicate and foreign response line identities", () => {
    const current = draft(); const good = preview(current);
    for (const lines of [[], [good.lines[0], good.lines[0]], [{ ...good.lines[0], lineItemId: "wrong" }]]) {
      expect(applyMobileQuotePreview(current, current, { ...good, lines })).toBe(current);
    }
  });
  it("retains non-pricing edits and rejects invalid authoritative amounts", () => {
    const requested = draft(); const current = structuredClone(requested); current.windows[0].notes = "Keep trim";
    expect(applyMobileQuotePreview(current, requested, preview(requested))?.windows[0].notes).toBe("Keep trim");
    const good = preview(requested);
    expect(applyMobileQuotePreview(current, requested, { ...good, lines: [{ ...good.lines[0], price: {} }] })).toBe(current);
  });
});
