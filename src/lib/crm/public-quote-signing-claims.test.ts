import { describe, expect, it, vi } from "vitest";
import { acceptPublicQuote, publicQuoteSigningStatus } from "./public-quote";
function fixture(options: { status?: string; error?: { code: string }; concurrent?: boolean; native?: boolean; timestampOnly?: boolean } = {}) {
  const quote = { id: "quote", share_token: "token", job_id: null, status: options.status || "sent", signed_at: options.timestampOnly ? "2026-09-23T00:00:00Z" : null,
    customer_signature: null, customer_name: "Synthetic Customer", quote_group_id: null, meta: options.native ? { native_delivery_id: "delivery", native_frozen_line_totals: { line: { quantity: 1, total: 450 } } } : {} };
  const design = { id: "design", product_id: "roller", unit_price: 450, price_status: "ok", price_breakdown: {}, details: {}, surcharges: [], motorization: [] };
  const lines = [{ id: "line", quote_id: "quote", room: "Kitchen", quantity: 1, sort_order: 0, selected_design_id: "design", discount_percent: 0, designs: [design] }];
  let attempted = false;
  const mutations = vi.fn();
  const rpc = vi.fn(async () => { mutations(); attempted = true; return { data: [], error: options.error || null }; });
  const db = { rpc, from(table: string) {
    let writing = false;
    const result = () => {
      if (writing) { attempted = true; return { data: [], error: options.error || null }; }
      return { data: table === "crm_quotes" ? (attempted && options.concurrent ? { ...quote, signed_at: "2026-09-23T00:00:00Z", customer_signature: "Original signer" } : quote)
        : table === "crm_quote_line_items" ? lines : [], error: null };
    };
    const builder = { select: () => builder, eq: () => builder, is: () => builder,
      update: () => { writing = true; mutations(); return builder; },
      maybeSingle: async () => result(),
      then(resolve: (r: ReturnType<typeof result>) => unknown) { return Promise.resolve(resolve(result())); },
    };
    return builder;
  } };
  return { db: db as unknown as Parameters<typeof acceptPublicQuote>[0], mutations, rpc };
}
const consent = { printedName: "Synthetic Customer", signature: "Synthetic Customer", acknowledgedTotal: 450, notify: false };
describe("signature claims require evidence for this exact contract", () => {
  it.each([undefined, { code: "23505" }])("rejects an unsigned empty/conflicting claim instead of reporting signed", async error => {
    const { db } = fixture({ error });
    await expect(acceptPublicQuote(db, "token", consent)).rejects.toMatchObject({ status: 409 });
  });
  it.each([undefined, { code: "23505" }])("accepts a concurrent repeat only when this contract has a persisted signature", async error => {
    const { db } = fixture({ error, concurrent: true });
    await expect(acceptPublicQuote(db, "token", consent)).resolves.toEqual({ ok: true, alreadySigned: true });
  });
  it("treats empty native RPC result as unconfirmed", async () => {
    const { db, rpc } = fixture({ native: true });
    await expect(acceptPublicQuote(db, "token", consent)).rejects.toMatchObject({ status: 409 });
    expect(rpc).toHaveBeenCalledWith("accept_native_quote_delivery", expect.anything());
  });
  it.each(["archived", "lost"])("rejects %s contracts before any mutation", async status => {
    const { db, mutations } = fixture({ status });
    await expect(acceptPublicQuote(db, "token", consent)).rejects.toMatchObject({ status: 409 });
    expect(mutations).not.toHaveBeenCalled();
  });
  it.each([NaN, Infinity, 0, -1])("rejects invalid acknowledged total %s", async acknowledgedTotal => {
    const { db, mutations } = fixture();
    await expect(acceptPublicQuote(db, "token", { ...consent, acknowledgedTotal })).rejects.toMatchObject({ status: 400 });
    expect(mutations).not.toHaveBeenCalled();
  });
  it("does not treat a manually recorded sale timestamp as an electronic signature", async () => {
    const { db, mutations } = fixture({ timestampOnly: true });
    expect(await publicQuoteSigningStatus(db, "token")).toMatchObject({ signed: false });
    expect(mutations).not.toHaveBeenCalled();
  });
});
