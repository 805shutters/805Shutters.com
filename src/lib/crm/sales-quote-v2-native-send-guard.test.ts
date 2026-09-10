import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { assertHistoricalSalesQuoteMutationAllowed } from "./sales-quote-v2-send-guard";
import {
  markSalesQuoteSold,
  prepareSalesQuoteForCommunication,
  resyncSalesQuoteCustomerMirror,
  restoreSalesQuoteMirrorForPublicLink,
  sendSalesQuotePaymentLinkToCustomer,
  sendSalesQuoteToCustomer,
} from "./sales-quote-send";

const quoteId = "11111111-1111-4111-8111-111111111111";
const accountId = "72ccf12a-11c0-4261-8ad0-31af8ad0bbfb";
const actor = { email: "staff@example.com", userId: "22222222-2222-4222-8222-222222222222" };
const nativeQuote = { id: quoteId, account_id: accountId, status: "draft", quote_v2_backend: true, quote_v2_status: "priced" };

function fixture(input: {
  quote?: Record<string, unknown>;
  nativeIds?: string[];
  originError?: object;
  group?: Record<string, unknown>[];
} = {}) {
  const calls: string[] = [];
  const writes = vi.fn(() => { throw new Error("Unexpected mutation"); });
  const quote = input.quote ?? nativeQuote;
  const nativeIds = input.nativeIds ?? [quoteId];
  const from = vi.fn((table: string) => {
    calls.push(table);
    let field: string;
    let id: unknown;
    const response = () => {
      if (table === "sales_quote_v2_draft_requests") return {
        data: nativeIds.includes(String(id)) ? { quote_id: id } : null,
        error: input.originError ?? null,
      };
      if (table === "sales_quote_v2_deliveries") return { data: null, error: null };
      if (table === "sales_quotes") return {
        data: field === "quote_group_id" ? (input.group ?? []) : quote,
        error: null,
      };
      throw new Error(`Unexpected read before provenance guard: ${table}`);
    };
    const query = {
      select: () => query,
      eq: (key: string, value: unknown) => { field = key; id = value; return query; },
      maybeSingle: async () => response(),
      then: (resolve: (value: unknown) => void) => Promise.resolve(response()).then(resolve),
      update: writes,
      upsert: writes,
      insert: writes,
      delete: writes,
    };
    return query;
  });
  return { db: { from } as unknown as SupabaseClient, calls, writes };
}

describe("native V2 provenance before historical contract mutation", () => {
  it("leaves ordinary historical records alone without a provenance lookup", async () => {
    const f = fixture();
    await assertHistoricalSalesQuoteMutationAllowed(f.db, { id: quoteId });
    expect(f.calls).toEqual([]);
  });

  it.each(["ready", "priced", "sent", "sold"])(
    "preserves marked historical records in %s state when no native receipt exists",
    async (status) => {
      const f = fixture({ nativeIds: [] });
      await assertHistoricalSalesQuoteMutationAllowed(f.db, { ...nativeQuote, quote_v2_status: status });
      expect(f.calls).toEqual(["sales_quote_v2_draft_requests"]);
      expect(f.writes).not.toHaveBeenCalled();
    },
  );

  it("does not treat inaccessible provenance as historical absence", async () => {
    const f = fixture({ originError: { code: "42501" }, nativeIds: [] });
    await expect(assertHistoricalSalesQuoteMutationAllowed(f.db, nativeQuote))
      .rejects.toMatchObject({ status: 502 });
    expect(f.writes).not.toHaveBeenCalled();
  });

  it("rejects a marked quote without a usable identity", async () => {
    const f = fixture();
    await expect(assertHistoricalSalesQuoteMutationAllowed(f.db, { quote_v2_backend: true }))
      .rejects.toMatchObject({ status: 409 });
    expect(f.calls).toEqual([]);
  });

  const actions = [
    ["send", (db: SupabaseClient) => sendSalesQuoteToCustomer(db, quoteId, actor, { emails: ["customer@example.com"] })],
    ["send as is", (db: SupabaseClient) => sendSalesQuoteToCustomer(db, quoteId, actor, { sendAsIs: true })],
    ["payment link", (db: SupabaseClient) => sendSalesQuotePaymentLinkToCustomer(db, quoteId, actor, { phone: "8055550100" })],
    ["mark sold", (db: SupabaseClient) => markSalesQuoteSold(db, quoteId, actor, { measureDecision: "needed" })],
    ["resync mirror", (db: SupabaseClient) => resyncSalesQuoteCustomerMirror(db, quoteId)],
    ["restore mirror", (db: SupabaseClient) => restoreSalesQuoteMirrorForPublicLink(db, quoteId)],
  ] as const;
  it.each(actions)("blocks native %s before any write or notification", async (_name, run) => {
    const f = fixture();
    await expect(run(f.db)).rejects.toMatchObject({ status: 409 });
    expect(f.writes).not.toHaveBeenCalled();
    expect(f.calls).toEqual(["sales_quotes", "sales_quote_v2_draft_requests"]);
  });

  it("does not rebuild an already sent native quote through the communication hub", async () => {
    const f = fixture({ quote: { ...nativeQuote, status: "sent" } });
    await expect(prepareSalesQuoteForCommunication(f.db, quoteId)).rejects.toMatchObject({ status: 502 });
    expect(f.writes).not.toHaveBeenCalled();
  });

  it.each([
    ["restore", (db: SupabaseClient) => restoreSalesQuoteMirrorForPublicLink(db, "historical-a")],
    ["send with contact changes", (db: SupabaseClient) => sendSalesQuoteToCustomer(db, "historical-a", actor, { emails: ["new@example.com"] })],
  ] as const)("checks a native sibling before any historical group %s writes", async (_name, run) => {
    const historical = { id: "historical-a", quote_group_id: "group", quote_letter: "A" };
    const f = fixture({ quote: historical, group: [historical, { ...nativeQuote, quote_letter: "B" }] });
    await expect(run(f.db)).rejects.toMatchObject({ status: 409 });
    expect(f.calls).toEqual(["sales_quotes", "sales_quotes", "sales_quote_v2_draft_requests"]);
    expect(f.writes).not.toHaveBeenCalled();
  });
});
