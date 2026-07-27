import { describe, expect, it } from "vitest";
import {
  assertMikePaymentAdmin,
  buildDashboardData,
  cancelCrmCalendarEvent,
  createCrmJobExpense,
  createCrmQuote,
  createPartnerPaymentBatch,
  deleteCrmBookkeepingCredit,
  deleteCrmBookkeepingPayment,
  deleteCrmCustomerFile,
  deleteCrmJobExpense,
  deleteCrmLedgerRow,
  deleteSalesQuote,
  enrichCalendarEventsWithJobDetails,
  normalizeRemakeAmount,
  resolveFullPartnerPaymentAmount,
  resolveQuoteBookkeepingCustomerName,
  syncRemakeExpense,
  updateCrmBookkeepingCredit,
  updateCrmBookkeepingEntry,
  updateCrmBookkeepingPayment,
  updateCrmJobExpense,
  updateCrmInstallationInvoiceEmail,
  updateCrmQuote,
  updateCrmSettings,
  vendorOrderTaskFromRow,
  vendorOrderTasksFromRow
} from "./backend";
import { CrmAuthError } from "./auth";
import {
  CrmBookkeepingEntry,
  CrmBookkeepingPayment,
  CrmCalendarEvent,
  CrmCustomerContract,
  CrmInstallationInvoiceEmail,
  CrmJob,
  CrmQuote
} from "./types";

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

function installationInvoiceEmail(overrides: Partial<CrmInstallationInvoiceEmail> = {}): CrmInstallationInvoiceEmail {
  return {
    id: "install-email-1",
    created_at: "2026-06-20T00:00:00.000Z",
    updated_at: "2026-06-20T00:00:00.000Z",
    mailbox_email: "805shutters@gmail.com",
    gmail_message_id: "gmail-install-1",
    gmail_thread_id: null,
    gmail_history_id: null,
    subject: "Install invoice",
    from_email: "installer@example.com",
    to_email: "805shutters@gmail.com",
    sent_at: "2026-06-20T00:00:00.000Z",
    snippet: null,
    attachment_names: [],
    email_url: "https://mail.google.com/mail/u/0/#inbox/gmail-install-1",
    raw: {},
    extracted_customer_name: "Manual Customer",
    extracted_invoice_amount: 375,
    extracted_invoice_number: "INV-805",
    installation_invoice_paid_at: null,
    installation_invoice_paid_amount: 0,
    installation_invoice_payment_method: null,
    installation_invoice_payment_notes: null,
    extraction_confidence: 0.95,
    matched_job_id: "job-1",
    matched_quote_id: null,
    matched_bookkeeping_entry_id: "entry-1",
    match_status: "matched",
    match_confidence: 0.9,
    match_reason: "Matched by customer",
    processed_at: "2026-06-20T00:00:00.000Z",
    applied_at: "2026-06-20T00:00:00.000Z",
    error_message: null,
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
  options: {
    job?: CrmJob;
    existingQuote?: CrmQuote;
    existingEntry?: CrmBookkeepingEntry | null;
    existingInstallationInvoiceEmail?: CrmInstallationInvoiceEmail | null;
    lineItemCount?: number;
  } = {}
) {
  const calls: RecordedSupabaseCall[] = [];
  const state = {
    job: options.job ?? job(),
    existingQuote: options.existingQuote ?? quote({ status: "ordered" }),
    existingEntry: options.existingEntry ?? null,
    existingInstallationInvoiceEmail: options.existingInstallationInvoiceEmail ?? null,
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
      if (this.table === "crm_installation_invoice_emails") {
        return { data: state.existingInstallationInvoiceEmail, error: null };
      }
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
      if (this.table === "crm_installation_invoice_emails" && this.action === "update") {
        state.existingInstallationInvoiceEmail = installationInvoiceEmail({
          ...(state.existingInstallationInvoiceEmail || installationInvoiceEmail()),
          ...(this.payload as Partial<CrmInstallationInvoiceEmail>)
        });
        return { data: state.existingInstallationInvoiceEmail, error: null };
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

describe("vendorOrderTaskFromRow", () => {
  const queuedRow = {
    id: "form-123",
    job_id: "job-123",
    quote_id: "quote-123",
    submitted_at: "2026-07-26T18:00:00.000Z",
    customer_snapshot: { name: "Ready Customer" },
    quote_snapshot: { quoteNumber: "805-0200" },
    meta: {
      vendor_order_preparation: {
        taskId: "task_12345678",
        manufacturer: "Norman",
        productType: "roller",
        status: "queued",
        message: "Ready for saved-draft entry.",
        payload: { privatePortalPlan: "must not reach the dashboard" }
      }
    }
  };

  it("projects only safe queued-task metadata for the CRM action card", () => {
    const task = vendorOrderTaskFromRow(queuedRow);
    expect(task).toEqual({
      taskId: "task_12345678",
      formId: "form-123",
      jobId: "job-123",
      quoteId: "quote-123",
      customerName: "Ready Customer",
      quoteNumber: "805-0200",
      manufacturer: "Norman",
      productType: "roller",
      status: "queued",
      submittedAt: "2026-07-26T18:00:00.000Z",
      message: "Ready for saved-draft entry.",
      routingKeys: [],
      productNames: [],
      lineCount: 1,
      portalUrl: null,
      orderPacketUrl: null,
    });
    expect(task).not.toHaveProperty("payload");
  });

  it("projects queued Onyx shutter tasks without relabeling them as Norman", () => {
    const task = vendorOrderTaskFromRow({
      ...queuedRow,
      meta: {
        vendor_order_preparation: {
          ...queuedRow.meta.vendor_order_preparation,
          manufacturer: "Onyx",
          productType: "shutters",
          taskId: "onyx:form-123:abcdef123456",
        },
      },
    });
    expect(task).toMatchObject({
      manufacturer: "Onyx",
      productType: "shutters",
      status: "queued",
      taskId: "onyx:form-123:abcdef123456",
    });
  });

  it("does not expose non-queued or unsubmitted vendor work", () => {
    expect(vendorOrderTaskFromRow({
      ...queuedRow,
      meta: { vendor_order_preparation: { ...queuedRow.meta.vendor_order_preparation, status: "review_ready" } }
    })).toBeNull();
    expect(vendorOrderTaskFromRow({ ...queuedRow, submitted_at: null })).toBeNull();
  });

  it("fans one submitted measure into one safe dashboard task per manufacturer", () => {
    const preparations = ["Norman", "Onyx", "Lotus", "Polar"].map((manufacturer, index) => ({
      taskId: `${manufacturer.toLowerCase()}:form-123:${index}`,
      manufacturer,
      productType: index ? "mixed" : "roller",
      status: "queued",
      message: `${manufacturer} is ready.`,
      routingKeys: [`${manufacturer.toLowerCase()}:product`],
      productNames: [`${manufacturer} Product`],
      lineCount: index + 1,
      portalUrl: `https://${manufacturer.toLowerCase()}.example.test/order`,
      orderPacketUrl: "/api/crm/vendor-order-packets/quote-123",
      payload: { customer: { name: "must not reach dashboard" } },
    }));
    const tasks = vendorOrderTasksFromRow({
      ...queuedRow,
      meta: { vendor_order_preparations: preparations },
    });
    expect(tasks.map((task) => task.manufacturer)).toEqual(["Norman", "Onyx", "Lotus", "Polar"]);
    expect(tasks.every((task) => task.customerName === "Ready Customer")).toBe(true);
    expect(tasks.every((task) => !("payload" in task))).toBe(true);
  });
});

describe("buildDashboardData", () => {
  it("counts Open Jobs as sold jobs that are not paid/completed", () => {
    const data = buildDashboardData({
      jobs: [
        job({ id: "quoted-lead", status: "quoted", customer_name: "Quoted Lead" }),
        job({ id: "sold-open", status: "sold", customer_name: "Sold Open", estimated_total: 1000 }),
        job({ id: "paid-status", status: "closed", customer_name: "Paid Status", estimated_total: 1000 }),
        job({ id: "paid-balance", status: "sold", customer_name: "Paid Balance", estimated_total: 1000 }),
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
    expect(data.bookkeepingRows.find((item) => item.id === "quote-sold-open")?.customerPhone).toBe("8055551212");
    expect(data.customerFiles.find((file) => file.customerName === "Sold Open")?.phone).toBe("8055551212");
    expect(data.customerFiles.find((file) => file.customerName === "Sold Open")?.lifetimeValue).toBe(1000);
    expect(data.customerFiles.find((file) => file.customerName === "Sold Open")?.openBalance).toBe(1000);
    expect(data.customerFiles.find((file) => file.customerName === "Paid Balance")?.lifetimeValue).toBe(1000);
    expect(data.customerFiles.find((file) => file.customerName === "Paid Balance")?.openBalance).toBe(0);
  });

  it("projects customer-table phone numbers onto standalone bookkeeping rows", () => {
    const data = buildDashboardData({
      jobs: [],
      quotes: [],
      events: [],
      customers: [
        {
          id: "customer-legacy",
          created_at: "2026-06-20T00:00:00.000Z",
          updated_at: "2026-06-20T00:00:00.000Z",
          source: "bookkeeping_import",
          display_name: "Legacy Customer",
          normalized_name: "legacy customer",
          phone: "805-555-4343",
          email: null,
          address: null,
          city: null,
          first_sold_date: null,
          latest_sold_date: null,
          latest_status: null,
          lifetime_value: 0,
          open_balance: 0,
          notes: null,
          meta: {}
        }
      ],
      products: [],
      contracts: [],
      entries: [bookkeepingEntry({ id: "entry-legacy", job_id: null, customer_name: "Legacy Customer" })],
      payments: [],
      credits: [],
      expenses: [],
      installationInvoiceEmails: [],
      kenPayments: [],
      openingBalance: 0,
      payoffTarget: 500000
    });

    expect(data.bookkeepingRows.find((row) => row.id === "entry-legacy")?.customerPhone).toBe("805-555-4343");
    expect(data.customerFiles.find((file) => file.customerName === "Legacy Customer")?.phone).toBe("805-555-4343");
  });

  it("counts signed customer contracts as sold even when the quote status is stale", () => {
    const signedAt = "2026-07-02T22:37:35.000Z";
    const data = buildDashboardData({
      jobs: [
        job({
          id: "signed-contract-job",
          status: "scheduled",
          customer_name: "Signed Contract Customer",
          estimated_total: 3000
        })
      ],
      quotes: [
        quote({
          id: "signed-contract-quote",
          job_id: "signed-contract-job",
          status: "sent",
          sold_at: null,
          quote_total: 3000,
          customer_name: "Signed Contract Customer",
          share_token: "signed-contract-token"
        })
      ],
      events: [],
      customers: [],
      products: [],
      contracts: [
        {
          id: "signed-contract",
          created_at: signedAt,
          updated_at: signedAt,
          customer_id: null,
          job_id: "signed-contract-job",
          quote_id: "signed-contract-quote",
          bookkeeping_entry_id: null,
          title: "Contract 805-2000",
          contract_url: "/quote/signed-contract-token",
          share_token: "signed-contract-token",
          status: "sold",
          signed_at: signedAt,
          total_amount: 3000,
          meta: {}
        }
      ],
      entries: [],
      payments: [],
      credits: [],
      expenses: [],
      installationInvoiceEmails: [],
      kenPayments: [],
      openingBalance: 0,
      payoffTarget: 500000
    });

    expect(data.summary.soldJobs).toBe(1);
    expect(data.summary.openJobs).toBe(1);
    expect(data.jobs.find((item) => item.id === "signed-contract-job")?.status).toBe("sold");
    expect(data.quotes.find((item) => item.id === "signed-contract-quote")).toMatchObject({
      status: "sold",
      live_status: "sold",
      signed_at: signedAt,
      sold_at: signedAt
    });
    expect(data.bookkeepingRows.find((item) => item.id === "signed-contract-quote")).toMatchObject({
      status: "sold",
      soldDate: signedAt,
      total: 3000
    });
    expect(data.customerFiles.find((file) => file.customerName === "Signed Contract Customer")).toMatchObject({
      latestStatus: "sold",
      latestSoldDate: signedAt
    });
  });
});

describe("quote bookkeeping notes", () => {
  const actor = { email: "bookkeeper@805shutters.com" };

  it("resolves quote bookkeeping customer names without falling back over real data", () => {
    expect(
      resolveQuoteBookkeepingCustomerName({
        payloadCustomerName: "  Payload Customer  ",
        existingEntryCustomerName: "Ledger Customer",
        jobCustomerName: "Job Customer"
      })
    ).toBe("Payload Customer");
    expect(
      resolveQuoteBookkeepingCustomerName({
        existingEntryCustomerName: "Ledger Customer",
        jobCustomerName: "Job Customer"
      })
    ).toBe("Ledger Customer");
    expect(
      resolveQuoteBookkeepingCustomerName({
        existingEntryCustomerName: "Linked job",
        jobCustomerName: "Job Customer"
      })
    ).toBe("Job Customer");
    expect(resolveQuoteBookkeepingCustomerName({})).toBe("Linked job");
  });

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

  it("allows an intentional overall-total override for a builder-managed quote", async () => {
    const { calls, supabase } = createSupabaseRecorder({
      existingQuote: quote({
        id: "quote-1",
        status: "ordered",
        quote_total: 5000,
        deposit_required: 2500,
        balance_due: 2500,
        meta: { adjustments: { depositPercent: 50, balanceDueOverride: 2400 } }
      }),
      lineItemCount: 3
    });

    await updateCrmQuote(
      supabase,
      "quote-1",
      { quote_total: 3955.12, manual_total_override: true },
      actor
    );

    const quoteUpdate = calls.find((call) => call.table === "crm_quotes" && call.action === "update");
    const entryUpsert = calls.find(
      (call) => call.table === "crm_quote_bookkeeping_entries" && call.action === "upsert"
    );
    expect(quoteUpdate?.payload).toMatchObject({
      quote_total: 3955.12,
      deposit_required: 1977.56,
      balance_due: 1977.56,
      meta: {
        adjustments: {
          depositPercent: 50,
          totalOverride: 3955.12,
          balanceDueOverride: null
        }
      }
    });
    expect(entryUpsert?.payload).toMatchObject({ total_amount: 3955.12 });
  });

  it("preserves the existing bookkeeping customer name when quote updates omit customer_name", async () => {
    const { calls, supabase } = createSupabaseRecorder({
      job: job({ id: "job-1", customer_name: "Linked Job Customer" }),
      existingQuote: quote({ id: "quote-1", job_id: "job-1", status: "ordered" }),
      existingEntry: bookkeepingEntry({ quote_id: "quote-1", customer_name: "Actual Ledger Customer" })
    });

    await updateCrmQuote(supabase, "quote-1", { manufacturer_order_ref: "PO-123" }, actor);

    const entryUpsert = calls.find(
      (call) => call.table === "crm_quote_bookkeeping_entries" && call.action === "upsert"
    );
    expect(entryUpsert?.payload).toMatchObject({
      quote_id: "quote-1",
      customer_name: "Actual Ledger Customer",
      manufacturer_order_ref: "PO-123"
    });
  });

  it("records installation invoice payment fields on a quote-backed bookkeeping row", async () => {
    const { calls, supabase } = createSupabaseRecorder({
      existingQuote: quote({ id: "quote-1", job_id: "job-1", status: "ordered" }),
      existingEntry: bookkeepingEntry({ quote_id: "quote-1", customer_name: "Actual Ledger Customer" })
    });

    await updateCrmQuote(
      supabase,
      "quote-1",
      {
        installation_invoice_paid_at: "2026-07-04",
        installation_invoice_paid_amount: 425.75,
        installation_invoice_payment_method: "check",
        installation_invoice_payment_notes: "Installer invoice 805-44"
      },
      actor
    );

    const entryUpsert = calls.find(
      (call) => call.table === "crm_quote_bookkeeping_entries" && call.action === "upsert"
    );
    expect(entryUpsert?.payload).toMatchObject({
      quote_id: "quote-1",
      installation_invoice_paid_at: "2026-07-04",
      installation_invoice_paid_amount: 425.75,
      installation_invoice_payment_method: "check",
      installation_invoice_payment_notes: "Installer invoice 805-44"
    });
  });

  it("records installation invoice payment fields on a manual bookkeeping row", async () => {
    const { calls, supabase } = createSupabaseRecorder({
      existingEntry: bookkeepingEntry({ id: "entry-1", job_id: "job-1", installation_invoice_amount: 425.75 })
    });

    await updateCrmBookkeepingEntry(
      supabase,
      "entry-1",
      {
        installation_invoice_paid_at: "2026-07-04",
        installation_invoice_paid_amount: 425.75,
        installation_invoice_payment_method: "check"
      },
      actor
    );

    const entryUpdate = calls.find(
      (call) => call.table === "crm_quote_bookkeeping_entries" && call.action === "update"
    );
    expect(entryUpdate?.payload).toMatchObject({
      installation_invoice_paid_at: "2026-07-04",
      installation_invoice_paid_amount: 425.75,
      installation_invoice_payment_method: "check"
    });
  });

  it("defaults a Gmail installation invoice paid amount to the extracted invoice amount", async () => {
    const { calls, supabase } = createSupabaseRecorder({
      existingInstallationInvoiceEmail: installationInvoiceEmail({
        id: "install-email-1",
        extracted_invoice_amount: 375
      })
    });

    await updateCrmInstallationInvoiceEmail(
      supabase,
      "install-email-1",
      {
        installation_invoice_paid_at: "2026-07-04"
      },
      actor
    );

    const emailUpdate = calls.find(
      (call) => call.table === "crm_installation_invoice_emails" && call.action === "update"
    );
    expect(emailUpdate?.payload).toMatchObject({
      installation_invoice_paid_at: "2026-07-04",
      installation_invoice_paid_amount: 375
    });
    expect(calls.find((call) => call.table === "crm_activity_events" && call.action === "insert")?.payload).toMatchObject({
      entity_type: "installation_invoice_email",
      entity_id: "install-email-1",
      action: "update"
    });
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

  it("syncs manual bookkeeping total edits onto the linked job estimate", async () => {
    const { calls, supabase } = createSupabaseRecorder({
      job: job({ id: "job-1", estimated_total: 1000 }),
      existingEntry: bookkeepingEntry({ id: "entry-1", job_id: "job-1", total_amount: 1000 })
    });

    await updateCrmBookkeepingEntry(
      supabase,
      "entry-1",
      {
        total_amount: 5170.41
      },
      actor
    );

    const jobTotalUpdate = calls.find(
      (call) =>
        call.table === "crm_jobs" &&
        call.action === "update" &&
        (call.payload as Record<string, unknown>).estimated_total === 5170.41
    );

    expect(jobTotalUpdate?.payload).toMatchObject({
      estimated_total: 5170.41
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

  it("does not let Ken change payoff settings", async () => {
    await expect(
      updateCrmSettings(
        {} as never,
        { payoff_target: 500000, ken_opening_balance: 0 },
        { email: "khill31@msn.com" }
      )
    ).rejects.toBeInstanceOf(CrmAuthError);
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
      crm_quote_bookkeeping_entries: [
        // Installer invoice matched (waived at $0) so the job is payable —
        // unmatched rows are held for the missing installer invoice.
        bookkeepingEntry({
          source: "crm_quote",
          quote_id: "quote-1",
          cogs_amount: 100,
          installation_match_status: "matched",
          installation_matched_at: "2026-06-25T00:00:00.000Z"
        })
      ],
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

  it("stores commission payment metadata in the existing payment table when commission storage is missing", async () => {
    const kenPayments: Array<Record<string, unknown>> = [];
    const calls: Array<{ table: string; action: string; payload?: unknown }> = [];
    const rowsByTable: Record<string, unknown[]> = {
      crm_jobs: [job({ id: "job-1", status: "closed", customer_name: "Susan Milani" })],
      crm_quotes: [
        quote({
          id: "quote-1",
          job_id: "job-1",
          status: "sold",
          quote_total: 1000,
          materials_cost: 100,
          sold_by: "Mike",
          customer_name: "Susan Milani"
        })
      ],
      crm_quote_bookkeeping_entries: [
        // Installer invoice matched (waived at $0) so the job is payable —
        // unmatched rows are held for the missing installer invoice.
        bookkeepingEntry({
          source: "crm_quote",
          quote_id: "quote-1",
          cogs_amount: 100,
          installation_match_status: "matched",
          installation_matched_at: "2026-06-25T00:00:00.000Z"
        })
      ],
      crm_quote_bookkeeping_payments: [
        payment({ id: "quote-payment-1", quote_id: "quote-1", job_id: "job-1", amount: 1000 })
      ],
      crm_quote_bookkeeping_credits: [],
      crm_job_expenses: [],
      crm_installation_invoice_emails: [],
      crm_ken_payments: kenPayments,
      crm_ken_payment_allocations: [],
      crm_order_cogs_emails: [],
      crm_commission_payments: [],
      crm_commission_payment_allocations: [],
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
        if (this.table === "crm_commission_payments") {
          return { data: null, error: { code: "PGRST205", message: "Could not find the table 'public.crm_commission_payments'" } };
        }
        if (this.action === "insert") {
          const payload = this.payload as Record<string, unknown>;
          const data = { id: `${this.table}-1`, created_at: "2026-06-30T00:00:00.000Z", updated_at: "2026-06-30T00:00:00.000Z", ...payload };
          if (this.table === "crm_ken_payments") kenPayments.push(data);
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
          error: { code: "PGRST202", message: "Could not find the function public.crm_create_commission_payment_batch" }
        });
      }
    } as unknown as Parameters<typeof createPartnerPaymentBatch>[0];

    const result = await createPartnerPaymentBatch(
      supabase,
      { person: "mike", item_ids: ["mike:crm_quote:quote-1"] },
      { email: "805shutters@gmail.com" }
    );

    expect(calls.some((call) => call.table === "crm_commission_payments")).toBe(true);
    const fallbackPayload = calls.find((call) => call.table === "crm_ken_payments")?.payload as Record<string, unknown>;
    expect(fallbackPayload).toMatchObject({ amount: 800 });
    expect(fallbackPayload.meta).toMatchObject({
      partnerPaymentPerson: "mike",
      partnerPaymentFallbackTable: "crm_ken_payments"
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
      customer_notes: "4 shutters",
      job_status: "scheduled"
    });
  });

  it("adds quote sent and signed contract milestones to calendar events", () => {
    const events = [
      {
        id: "event-quote",
        created_at: "2026-06-20T00:00:00.000Z",
        updated_at: "2026-06-20T00:00:00.000Z",
        job_id: "job-quote",
        title: "Quote follow-up",
        event_type: "sales_consult",
        status: "scheduled",
        assigned_to: "Jessica",
        start_at: "2026-06-24T23:00:00.000Z",
        end_at: "2026-06-25T00:00:00.000Z",
        location: null,
        notes: null
      } satisfies CrmCalendarEvent
    ];
    const jobs = [job({ id: "job-quote", status: "quoted" })];
    const quotes = [
      quote({
        id: "quote-sent",
        job_id: "job-quote",
        status: "sent",
        sent_at: "2026-06-25T18:00:00.000Z"
      }),
      quote({
        id: "quote-signed",
        job_id: "job-quote",
        status: "sold",
        sent_at: "2026-06-26T18:00:00.000Z",
        signed_at: "2026-06-27T18:00:00.000Z"
      })
    ];
    const contracts = [
      {
        id: "contract-1",
        created_at: "2026-06-27T18:00:00.000Z",
        updated_at: "2026-06-28T18:00:00.000Z",
        customer_id: null,
        job_id: null,
        quote_id: "quote-signed",
        bookkeeping_entry_id: null,
        title: "Contract Q-1",
        contract_url: null,
        share_token: null,
        status: "sold",
        signed_at: "2026-06-28T18:00:00.000Z",
        total_amount: 1000,
        meta: {}
      } satisfies CrmCustomerContract
    ];

    expect(enrichCalendarEventsWithJobDetails(events, jobs, quotes, contracts)[0]).toMatchObject({
      quote_sent_at: "2026-06-26T18:00:00.000Z",
      quote_signed_at: "2026-06-27T18:00:00.000Z",
      customer_contract_signed_at: "2026-06-28T18:00:00.000Z"
    });
  });
});

describe("cancelCrmCalendarEvent", () => {
  it("cancels the calendar event and clears the linked scheduled job appointment", async () => {
    const { inserts, supabase, updates } = calendarCancelRecorder({
      event: {
        id: "event-1",
        created_at: "2026-06-20T00:00:00.000Z",
        updated_at: "2026-06-20T00:00:00.000Z",
        job_id: "job-1",
        title: "Renee consultation",
        event_type: "sales_consult",
        status: "scheduled",
        assigned_to: "Jessica",
        start_at: "2026-06-30T21:00:00.000Z",
        end_at: "2026-06-30T22:00:00.000Z",
        location: "6 Via Magnolia",
        notes: "NO SHOES IN HOME",
        meta: { createdBy: "805shutters@gmail.com" }
      },
      job: {
        id: "job-1",
        created_at: "2026-06-20T00:00:00.000Z",
        updated_at: "2026-06-20T00:00:00.000Z",
        source: "crm",
        lead_id: null,
        status: "scheduled",
        priority: "normal",
        customer_name: "Renee Appell",
        phone: "8185357772",
        email: null,
        address: "6 Via Magnolia",
        city: "Thousand Oaks",
        product_interest: "Shutters",
        sales_owner: "Jessica",
        next_action: "Prepare for appointment",
        next_action_due: "2026-06-30",
        appointment_start: "2026-06-30T21:00:00.000Z",
        appointment_end: "2026-06-30T22:00:00.000Z",
        estimated_total: 0,
        deposit_paid: 0,
        notes: "NO SHOES IN HOME"
      }
    });

    const result = await cancelCrmCalendarEvent(supabase, { id: "event-1" }, actor);

    expect(result.status).toBe("canceled");
    expect(updates.find((update) => update.table === "crm_calendar_events")?.payload).toMatchObject({
      status: "canceled",
      meta: {
        createdBy: "805shutters@gmail.com",
        canceledBy: actor.email
      }
    });
    expect(updates.find((update) => update.table === "crm_jobs")?.payload).toEqual({
      appointment_start: null,
      appointment_end: null,
      status: "follow_up",
      next_action: "Follow up after canceled appointment",
      next_action_due: null
    });
    expect(inserts[0]?.payload).toMatchObject({
      entity_type: "calendar_event",
      entity_id: "event-1",
      action: "cancel",
      metadata: {
        jobId: "job-1"
      }
    });
  });
});

function calendarCancelRecorder(opts: { event: CrmCalendarEvent; job?: CrmJob | null }) {
  const inserts: Array<{ table: string; payload: Record<string, unknown> }> = [];
  const updates: Array<{ table: string; filters: Record<string, unknown>; payload: Record<string, unknown> }> = [];

  class QueryRecorder {
    private filters: Record<string, unknown> = {};
    private payload: Record<string, unknown> | null = null;

    constructor(private table: string) {}

    select(_columns?: string) {
      return this;
    }

    eq(key: string, value: unknown) {
      this.filters[key] = value;
      return this;
    }

    update(payload: Record<string, unknown>) {
      this.payload = payload;
      updates.push({ table: this.table, filters: this.filters, payload });
      return this;
    }

    insert(payload: Record<string, unknown>) {
      inserts.push({ table: this.table, payload });
      return { error: null };
    }

    async maybeSingle() {
      if (this.table === "crm_calendar_events") return { data: opts.event, error: null };
      if (this.table === "crm_jobs" && !this.payload) return { data: opts.job ?? null, error: null };
      if (this.table === "crm_jobs") return { data: null, error: null };
      return { data: null, error: null };
    }

    async single() {
      if (this.table === "crm_calendar_events" && this.payload) {
        return { data: { ...opts.event, ...this.payload }, error: null };
      }
      return { data: null, error: null };
    }
  }

  const supabase = {
    from(table: string) {
      return new QueryRecorder(table);
    }
  } as unknown as Parameters<typeof cancelCrmCalendarEvent>[0];

  return { inserts, supabase, updates };
}

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

describe("deleteSalesQuote", () => {
  it("soft-deletes the quote so append-only V2 audit history is preserved", async () => {
    const updates: Array<Record<string, unknown>> = [];
    const inserts: Array<Record<string, unknown>> = [];

    class QueryRecorder {
      constructor(private table: string) {}
      select() { return this; }
      eq() { return this; }
      update(payload: Record<string, unknown>) {
        if (this.table === "sales_quotes") updates.push(payload);
        return this;
      }
      insert(payload: Record<string, unknown>) {
        if (this.table === "crm_activity_events") inserts.push(payload);
        return this;
      }
      async maybeSingle() {
        return this.table === "sales_quotes"
          ? { data: { id: "quote-v2-1", quote_number: "805-0200" }, error: null }
          : { data: null, error: null };
      }
      then<TResult1 = unknown, TResult2 = never>(
        onfulfilled?: ((value: { error: null }) => TResult1 | PromiseLike<TResult1>) | null,
        onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
      ) {
        return Promise.resolve({ error: null }).then(onfulfilled, onrejected);
      }
    }

    const supabase = {
      from(table: string) {
        return new QueryRecorder(table);
      }
    } as unknown as Parameters<typeof deleteSalesQuote>[0];

    await deleteSalesQuote(supabase, "quote-v2-1", actor);

    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({
      deleted_by: actor.email,
      deleted_by_user_id: actor.userId
    });
    expect(updates[0].deleted_at).toEqual(expect.any(String));
    expect(inserts[0]).toMatchObject({
      entity_type: "quote",
      entity_id: "quote-v2-1",
      action: "delete"
    });
  });
});

function customerDeleteRecorder() {
  const tables: Record<string, Array<Record<string, unknown>>> = {
    crm_customers: [{ id: "customer-1", meta: { existingCustomer: true } }],
    crm_jobs: [{ id: "job-1", meta: { existingJob: true } }],
    crm_quotes: [{ id: "quote-1", job_id: "job-1", meta: { existingQuote: true } }],
    crm_quote_bookkeeping_entries: [
      { id: "entry-1", job_id: "job-1", quote_id: "quote-1", meta: { existingEntry: true } }
    ],
    crm_customer_products: [
      { id: "product-1", customer_id: "customer-1", job_id: null, quote_id: null, bookkeeping_entry_id: null, meta: {} }
    ],
    crm_customer_contracts: [
      { id: "contract-1", customer_id: "customer-1", job_id: null, quote_id: null, bookkeeping_entry_id: null, meta: {} }
    ],
    crm_activity_events: []
  };

  class QueryRecorder {
    private operation: "select" | "update" | "insert" = "select";
    private filters: Record<string, unknown> = {};
    private inFilter: { column: string; values: unknown[] } | null = null;
    private payload: Record<string, unknown> | null = null;
    private selectedColumns = "*";

    constructor(private table: string) {}

    select(columns = "*") {
      this.selectedColumns = columns;
      return this;
    }

    in(column: string, values: unknown[]) {
      this.inFilter = { column, values };
      return this;
    }

    eq(key: string, value: unknown) {
      this.filters[key] = value;
      return this;
    }

    update(payload: Record<string, unknown>) {
      this.operation = "update";
      this.payload = payload;
      return this;
    }

    insert(payload: Record<string, unknown>) {
      this.operation = "insert";
      this.payload = payload;
      return this;
    }

    then<TResult1 = unknown, TResult2 = never>(
      onfulfilled?: ((value: { data?: unknown; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
    ) {
      return Promise.resolve(this.execute()).then(onfulfilled, onrejected);
    }

    private matches(record: Record<string, unknown>) {
      const eqMatches = Object.entries(this.filters).every(([column, value]) => record[column] === value);
      const inMatches = !this.inFilter || this.inFilter.values.includes(record[this.inFilter.column]);
      return eqMatches && inMatches;
    }

    private execute() {
      const records = tables[this.table] || [];
      if (this.operation === "insert") {
        records.push({ ...(this.payload || {}) });
        return { data: null, error: null };
      }

      if (this.operation === "update") {
        for (const record of records) {
          if (this.matches(record)) Object.assign(record, this.payload);
        }
        return { data: null, error: null };
      }

      const data = records.filter((record) => this.matches(record)).map((record) => {
        if (this.selectedColumns === "id") return { id: record.id };
        return record;
      });
      return { data, error: null };
    }
  }

  const supabase = {
    from(table: string) {
      return new QueryRecorder(table);
    }
  } as unknown as Parameters<typeof deleteCrmCustomerFile>[0];

  return { supabase, tables };
}

describe("deleteCrmCustomerFile", () => {
  it("tombstones the customer file and linked CRM records without physical deletes", async () => {
    const { supabase, tables } = customerDeleteRecorder();

    const result = await deleteCrmCustomerFile(
      supabase,
      "customer-1",
      {
        customerId: "customer-1",
        customerName: "Kelly Krasner",
        jobIds: ["job-1"]
      },
      actor
    );

    expect(result).toMatchObject({ deleted: true, count: 6 });
    expect(tables.crm_customers[0].meta).toMatchObject({
      existingCustomer: true,
      deleted_by: actor.email,
      delete_source: "customer_file_delete"
    });
    expect(tables.crm_jobs[0].meta).toMatchObject({
      existingJob: true,
      deleted_by: actor.email,
      delete_source: "customer_file_delete"
    });
    expect(tables.crm_quotes[0].meta).toMatchObject({
      existingQuote: true,
      deleted_by: actor.email,
      bookkeeping_deleted_by: actor.email,
      bookkeeping_delete_source: "customer_file_delete"
    });
    expect(tables.crm_quote_bookkeeping_entries[0].meta).toMatchObject({
      existingEntry: true,
      deleted_by: actor.email,
      bookkeeping_deleted_by: actor.email,
      bookkeeping_delete_source: "customer_file_delete"
    });
    expect(tables.crm_customer_products[0].meta).toMatchObject({ deleted_by: actor.email });
    expect(tables.crm_customer_contracts[0].meta).toMatchObject({ deleted_by: actor.email });
    expect(tables.crm_activity_events[0]).toMatchObject({
      actor_email: actor.email,
      entity_type: "customer",
      action: "delete"
    });
  });
});

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

function ledgerLineRecorder(opts: { table: string; row: Record<string, unknown> | null }) {
  const deletes: Array<{ table: string; filters: Record<string, unknown> }> = [];
  const updates: Array<{ table: string; filters: Record<string, unknown>; payload: Record<string, unknown> }> = [];
  const inserts: Array<{ table: string; payload: Record<string, unknown> }> = [];

  class QueryRecorder {
    table: string;
    filters: Record<string, unknown> = {};
    payload: Record<string, unknown> | null = null;
    operation: "select" | "update" | "insert" | "delete" = "select";

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

    update(payload: Record<string, unknown>) {
      this.operation = "update";
      this.payload = payload;
      return this;
    }

    insert(payload: Record<string, unknown>) {
      this.operation = "insert";
      this.payload = payload;
      return this;
    }

    delete() {
      this.operation = "delete";
      return this;
    }

    async maybeSingle() {
      if (this.table === opts.table && opts.row && this.filters.id === opts.row.id) {
        return { data: opts.row, error: null };
      }
      return { data: null, error: null };
    }

    async single() {
      if (this.operation === "update") {
        updates.push({ table: this.table, filters: this.filters, payload: this.payload || {} });
        return { data: { ...(opts.row || {}), ...(this.payload || {}) }, error: null };
      }
      if (this.operation === "insert") {
        inserts.push({ table: this.table, payload: this.payload || {} });
        return { data: { id: "new-line-1", ...(this.payload || {}) }, error: null };
      }
      return { data: opts.row, error: null };
    }

    then<TResult1 = unknown, TResult2 = never>(
      onfulfilled?: ((value: { data: null; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
    ) {
      if (this.operation === "delete") deletes.push({ table: this.table, filters: this.filters });
      if (this.operation === "insert") inserts.push({ table: this.table, payload: this.payload || {} });
      if (this.operation === "update") updates.push({ table: this.table, filters: this.filters, payload: this.payload || {} });
      return Promise.resolve({ data: null, error: null } as { data: null; error: null }).then(onfulfilled, onrejected);
    }
  }

  const supabase = {
    from(table: string) {
      return new QueryRecorder(table);
    }
  } as unknown as Parameters<typeof deleteCrmBookkeepingPayment>[0];

  return { deletes, updates, inserts, supabase };
}

describe("ledger payment line CRUD", () => {
  it("updates amount, label, date, and type on the payment row only", async () => {
    const { updates, supabase } = ledgerLineRecorder({
      table: "crm_quote_bookkeeping_payments",
      row: { id: "payment-1", amount: 500, payment_label: "Deposit", payment_type: "check", meta: {} }
    });

    await updateCrmBookkeepingPayment(
      supabase,
      "payment-1",
      { amount: "750.25", payment_label: "Balance payment", payment_type: "zelle", paid_at: "2026-07-01" },
      actor
    );

    const paymentUpdates = updates.filter((update) => update.table === "crm_quote_bookkeeping_payments");
    expect(paymentUpdates).toHaveLength(1);
    expect(paymentUpdates[0].filters.id).toBe("payment-1");
    expect(paymentUpdates[0].payload).toMatchObject({
      amount: 750.25,
      payment_label: "Balance payment",
      payment_type: "zelle",
      paid_at: "2026-07-01"
    });
  });

  it("rejects a zero or negative payment amount", async () => {
    const { supabase } = ledgerLineRecorder({
      table: "crm_quote_bookkeeping_payments",
      row: { id: "payment-1", amount: 500, meta: {} }
    });

    await expect(updateCrmBookkeepingPayment(supabase, "payment-1", { amount: 0 }, actor)).rejects.toMatchObject({
      status: 400
    });
  });

  it("deletes only the payment row and records an audit event with the before snapshot", async () => {
    const before = { id: "payment-1", amount: 500, payment_label: "Deposit", meta: {} };
    const { deletes, inserts, supabase } = ledgerLineRecorder({
      table: "crm_quote_bookkeeping_payments",
      row: before
    });

    await deleteCrmBookkeepingPayment(supabase, "payment-1", actor);

    expect(deletes).toHaveLength(1);
    expect(deletes[0].table).toBe("crm_quote_bookkeeping_payments");
    expect(deletes[0].filters.id).toBe("payment-1");
    const audit = inserts.find((insert) => insert.table === "crm_activity_events");
    expect(audit?.payload).toMatchObject({ entity_type: "bookkeeping_payment", action: "delete", before_data: before });
  });

  it("404s when the payment does not exist", async () => {
    const { deletes, supabase } = ledgerLineRecorder({ table: "crm_quote_bookkeeping_payments", row: null });
    await expect(deleteCrmBookkeepingPayment(supabase, "missing", actor)).rejects.toMatchObject({ status: 404 });
    expect(deletes).toHaveLength(0);
  });
});

describe("ledger credit line CRUD", () => {
  it("updates amount, date, and note on the credit row", async () => {
    const { updates, supabase } = ledgerLineRecorder({
      table: "crm_quote_bookkeeping_credits",
      row: { id: "credit-1", amount: 100, note: "Old", meta: {} }
    });

    await updateCrmBookkeepingCredit(supabase, "credit-1", { amount: 250, credit_date: "2026-07-02", note: "Adjusted" }, actor);

    const creditUpdates = updates.filter((update) => update.table === "crm_quote_bookkeeping_credits");
    expect(creditUpdates).toHaveLength(1);
    expect(creditUpdates[0].payload).toMatchObject({ amount: 250, credit_date: "2026-07-02", note: "Adjusted" });
  });

  it("deletes only the credit row and audits it", async () => {
    const { deletes, inserts, supabase } = ledgerLineRecorder({
      table: "crm_quote_bookkeeping_credits",
      row: { id: "credit-1", amount: 100, meta: {} }
    });

    await deleteCrmBookkeepingCredit(supabase, "credit-1", actor);

    expect(deletes).toHaveLength(1);
    expect(deletes[0].table).toBe("crm_quote_bookkeeping_credits");
    const audit = inserts.find((insert) => insert.table === "crm_activity_events");
    expect(audit?.payload).toMatchObject({ entity_type: "bookkeeping_credit", action: "delete" });
  });
});

describe("job expense CRUD", () => {
  it("creates an expense tied to a bookkeeping entry", async () => {
    const { inserts, supabase } = ledgerLineRecorder({ table: "crm_job_expenses", row: null });

    await createCrmJobExpense(
      supabase,
      { bookkeeping_entry_id: "entry-1", label: "Permit fee", category: "permit", amount: 85, incurred_on: "2026-07-01" },
      actor
    );

    const expenseInsert = inserts.find((insert) => insert.table === "crm_job_expenses");
    expect(expenseInsert?.payload).toMatchObject({
      bookkeeping_entry_id: "entry-1",
      label: "Permit fee",
      category: "permit",
      amount: 85,
      source: "manual"
    });
  });

  it("refuses an expense with no target row", async () => {
    const { supabase } = ledgerLineRecorder({ table: "crm_job_expenses", row: null });
    await expect(createCrmJobExpense(supabase, { label: "Orphan", amount: 10 }, actor)).rejects.toMatchObject({
      status: 400
    });
  });

  it("refuses an unknown category", async () => {
    const { supabase } = ledgerLineRecorder({ table: "crm_job_expenses", row: null });
    await expect(
      createCrmJobExpense(supabase, { job_id: "job-1", label: "Bad", category: "bribery", amount: 10 }, actor)
    ).rejects.toMatchObject({ status: 400 });
  });

  it("updates the expense row in place", async () => {
    const { updates, supabase } = ledgerLineRecorder({
      table: "crm_job_expenses",
      row: { id: "expense-1", label: "Permit fee", category: "permit", amount: 85, meta: {} }
    });

    await updateCrmJobExpense(supabase, "expense-1", { amount: 120, category: "repair" }, actor);

    const expenseUpdates = updates.filter((update) => update.table === "crm_job_expenses");
    expect(expenseUpdates).toHaveLength(1);
    expect(expenseUpdates[0].payload).toMatchObject({ amount: 120, category: "repair" });
  });

  it("deletes only the expense row and audits it", async () => {
    const { deletes, inserts, supabase } = ledgerLineRecorder({
      table: "crm_job_expenses",
      row: { id: "expense-1", amount: 85, meta: {} }
    });

    await deleteCrmJobExpense(supabase, "expense-1", actor);

    expect(deletes).toHaveLength(1);
    expect(deletes[0].table).toBe("crm_job_expenses");
    const audit = inserts.find((insert) => insert.table === "crm_activity_events");
    expect(audit?.payload).toMatchObject({ entity_type: "expense", action: "delete" });
  });
});
