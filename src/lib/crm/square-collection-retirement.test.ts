import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { retireLegacySquareRequests } from "./square-collection-retirement";
const target = { quoteId: "quote", jobId: "job" };
const missing = () => Response.json({ errors: [{ code: "NOT_FOUND" }] }, { status: 404 });
let removed: boolean;
let order: Record<string, unknown>;
let payment: Record<string, unknown>;
let invoices: Record<string, unknown>[];
let subscriptions: Record<string, unknown>[];
let failure: string;
let calls: string[];
function database(options: { ledger?: number; plan?: unknown; rpcError?: boolean; changed?: boolean } = {}) {
  let reads = 0;
  const row = { id: "link", order_id: "order", quote_id: "quote", bookkeeping_entry_id: null, amount_cents: 10000, created_at: "2026-09-23T00:00:00Z" };
  return {
    rpc: vi.fn().mockResolvedValue({ error: options.rpcError ? {} : null }),
    from: vi.fn((table: string) => {
      const q: any = { select: () => q, eq: () => q, order: () => q, limit: () => q, maybeSingle: () => q,
        then: (resolve: (value: unknown) => unknown) => {
          const data = table === "crm_square_requests" ? [{ ...row, ...(options.changed && reads++ > 0 ? { id: "new-link" } : {}) }]
            : table === "crm_jobs" ? { id: "job", meta: { payment_plan: options.plan } }
            : [{ id: "receipt", amount: options.ledger ?? 100 }];
          return Promise.resolve({ data, error: null }).then(resolve);
        } };
      return q;
    }),
  } as unknown as SupabaseClient;
}
beforeEach(() => {
  vi.stubEnv("VERCEL_ENV", "production");
  vi.stubEnv("SQUARE_ENV", "production"); vi.stubEnv("SQUARE_ACCESS_TOKEN", "fixture"); vi.stubEnv("SQUARE_LOCATION_ID", "location");
  removed = false; failure = ""; calls = []; invoices = []; subscriptions = [];
  order = { id: "order", location_id: "location", metadata: { quote_id: "quote", job_id: "job" }, state: "COMPLETED", total_money: { amount: 10000, currency: "USD" }, tenders: [{ payment_id: "payment" }] };
  payment = { id: "payment", order_id: "order", location_id: "location", status: "COMPLETED", total_money: { amount: 10000, currency: "USD" } };
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    const path = new URL(url).pathname; calls.push(`${init.method} ${path}`);
    if (failure === `${init.method} ${path}`) return Response.json({}, { status: 503 });
    if (path === "/v2/locations/location") return Response.json({ location: { id: "location", status: "ACTIVE" } });
    if (path === "/v2/invoices") return Response.json({ invoices });
    if (path === "/v2/subscriptions/search") return Response.json({ subscriptions });
    if (path === "/v2/orders/order") return Response.json({ order });
    if (path === "/v2/payments/payment") return Response.json({ payment });
    if (path === "/v2/online-checkout/payment-links/link") {
      if (init.method === "DELETE") { removed = true; if (!(order.tenders as unknown[])?.length) order.state = "CANCELED"; return Response.json({ id: "link" }); }
      return removed ? missing() : Response.json({ payment_link: { id: "link", order_id: "order" } });
    }
    throw new Error(`Unexpected provider path ${path}`);
  }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it("retires the exact paid link only after receipt verification, then records readback evidence", async () => {
  const db = database();
  await expect(retireLegacySquareRequests(db, target)).resolves.toEqual({ retired: 1 });
  expect(calls.indexOf("GET /v2/payments/payment")).toBeLessThan(calls.indexOf("DELETE /v2/online-checkout/payment-links/link"));
  expect(calls.at(-1)).toBe("GET /v2/payments/payment");
  expect(db.rpc).toHaveBeenCalledWith("clear_stripe_migration_target", expect.objectContaining({ p_target: "quote", p_evidence: expect.stringContaining('"paymentIds":["payment"]') }));
  expect(calls.filter(c => c.startsWith("POST"))).toEqual(["POST /v2/subscriptions/search"]);
});
it("can retire an unpaid exact order without posting a receipt", async () => {
  order.state = "OPEN"; order.tenders = [];
  const db = database(); await retireLegacySquareRequests(db, target);
  expect(vi.mocked(db.from).mock.calls.map(c => c[0])).not.toContain("crm_quote_bookkeeping_payments");
});
it("accepts an already missing link only with its verified exact order", async () => {
  removed = true; await retireLegacySquareRequests(database(), target);
  expect(calls.some(c => c.startsWith("DELETE"))).toBe(false);
});
it.each(["pending", "refund", "mismatch", "ledger", "invoice", "subscription", "mandate"])("holds %s before any deletion or clearance", async (reason) => {
  if (reason === "pending") payment.status = "APPROVED";
  if (reason === "refund") payment.refunded_money = { amount: 1 };
  if (reason === "mismatch") order.metadata = { quote_id: "different", job_id: "job" };
  if (reason === "invoice") invoices = [{ status: "UNPAID" }];
  if (reason === "subscription") subscriptions = [{ status: "ACTIVE" }];
  const db = database({ ledger: reason === "ledger" ? 50 : 100, plan: reason === "mandate" ? { method: "square_autopay", status: "active" } : undefined });
  await expect(retireLegacySquareRequests(db, target)).rejects.toMatchObject({ status: 409 });
  expect(calls.some(c => c.startsWith("DELETE"))).toBe(false); expect(db.rpc).not.toHaveBeenCalled();
});
it.each(["GET /v2/invoices", "GET /v2/orders/order", "DELETE /v2/online-checkout/payment-links/link"])("holds provider failure %s", async (at) => {
  failure = at; const db = database();
  await expect(retireLegacySquareRequests(db, target)).rejects.toMatchObject({ status: 409 }); expect(db.rpc).not.toHaveBeenCalled();
});
it("does not clear newly changed historical requests", async () => {
  const db = database({ changed: true }); await expect(retireLegacySquareRequests(db, target)).rejects.toThrow("changed"); expect(db.rpc).not.toHaveBeenCalled();
});
it("refuses a sandbox connection", async () => {
  vi.stubEnv("SQUARE_ENV", "sandbox"); await expect(retireLegacySquareRequests(database(), target)).rejects.toMatchObject({ status: 409 }); expect(fetch).not.toHaveBeenCalled();
});
it("does not claim clearance when evidence could not be saved", async () => {
  await expect(retireLegacySquareRequests(database({ rpcError: true }), target)).rejects.toThrow("could not be saved");
});

it("refuses production retirement from a preview deployment", async () => {
  vi.stubEnv("VERCEL_ENV", "preview"); await expect(retireLegacySquareRequests(database(), target)).rejects.toMatchObject({ status: 409 }); expect(fetch).not.toHaveBeenCalled();
});

it("accepts a fully paid OPEN order only with completed matched receipts and post-retirement readback", async () => {
  order.state = "OPEN";
  await expect(retireLegacySquareRequests(database(), target)).resolves.toEqual({ retired: 1 });
  expect(calls.filter(c => c === "GET /v2/payments/payment")).toHaveLength(2);
});
it("does not clear a missing link whose unpaid order remains open", async () => {
  removed = true; order.state = "OPEN"; order.tenders = [];
  const db = database();
  await expect(retireLegacySquareRequests(db, target)).rejects.toThrow("not been canceled");
  expect(db.rpc).not.toHaveBeenCalled();
});
it("holds payment changes discovered after link retirement", async () => {
  const original = vi.mocked(fetch).getMockImplementation()!;
  vi.mocked(fetch).mockImplementation(async (...args) => {
    if (removed && new URL(String(args[0])).pathname === "/v2/payments/payment") payment.refunded_money = { amount: 1 };
    return original(...args);
  });
  const db = database();
  await expect(retireLegacySquareRequests(db, target)).rejects.toThrow("refunded");
  expect(db.rpc).not.toHaveBeenCalled();
});
