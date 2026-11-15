import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  native: vi.fn(),
  historical: vi.fn(),
  sell: vi.fn(),
  advance: vi.fn(),
  installer: vi.fn(),
  notify: vi.fn(),
  form: vi.fn(),
  createClient: vi.fn(),
}));

vi.mock("@supabase/supabase-js", async (importOriginal) => ({
  ...await importOriginal<typeof import("@supabase/supabase-js")>(),
  createClient: mocks.createClient,
}));
vi.mock("./sales-quote-v2-send-guard", async (importOriginal) => ({
  ...await importOriginal<typeof import("./sales-quote-v2-send-guard")>(),
  isNativeV2SalesQuote: mocks.native,
  assertHistoricalSalesQuoteMutationAllowed: mocks.historical,
}));
vi.mock("./native-quote-delivery", () => ({ markNativeSalesQuoteSold: mocks.sell }));
vi.mock("./quote-builder", async (importOriginal) => ({
  ...await importOriginal<typeof import("./quote-builder")>(),
  advanceQuoteStatus: mocks.advance,
}));
vi.mock("./sold-installer-delivery", () => ({ ensureSoldQuoteInstallerDelivery: mocks.installer }));
vi.mock("./sold-quote-notifications", () => ({ sendSoldQuoteSmsNotifications: mocks.notify }));
vi.mock("./technical-measures", () => ({
  ensureTechnicalMeasureForm: mocks.form,
  technicalMeasureFormUrl: (id: string) => `https://805shutters.com/crm/measure/${id}`,
}));

import { markSalesQuoteSold } from "./sales-quote-send";
import { acceptPublicQuote } from "./public-quote";

type Row = Record<string, unknown> & { id?: string };
type Filter = ["eq", string, unknown];

function memory(initial: Record<string, Row[]>) {
  const tables: Record<string, Row[]> = Object.fromEntries(
    Object.entries(initial).map(([table, rows]) => [table, rows.map((row) => ({ ...row }))]),
  );
  function from(table: string) {
    const filters: Filter[] = [];
    let op: "select" | "update" | "insert" | "upsert" = "select";
    let payload: Row | Row[] | null = null;
    const rows = () => (tables[table] ||= []);
    const matched = () => rows().filter((row) => filters.every(([, key, value]) => row[key] === value));
    const execute = (single: boolean) => {
      if (op === "update") {
        const found = matched();
        for (const row of found) Object.assign(row, payload);
        return { data: single ? found[0] ?? null : found.map((row) => ({ ...row })), error: null };
      }
      if (op === "insert" || op === "upsert") {
        const incoming = Array.isArray(payload) ? payload : [payload || {}];
        const created = incoming.map((item) => ({ id: item.id || crypto.randomUUID(), ...item }));
        rows().push(...created);
        return { data: single ? created[0] : created, error: null };
      }
      const found = matched();
      return { data: single ? found[0] ?? null : found, error: null };
    };
    const builder = {
      select() { return builder; },
      eq(key: string, value: unknown) { filters.push(["eq", key, value]); return builder; },
      is() { return builder; },
      in() { return builder; },
      neq() { return builder; },
      not() { return builder; },
      order() { return builder; },
      limit() { return builder; },
      gte() { return builder; },
      lte() { return builder; },
      or() { return builder; },
      update(value: Row) { op = "update"; payload = value; return builder; },
      insert(value: Row | Row[]) { op = "insert"; payload = value; return builder; },
      upsert(value: Row | Row[]) { op = "upsert"; payload = value; return builder; },
      delete() { return builder; },
      maybeSingle: async () => execute(true),
      single: async () => execute(true),
      then(resolve: (value: ReturnType<typeof execute>) => unknown, reject?: (reason: unknown) => unknown) {
        return Promise.resolve(execute(false)).then(resolve, reject);
      },
    };
    return builder;
  }
  return { tables, db: { from } as unknown as SupabaseClient };
}

const actor = { email: "staff@805shutters.com", userId: "10000000-0000-4000-8000-000000000001" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.native.mockResolvedValue(true);
  mocks.historical.mockResolvedValue(undefined);
  mocks.sell.mockResolvedValue("crm-quote");
  mocks.installer.mockResolvedValue(null);
  mocks.notify.mockResolvedValue({ deliveries: [] });
  mocks.form.mockResolvedValue({ id: "form-1" });
});

describe("sold jobs skip the in-app technical measure", () => {
  it("marks an in-home sale ready to order without calling MTS", async () => {
    const job = {
      id: "job-1",
      status: "quoted",
      customer_name: "Jane Smith",
      next_action: "Call customer",
      meta: { measure_needed: { status: "needed", form_status: "draft" } },
    };
    const salesQuote = {
      id: "sales-1",
      status: "draft",
      quote_v2_revision: 4,
      total_amount: 1800,
      customer_name: "Jane Smith",
      share_token: "sale-token",
    };
    const { tables, db } = memory({ sales_quotes: [salesQuote], crm_jobs: [job], crm_activity_events: [] });
    mocks.advance.mockImplementation(async () => {
      tables.crm_jobs[0].status = "sold";
      return { id: "crm-quote", status: "sold", job_id: job.id };
    });

    await markSalesQuoteSold(db, salesQuote.id, actor, {
      measureDecision: "needed",
      expectedRevision: 4,
      acknowledgedTotal: 1800,
    });

    expect(mocks.sell).toHaveBeenCalledWith(db, expect.objectContaining({ id: "sales-1" }), actor, expect.objectContaining({
      measureDecision: "not_needed",
    }));
    expect(tables.crm_jobs[0]).toMatchObject({
      status: "sold",
      next_action: "Order product",
      meta: { measure_needed: { status: "not_needed" } },
    });
    expect(mocks.form).toHaveBeenCalledWith(db, { jobId: "job-1", quoteId: "crm-quote" }, actor);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("creates the signed-contract vendor packet for an e-signed quote that stored needed", async () => {
    const design = {
      id: "design-1",
      product_id: "roller",
      program_id: null,
      fabric: null,
      details: {},
      surcharges: [],
      motorization: [],
      unit_price: 450,
      price_status: "ok",
      price_breakdown: {},
      label: "A",
      sort_order: 0,
    };
    const line = {
      id: "line-1",
      quote_id: "quote-1",
      room: "Living Room",
      quantity: 1,
      sort_order: 0,
      selected_design_id: design.id,
      discount_percent: 0,
      width_in: 36,
      height_in: 48,
      designs: [design],
    };
    const quote = {
      id: "quote-1",
      job_id: "job-1",
      share_token: "sign-token",
      quote_number: "805-100",
      customer_name: "Jamie Sample",
      customer_phone: "8055550100",
      customer_email: "jamie@example.com",
      customer_address: "100 Example Lane",
      status: "sent",
      signed_at: null,
      archived_at: null,
      quote_group_id: null,
      external_id: null,
      meta: { measure_needed: { status: "needed", form_status: "draft" } },
    };
    const job = {
      id: "job-1",
      status: "quoted",
      customer_name: "Jamie Sample",
      phone: "8055550100",
      email: "jamie@example.com",
      address: "100 Example Lane",
      city: "Ventura",
      next_action: "Send quote",
      meta: { measure_needed: { status: "needed", form_status: "draft" } },
    };
    const { tables, db } = memory({
      crm_quotes: [quote],
      crm_quote_line_items: [line],
      crm_jobs: [job],
      crm_quote_bookkeeping_entries: [],
      crm_quote_bookkeeping_payments: [],
      crm_quote_bookkeeping_credits: [],
      crm_customers: [],
      crm_customer_contracts: [],
      crm_vendor_order_drafts: [],
      crm_activity_events: [],
    });

    const result = await acceptPublicQuote(db, "sign-token", {
      printedName: "Jamie Sample",
      signature: "Jamie Sample",
      acknowledgedTotal: 450,
      notify: false,
    });

    expect(result).toMatchObject({ ok: true, alreadySigned: false });
    expect(tables.crm_jobs[0]).toMatchObject({
      status: "sold",
      next_action: "Order product",
      meta: { measure_needed: { status: "not_needed" } },
    });
    expect(tables.crm_vendor_order_drafts.length).toBeGreaterThan(0);
    expect(tables.crm_vendor_order_drafts[0]).toMatchObject({
      crm_quote_id: "quote-1",
      crm_job_id: "job-1",
      source_kind: "signed_contract",
      status: "queued",
    });
    expect(mocks.form).toHaveBeenCalled();
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
});
