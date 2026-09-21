import { describe, expect, it, vi } from "vitest";
import { createDraftPricingRecovery, draftPricingRecoveryRequest } from "./quoteDraftPricingRecovery";
import type { SalesQuote } from "@mts/types/quote";

const quote: Partial<SalesQuote> = { id: "quote", status: "draft", quote_v2_backend: true, quote_v2_status: "blocked", quote_v2_revision: 7 };
const lines = [{ id: "line", selected_design_id: "selected-b" }];
const failed = { id: "selected-b", line_item_id: "line", unit_price: 0, quote_v2_price_status: "blocked" as const,
  options_json: { authoritative_price_status: "blocked", authoritative_price_error: "The requested catalog identity is not the server-selected catalog for this product and effective date." } };
const alternate = { ...failed, id: "alternate-a", unit_price: 999 };
const request = draftPricingRecoveryRequest(quote, lines, [alternate, failed])!;

describe("draft-open automatic price recovery", () => {
  it("uses the persisted selected design and identities only, without changing fabric or dimensions", () => {
    expect(request).toEqual({ quoteId: "quote", lineItemId: "line", designId: "selected-b", expectedRevision: 7 });
    expect(draftPricingRecoveryRequest(quote, [{ id: "line", selected_design_id: null }], [failed])).toBeNull();
    expect(draftPricingRecoveryRequest(quote, lines, [alternate])).toBeNull();
    expect(draftPricingRecoveryRequest(quote, [], [])).toBeNull();
  });
  it.each(["sent", "sold", "ordered", "archived"] as const)("never auto-reprices %s quotes", status => {
    expect(draftPricingRecoveryRequest({ ...quote, status }, lines, [failed])).toBeNull();
  });
  it("excludes signed, deleted, accepted, historical and incomplete-load records", () => {
    for (const patch of [{ sent_at: "2026-09-01" }, { signed_at: "2026-09-01" }, { customer_signature: "signed" },
      { deleted_at: "2026-09-01" }, { quote_v2_accepted_selection: {} as NonNullable<SalesQuote["quote_v2_accepted_selection"]> }, { quote_v2_backend: false }, { quote_v2_status: "sent" as const }, { quote_v2_revision: 0 }]) {
      expect(draftPricingRecoveryRequest({ ...quote, ...patch }, lines, [failed])).toBeNull();
    }
    expect(draftPricingRecoveryRequest(undefined, lines, [failed])).toBeNull();
  });
  it("leaves authoritative prices including intentional zero unchanged even with an old saved error", () => {
    for (const unit_price of [0, 732]) {
      expect(draftPricingRecoveryRequest(quote, lines, [{ ...failed, unit_price, options_json: { ...failed.options_json, authoritative_price_status: "authoritative" } }])).toBeNull();
    }
  });
  it("skips manual and Custom Mode snapshots, including mixed quotes", () => {
    const protectedDesigns = [
      { ...failed, options_json: { manual_price_override: true } },
      { ...failed, quote_v2_priced_catalog_version: "custom-override-v1" },
      { ...failed, options_json: { authoritative_v2_snapshot: { catalogVersion: "custom-override-v1" } } },
    ];
    for (const protectedDesign of protectedDesigns) {
      expect(draftPricingRecoveryRequest(quote, lines, [protectedDesign])).toBeNull();
      expect(draftPricingRecoveryRequest(quote, [...lines, { id: "manual-line", selected_design_id: "manual" }], [failed,
        { ...protectedDesign, id: "manual", line_item_id: "manual-line" }])).toBeNull();
    }
  });
  it("saves and refreshes once, then reopening authoritative rows retains the returned price", async () => {
    const recovery = createDraftPricingRecovery();
    const price = vi.fn().mockResolvedValue({ revision: 8 });
    const saved = vi.fn(); const refresh = vi.fn().mockResolvedValue(undefined);
    const callbacks = { isCurrent: () => true, price, saved, refresh };
    await recovery.run(request, callbacks);
    await recovery.run(request, callbacks);
    await recovery.run({ ...request, expectedRevision: 8 }, callbacks);
    expect(price).toHaveBeenCalledTimes(1);
    expect(price.mock.calls[0][0]).toMatchObject(request);
    expect(price.mock.calls[0][0].idempotencyKey).toMatch(/^draft-open:/);
    expect(Object.keys(price.mock.calls[0][0]).sort()).toEqual(["designId", "expectedRevision", "idempotencyKey", "lineItemId", "quoteId"]);
    expect(saved).toHaveBeenCalledExactlyOnceWith({ revision: 8 }); expect(refresh).toHaveBeenCalledTimes(1);
    const reopened = { ...failed, unit_price: 732, options_json: { authoritative_price_status: "authoritative" } };
    expect(draftPricingRecoveryRequest({ ...quote, quote_v2_revision: 8 }, lines, [reopened])).toBeNull();
  });
  it("does not loop when the server returns another blocked revision or fails", async () => {
    const recovery = createDraftPricingRecovery();
    const price = vi.fn().mockRejectedValueOnce(new Error("Revision conflict"));
    const callbacks = { isCurrent: () => true, price, saved: vi.fn(), refresh: vi.fn().mockResolvedValue(undefined) };
    await expect(recovery.run(request, callbacks)).rejects.toThrow("Revision conflict");
    await recovery.run(request, callbacks); expect(price).toHaveBeenCalledTimes(1);
    price.mockResolvedValueOnce({ revision: 10 });
    await recovery.run({ ...request, expectedRevision: 9 }, callbacks);
    await recovery.run({ ...request, expectedRevision: 10 }, callbacks);
    expect(price).toHaveBeenCalledTimes(2);
  });
  it("cancels queued work on cleanup and prevents concurrent duplicate attempts", async () => {
    const recovery = createDraftPricingRecovery(); let active = false;
    let resolve!: (result: { revision: number }) => void;
    const price = vi.fn(() => new Promise<{ revision: number }>(done => { resolve = done; }));
    const callbacks = { isCurrent: () => active, price, saved: vi.fn(), refresh: vi.fn().mockResolvedValue(undefined) };
    await recovery.run(request, callbacks); expect(price).not.toHaveBeenCalled();
    active = true;
    const pending = recovery.run(request, callbacks);
    await recovery.run(request, callbacks); expect(price).toHaveBeenCalledTimes(1);
    active = false; resolve({ revision: 8 }); await pending;
    expect(callbacks.saved).not.toHaveBeenCalled();
    expect(callbacks.refresh).toHaveBeenCalledTimes(1);
  });
});
