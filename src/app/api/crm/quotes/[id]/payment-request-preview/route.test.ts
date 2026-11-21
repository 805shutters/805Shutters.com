import { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeEach, expect, it, vi } from "vitest";
import { requireCrmUser } from "@/lib/crm/auth";
import { loadPublicQuoteById } from "@/lib/crm/public-quote";
import { GET } from "./route";

const mocks = vi.hoisted(() => ({
  requireCrmUser: vi.fn(),
  loadPublicQuoteById: vi.fn(),
  stripeConfig: vi.fn(),
  stripeRequest: vi.fn(),
  verifyStripeAccount: vi.fn(),
  createSquarePaymentLink: vi.fn(),
  createStripePaymentLink: vi.fn(),
  createCardPaymentLink: vi.fn(),
}));

vi.mock("@/lib/crm/auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/crm/auth")>("@/lib/crm/auth");
  return { ...actual, requireCrmUser: mocks.requireCrmUser };
});
vi.mock("@/lib/crm/public-quote", () => ({ loadPublicQuoteById: mocks.loadPublicQuoteById }));
vi.mock("@/lib/finance/stripe", async () => {
  const actual = await vi.importActual<typeof import("@/lib/finance/stripe")>("@/lib/finance/stripe");
  return {
    ...actual,
    stripeConfig: mocks.stripeConfig,
    stripeRequest: mocks.stripeRequest,
    verifyStripeAccount: mocks.verifyStripeAccount,
  };
});
vi.mock("@/lib/finance/square", async () => {
  const actual = await vi.importActual<typeof import("@/lib/finance/square")>("@/lib/finance/square");
  return { ...actual, createSquarePaymentLink: mocks.createSquarePaymentLink };
});
vi.mock("@/lib/crm/stripe-collection", () => ({
  createStripePaymentLink: mocks.createStripePaymentLink,
  synchronizeStripeRequest: vi.fn(),
  retireStripePaymentLink: vi.fn(),
}));
vi.mock("@/lib/crm/card-payment-links", () => ({
  createCardPaymentLink: mocks.createCardPaymentLink,
  isCardConfigured: vi.fn(() => true),
}));

const QUOTE_ID = "11111111-1111-4111-8111-111111111111";
const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("unexpected provider call"));
afterAll(() => fetchSpy.mockRestore());

function memoryDb(extra: Record<string, Array<Record<string, unknown>>> = {}) {
  const tables: Record<string, Array<Record<string, unknown>>> = {
    crm_quote_bookkeeping_payments: [{ id: "pay-1", quote_id: QUOTE_ID, amount: 500, payment_label: "Deposit" }],
    crm_quote_bookkeeping_credits: [{ id: "credit-in", to_quote_id: QUOTE_ID, from_quote_id: "other-quote", amount: 250 }],
    crm_square_requests: [],
    crm_stripe_requests: [],
    crm_card_migration_clearances: [],
    ...extra,
  };
  const writes = vi.fn();
  const from = vi.fn((table: string) => {
    const filters: Array<[string, unknown]> = [];
    const rows = () => (tables[table] ?? []).filter((row) => filters.every(([column, value]) => row[column] === value));
    const api = {
      select: () => api,
      eq: (column: string, value: unknown) => {
        filters.push([column, value]);
        return api;
      },
      order: () => api,
      range: async (start: number, end: number) => ({ data: rows().slice(start, end + 1), error: null }),
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
      insert: (...args: unknown[]) => writes("insert", table, args),
      update: (...args: unknown[]) => writes("update", table, args),
      upsert: (...args: unknown[]) => writes("upsert", table, args),
      delete: (...args: unknown[]) => writes("delete", table, args),
    };
    return api;
  });
  return { client: { from, rpc: (...args: unknown[]) => writes("rpc", args) } as unknown as SupabaseClient, writes, from };
}

function quote(patch: Record<string, unknown> = {}) {
  return {
    customerName: "Ada Customer",
    customerEmail: "ada@example.test",
    signed: true,
    superseded: false,
    total: 4000,
    depositDue: 2000,
    ...patch,
  };
}

let db = memoryDb();

beforeEach(() => {
  vi.clearAllMocks();
  fetchSpy.mockClear();
  db = memoryDb();
  mocks.requireCrmUser.mockResolvedValue({ supabase: db.client, email: "staff@example.test", user: { id: "user-1" } });
  mocks.loadPublicQuoteById.mockResolvedValue(quote());
  mocks.stripeConfig.mockImplementation(() => {
    throw new Error("Stripe account, environment and restricted server key must agree.");
  });
});

function call(paymentType?: string, id = QUOTE_ID) {
  const url = new URL(`http://localhost/api/crm/quotes/${id}/payment-request-preview`);
  if (paymentType !== undefined) url.searchParams.set("paymentType", paymentType);
  return GET(new NextRequest(url), { params: Promise.resolve({ id }) });
}

function expectNoProviderOrWrite() {
  expect(db.writes).not.toHaveBeenCalled();
  expect(mocks.stripeRequest).not.toHaveBeenCalled();
  expect(mocks.verifyStripeAccount).not.toHaveBeenCalled();
  expect(mocks.createSquarePaymentLink).not.toHaveBeenCalled();
  expect(mocks.createStripePaymentLink).not.toHaveBeenCalled();
  expect(mocks.createCardPaymentLink).not.toHaveBeenCalled();
  expect(fetchSpy).not.toHaveBeenCalled();
}

it("returns the deposit a signed quote would collect", async () => {
  const response = await call("deposit");
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(await response.json()).toEqual({
    paymentType: "deposit",
    amount: 1500,
    outstanding: 3250,
    recipient: { name: "Ada Customer", email: "ada@example.test" },
    signed: true,
    superseded: false,
    blockingSquareRequests: [],
    openStripeRequest: null,
  });
  expect(requireCrmUser).toHaveBeenCalled();
  expect(loadPublicQuoteById).toHaveBeenCalledWith(db.client, QUOTE_ID);
  expectNoProviderOrWrite();
});

it("returns the balance and unsigned state without refusing the preview", async () => {
  mocks.loadPublicQuoteById.mockResolvedValue(quote({ signed: false }));
  const response = await call("balance");
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    paymentType: "balance",
    amount: 1750,
    outstanding: 3250,
    recipient: { name: "Ada Customer", email: "ada@example.test" },
    signed: false,
    superseded: false,
    blockingSquareRequests: [],
    openStripeRequest: null,
  });
  expectNoProviderOrWrite();
});

it("returns a superseded quote with the amount the send path would calculate", async () => {
  mocks.loadPublicQuoteById.mockResolvedValue(quote({ signed: false, superseded: true }));
  const response = await call("deposit");
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    amount: 1500,
    outstanding: 3250,
    signed: false,
    superseded: true,
    blockingSquareRequests: [],
    openStripeRequest: null,
  });
  expectNoProviderOrWrite();
});

it("lists blocking production Square requests and their clearance state", async () => {
  db = memoryDb({
    crm_square_requests: [
      { id: "sq-sandbox", environment: "sandbox", quote_id: QUOTE_ID, bookkeeping_entry_id: null, created_at: "2026-01-01T00:00:00.000Z" },
      { id: "sq-other", environment: "production", quote_id: "other-quote", bookkeeping_entry_id: null, created_at: "2026-01-01T00:00:00.000Z" },
      { id: "sq-b", environment: "production", quote_id: QUOTE_ID, bookkeeping_entry_id: null, created_at: "2026-06-01T00:00:00.000Z" },
      { id: "sq-a", environment: "production", quote_id: QUOTE_ID, bookkeeping_entry_id: null, created_at: "2026-04-01T00:00:00.000Z" },
    ],
  });
  mocks.requireCrmUser.mockResolvedValue({ supabase: db.client, email: "staff@example.test", user: { id: "user-1" } });
  const response = await call("deposit");
  expect(response.status).toBe(200);
  expect((await response.json()).blockingSquareRequests).toEqual([
    { id: "sq-a", createdAt: "2026-04-01T00:00:00.000Z", clearanceState: "absent", reviewedThrough: null },
    { id: "sq-b", createdAt: "2026-06-01T00:00:00.000Z", clearanceState: "absent", reviewedThrough: null },
  ]);
  expectNoProviderOrWrite();
});

it("reports a stale clearance and omits Square requests the guard would allow", async () => {
  db = memoryDb({
    crm_square_requests: [
      { id: "sq-covered", environment: "production", quote_id: QUOTE_ID, bookkeeping_entry_id: null, created_at: "2026-02-01T00:00:00.000Z" },
      { id: "sq-new", environment: "production", quote_id: QUOTE_ID, bookkeeping_entry_id: null, created_at: "2026-06-01T00:00:00.000Z" },
    ],
    crm_card_migration_clearances: [{ target_id: QUOTE_ID, reviewed_through: "2026-03-01T00:00:00.000Z" }],
  });
  mocks.requireCrmUser.mockResolvedValue({ supabase: db.client, email: "staff@example.test", user: { id: "user-1" } });
  const response = await call("deposit");
  expect((await response.json()).blockingSquareRequests).toEqual([
    { id: "sq-new", createdAt: "2026-06-01T00:00:00.000Z", clearanceState: "stale", reviewedThrough: "2026-03-01T00:00:00.000Z" },
  ]);
  expectNoProviderOrWrite();
});

it("returns the open Stripe request the reservation guard would resume", async () => {
  db = memoryDb({
    crm_stripe_requests: [
      { id: "st_paid", account_id: "acct_fixture", livemode: true, quote_id: QUOTE_ID, bookkeeping_entry_id: null, status: "paid", purpose: "deposit", amount_cents: 100, session_id: "cs_paid", created_at: "2026-10-01T00:00:00.000Z" },
      { id: "st_other", account_id: "acct_other", livemode: true, quote_id: QUOTE_ID, bookkeeping_entry_id: null, status: "open", purpose: "balance", amount_cents: 50, session_id: "cs_other", created_at: "2026-11-02T00:00:00.000Z" },
      { id: "st_testmode", account_id: "acct_fixture", livemode: false, quote_id: QUOTE_ID, bookkeeping_entry_id: null, status: "creating", purpose: "deposit", amount_cents: 50, session_id: null, created_at: "2026-11-03T00:00:00.000Z" },
      { id: "st_open", account_id: "acct_fixture", livemode: true, quote_id: QUOTE_ID, bookkeeping_entry_id: null, status: "open", purpose: "deposit", amount_cents: 150000, session_id: "cs_open", created_at: "2026-11-01T00:00:00.000Z" },
    ],
  });
  mocks.requireCrmUser.mockResolvedValue({ supabase: db.client, email: "staff@example.test", user: { id: "user-1" } });
  mocks.stripeConfig.mockReturnValue({ account: "acct_fixture", livemode: true, environment: "live", key: "sk_live_fixture" });
  const response = await call("deposit");
  const body = await response.json();
  expect(body.openStripeRequest).toEqual({
    id: "st_open",
    accountId: "acct_fixture",
    livemode: true,
    status: "open",
    purpose: "deposit",
    amountCents: 150000,
    sessionId: "cs_open",
    createdAt: "2026-11-01T00:00:00.000Z",
  });
  expect(JSON.stringify(body)).not.toContain("sk_live_fixture");
  expectNoProviderOrWrite();
});

it.each([undefined, "", "full", "Deposit"])("rejects paymentType %j before reading the quote", async (paymentType) => {
  const response = await call(paymentType);
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ message: "Choose either a deposit or balance payment link." });
  expect(loadPublicQuoteById).not.toHaveBeenCalled();
  expect(db.from).not.toHaveBeenCalled();
  expectNoProviderOrWrite();
});

it("returns 404 when the quote is missing and does not read payment rows", async () => {
  mocks.loadPublicQuoteById.mockResolvedValue(null);
  const response = await call("balance");
  expect(response.status).toBe(404);
  expect(await response.json()).toEqual({ message: "Quote was not found." });
  expect(db.from).not.toHaveBeenCalled();
  expectNoProviderOrWrite();
});
