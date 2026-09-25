import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const mocks = vi.hoisted(() => ({
  native: vi.fn(), historical: vi.fn(), sell: vi.fn(), prepare: vi.fn(),
  advance: vi.fn(), installer: vi.fn(), notify: vi.fn(),
}));
vi.mock("./sales-quote-v2-send-guard", async importOriginal => ({
  ...await importOriginal<object>(), isNativeV2SalesQuote: mocks.native,
  assertHistoricalSalesQuoteMutationAllowed: mocks.historical,
}));
vi.mock("./native-quote-delivery", () => ({ markNativeSalesQuoteSold: mocks.sell, prepareNativeInPersonQuote: mocks.prepare }));
vi.mock("./quote-builder", () => ({ advanceQuoteStatus: mocks.advance }));
vi.mock("./sold-installer-delivery", () => ({ ensureSoldQuoteInstallerDelivery: mocks.installer }));
vi.mock("./sold-quote-notifications", () => ({ sendSoldQuoteSmsNotifications: mocks.notify }));

import { markSalesQuoteSold, prepareSalesQuoteInPerson } from "./sales-quote-send";

const quote = { id: "native-source", status: "draft", quote_v2_revision: 17, total_amount: 3160.24 };
const actor = { userId: "staff-actor", email: "staff@example.test" };
function database() {
  const query = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn().mockResolvedValue({ data: quote, error: null }) };
  query.select.mockReturnValue(query); query.eq.mockReturnValue(query);
  return { from: vi.fn().mockReturnValue(query) } as unknown as SupabaseClient;
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.native.mockResolvedValue(true);
  mocks.historical.mockRejectedValue(new Error("Historical workflow rejects native quote"));
  mocks.sell.mockResolvedValue("native-contract");
  mocks.advance.mockResolvedValue({ id: "native-contract", status: "sold", job_id: null });
  mocks.prepare.mockResolvedValue({ path: "/quote/synthetic", signed: false });
});

describe("native quote staff actions", () => {
  it("records the native sale and continues the existing handoff without the historical mutation guard", async () => {
    const db = database();
    const result = await markSalesQuoteSold(db, quote.id, actor, {
      measureDecision: "not_needed", expectedRevision: 17, acknowledgedTotal: 3160.24,
    });
    expect(mocks.sell).toHaveBeenCalledWith(db, quote, actor, expect.objectContaining({
      measureDecision: "not_needed", expectedRevision: 17, acknowledgedTotal: 3160.24,
    }));
    expect(mocks.historical).not.toHaveBeenCalled();
    expect(mocks.advance).toHaveBeenCalledWith(db, "native-contract", "sold", actor, { deferInstallerDelivery: true });
    expect(mocks.notify).toHaveBeenCalledOnce();
    expect(result.crmQuote.id).toBe("native-contract");
  });
  it("requires the technical measure decision before attempting a sale", async () => {
    await expect(markSalesQuoteSold(database(), quote.id, actor, { expectedRevision: 17, acknowledgedTotal: 3160.24 }))
      .rejects.toThrow("Choose whether a technical measure is needed");
    expect(mocks.sell).not.toHaveBeenCalled();
  });
  it("opens native in-person signing without historical mutation or sending notifications", async () => {
    const db = database();
    await expect(prepareSalesQuoteInPerson(db, quote.id, actor, { expectedRevision: 17 }))
      .resolves.toEqual({ path: "/quote/synthetic", signed: false });
    expect(mocks.prepare).toHaveBeenCalledWith(db, quote, actor, { expectedRevision: 17 });
    expect(mocks.historical).not.toHaveBeenCalled();
    expect(mocks.notify).not.toHaveBeenCalled();
  });
});
