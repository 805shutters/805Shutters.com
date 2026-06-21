import { describe, expect, it } from "vitest";
import {
  assertMikePaymentAdmin,
  buildDashboardData,
  createCrmQuote,
  deleteCrmLedgerRow,
  enrichCalendarEventsWithJobDetails,
  normalizeRemakeAmount,
  resolveFullPartnerPaymentAmount,
  syncRemakeExpense,
  updateCrmQuote
} from "./backend";
import { CrmAuthError } from "./auth";
import { CrmBookkeepingPayment, CrmCalendarEvent, CrmJob, CrmQuote } from "./types";

type FakeExpense = {
  id: string;
  category: string;
  bookkeeping_entry_id?: string | null;
  quote_id?: string | null;
  job_id?: string | null;
  amount?: number;
  meta?: Record<string, unknown>;
  [key: string]: unknown;
};

class FakeExpenseQuery {
  private operation: "select" | "delete" | "update" | "insert" = "select";
  private filters: Array<{ column: string; value: unknown }> = [];
  private inFilter: { column: string; values: unknown[] } | null = null;
  private payload: Record<string, unknown> | Record<string, unknown>[] | null = null;

  constructor(private records: FakeExpense[]) {}

  select() {
    this.operation = "select";
    return this;
  }

  delete() {
    this.operation = "delete";
    return this;
  }

  update(payload: Record<string, unknown>) {
    this.operation = "update";
    this.payload = payload;
    return this;
  }

  insert(payload: Record<string, unknown> | Record<string, unknown>[]) {
    this.operation = "insert";
    this.payload = payload;
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push({ column, value });
    return this;
  }

  in(column: string, values: unknown[]) {
    this.inFilter = { column, values };
    return this;
  }

  order() {
    return this;
  }

  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: { data?: FakeExpense[] | FakeExpense | null; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ) {
    return Promise.resolve(this.execute()).then(onfulfilled, onrejected);
  }

  private matches(record: FakeExpense) {
    const eqMatches = this.filters.every(({ column, value }) => record[column] === value);
    const inMatches = !this.inFilter || this.inFilter.values.includes(record[this.inFilter.column]);
    return eqMatches && inMatches;
  }

  private execute() {
    if (this.operation === "select") {
      return { data: this.records.filter((record) => this.matches(record)), error: null };
    }

    if (this.operation === "delete") {
      for (let index = this.records.length - 1; index >= 0; index -= 1) {
        if (this.matches(this.records[index])) this.records.splice(index, 1);
      }
      return { data: null, error: null };
    }

    if (this.operation === "update") {
      for (const record of this.records) {
        if (this.matches(record)) Object.assign(record, this.payload);
      }
      return { data: null, error: null };
    }

    const payloads = Array.isArray(this.payload) ? this.payload : [this.payload];
    for (const payload of payloads) {
      if (!payload) continue;
      this.records.push({ id: `expense-${this.records.length + 1}`, ...payload } as FakeExpense);
    }
    return { data: null, error: null };
  }
}

function fakeExpenseSupabase(records: FakeExpense[]) {
  return {
    from(table: string) {
      expect(table).toBe("crm_job_expenses");
      return new FakeExpenseQuery(records);
    }
  };
}

function job(overrides: Partial<CrmJob> = {}): CrmJob {
  return {
    id: "job-1",
    created_at: "2026-06-20T00:00:00.000Z",
    updated_at: "2026-06-20T00:00:00.000Z",
    source: "crm",
    lead_id: null,
    status: "sold",
    priority: "normal",
    customer_name: "Test Customer",
    phone: "8055551212",
    email: null,
    address: null,
    city: "Ventura",
    product_interest: "Shutters",
    sales_owner: "Jessica",
    next_action: null,
    next_action_due: null,
    appointment_start: null,
    appointment_end: null,
    estimated_total: 0,
    deposit_paid: 0,
    notes: null,
    ...overrides
  };
}

function quote(overrides: Partial<CrmQuote> = {}): CrmQuote {
  return {
    id: "quote-1",
    created_at: "2026-06-20T00:00:00.000Z",
    updated_at: "2026-06-20T00:00:00.000Z",
    job_id: "job-1",
    quote_number: null,
    status: "sold",
    quote_total: 1000,
    materials_cost: 0,
    labor_cost: 0,
    discount: 0,
    tax: 0,
    deposit_required: 500,
    balance_due: 500,
    sold_by: null,
    sent_at: null,
    approved_at: null,
    sold_at: "2026-06-20T00:00:00.000Z",
    ordered_at: null,
    received_at: null,
    installed_at: null,
    archived_at: null,
    manufacturer_name: null,
    manufacturer_order_ref: null,
    manufacturer_order_url: null,
    manufacturer_document_url: null,
    customer_email: null,
    customer_phone: null,
    customer_address: null,
    share_token: null,
    customer_signature: null,
    customer_printed_name: null,
    signed_at: null,
    quote_group_id: null,
    quote_label: null,
    meta: {},
    notes: null,
    ...overrides
  };
}

function payment(overrides: Partial<CrmBookkeepingPayment> = {}): CrmBookkeepingPayment {
  return {
    id: "payment-1",
    created_at: "2026-06-20T00:00:00.000Z",
    updated_at: "2026-06-20T00:00:00.000Z",
    quote_id: null,
    job_id: null,
    bookkeeping_entry_id: null,
    payment_label: "Balance payment",
    payment_type: "cash",
    amount: 0,
    paid_at: "2026-06-20",
    notes: null,
    source: "manual",
    ...overrides
  };
}

type RecordedSupabaseCall = {
  table: string;
  action: "insert" | "update" | "upsert" | "delete";
  payload?: unknown;
  options?: unknown;
};

function createSupabaseRecorder(options: { job?: CrmJob; existingQuote?: CrmQuote; lineItemCount?: number } = {}) {
  const calls: RecordedSupabaseCall[] = [];
  const state = {
    job: options.job ?? job(),
    existingQuote: options.existingQuote ?? quote({ status: "ordered" }),
    lineItemCount: options.lineItemCount ?? 0
  };

  class QueryRecorder {
    action: RecordedSupabaseCall["action"] | null = null;
    payload: unknown;
    error = null;
    count: number | null = null;
    private filters: Record<string, unknown> = {};
    private selectedColumns = "*";

    constructor(private table: string) {}

    select(columns = "*", options?: { count?: string; head?: boolean }) {
      this.selectedColumns = columns;
      if (options?.count === "exact" && options.head) this.count = state.lineItemCount;
      return this;
    }

    ilike() {
      return this;
    }

    limit() {
      return this;
    }

    eq(key: string, value: unknown) {
      this.filters[key] = value;
      return this;
    }

    insert(payload: unknown) {
      this.action = "insert";
      this.payload = payload;
      calls.push({ table: this.table, action: "insert", payload });
      return this;
    }

    update(payload: unknown) {
      this.action = "update";
      this.payload = payload;
      calls.push({ table: this.table, action: "update", payload });
      return this;
    }

    upsert(payload: unknown, options?: unknown) {
      this.action = "upsert";
      this.payload = payload;
      calls.push({ table: this.table, action: "upsert", payload, options });
      return this;
    }

    delete() {
      this.action = "delete";
      calls.push({ table: this.table, action: "delete" });
      return this;
    }

    async maybeSingle() {
      if (this.table === "crm_jobs") {
        if (this.action === "update") return { data: null, error: null };
        if (this.selectedColumns === "status") return { data: { status: state.job.status }, error: null };
        return { data: state.job, error: null };
      }
      if (this.table === "crm_quotes") return { data: state.existingQuote, error: null };
      return { data: null, error: null };
    }

    async single() {
      if (this.table === "crm_quotes" && this.action === "insert") {
        const record = this.payload as Partial<CrmQuote>;
        const data = quote({
          ...record,
          id: "quote-created",
          job_id: String(record.job_id || state.job.id),
          status: String(record.status || "draft") as CrmQuote["status"]
        });
        state.existingQuote = data;
        return { data, error: null };
      }
      if (this.table === "crm_quotes" && this.action === "update") {
        state.existingQuote = quote({
          ...state.existingQuote,
          ...(this.payload as Partial<CrmQuote>)
        });
        return { data: state.existingQuote, error: null };
      }
      return { data: this.payload ?? null, error: null };
    }
  }

  const supabase = {
    from(table: string) {
      return new QueryRecorder(table);
    }
  } as unknown as Parameters<typeof createCrmQuote>[0];

  return { calls, supabase };
}

describe("buildDashboardData", () => {
  it("counts Open Jobs as sold jobs that are not paid/completed", () => {
    const data = buildDashboardData({
      jobs: [
        job({ id: "quoted-lead", status: "quoted", customer_name: "Quoted Lead" }),
        job({ id: "sold-open", status: "sold", customer_name: "Sold Open" }),
        job({ id: "paid-status", status: "closed", customer_name: "Paid Status" }),
        job({ id: "paid-balance", status: "sold", customer_name: "Paid Balance" }),
        job({ id: "duplicate-open", status: "ordered", customer_name: "Duplicate Open" })
      ],
      quotes: [
        quote({ id: "quote-lead", job_id: "quoted-lead", status: "sent", customer_name: "Quoted Lead" }),
        quote({ id: "quote-sold-open", job_id: "sold-open", status: "sold", customer_name: "Sold Open" }),
        quote({ id: "quote-paid-status", job_id: "paid-status", status: "paid", customer_name: "Paid Status" }),
        quote({ id: "quote-paid-balance", job_id: "paid-balance", status: "sold", customer_name: "Paid Balance" }),
        quote({ id: "quote-duplicate-a", job_id: "duplicate-open", status: "ordered", customer_name: "Duplicate Open" }),
        quote({ id: "quote-duplicate-b", job_id: "duplicate-open", status: "approved", customer_name: "Duplicate Open" })
      ],
      events: [],
      customers: [],
      products: [],
      contracts: [],
      entries: [],
      payments: [payment({ id: "paid-balance-payment", quote_id: "quote-paid-balance", amount: 1000 })],
      credits: [],
      expenses: [],
      installationInvoiceEmails: [],
      kenPayments: [],
      openingBalance: 0,
      payoffTarget: 500000
    });

    expect(data.summary.openJobs).toBe(2);
    expect(data.jobs.find((item) => item.id === "paid-balance")?.status).toBe("closed");
    expect(data.bookkeepingRows.find((item) => item.id === "quote-paid-status")?.status).toBe("paid");
    expect(data.bookkeepingRows.find((item) => item.id === "quote-paid-status")?.liveStatus).toBe("closed");
    expect(data.bookkeepingRows.find((item) => item.id === "quote-paid-status")?.isPaidInFull).toBe(false);
    expect(data.quotes.find((item) => item.id === "quote-paid-balance")?.status).toBe("sold");
    expect(data.quotes.find((item) => item.id === "quote-paid-balance")?.live_status).toBe("closed");
    expect(data.quotes.find((item) => item.id === "quote-paid-status")?.live_status).toBe("closed");
    expect(data.customerFiles.find((file) => file.customerName === "Paid Balance")?.latestStatus).toBe("closed");
    expect(data.customerFiles.find((file) => file.customerName === "Paid Status")?.latestStatus).toBe("closed");
    expect(data.customerFiles.find((file) => file.customerName === "Sold Open")?.latestStatus).toBe("sold");
  });
});

describe("quote bookkeeping notes", () => {
  const actor = { email: "bookkeeper@805shutters.com" };

  it("does not copy customer-facing quote notes into the bookkeeping entry when creating a committed quote", async () => {
    const { calls, supabase } = createSupabaseRecorder();

    await createCrmQuote(
      supabase,
      {
        job_id: "job-1",
        status: "ordered",
        quote_number: "805-2000",
        quote_total: 1315,
        notes:
          '{"__customerEmailNote":"Customer-facing pricing explanation that belongs on the quote, not bookkeeping."}'
      },
      actor
    );

    const entryInsert = calls.find(
      (call) => call.table === "crm_quote_bookkeeping_entries" && call.action === "insert"
    );
    expect(entryInsert?.payload).toMatchObject({
      source: "crm_quote",
      quote_id: "quote-created"
    });
    expect((entryInsert?.payload as { notes?: unknown }).notes).toBeNull();
  });

  it("writes bookkeeping_notes to the quote bookkeeping entry without updating quote notes", async () => {
    const { calls, supabase } = createSupabaseRecorder({
      existingQuote: quote({ id: "quote-1", status: "ordered", notes: "Customer-facing quote note" })
    });

    await updateCrmQuote(supabase, "quote-1", { bookkeeping_notes: "Ledger-only follow-up" }, actor);

    const quoteUpdate = calls.find((call) => call.table === "crm_quotes" && call.action === "update");
    const entryUpsert = calls.find(
      (call) => call.table === "crm_quote_bookkeeping_entries" && call.action === "upsert"
    );
    expect(quoteUpdate).toBeUndefined();
    expect(entryUpsert?.payload).toMatchObject({ quote_id: "quote-1", notes: "Ledger-only follow-up" });
  });

  it("does not copy quote note updates into the quote bookkeeping entry", async () => {
    const { calls, supabase } = createSupabaseRecorder({
      existingQuote: quote({ id: "quote-1", status: "ordered", notes: "Old quote note" })
    });

    await updateCrmQuote(supabase, "quote-1", { notes: "New customer-facing quote note" }, actor);

    const quoteUpdate = calls.find((call) => call.table === "crm_quotes" && call.action === "update");
    const entryUpsert = calls.find(
      (call) => call.table === "crm_quote_bookkeeping_entries" && call.action === "upsert"
    );
    expect(quoteUpdate?.payload).toMatchObject({ notes: "New customer-facing quote note" });
    expect(entryUpsert?.payload).not.toHaveProperty("notes");
  });
});

describe("partner payment write rules", () => {
  it("allows only Mike's CRM login to write partner payments", () => {
    expect(() => assertMikePaymentAdmin({ email: "805shutters@gmail.com" })).not.toThrow();
    expect(() => assertMikePaymentAdmin({ email: "jessica@805shutters.com" })).toThrow(CrmAuthError);
    expect(() => assertMikePaymentAdmin({ email: "khill31@msn.com" })).toThrow(CrmAuthError);
  });

  it("rejects partial partner payments", () => {
    expect(resolveFullPartnerPaymentAmount(undefined, 600)).toBe(600);
    expect(resolveFullPartnerPaymentAmount("", 600)).toBe(600);
    expect(() => resolveFullPartnerPaymentAmount(250, 600)).toThrow(CrmAuthError);
  });
});

describe("remake expense writes", () => {
  it("normalizes positive, negative, blank, and invalid remake amounts", () => {
    expect(normalizeRemakeAmount(325)).toBe(325);
    expect(normalizeRemakeAmount("-325.22")).toBe(325.22);
    expect(normalizeRemakeAmount("")).toBe(0);
    expect(normalizeRemakeAmount("not money")).toBe(0);
  });

  it("upserts one quote-linked remake expense and collapses duplicates", async () => {
    const records: FakeExpense[] = [
      { id: "primary", category: "remake", quote_id: "quote-1", job_id: null, amount: 100, meta: { existing: true } },
      { id: "duplicate", category: "remake", quote_id: "quote-1", job_id: "job-1", amount: 50 },
      { id: "other", category: "other", quote_id: "quote-1", job_id: "job-1", amount: 25 }
    ];

    await syncRemakeExpense(
      fakeExpenseSupabase(records) as never,
      { quoteId: "quote-1", jobId: "job-1", source: "crm_quote", actorEmail: "805shutters@gmail.com" },
      -325
    );

    expect(records).toHaveLength(2);
    expect(records.find((record) => record.id === "duplicate")).toBeUndefined();
    expect(records.find((record) => record.id === "primary")).toMatchObject({
      category: "remake",
      label: "Remake",
      quote_id: "quote-1",
      job_id: "job-1",
      amount: 325,
      source: "crm_quote"
    });
  });

  it("clears manual row remake expenses when the amount is blank or zero", async () => {
    const records: FakeExpense[] = [
      { id: "remake", category: "remake", bookkeeping_entry_id: "entry-1", amount: 100 },
      { id: "other", category: "other", bookkeeping_entry_id: "entry-1", amount: 25 }
    ];

    await syncRemakeExpense(
      fakeExpenseSupabase(records) as never,
      { bookkeepingEntryId: "entry-1", source: "manual", actorEmail: "805shutters@gmail.com" },
      ""
    );

    expect(records).toEqual([{ id: "other", category: "other", bookkeeping_entry_id: "entry-1", amount: 25 }]);
  });
});

describe("enrichCalendarEventsWithJobDetails", () => {
  it("adds linked job contact details to calendar events", () => {
    const events = [
      {
        id: "event-1",
        created_at: "2026-06-20T00:00:00.000Z",
        updated_at: "2026-06-20T00:00:00.000Z",
        job_id: "job-1",
        title: "Susannah consultation",
        event_type: "sales_consult",
        status: "scheduled",
        assigned_to: "Jessica",
        start_at: "2026-06-24T23:00:00.000Z",
        end_at: "2026-06-25T00:00:00.000Z",
        location: "340 Green Moor Place",
        notes: "4 shutters"
      } satisfies CrmCalendarEvent
    ];

    const jobs = [
      {
        id: "job-1",
        created_at: "2026-06-20T00:00:00.000Z",
        updated_at: "2026-06-20T00:00:00.000Z",
        source: "crm",
        lead_id: null,
        status: "scheduled",
        priority: "normal",
        customer_name: "Susannah",
        phone: "8043589594",
        email: "customer@email.com",
        address: "340 Green Moor Place",
        city: "Thousand Oaks",
        product_interest: "Shutters",
        sales_owner: "Jessica",
        next_action: null,
        next_action_due: null,
        appointment_start: "2026-06-24T23:00:00.000Z",
        appointment_end: "2026-06-25T00:00:00.000Z",
        estimated_total: 0,
        deposit_paid: 0,
        notes: "Bring white shutter samples"
      } satisfies CrmJob
    ];

    expect(enrichCalendarEventsWithJobDetails(events, jobs)[0]).toMatchObject({
      customer_name: "Susannah",
      customer_phone: "8043589594",
      customer_email: "customer@email.com",
      customer_address: "340 Green Moor Place",
      customer_city: "Thousand Oaks",
      product_interest: "Shutters",
      customer_notes: "4 shutters"
    });
  });
});

function deleteRecorder(opts: { entry?: Record<string, unknown> | null; quote?: Record<string, unknown> | null }) {
  const deletes: Array<{ table: string; filters: Record<string, unknown> }> = [];
  const updates: Array<{ table: string; filters: Record<string, unknown>; payload: Record<string, unknown> }> = [];

  class QueryRecorder {
    error = null;
    table: string;
    filters: Record<string, unknown> = {};

    constructor(table: string) {
      this.table = table;
    }

    select() {
      return this;
    }

    eq(key: string, value: unknown) {
      this.filters[key] = value;
      return this;
    }

    insert() {
      return this;
    }

    update(payload: Record<string, unknown>) {
      updates.push({ table: this.table, filters: this.filters, payload });
      return this;
    }

    delete() {
      deletes.push(this);
      return this;
    }

    async maybeSingle() {
      if (this.table === "crm_quote_bookkeeping_entries") return { data: opts.entry ?? null, error: null };
      if (this.table === "crm_quotes") return { data: opts.quote ?? null, error: null };
      return { data: null, error: null };
    }
  }

  const supabase = {
    from(table: string) {
      return new QueryRecorder(table);
    }
  } as unknown as Parameters<typeof deleteCrmLedgerRow>[0];

  return { deletes, updates, supabase };
}

const actor = { email: "boss@805shutters.com", userId: "user-1" };

describe("deleteCrmLedgerRow", () => {
  it("tombstones ONLY the bookkeeping entry, even when it is linked to a job and quote", async () => {
    const { deletes, updates, supabase } = deleteRecorder({
      entry: { id: "entry-1", job_id: "job-9", quote_id: "quote-9", meta: { existing: true } }
    });

    await deleteCrmLedgerRow(supabase, "entry-1", actor);

    expect(deletes).toHaveLength(0);
    expect(updates).toHaveLength(1);
    expect(updates[0].table).toBe("crm_quote_bookkeeping_entries");
    expect(updates[0].filters.id).toBe("entry-1");
    expect(updates[0].payload.meta).toMatchObject({
      existing: true,
      bookkeeping_deleted_by: actor.email,
      bookkeeping_delete_source: "ledger_row_delete"
    });
  });

  it("never deletes from crm_jobs or crm_quotes (a duplicate row can't wipe out the sale)", async () => {
    const { deletes, updates, supabase } = deleteRecorder({
      entry: { id: "entry-1", job_id: "job-9", quote_id: "quote-9" }
    });

    await deleteCrmLedgerRow(supabase, "entry-1", actor);

    const tables = deletes.map((d) => d.table);
    expect(tables).not.toContain("crm_jobs");
    expect(tables).not.toContain("crm_quotes");
    expect(updates.map((d) => d.table)).not.toContain("crm_jobs");
  });

  it("can hide a quote-backed ledger row without deleting the quote", async () => {
    const { deletes, updates, supabase } = deleteRecorder({
      entry: null,
      quote: { id: "quote-9", meta: { existing: true } }
    });

    await deleteCrmLedgerRow(supabase, "quote-9", actor);

    expect(deletes).toHaveLength(0);
    expect(updates).toHaveLength(1);
    expect(updates[0].table).toBe("crm_quotes");
    expect(updates[0].filters.id).toBe("quote-9");
    expect(updates[0].payload.meta).toMatchObject({
      existing: true,
      bookkeeping_deleted_by: actor.email,
      bookkeeping_delete_source: "ledger_row_delete"
    });
  });

  it("throws a 404 for a missing ledger row and hides nothing", async () => {
    const { deletes, updates, supabase } = deleteRecorder({ entry: null, quote: null });
    await expect(deleteCrmLedgerRow(supabase, "missing-row", actor)).rejects.toMatchObject({ status: 404 });
    expect(deletes).toHaveLength(0);
    expect(updates).toHaveLength(0);
  });
});
