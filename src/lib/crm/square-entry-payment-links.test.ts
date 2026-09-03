import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { CrmAuthError, requireCrmUser } from "@/lib/crm/auth";
import { recordCrmActivity } from "@/lib/crm/backend";
import { POST } from "@/app/api/crm/bookkeeping/[id]/square-payment-link/route";
import { sendSquareEntryPaymentLink } from "./square-entry-payment-links";
import { createSquarePaymentLink, isSquareConfigured } from "@/lib/finance/square";
import { sendEmail } from "@/lib/notify/email";

vi.mock("@/lib/crm/backend", () => ({ recordCrmActivity: vi.fn().mockResolvedValue({ recorded: true }) }));
vi.mock("@/lib/crm/auth", async (original) => ({ ...await original<typeof import("@/lib/crm/auth")>(), requireCrmUser: vi.fn() }));
vi.mock("@/lib/finance/square", async (original) => ({
  ...await original<typeof import("@/lib/finance/square")>(),
  isSquareConfigured: vi.fn(() => true),
  createSquarePaymentLink: vi.fn().mockResolvedValue({ id: "link-1", url: "https://square.link/u/test" }),
}));
vi.mock("@/lib/notify/email", () => ({
  buildSquareOrderPaymentEmail: vi.fn(() => ({ subject: "Payment request", html: "preview", text: "preview" })),
  sendEmail: vi.fn().mockResolvedValue({ sent: true }),
}));

function fixture(options: { entry?: Record<string, unknown>; quote?: Record<string, unknown>; job?: Record<string, unknown>; failLedger?: boolean } = {}) {
  const calls: Array<{ table: string; filters: Record<string, unknown> }> = [];
  const entry = { id: "entry-1", source: "legacy_sheet", customer_name: "Test customer", total_amount: 1000,
    job_id: null, quote_id: null, meta: { customer_email: "exact@example.com", deposit_required: 400 }, ...options.entry };
  const from = (table: string) => {
    const filters: Record<string, unknown> = {};
    let offset = 0;
    const query = {
      select: () => query, eq: (key: string, value: unknown) => { filters[key] = value; return query; },
      order: () => query, range: (start: number) => { offset = start; return query; },
      maybeSingle: () => query,
      then(resolve: (value: unknown) => unknown) {
        calls.push({ table, filters: { ...filters } });
        let data: unknown = null;
        if (table === "crm_quote_bookkeeping_entries") data = entry;
        else if (table === "crm_quotes") data = options.quote || { id: "quote-1", job_id: "job-1", customer_email: "quote@example.com" };
        else if (table === "crm_jobs") data = options.job || { id: "job-1", email: "job@example.com" };
        else if (table.endsWith("payments")) data = offset ? [] : [{ amount: 100, payment_label: "Deposit" }];
        else data = offset || !filters.to_bookkeeping_entry_id ? [] : [{ amount: 10 }];
        return Promise.resolve(resolve({ data, error: options.failLedger && table.endsWith("payments") ? { message: "offline" } : null }));
      },
    };
    return query;
  };
  return { supabase: { from } as unknown as SupabaseClient, calls };
}
const actor = { email: "805@805shutters.com", userId: "staff-1" };
const confirmation = { expectedAmount: 300, expectedRecipient: "exact@example.com" };

beforeEach(() => { vi.clearAllMocks(); vi.mocked(isSquareConfigured).mockReturnValue(true); });

describe("standalone entry Square requests", () => {
  it("uses the exact entry ledger and branded sender, not a quote ledger", async () => {
    const { supabase, calls } = fixture();
    const result = await sendSquareEntryPaymentLink(supabase, "entry-1", "deposit", actor, confirmation);
    expect(result).toMatchObject({ amount: 300, recipient: "exact@example.com", email: { sent: true } });
    expect(createSquarePaymentLink).toHaveBeenCalledWith(expect.objectContaining({ bookkeepingEntryId: "entry-1", amountCents: 30000 }));
    expect(vi.mocked(createSquarePaymentLink).mock.calls[0][0]).not.toHaveProperty("quoteId");
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ from: "805 Shutters <805@805shutters.com>", to: "exact@example.com" }));
    expect(calls.filter((call) => call.table.endsWith("payments")).every((call) => call.filters.bookkeeping_entry_id === "entry-1")).toBe(true);
  });
  it("subtracts the credit and unpaid deposit from the balance request", async () => {
    await expect(sendSquareEntryPaymentLink(fixture().supabase, "entry-1", "balance", actor,
      { ...confirmation, expectedAmount: 590 })).resolves.toMatchObject({ amount: 590 });
  });
  it("supports an imported entry linked to an exact quote without using its ledger", async () => {
    const { supabase, calls } = fixture({ entry: { quote_id: "quote-1", job_id: "job-1", meta: { deposit_required: 400 } } });
    await sendSquareEntryPaymentLink(supabase, "entry-1", "deposit", actor, { expectedAmount: 300, expectedRecipient: "quote@example.com" });
    expect(calls.find((call) => call.table === "crm_quotes")?.filters).toEqual({ id: "quote-1" });
    expect(calls.find((call) => call.table === "crm_jobs")?.filters).toEqual({ id: "job-1" });
  });
  it("uses linked job email only through its exact ID", async () => {
    await sendSquareEntryPaymentLink(fixture({ entry: { job_id: "job-1", meta: { deposit_required: 400 } } }).supabase,
      "entry-1", "deposit", actor, { expectedAmount: 300, expectedRecipient: "job@example.com" });
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "job@example.com" }));
  });
  it.each([
    [{ entry: { source: "crm_quote" } }, "Use this job's CRM quote"],
    [{ entry: { meta: {} } }, "valid customer email"],
    [{ entry: { quote_id: "quote-1", job_id: "different-job" } }, "links disagree"],
    [{ entry: { meta: { deleted_at: "2026-01-01" } } }, "not found"],
    [{ failLedger: true }, "balance could not be verified"],
    [{ entry: { quote_id: "quote-1" }, quote: { id: "quote-1", meta: { deleted_at: "2026-01-01" } } }, "quote was deleted"],
    [{ entry: { job_id: "job-1" }, job: { id: "job-1", meta: { deleted_at: "2026-01-01" } } }, "job was deleted"],
  ])("fails closed before provider or email calls: %j", async (options, error) => {
    await expect(sendSquareEntryPaymentLink(fixture(options).supabase, "entry-1", "deposit", actor, confirmation)).rejects.toThrow(error);
    expect(createSquarePaymentLink).not.toHaveBeenCalled(); expect(sendEmail).not.toHaveBeenCalled();
  });
  it("rejects missing confirmation and stale amounts/recipients", async () => {
    for (const value of [undefined, { ...confirmation, expectedAmount: 310 }, { ...confirmation, expectedRecipient: "wrong@example.com" }]) {
      await expect(sendSquareEntryPaymentLink(fixture().supabase, "entry-1", "deposit", actor, value!)).rejects.toThrow();
    }
    expect(createSquarePaymentLink).not.toHaveBeenCalled();
  });
  it("preserves a successful send when activity logging fails", async () => {
    vi.mocked(recordCrmActivity).mockRejectedValueOnce(new Error("audit offline"));
    await expect(sendSquareEntryPaymentLink(fixture().supabase, "entry-1", "deposit", actor, confirmation))
      .resolves.toMatchObject({ email: { sent: true }, auditRecorded: false, warning: expect.stringContaining("Do not resend") });
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });
});

describe("entry payment request route", () => {
  const routeId = "00000000-0000-4000-8000-000000000001";
  const request = (body: Record<string, unknown>) => new NextRequest("https://test.invalid/api/crm/bookkeeping/entry-1/square-payment-link", {
    method: "POST", body: JSON.stringify(body),
  });
  function authorize() {
    vi.mocked(requireCrmUser).mockResolvedValue({ supabase: fixture().supabase, email: actor.email, user: { id: actor.userId } } as Awaited<ReturnType<typeof requireCrmUser>>);
  }
  it("requires CRM authorization before looking up a ledger", async () => {
    vi.mocked(requireCrmUser).mockRejectedValue(new CrmAuthError(401, "CRM session is required."));
    expect((await POST(request({ paymentType: "deposit", ...confirmation }), { params: Promise.resolve({ id: routeId }) })).status).toBe(401);
    expect(createSquarePaymentLink).not.toHaveBeenCalled();
  });
  it("requires an explicit amount and recipient confirmation", async () => {
    authorize();
    expect((await POST(request({ paymentType: "deposit" }), { params: Promise.resolve({ id: routeId }) })).status).toBe(400);
    expect(createSquarePaymentLink).not.toHaveBeenCalled();
  });
  it("sends a confirmed request to the resolved exact entry", async () => {
    authorize();
    const response = await POST(request({ paymentType: "deposit", ...confirmation }), { params: Promise.resolve({ id: routeId }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ recipient: "exact@example.com", amount: 300, email: { sent: true } });
  });
  it("honors the read-only account restriction", async () => {
    vi.mocked(requireCrmUser).mockRejectedValue(new CrmAuthError(403, "Ken's CRM login is read-only."));
    expect((await POST(request({ paymentType: "deposit", ...confirmation }), { params: Promise.resolve({ id: routeId }) })).status).toBe(403);
    expect(createSquarePaymentLink).not.toHaveBeenCalled();
  });
  it("rejects malformed entry IDs and non-object requests", async () => {
    authorize();
    expect((await POST(request({ paymentType: "deposit", ...confirmation }), { params: Promise.resolve({ id: "wrong-id" }) })).status).toBe(400);
    const nullBody = new NextRequest("https://test.invalid", { method: "POST", body: "null" });
    expect((await POST(nullBody, { params: Promise.resolve({ id: routeId }) })).status).toBe(400);
    expect(createSquarePaymentLink).not.toHaveBeenCalled();
  });
});
