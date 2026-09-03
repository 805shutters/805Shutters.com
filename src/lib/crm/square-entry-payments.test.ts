import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { reconcileSquareEntryPayment } from "./square-entry-payments";
import type { SquarePaymentFacts } from "@/lib/finance/square";
import { fetchSquareOrderFacts, fetchSquarePaymentFacts } from "@/lib/finance/square";
import { getSupabaseServiceClient } from "@/lib/supabase-server";
import { reconcileVerifiedSquareOrderPayment } from "@/lib/crm/square-payments";
import { POST } from "@/app/api/webhooks/square/route";

vi.mock("@/lib/supabase-server", () => ({ getSupabaseServiceClient: vi.fn() }));
vi.mock("@/lib/crm/square-contract-reminders", () => ({ scheduleSquareContractReminder: vi.fn() }));
vi.mock("@/lib/crm/square-payments", () => ({ reconcileVerifiedSquareOrderPayment: vi.fn().mockResolvedValue({ status: "recorded", quoteId: "quote-1" }) }));
vi.mock("@/lib/finance/square", async (original) => ({
  ...await original<typeof import("@/lib/finance/square")>(),
  fetchSquareOrderFacts: vi.fn(),
  fetchSquarePaymentFacts: vi.fn(),
  getSquareWebhookConfig: () => ({ webhookUrl: "https://test.invalid/api/webhooks/square", signingKey: "test-signing-key" }),
}));
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fetchSquarePaymentFacts).mockResolvedValue({ ...facts, status: "COMPLETED" });
  vi.mocked(fetchSquareOrderFacts).mockResolvedValue({ bookkeepingEntryId: "entry-1", quoteId: null, jobId: null, paymentType: "deposit", expectedAmountCents: 30000, currency: "USD" });
});

const facts: SquarePaymentFacts = { squarePaymentId: "square-1", amountCents: 30000,
  currency: "USD", jobId: null, eventId: null, receiptUrl: null, refundedAmountCents: 0, bookkeepingEntryId: "entry-1", quoteId: null, paymentType: "deposit", orderId: "order-1", paidAt: "2026-09-03T15:00:00Z" };

function fixture(options: { duplicate?: Record<string, unknown>; race?: boolean; source?: string; deleted?: boolean } = {}) {
  const inserts: Record<string, unknown>[] = [];
  const reads: Array<{ table: string; filters: Record<string, unknown> }> = [];
  let attempted = false;
  const from = (table: string) => {
    const filters: Record<string, unknown> = {};
    const query = {
      upsert: () => Promise.resolve({ error: null }),
      select: () => query, eq: (key: string, value: unknown) => { filters[key] = value; return query; }, maybeSingle: () => query,
      insert: (record: Record<string, unknown>) => { attempted = true; inserts.push(record); return Promise.resolve({ error: options.race ? { code: "23505", message: "duplicate" } : null }); },
      then(resolve: (value: unknown) => unknown) {
        reads.push({ table, filters });
        return Promise.resolve(resolve({ data: table === "crm_quote_bookkeeping_entries"
          ? { id: "entry-1", source: options.source || "legacy_sheet", job_id: "job-1", meta: options.deleted ? { deleted_at: "2026-01-01" } : {} }
          : options.duplicate || (options.race && attempted ? { id: "winner", bookkeeping_entry_id: "entry-1", quote_id: null, amount: 300 } : null), error: null }));
      },
    };
    return query;
  };
  return { supabase: { from } as unknown as SupabaseClient, inserts, reads };
}

describe("Square entry reconciliation", () => {
  it("records to exactly one entry ledger and never updates operational stage", async () => {
    const { supabase, inserts, reads } = fixture();
    await expect(reconcileSquareEntryPayment(supabase, facts)).resolves.toMatchObject({ status: "recorded", paymentLabel: "Deposit" });
    expect(inserts).toEqual([expect.objectContaining({ bookkeeping_entry_id: "entry-1", quote_id: null,
      job_id: "job-1", amount: 300, payment_type: "credit_card", payment_label: "Deposit", paid_at: "2026-09-03",
      external_source: "square", external_id: "square-1" })]);
    expect(reads.every((read) => !["crm_quotes", "crm_jobs"].includes(read.table))).toBe(true);
  });
  it("records an explicitly labeled balance payment", async () => {
    const { supabase, inserts } = fixture();
    await reconcileSquareEntryPayment(supabase, { ...facts, paymentType: "balance" });
    expect(inserts[0].payment_label).toBe("Balance payment");
  });
  it("does not record a duplicate payment", async () => {
    const { supabase, inserts } = fixture({ duplicate: { id: "existing", bookkeeping_entry_id: "entry-1", quote_id: null, amount: 300 } });
    await expect(reconcileSquareEntryPayment(supabase, facts)).resolves.toMatchObject({ status: "duplicate" });
    expect(inserts).toHaveLength(0);
  });
  it("handles a concurrent retry through the existing global unique index", async () => {
    await expect(reconcileSquareEntryPayment(fixture({ race: true }).supabase, facts)).resolves.toMatchObject({ status: "duplicate" });
  });
  it("rejects a duplicate id assigned to another ledger", async () => {
    const { supabase, inserts } = fixture({ duplicate: { id: "existing", bookkeeping_entry_id: "entry-2", amount: 300 } });
    await expect(reconcileSquareEntryPayment(supabase, facts)).rejects.toThrow("different ledger");
    expect(inserts).toHaveLength(0);
  });
  it.each([
    [{ ...facts, quoteId: "quote-1" }, "exactly one"],
    [{ ...facts, paymentType: null }, "type is missing"],
    [{ ...facts, amountCents: 0 }, "amount is invalid"],
    [{ ...facts, amountCents: 1.5 }, "amount is invalid"],
  ])("rejects ambiguous or invalid metadata", async (value, error) => {
    const { supabase, inserts } = fixture();
    await expect(reconcileSquareEntryPayment(supabase, value)).rejects.toThrow(error);
    expect(inserts).toHaveLength(0);
  });
  it("rejects deleted and quote-owned ledgers", async () => {
    await expect(reconcileSquareEntryPayment(fixture({ deleted: true }).supabase, facts)).rejects.toThrow("missing or deleted");
    await expect(reconcileSquareEntryPayment(fixture({ source: "crm_quote" }).supabase, facts)).rejects.toThrow("quote-owned");
  });
});

describe("Square webhook entry routing", () => {
  function request(payment: Record<string, unknown>, signature = true) {
    const body = JSON.stringify({ type: "payment.updated", data: { object: { payment: {
      id: "square-1", status: "COMPLETED", amount_money: { amount: 30000 }, created_at: facts.paidAt, ...payment,
    } } } });
    const signed = createHmac("sha256", "test-signing-key").update(`https://test.invalid/api/webhooks/square${body}`).digest("base64");
    return new NextRequest("https://test.invalid/api/webhooks/square", { method: "POST", body,
      headers: { "x-square-hmacsha256-signature": signature ? signed : "invalid" } });
  }
  it("routes the API-verified entry identity without invoking quote reconciliation", async () => {
    const { supabase, inserts } = fixture(); vi.mocked(getSupabaseServiceClient).mockReturnValue(supabase);
    const response = await POST(request({ metadata: { bookkeeping_entry_id: "entry-1", payment_type: "deposit" } }));
    expect(response.status).toBe(200);
    expect((await response.json()).results[0]).toMatchObject({ status: "recorded", bookkeepingEntryId: "entry-1" });
    expect(fetchSquarePaymentFacts).toHaveBeenCalledWith("square-1");
    expect(fetchSquareOrderFacts).toHaveBeenCalledWith("order-1");
    expect(inserts).toHaveLength(1); expect(reconcileVerifiedSquareOrderPayment).not.toHaveBeenCalled();
  });
  it("retrieves an entry identity from the Square order when the event omits metadata", async () => {
    const { supabase, inserts } = fixture(); vi.mocked(getSupabaseServiceClient).mockReturnValue(supabase);
    vi.mocked(fetchSquareOrderFacts).mockResolvedValue({ bookkeepingEntryId: "entry-1", quoteId: null, jobId: null, paymentType: "balance", expectedAmountCents: 30000, currency: "USD" });
    expect((await POST(request({ order_id: "order-1" }))).status).toBe(200);
    expect(fetchSquareOrderFacts).toHaveBeenCalledWith("order-1");
    expect(inserts[0]).toMatchObject({ bookkeeping_entry_id: "entry-1", quote_id: null, payment_label: "Balance payment" });
    expect(reconcileVerifiedSquareOrderPayment).not.toHaveBeenCalled();
  });
  it("ignores forged event identity and uses the API verified entry", async () => {
    const { supabase, inserts } = fixture(); vi.mocked(getSupabaseServiceClient).mockReturnValue(supabase);
    expect((await POST(request({ metadata: { bookkeeping_entry_id: "forged-entry", payment_type: "balance" } }))).status).toBe(200);
    expect(inserts[0]).toMatchObject({ bookkeeping_entry_id: "entry-1", payment_label: "Deposit" });
  });
  it.each([{ expectedAmountCents: 30100 }, { currency: "CAD" }, { quoteId: "ambiguous-quote" }])("rejects inconsistent API order facts %j", async (patch) => {
    const { supabase, inserts } = fixture(); vi.mocked(getSupabaseServiceClient).mockReturnValue(supabase);
    vi.mocked(fetchSquareOrderFacts).mockResolvedValue({ bookkeepingEntryId: "entry-1", quoteId: null, jobId: null, paymentType: "deposit", expectedAmountCents: 30000, currency: "USD", ...patch });
    expect((await POST(request({ order_id: "order-1" }))).status).toBe(500);
    expect(inserts).toHaveLength(0);
  });
  it("preserves the existing quote route", async () => {
    vi.mocked(getSupabaseServiceClient).mockReturnValue(fixture().supabase);
    vi.mocked(fetchSquareOrderFacts).mockResolvedValue({ quoteId: "quote-1", jobId: "job-1", paymentType: "deposit", expectedAmountCents: 30000, currency: "USD" });
    expect((await POST(request({ metadata: { quote_id: "quote-1", payment_type: "deposit" } }))).status).toBe(200);
    expect(reconcileVerifiedSquareOrderPayment).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ order: expect.objectContaining({ quoteId: "quote-1" }) }));
  });
  it("rejects an invalid signature without touching either ledger", async () => {
    const { supabase, inserts, reads } = fixture(); vi.mocked(getSupabaseServiceClient).mockReturnValue(supabase);
    expect((await POST(request({ metadata: { bookkeeping_entry_id: "entry-1", payment_type: "deposit" } }, false))).status).toBe(401);
    expect(inserts).toHaveLength(0); expect(reads).toHaveLength(0); expect(reconcileVerifiedSquareOrderPayment).not.toHaveBeenCalled();
  });
});
