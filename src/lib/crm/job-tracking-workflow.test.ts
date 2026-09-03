import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CrmAuthError, requireCrmUser } from "./auth";
import { jobTrackingStages, parseJobTrackingStageInput, updateJobTrackingStage } from "./job-tracking-workflow";
import { POST } from "@/app/api/crm/job-tracking/stage/route";
import { buildBookkeepingRows } from "./bookkeeping";
import { buildDashboardData } from "./backend";
import { buildJobTrackingView } from "./job-tracking-view";
import type { CrmBookkeepingEntry, CrmBookkeepingPayment, CrmJob, CrmQuote } from "./types";

vi.mock("@/lib/crm/auth", async (importOriginal) => ({
  ...await importOriginal<typeof import("./auth")>(),
  requireCrmUser: vi.fn()
}));

const JOB_ID = "11111111-1111-4111-8111-111111111111";
const QUOTE_ID = "22222222-2222-4222-8222-222222222222";
const ENTRY_ID = "33333333-3333-4333-8333-333333333333";
const OTHER_ID = "44444444-4444-4444-8444-444444444444";
const actor = { email: "805@805shutters.com", userId: OTHER_ID };
const timestamp = "2026-08-01T00:00:00.000Z";
type RecordData = Record<string, unknown> & { id: string };

function database(options: { job?: Record<string, unknown>; quote?: Record<string, unknown>; entry?: Record<string, unknown>; errorAt?: "read" | "write"; stale?: boolean; auditError?: "returned" | "thrown" } = {}) {
  const tables: Record<string, RecordData[]> = {
    crm_jobs: [{ id: JOB_ID, updated_at: timestamp, status: "sold", deposit_paid: 400, meta: { keepJob: true }, ...options.job }],
    crm_quotes: [{ id: QUOTE_ID, job_id: JOB_ID, updated_at: timestamp, status: "sold", sold_at: timestamp, signed_at: null, customer_signature: null, quote_total: 1000, balance_due: 600, meta: { square: { payment_id: "square-existing" }, keepQuote: true }, ...options.quote }],
    crm_quote_bookkeeping_entries: [{ id: ENTRY_ID, quote_id: QUOTE_ID, job_id: JOB_ID, updated_at: timestamp, sold_date: "2026-08-01", total_amount: 1000, cogs_amount: 200, meta: { keepEntry: true }, ...options.entry }],
    crm_activity_events: []
  };
  const writes: Array<{ table: string; patch: Record<string, unknown>; filters: Array<[string, unknown]> }> = [];
  const from = vi.fn((table: string) => {
    const filters: Array<[string, unknown]> = [];
    let patch: Record<string, unknown> | null = null;
    const query = {
      select: () => query,
      eq: (key: string, value: unknown) => { filters.push([key, value]); return query; },
      update: (value: Record<string, unknown>) => { patch = value; return query; },
      insert: async (value: RecordData) => {
        if (options.auditError === "thrown" && table === "crm_activity_events") throw new Error("Activity network unavailable");
        if (options.auditError === "returned" && table === "crm_activity_events") return { error: { message: "crm_activity_events unavailable" } };
        tables[table].push(value); return { error: null };
      },
      maybeSingle: async () => {
        if (options.errorAt === (patch ? "write" : "read")) return { data: null, error: { message: "Database unavailable" } };
        const found = tables[table]?.find((row) => filters.every(([key, value]) => row[key] === value));
        if (!found || (patch && options.stale)) return { data: null, error: null };
        if (patch) {
          writes.push({ table, patch, filters });
          Object.assign(found, patch);
        }
        return { data: structuredClone(found), error: null };
      }
    };
    return query;
  });
  return { client: { from } as unknown as SupabaseClient, tables, writes, from };
}

beforeEach(() => { vi.mocked(requireCrmUser).mockReset(); });

describe("job tracking stage input", () => {
  it.each([null, [], {}, { stage: "paid", jobId: JOB_ID }, { stage: "ordered" }, { stage: "ordered", jobId: "customer name" }, { stage: "ordered", jobId: 7 }])("rejects missing/unsafe targets and unsupported stages: %j", (input) => {
    expect(() => parseJobTrackingStageInput(input)).toThrow(CrmAuthError);
  });

  it("normalizes supplied exact IDs", () => {
    const id = "aabbccdd-1111-4111-8111-111111111111";
    expect(parseJobTrackingStageInput({ stage: "complete", jobId: ` ${id.toUpperCase()} ` })).toEqual({ stage: "complete", jobId: id });
  });
});

describe("manual job tracking stages", () => {
  it.each(jobTrackingStages)("persists %s as manual, without changing sold/signature/payment facts", async (stage) => {
    const db = database();
    const quoteBefore = structuredClone(db.tables.crm_quotes[0]);
    const result = await updateJobTrackingStage(db.client, { quoteId: QUOTE_ID, jobId: JOB_ID, bookkeepingEntryId: ENTRY_ID, stage }, actor);
    expect(result).toMatchObject({ auditRecorded: true, warning: null });
    expect(result.jobTracking).toMatchObject({ stage, source: "manual", updated_by: actor.email, updated_by_user_id: actor.userId });
    expect(db.writes).toHaveLength(1);
    expect(db.writes[0].table).toBe("crm_quotes");
    expect(Object.keys(db.writes[0].patch)).toEqual(["meta"]);
    expect(db.tables.crm_quotes[0]).toMatchObject(quoteBefore);
    expect(db.tables.crm_quotes[0].meta).toMatchObject({ square: { payment_id: "square-existing" }, keepQuote: true, job_tracking: { stage } });
    expect(db.tables.crm_activity_events[0]).toMatchObject({
      actor_email: actor.email,
      entity_type: "quote",
      entity_id: QUOTE_ID,
      action: "job_tracking.stage_changed",
      before_data: { job_tracking: null },
      after_data: { job_tracking: { stage } },
      metadata: { evidenceUnchanged: true, bookkeepingEntryId: ENTRY_ID }
    });
  });

  it("allows a backward stage change without discarding unrelated metadata", async () => {
    const db = database({ quote: { status: "installed", meta: { job_tracking: { stage: "complete", note: "keep" }, anotherKey: 5 } } });
    await updateJobTrackingStage(db.client, { quoteId: QUOTE_ID, stage: "need_follow_up" }, actor);
    expect(db.tables.crm_quotes[0]).toMatchObject({ status: "installed", meta: { anotherKey: 5, job_tracking: { stage: "need_follow_up", note: "keep" } } });
  });

  it("updates a standalone entry without inventing quote, job, or sold date", async () => {
    const db = database({ entry: { quote_id: null, job_id: null, sold_date: null } });
    const result = await updateJobTrackingStage(db.client, { bookkeepingEntryId: ENTRY_ID, stage: "complete" }, actor);
    expect(result).toMatchObject({ entityType: "bookkeeping_entry", quoteId: null, jobId: null });
    expect(db.writes[0].table).toBe("crm_quote_bookkeeping_entries");
    expect(db.tables.crm_quote_bookkeeping_entries[0]).toMatchObject({ sold_date: null, total_amount: 1000, cogs_amount: 200 });
  });

  it("writes only a job marker for an exact job-only request", async () => {
    const db = database();
    const result = await updateJobTrackingStage(db.client, { jobId: JOB_ID, stage: "sold_need_deposit" }, actor);
    expect(result).toMatchObject({ entityType: "job", quoteId: null });
    expect(db.writes[0].table).toBe("crm_jobs");
    expect(db.tables.crm_jobs[0]).toMatchObject({ status: "sold", deposit_paid: 400 });
  });

  it("follows the exact quote and job links from a bookkeeping entry", async () => {
    const db = database();
    expect(await updateJobTrackingStage(db.client, { bookkeepingEntryId: ENTRY_ID, stage: "shipped" }, actor))
      .toMatchObject({ entityType: "quote", quoteId: QUOTE_ID, jobId: JOB_ID });
  });

  it("reloads the linked quote marker over a stale imported-entry stage", async () => {
    const db = database({ entry: { source: "legacy_sheet", meta: { job_tracking: { stage: "complete", updated_at: timestamp, source: "manual" } } } });
    await updateJobTrackingStage(db.client, { bookkeepingEntryId: ENTRY_ID, quoteId: QUOTE_ID, jobId: JOB_ID, stage: "need_follow_up" }, actor);
    const quotes = db.tables.crm_quotes as unknown as CrmQuote[];
    const entries = db.tables.crm_quote_bookkeeping_entries as unknown as CrmBookkeepingEntry[];
    const rows = buildBookkeepingRows({ quotes, entries, payments: [] });
    const items = buildJobTrackingView({ jobs: db.tables.crm_jobs.map((j) => ({ ...j, customer_name: "Sample customer" })) as unknown as CrmJob[], quotes, rows, files: [] });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ stageId: "need_follow_up", manualStage: true });
    expect(items[0].soldDate).toBe("2026-08-01");
  });

  it("keeps a prepaid quote active until installation is recorded", () => {
    const db = database({ quote: { deposit_required: 500, balance_due: 0 } });
    const quotes = db.tables.crm_quotes as unknown as CrmQuote[];
    const payment = { id: OTHER_ID, quote_id: QUOTE_ID, amount: 1000, payment_label: "Deposit payment", paid_at: timestamp } as CrmBookkeepingPayment;
    const rows = buildBookkeepingRows({ quotes, entries: [], payments: [payment] });
    expect(rows[0].isPaidInFull).toBe(true);
    const items = buildJobTrackingView({ jobs: [{ ...db.tables.crm_jobs[0], status: "closed" }] as unknown as CrmJob[], quotes, rows, files: [] });
    expect(items[0]).toMatchObject({ stageId: "need_to_order", balanceOutstanding: 0 });
  });

  it("does not display inferred created_at as a signature or sold date", () => {
    const db = database({ quote: { created_at: timestamp, status: "draft", signed_at: null, sold_at: null, approved_at: null, customer_signature: "Recorded signature without timestamp" } });
    const dashboard = buildDashboardData({
      jobs: db.tables.crm_jobs.map((j) => ({ ...j, customer_name: "Sample customer" })) as unknown as CrmJob[], quotes: db.tables.crm_quotes as unknown as CrmQuote[],
      events: [], customers: [], products: [], contracts: [], entries: [], payments: [], credits: [], expenses: [],
      installationInvoiceEmails: [], kenPayments: [], openingBalance: 0, payoffTarget: 0
    });
    expect(dashboard.quotes[0]).toMatchObject({ source_signed_at: null, source_sold_at: null });
    const items = buildJobTrackingView({ jobs: dashboard.jobs, quotes: dashboard.quotes, rows: dashboard.bookkeepingRows, files: dashboard.customerFiles });
    expect(items[0]).toMatchObject({ signedAt: null, soldDate: null, signatureRecorded: true });
  });

  it.each([
    { input: { jobId: OTHER_ID, quoteId: QUOTE_ID }, options: {} },
    { input: { bookkeepingEntryId: ENTRY_ID, quoteId: OTHER_ID }, options: {} },
    { input: { bookkeepingEntryId: ENTRY_ID }, options: { entry: { job_id: OTHER_ID } } },
    { input: { bookkeepingEntryId: ENTRY_ID, quoteId: QUOTE_ID }, options: { entry: { quote_id: null } } },
    { input: { bookkeepingEntryId: ENTRY_ID, jobId: JOB_ID }, options: { entry: { quote_id: null, job_id: null } } }
  ])("rejects mismatched links before writing: %j", async ({ input, options }) => {
    const db = database(options);
    await expect(updateJobTrackingStage(db.client, { ...input, stage: "ordered" }, actor)).rejects.toMatchObject({ status: 409 });
    expect(db.writes).toHaveLength(0);
  });

  it.each([{ status: "needed" }, { status: "needed", form_status: "awaiting_signature" }, { status: "measured", form_status: "draft" }])("preserves the technical measure ordering gate: %j", async (measure) => {
    const db = database({ job: { meta: { measure_needed: measure } } });
    await expect(updateJobTrackingStage(db.client, { quoteId: QUOTE_ID, stage: "ordered" }, actor)).rejects.toMatchObject({ status: 409 });
    expect(db.writes).toHaveLength(0);
  });

  it.each([{ status: "not_needed" }, { status: "measured", form_status: "submitted" }])("accepts cleared measure gate: %j", async (measure) => {
    const db = database({ job: { meta: { measure_needed: measure } } });
    await expect(updateJobTrackingStage(db.client, { quoteId: QUOTE_ID, stage: "ordered" }, actor)).resolves.toMatchObject({ jobTracking: { stage: "ordered" } });
  });

  it("rejects absent and deleted targets", async () => {
    const db = database({ quote: { meta: { deleted_at: timestamp } } });
    await expect(updateJobTrackingStage(db.client, { quoteId: QUOTE_ID, stage: "ordered" }, actor)).rejects.toMatchObject({ status: 404 });
    await expect(updateJobTrackingStage(db.client, { jobId: OTHER_ID, stage: "ordered" }, actor)).rejects.toMatchObject({ status: 404 });
    expect(db.writes).toHaveLength(0);
  });

  it.each(["read", "write"] as const)("fails clearly on database %s errors", async (errorAt) => {
    const db = database({ errorAt });
    await expect(updateJobTrackingStage(db.client, { quoteId: QUOTE_ID, stage: "ordered" }, actor)).rejects.toMatchObject({ status: 502 });
    expect(db.tables.crm_activity_events).toHaveLength(0);
  });

  it("does not overwrite concurrent record edits", async () => {
    const db = database({ stale: true });
    await expect(updateJobTrackingStage(db.client, { quoteId: QUOTE_ID, stage: "ordered" }, actor)).rejects.toMatchObject({ status: 409 });
    expect(db.writes).toHaveLength(0);
    expect(db.tables.crm_activity_events).toHaveLength(0);
    const fresh = database();
    await updateJobTrackingStage(fresh.client, { jobId: JOB_ID, stage: "scheduled" }, actor);
    expect(fresh.writes[0].filters).toContainEqual(["updated_at", timestamp]);
  });

  it.each(["returned", "thrown"] as const)("reports a saved stage with an audit warning for %s errors", async (auditError) => {
    const db = database({ auditError });
    const result = await updateJobTrackingStage(db.client, { quoteId: QUOTE_ID, stage: "need_follow_up" }, actor);
    expect(result).toMatchObject({ auditRecorded: false, jobTracking: { stage: "need_follow_up", updated_by: actor.email } });
    expect(result.warning).toMatch(/Stage saved, but the activity log/);
    expect(db.tables.crm_activity_events).toHaveLength(0);
    expect(db.tables.crm_quotes[0].meta).toMatchObject({ job_tracking: { stage: "need_follow_up" } });
  });
});

describe("job tracking stage route", () => {
  it.each([401, 403])("preserves CRM authentication/read-only denial (%s)", async (status) => {
    vi.mocked(requireCrmUser).mockImplementation(async () => { throw new CrmAuthError(status, "Not allowed"); });
    const response = await POST(new NextRequest("https://example.test/api/crm/job-tracking/stage", { method: "POST", body: JSON.stringify({ jobId: JOB_ID, stage: "ordered" }) }));
    expect(response.status).toBe(status);
  });

  it("rejects invalid JSON and writes nothing", async () => {
    const db = database();
    vi.mocked(requireCrmUser).mockResolvedValue({ supabase: db.client, email: actor.email, user: { id: actor.userId }, displayName: null } as Awaited<ReturnType<typeof requireCrmUser>>);
    const response = await POST(new NextRequest("https://example.test/api/crm/job-tracking/stage", { method: "POST", body: "bad-json" }));
    expect(response.status).toBe(400);
    expect(db.from).not.toHaveBeenCalled();
  });

  it("returns the saved marker for an authenticated staff user", async () => {
    const db = database();
    vi.mocked(requireCrmUser).mockResolvedValue({ supabase: db.client, email: actor.email, user: { id: actor.userId }, displayName: null } as Awaited<ReturnType<typeof requireCrmUser>>);
    const response = await POST(new NextRequest("https://example.test/api/crm/job-tracking/stage", { method: "POST", body: JSON.stringify({ quoteId: QUOTE_ID, stage: "complete" }) }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ quoteId: QUOTE_ID, jobTracking: { stage: "complete", source: "manual" } });
  });

  it("returns 200 with a truthful partial-audit warning after the stage is saved", async () => {
    const db = database({ auditError: "returned" });
    vi.mocked(requireCrmUser).mockResolvedValue({ supabase: db.client, email: actor.email, user: { id: actor.userId }, displayName: null } as Awaited<ReturnType<typeof requireCrmUser>>);
    const response = await POST(new NextRequest("https://example.test/api/crm/job-tracking/stage", { method: "POST", body: JSON.stringify({ quoteId: QUOTE_ID, stage: "complete" }) }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ auditRecorded: false, warning: expect.stringContaining("Stage saved"), jobTracking: { stage: "complete" } });
  });
});
