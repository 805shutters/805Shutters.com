import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { beforeEach, expect, it, vi } from "vitest";
import { CrmAuthError, requireCrmUser } from "@/lib/crm/auth";
import { stripeConfig } from "@/lib/finance/stripe";
import { createSquarePaymentLink } from "@/lib/finance/square";
import { syncStripeFinance } from "@/lib/crm/stripe-finance";
import { syncSquareFinance } from "@/lib/crm/square-finance";
import { GET } from "./route";

vi.mock("@/lib/crm/auth", async () => ({
  ...(await vi.importActual("@/lib/crm/auth")),
  requireCrmUser: vi.fn(),
}));
vi.mock("@/lib/finance/stripe", () => ({ stripeConfig: vi.fn(), stripeRecord: vi.fn() }));
vi.mock("@/lib/finance/square", () => ({
  createSquarePaymentLink: vi.fn(),
  retireSquarePaymentLink: vi.fn(),
  squareEnvironment: vi.fn(),
}));
vi.mock("@/lib/crm/stripe-finance", () => ({ syncStripeFinance: vi.fn() }));
vi.mock("@/lib/crm/square-finance", () => ({ syncSquareFinance: vi.fn(), squareFinanceRows: vi.fn() }));
vi.mock("@/lib/crm/stripe-collection", () => ({ retireStripePaymentLink: vi.fn() }));

const writes = {
  insert: vi.fn(),
  update: vi.fn(),
  upsert: vi.fn(),
  delete: vi.fn(),
  rpc: vi.fn(),
};
const from = vi.fn();

function tables() {
  return {
    crm_square_requests: [
      { environment: "production", id: "open-link", order_id: "order-open", quote_id: "open", amount_cents: 25000, payment_type: "deposit", url: "https://square.example/open", created_at: "2026-02-01T00:00:00.000Z" },
      { environment: "production", id: "paid-link", quote_id: "paid", amount_cents: 50000, payment_type: "balance", url: "https://square.example/paid", created_at: "2026-02-01T00:00:00.000Z" },
      { environment: "production", id: "cleared-link", quote_id: "cleared", amount_cents: 80000, payment_type: "deposit", url: "https://square.example/cleared", created_at: "2026-02-01T00:00:00.000Z" },
      { environment: "sandbox", id: "sandbox-link", quote_id: "sandbox", amount_cents: 80000, payment_type: "deposit", url: "https://square.example/sandbox", created_at: "2026-02-01T00:00:00.000Z" },
      { environment: "production", id: "unsigned-link", quote_id: "unsigned", amount_cents: 10000, payment_type: "deposit", url: "https://square.example/unsigned", created_at: "2026-02-01T00:00:00.000Z" },
      { environment: "production", id: "entry-link", quote_id: null, bookkeeping_entry_id: "entry-1", amount_cents: 10000, payment_type: "deposit", url: "https://square.example/entry", created_at: "2026-02-01T00:00:00.000Z" },
    ],
    crm_quotes: [
      { id: "open", job_id: "job-1", quote_number: "Q-34", status: "sold", quote_total: 1000, signed_at: "2026-01-15T00:00:00.000Z", customer_printed_name: "Ada Customer" },
      { id: "paid", job_id: "job-1", quote_number: "Q-35", status: "sold", quote_total: 500, signed_at: "2026-01-15T00:00:00.000Z" },
      { id: "cleared", job_id: "job-2", quote_number: "Q-36", status: "installed", quote_total: 800, signed_at: "2026-01-15T00:00:00.000Z" },
      { id: "sandbox", job_id: "job-2", quote_number: "Q-37", status: "sold", quote_total: 800, signed_at: "2026-01-15T00:00:00.000Z" },
      { id: "unsigned", job_id: "job-2", quote_number: "Q-38", status: "sent", quote_total: 800, signed_at: null, customer_signature: null },
    ],
    crm_quote_bookkeeping_payments: [{ id: "pay-1", quote_id: "paid", amount: 500 }],
    crm_quote_bookkeeping_credits: [],
    crm_card_migration_clearances: [{ target_id: "cleared", reviewed_through: "2026-03-01T00:00:00.000Z" }],
    crm_jobs: [
      { id: "job-1", customer_name: "Ada Customer" },
      { id: "job-2", customer_name: "Other Customer" },
    ],
  } as Record<string, Record<string, unknown>[]>;
}

function mockSupabase(rows = tables(), rangeResult?: { data: unknown[] | null; error: { message: string } | null }) {
  from.mockImplementation((table: string) => {
    const filters: Array<(row: Record<string, unknown>) => boolean> = [];
    const chain = {
      select: () => chain,
      eq: (column: string, value: unknown) => {
        filters.push((row) => row[column] === value);
        return chain;
      },
      in: (column: string, values: readonly unknown[]) => {
        const allowed = new Set(values);
        filters.push((row) => allowed.has(row[column]));
        return chain;
      },
      order: () => chain,
      range: (start: number, end: number) => {
        if (rangeResult) return Promise.resolve(rangeResult);
        const matched = (rows[table] || []).filter((row) => filters.every((keep) => keep(row)));
        return Promise.resolve({ data: matched.slice(start, end + 1), error: null });
      },
      insert: writes.insert,
      update: writes.update,
      upsert: writes.upsert,
      delete: writes.delete,
    };
    return chain;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSupabase();
  vi.mocked(requireCrmUser).mockResolvedValue({ supabase: { from, rpc: writes.rpc }, email: "805shutters@gmail.com" } as never);
});

const request = () => new NextRequest("https://fixture.invalid/api/crm/stripe/clearance-review/");

it("returns one row per signed open-balance quote with a production Square request and no covering clearance", async () => {
  const response = await GET(request());
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.rows.map((row: { quoteId: string }) => row.quoteId)).toEqual(["open"]);
  expect(body.rows[0]).toMatchObject({
    quoteNumber: "Q-34",
    customerName: "Ada Customer",
    quoteTotalCents: 100000,
    openBalanceCents: 100000,
    clearance: { state: "none" },
    squareRequests: [expect.objectContaining({ id: "open-link", amountCents: 25000, status: null })],
  });
  expect(JSON.stringify(body)).not.toContain("cleared-link");
  expect(JSON.stringify(body)).not.toContain("sandbox-link");
  expect(body.rows[0].clearance.evidence).toBeUndefined();
});

it("refuses a CRM user who is not Mike before reading the review", async () => {
  vi.mocked(requireCrmUser).mockResolvedValue({ supabase: { from, rpc: writes.rpc }, email: "jessica@805shutters.com" } as never);
  const response = await GET(request());
  expect(response.status).toBe(403);
  expect(await response.json()).toMatchObject({ message: "Only Mike can review Square clearances." });
  expect(from).not.toHaveBeenCalled();
  expect(writes.rpc).not.toHaveBeenCalled();
});

it("refuses a missing CRM session before reading the review", async () => {
  vi.mocked(requireCrmUser).mockRejectedValue(new CrmAuthError(401, "CRM session is required."));
  expect((await GET(request())).status).toBe(401);
  expect(from).not.toHaveBeenCalled();
});

it("makes no provider calls and no writes while reading the review", async () => {
  const response = await GET(request());
  expect(response.status).toBe(200);
  expect(stripeConfig).not.toHaveBeenCalled();
  expect(createSquarePaymentLink).not.toHaveBeenCalled();
  expect(syncStripeFinance).not.toHaveBeenCalled();
  expect(syncSquareFinance).not.toHaveBeenCalled();
  expect(writes.insert).not.toHaveBeenCalled();
  expect(writes.update).not.toHaveBeenCalled();
  expect(writes.upsert).not.toHaveBeenCalled();
  expect(writes.delete).not.toHaveBeenCalled();
  expect(writes.rpc).not.toHaveBeenCalled();
  const source = [
    readFileSync(new URL("./route.ts", import.meta.url), "utf8"),
    readFileSync(new URL("../../../../../lib/crm/stripe-clearance-review.ts", import.meta.url), "utf8"),
  ].join("\n");
  expect(source).not.toMatch(/@\/lib\/finance\/(?:stripe|square)/);
  expect(source).not.toMatch(/stripeConfig|createSquarePaymentLink|syncStripeFinance|syncSquareFinance|retireSquarePaymentLink|retireStripePaymentLink/);
  expect(source).not.toMatch(/\.(?:insert|update|upsert|delete|rpc)\s*\(/);
});

it("does not write when the review cannot be read", async () => {
  mockSupabase(tables(), { data: null, error: { message: "password=secret" } });
  const response = await GET(request());
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain("password=secret");
  expect(writes.insert).not.toHaveBeenCalled();
  expect(writes.rpc).not.toHaveBeenCalled();
  expect(stripeConfig).not.toHaveBeenCalled();
});

it("does not expose a bulk clearance endpoint", async () => {
  const route = await import("./route");
  expect(route.GET).toEqual(expect.any(Function));
  expect("POST" in route).toBe(false);
  expect("PUT" in route).toBe(false);
  expect("DELETE" in route).toBe(false);
  const names = files(join(process.cwd(), "src/app/api")).map((path) => path.split("/").join("/"));
  expect(names.filter((path) => /bulk|clear-all|clearance-all|blanket/i.test(path))).toEqual([]);
});

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  });
}
