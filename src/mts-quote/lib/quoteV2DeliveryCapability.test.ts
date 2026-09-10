import { afterEach, describe, expect, it, vi } from "vitest";
import type { QuoteBuilderDatabase } from "@mts/integrations/supabase/quoteBuilderDatabase";
import { getQuoteV2DeliveryCapability } from "./quoteV2DeliveryCapability";
const database = { auth: { getSession: async () => ({ data: { session: { access_token: "fixture-token" } }, error: null }) } } as unknown as QuoteBuilderDatabase;
const allowed = { schemaVersion: 1, enabled: true, native: true, canSend: true, reserved: false };
afterEach(() => vi.unstubAllGlobals());
describe("native delivery capability authenticated read", () => {
  it("reads only the selected quote using CRM auth and cancellation", async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => allowed });
    vi.stubGlobal("fetch", fetch);
    const signal = new AbortController().signal;
    await expect(getQuoteV2DeliveryCapability(database, "quote/c", signal)).resolves.toEqual(allowed);
    expect(fetch).toHaveBeenCalledWith("/api/crm/sales-quotes/quote%2Fc/v2/delivery", {
      headers: { Authorization: "Bearer fixture-token" }, cache: "no-store", signal,
    });
  });
  it.each([null, {}, { ...allowed, schemaVersion: 2 }, { ...allowed, canSend: "true" }])("rejects malformed capability %j", async (payload) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => payload }));
    await expect(getQuoteV2DeliveryCapability(database, "quote-c")).rejects.toThrow("could not be verified");
  });
  it("rejects an HTTP error even when its body looks enabled", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => allowed }));
    await expect(getQuoteV2DeliveryCapability(database, "quote-c")).rejects.toThrow();
  });
  it("does not make an anonymous request when the CRM session is unavailable", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    const missing = { auth: { getSession: async () => ({ data: { session: null }, error: null }) } } as unknown as QuoteBuilderDatabase;
    await expect(getQuoteV2DeliveryCapability(missing, "quote-c")).rejects.toThrow("session is unavailable");
    expect(fetch).not.toHaveBeenCalled();
  });
});
