import { describe, expect, it } from "vitest";
import {
  assertMikePaymentAdmin,
  buildDashboardData,
  createCrmQuote,
  createPartnerPaymentBatch,
  deleteCrmLedgerRow,
  enrichCalendarEventsWithJobDetails,
  normalizeRemakeAmount,
  resolveFullPartnerPaymentAmount,
  syncRemakeExpense,
  updateCrmBookkeepingEntry,
  updateCrmQuote
} from "./backend";
import { CrmAuthError } from "./auth";
import { CrmBookkeepingEntry, CrmBookkeepingPayment, CrmCalendarEvent, CrmJob, CrmQuote } from "./types";

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

function bookkeepingEntry(overrides: Partial<CrmBookkeepingEntry> = {}): CrmBookkeepingEntry {
  return {
    id: "entry-1",
    created_at: "2026-06-20T00:00:00.000Z",
    updated_at: "2026-06-20T00:00:00.000Z",
    quote_id: null,
    job_id: "job-1",
    source: "manual",
    customer_name: "Manual Customer",
    sold_date: "2026-06-20",
    total_amount: 1000,
    payment_type: "cash",
    cogs_amount: 200,
    sales_owner: "mike",
    sales_owner_auth_user_id: null,
    sales_owner_set_at: null,
    installation_invoice_document_id: null,
    installation_invoice_amount: 0,
    installation_invoice_number: null,
    installation_invoice_url: null,
    installation_match_status: "unmatched",
    installation_matched_at: null,
    jessica_commission_paid_at: null,
    manufacturer_name: null,
    manufacturer_order_ref: null,
    manufacturer_order_url: null,
    manufacturer_document_url: null,
    notes: null,
    imported_sheet_row: null,
    ken_cut_override: null,
    meta: {},
    ...overrides
  };
}

type RecordedSupabaseCall = {
  table: string;
  action: "insert" | "update" | "upsert" | "delete";
  payload?: unknown;
  options?: unknown;
};

function createSupabaseRecorder(
  options: { job?: CrmJob; existingQuote?: CrmQuote; existingEntry?: CrmBookkeepingEntry | null; lineItemCount?: number } = {}
) {
  const calls: RecordedSupabaseCall[] = [];
  const state = {
    job: options.job ?? job(),
    existingQuote: options.existingQuote ?? quote({ status: "ordered" }),
    existingEntry: options.existingEntry ?? null,
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
      if (this.table === "crm_quote_bookkeeping_entries") return { data: state.existingEntry, error: null };
      return { data: null, error: null };
    }

    async single() {
      if (this.table === "crm_jobs" && this.action === "update") {
        state.job = job({
          ...state.job,
          ...(this.payload as Partial<CrmJob>)
        });
        return { data: state.job, error: null };
      }
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
      if (this.table === "crm_quote_bookkeeping_entries" && this.action === "update") {
        state.existingEntry = bookkeepingEntry({
          ...(state.existingEntry || bookkeepingEntry()),
          ...(this.payload as Partial<CrmBookkeepingEntry>)
        });
        return { data: state.existingEntry, error: null };
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

    expect(data.summary.openJobs).toBe(3);
    expect(data.jobs.find((item) => item.id === "paid-balance")?.status).toBe("closed");
    expect(data.bookkeepingRows.find((item) => item.id === "quote-paid-status")?.status).toBe("paid");
    expect(data.bookkeepingRows.find((item) => item.id === "quote-paid-status")?.liveStatus).toBe("closed");
    expect(data.bookkeepingRows.find((item) => item.id === "quote-paid-status")?.isPaidInFull).toBe(false);
    expect(data.quotes.find((item) => item.id === "quote-paid-balance")?.status).toBe("sold");
    expect(data.quotes.find((item) => item.id === "quote-paid-balance")?.live_status).toBe("closed");
    expect(data.quotes.find((item) => item.id === "quote-paid-status")?.live_status).toBe("invoiced");
    expect(data.customerFiles.find((file) => file.customerName === "Paid Balance")?.latestStatus).toBe("closed");
    expect(data.customerFiles.find((file) => file.customerName === "Paid Status")?.latestStatus).toBe("invoiced");
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

  it("records a balance-paid checkbox payment and closes a quote-backed job", async () => {
    const { calls, supabase } = createSupabaseRecorder({
      job: job({ id: "job-1", status: "invoiced" }),
      existingQuote: quote({ id: "quote-1", job_id: "job-1", status: "invoiced", quote_total: 1000 })
    });

    await updateCrmQuote(
      supabase,
      "quote-1",
      {
        status: "paid",
        payment_amount: 385.5,
        payment_label: "Balance payment",
        paid_at: "2026-06-21"
      },
      actor
    );

    expect(calls.find((call) => call.table === "crm_quote_bookkeeping_payments")?.payload).toMatchObject({
      quote_id: "quote-1",
      job_id: "job-1",
      payment_label: "Balance payment",
      amount: 385.5,
      paid_at: "2026-06-21",
      source: "crm_quote"
    });
    expect(calls.find((call) => call.table === "crm_quotes" && call.action === "update")?.payload).toMatchObject({
      status: "paid"
    });
    expect(calls.find((call) => call.table === "crm_jobs" && call.action === "update")?.payload).toMatchObject({
      status: "closed"
    });
  });

  it("records a balance-paid checkbox payment and closes a manual row's linked job", async () => {
    const { calls, supabase } = createSupabaseRecorder({
      job: job({ id: "job-1", status: "invoiced" }),
      existingEntry: bookkeepingEntry({ id: "entry-1", job_id: "job-1" })
    });

    await updateCrmBookkeepingEntry(
      supabase,
      "entry-1",
      {
        payment_amount: 250,
        payment_label: "Balance payment",
        paid_at: "2026-06-21",
        mark_balance_paid: true
      },
      actor
    );

    expect(calls.find((call) => call.table === "crm_quote_bookkeeping_payments")?.payload).toMatchObject({
      bookkeeping_entry_id: "entry-1",
      payment_label: "Balance payment",
      amount: 250,
      paid_at: "2026-06-21",
      source: "manual"
    });
    expect(calls.find((call) => call.table === "crm_jobs" && call.action === "update")?.payload).toMatchObject({
      status: "closed"
    });
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

  it("falls back to commission payment metadata when commission allocation storage fails", async () => {
    const commissionPayments: Array<Record<string, unknown>> = [];
    const calls: Array<{ table: string; action: string; payload?: unknown }> = [];
    const rowsByTable: Record<string, unknown[]> = {
      crm_jobs: [job({ id: "job-1", status: "sold", customer_name: "Mike Paid Job" })],
      crm_quotes: [
        quote({
          id: "quote-1",
          job_id: "job-1",
          status: "sold",
          quote_total: 1000,
          materials_cost: 100,
          sold_by: "Mike",
          customer_name: "Mike Paid Job"
        })
      ],
      crm_quote_bookkeeping_entries: [],
      crm_quote_bookkeeping_payments: [
        payment({ id: "quote-payment-1", quote_id: "quote-1", job_id: "job-1", amount: 1000 })
      ],
      crm_quote_bookkeeping_credits: [],
      crm_job_expenses: [],
      crm_installation_invoice_emails: [],
      crm_ken_payments: [],
      crm_order_cogs_emails: [],
      crm_commission_payments: commissionPayments,
      crm_settings: []
    };

    class PartnerQuery {
      private filters: Record<string, unknown> = {};
      private action: "select" | "insert" = "select";
      private payload: unknown;

      constructor(private table: string) {}

      select() {
        return this;
      }

      order() {
        return this;
      }

      limit() {
        return this;
      }

      eq(column: string, value: unknown) {
        this.filters[column] = value;
        return this;
      }

      gte() {
        return this;
      }

      insert(payload: unknown) {
        this.action = "insert";
        this.payload = payload;
        calls.push({ table: this.table, action: "insert", payload });
        return this;
      }

      single() {
        return Promise.resolve(this.execute(true));
      }

      maybeSingle() {
        const result = this.execute(true);
        return Promise.resolve({ data: Array.isArray(result.data) ? result.data[0] || null : result.data, error: result.error });
      }

      then<TResult1 = unknown, TResult2 = never>(
        onfulfilled?: ((value: { data: unknown; error: { code?: string; message?: string } | null }) => TResult1 | PromiseLike<TResult1>) | null,
        onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
      ) {
        return Promise.resolve(this.execute(false)).then(onfulfilled, onrejected);
      }

      private execute(single: boolean) {
        if (this.table === "crm_commission_payment_allocations") {
          return { data: null, error: { code: "23503", message: "allocation insert rejected" } };
        }
        if (this.table === "crm_ken_payment_allocations") {
          return { data: [], error: null };
        }
        if (this.action === "insert") {
          const payload = this.payload as Record<string, unknown>;
          const data = { id: `${this.table}-1`, created_at: "2026-06-30T00:00:00.000Z", updated_at: "2026-06-30T00:00:00.000Z", ...payload };
          if (this.table === "crm_commission_payments") commissionPayments.push(data);
          return { data, error: null };
        }
        const rows = (rowsByTable[this.table] || []).filter((row) =>
          Object.entries(this.filters).every(([key, value]) => (row as Record<string, unknown>)[key] === value)
        );
        return { data: single ? rows[0] || null : rows, error: null };
      }
    }

    const supabase = {
      from(table: string) {
        return new PartnerQuery(table);
      },
      rpc() {
        return Promise.resolve({
          data: null,
          error: { code: "XX000", message: "commission batch rpc failed" }
        });
      }
    } as unknown as Parameters<typeof createPartnerPaymentBatch>[0];

    const result = await createPartnerPaymentBatch(
      supabase,
      { person: "mike", item_ids: ["mike:crm_quote:quote-1"] },
      { email: "805shutters@gmail.com" }
    );

    expect(calls.find((call) => call.table === "crm_commission_payments")?.payload).toMatchObject({
      recipient: "mike",
      amount: 800
    });
    expect(calls.find((call) => call.table === "crm_commission_payment_allocations")).toBeTruthy();
    expect((result.payment.meta as { selectedItemAllocations?: Array<Record<string, unknown>> }).selectedItemAllocations?.[0]).toMatchObject({
      person: "mike",
      item_key: "mike:crm_quote:quote-1",
      amount: 800
    });
    expect(result.dashboard.partnerPaymentLedger.people.mike).toMatchObject({
      paid: 800,
      owed: 0,
      activeJobCount: 0
    });
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
