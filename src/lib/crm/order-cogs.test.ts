import { afterEach, describe, expect, it, vi } from "vitest";
import { extractNormanOrderCogs, extractOnyxOrderCogs, extractOrderCogsFromText, orderCogsTelegramText, processOrderCogsInbox } from "@/lib/crm/order-cogs";

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}

function gmailTextBody(text: string) {
  return Buffer.from(text, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

// A realistic Norman "Online Order Confirmation" body. The end-customer ("Jim Derenthal")
// is only in the PO#/Side Mark; the Company/Owner fields are the dealer (SNS / Ken Hill).
const NORMAN_BODY = [
  "Dear Customer, Thank you for your order!",
  "Norman Window Fashions www.normanusa.com",
  "Order Details",
  "Order Date: 6/22/2026",
  "WO#: 8880976230",
  "PO#: Jim Derenthal Roller",
  "Side Mark: Jim Derenthal Roller",
  "Ship Via: Air Freight to US",
  "Payment Terms: NET 15 DAY",
  "Customer ID: R00743",
  "Company Name: SNS Interiors, Inc.",
  "Owner Name: KEN HILL",
  "Pricing",
  "Sales Amount: $540.90",
  "Freight Handling Fee: $25.00",
  "Processing Fee: $11.32",
  "Tax Amount: $40.04",
  "Total Amount: $617.26"
].join("\n");

const NORMAN_SECOND_BODY = [
  "Dear Customer, Thank you for your order!",
  "Norman Window Fashions www.normanusa.com",
  "Order Details",
  "Order Date: 6/23/2026",
  "WO#: 8800217950",
  "PO#: Jim Derenthal Roller 2",
  "Side Mark: Jim Derenthal Roller 2",
  "Ship Via: Air Freight to US",
  "Payment Terms: NET 15 DAY",
  "Customer ID: R00743",
  "Company Name: SNS Interiors, Inc.",
  "Owner Name: KEN HILL",
  "Pricing",
  "Sales Amount: $270.00",
  "Freight Handling Fee: $25.00",
  "Processing Fee: $5.00",
  "Tax Amount: $12.40",
  "Total Amount: $312.40"
].join("\n");

const NORMAN_FIRST_NAME_BODY = [
  "Dear Customer, Thank you for your order!",
  "Norman Window Fashions www.normanusa.com",
  "Order Details",
  "Order Date: 7/20/2026",
  "WO#: 888097777",
  "PO#: Jason Chappelle",
  "Side Mark: Jason Chappelle",
  "Ship Via: Air Freight to US",
  "Payment Terms: NET 15 DAY",
  "Customer ID: R00743",
  "Company Name: SNS Interiors, Inc.",
  "Owner Name: KEN HILL",
  "Pricing",
  "Sales Amount: $1,100.00",
  "Freight Handling Fee: $25.00",
  "Processing Fee: $10.00",
  "Tax Amount: $98.45",
  "Total Amount: $1,233.45"
].join("\n");

class FakeSupabaseQuery {
  private action: "select" | "update" | "upsert" | "insert" = "select";
  private patch: Record<string, unknown> | null = null;
  private input: Record<string, unknown> | null = null;
  private filters: Record<string, unknown> = {};
  private wantsSingle = false;

  constructor(private readonly db: FakeSupabase, private readonly table: string) {}

  select() {
    // Preserve a prior insert/update/upsert action; a bare read stays "select".
    return this;
  }

  in() {
    return this;
  }

  limit() {
    return this;
  }

  update(patch: Record<string, unknown>) {
    this.action = "update";
    this.patch = patch;
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters[column] = value;
    return this;
  }

  upsert(input: Record<string, unknown>) {
    this.action = "upsert";
    this.input = input;
    return this;
  }

  insert(input: Record<string, unknown>) {
    this.action = "insert";
    this.input = input;
    return this;
  }

  single() {
    this.wantsSingle = true;
    return this;
  }

  maybeSingle() {
    this.wantsSingle = true;
    return this;
  }

  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ) {
    return Promise.resolve(this.result()).then(onfulfilled, onrejected);
  }

  private result() {
    if (this.action === "update") {
      this.db.updates.push({ table: this.table, patch: this.patch || {}, filters: this.filters });
      for (const row of this.db.selectRows(this.table)) {
        const matches = Object.entries(this.filters).every(([column, value]) => row[column] === value);
        if (matches) Object.assign(row, this.patch || {});
      }
      return { data: { id: this.filters.id, ...(this.patch || {}) }, error: null };
    }

    if (this.action === "insert" || this.action === "upsert") {
      const record = {
        id: `order-cogs-${this.db.records.length + 1}`,
        created_at: "2026-06-22T00:00:00.000Z",
        updated_at: "2026-06-22T00:00:00.000Z",
        ...(this.input || {})
      };
      if (this.table === "crm_order_cogs_emails") {
        if (this.db.failOrderCogsRecordWrites) {
          return { data: null, error: { message: "Could not find the table 'public.crm_order_cogs_emails' in the schema cache" } };
        }
        this.db.records.push(record);
        return { data: record, error: null };
      }
      this.db.inserts.push({ table: this.table, row: this.input || {} });
      return { data: this.input, error: null };
    }

    const rows = this.db.selectRows(this.table);
    const filtered = rows.filter((row) =>
      Object.entries(this.filters).every(([column, value]) => row[column] === value)
    );
    if (this.wantsSingle) return { data: filtered[0] ?? null, error: null };
    return { data: filtered, error: null };
  }
}

class FakeSupabase {
  records: Array<Record<string, unknown>> = [];
  updates: Array<{ table: string; patch: Record<string, unknown>; filters: Record<string, unknown> }> = [];
  inserts: Array<{ table: string; row: Record<string, unknown> }> = [];
  failOrderCogsRecordWrites = false;

  jobs: Array<Record<string, unknown>> = [
    {
      id: "job-1",
      customer_name: "Jim Derenthal",
      status: "sold",
      estimated_total: 5000,
      phone: "8051112222",
      email: "jim.derenthal@example.com",
      address: "1 Main St",
      product_interest: "roller shades",
      meta: {}
    }
  ];
  entries: Array<Record<string, unknown>> = [
    {
      id: "entry-1",
      quote_id: null,
      job_id: "job-1",
      customer_name: "Jim Derenthal",
      sold_date: "2026-06-01",
      total_amount: 5000,
      cogs_amount: 0,
      meta: {}
    }
  ];

  from(table: string) {
    return new FakeSupabaseQuery(this, table);
  }

  selectRows(table: string) {
    if (table === "crm_quote_bookkeeping_entries") return this.entries;
    if (table === "crm_quotes") return [];
    if (table === "crm_jobs") return this.jobs;
    if (table === "crm_order_cogs_emails") return this.records;
    return [];
  }
}

describe("extractOrderCogsFromText", () => {
  it("extracts customer, total, and order number from a generic vendor order email", () => {
    const result = extractOrderCogsFromText("Customer: Jane Doe Order Total: $1,234.56 Order # ABC-1234");

    expect(result.customerName).toBe("Jane Doe");
    expect(result.orderAmount).toBe(1234.56);
    expect(result.orderNumber).toBe("ABC-1234");
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
  });
});

describe("extractNormanOrderCogs", () => {
  it("reads the customer from the side mark, COGS from Total Amount, and WO# as the ref", () => {
    const result = extractNormanOrderCogs(NORMAN_BODY);

    // Side mark "Jim Derenthal Roller" -> customer, with the product word stripped.
    expect(result.customerName).toBe("Jim Derenthal");
    // COGS is the full landed Total Amount, not the $540.90 Sales Amount.
    expect(result.orderAmount).toBe(617.26);
    expect(result.orderNumber).toBe("8880976230");
    expect(result.manufacturer).toBe("Norman");
    expect(result.amountConfidence).toBeGreaterThanOrEqual(0.7);
  });

  it("strips a trailing re-order number from a last-name-first side mark", () => {
    const result = extractNormanOrderCogs(
      "WO#: 8800217950 PO#: SAUCEDO MICHELLE 2 Side Mark: SAUCEDO MICHELLE 2 Ship Via: Air Total Amount: $312.40"
    );
    // The trailing "2" (a re-order marker) is removed so it matches the CRM customer.
    expect(result.customerName).toBe("SAUCEDO MICHELLE");
    expect(result.orderNumber).toBe("8800217950");
    expect(result.orderAmount).toBe(312.4);
  });

  it("reads a confirmation-sheet order number from Norman PDF text", () => {
    const result = extractNormanOrderCogs(
      "8800219384 Confirmation Sheet PO#: Linda Brown Side Mark: Linda Brown Total Amount: $1,025.00"
    );
    expect(result.customerName).toBe("Linda Brown");
    expect(result.orderNumber).toBe("8800219384");
    expect(result.orderAmount).toBe(1025);
  });
});

describe("extractOnyxOrderCogs", () => {
  it("uses Grand Total and normalizes a last-name-first PO", () => {
    const result = extractOnyxOrderCogs(
      "Order No.: 52607181014 PO No.: Brown, Linda Side Mark: CHE01-Brown, Linda Total Area: 125.000 Grand Total: 1646.25 Proposed Deposit: 823.13"
    );
    expect(result.customerName).toBe("Linda Brown");
    expect(result.orderNumber).toBe("52607181014");
    expect(result.orderAmount).toBe(1646.25);
    expect(result.manufacturer).toBe("Onyx");
  });
});

describe("orderCogsTelegramText", () => {
  it("reports the exact extracted amount and resulting CRM COGS total", () => {
    expect(orderCogsTelegramText({
      customerName: "Linda Brown",
      manufacturer: "Onyx",
      orderNumber: "52607181014",
      addedAmount: 1646.25,
      totalCogs: 2671.25
    })).toBe([
      "✅ COGS processed",
      "Customer: Linda Brown",
      "Manufacturer: Onyx",
      "Order: 52607181014",
      "Added to COGS: $1,646.25",
      "New total COGS: $2,671.25"
    ].join("\n"));
  });
});

describe("processOrderCogsInbox", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("auto-applies a Norman order: writes COGS and marks the job ordered", async () => {
    vi.stubEnv("GMAIL_805_CLIENT_ID", "client");
    vi.stubEnv("GMAIL_805_CLIENT_SECRET", "secret");
    vi.stubEnv("GMAIL_805_REFRESH_TOKEN", "refresh");

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.endsWith("/labels")) return jsonResponse({ labels: [{ id: "label-processed", name: "Processed" }] });
        if (url.includes("oauth2.googleapis.com/token")) {
          return jsonResponse({ access_token: "token" });
        }
        if (url.includes("/messages?")) {
          return jsonResponse({ messages: [{ id: "msg-norman" }, { id: "msg-review" }] });
        }
        if (url.includes("/modify")) {
          return jsonResponse({ id: "archived" });
        }
        if (url.includes("/messages/msg-norman")) {
          return jsonResponse({
            id: "msg-norman",
            threadId: "thread-norman",
            historyId: "hist-norman",
            snippet: "Online Order Confirmation",
            payload: {
              headers: [
                { name: "From", value: "OrderConfirmation@normanusa.com" },
                { name: "To", value: "805shutters@gmail.com" },
                { name: "Subject", value: "Online Order Confirmation: R00743 | WO# 8880976230" },
                { name: "Date", value: "Mon, 22 Jun 2026 10:03:00 -0700" }
              ],
              mimeType: "text/plain",
              body: { data: gmailTextBody(NORMAN_BODY) }
            }
          });
        }
        return jsonResponse({
          id: "msg-review",
          threadId: "thread-review",
          historyId: "hist-review",
          snippet: "Order for Jim Derenthal",
          payload: {
            headers: [
              { name: "From", value: "vendor@example.com" },
              { name: "To", value: "805shutters@gmail.com" },
              { name: "Subject", value: "Order confirmation DEF-5678" },
              { name: "Date", value: "Mon, 22 Jun 2026 10:05:00 -0700" }
            ],
            mimeType: "text/plain",
            body: { data: gmailTextBody("Customer: Jim Derenthal Order # DEF-5678") }
          }
        });
      })
    );

    const supabase = new FakeSupabase();
    // A joined email local part is an additional identity signal, not an extra
    // required name token. It must not lower an otherwise exact name match.
    supabase.jobs[0].email = "jderenthal@example.com";
    const result = await processOrderCogsInbox(supabase as never, { maxResults: 2 });

    expect(result.scanned).toBe(2);
    expect(result.processed).toBe(2);
    expect(result.matched).toBe(1);
    expect(result.needsReview).toBe(1);
    // Only the applied (matched) email is archived; the needs_review one stays in the inbox.
    expect(result.archived).toBe(1);
    expect(result.archiveErrors).toBe(0);

    // COGS written to the ledger row (the "bookkeeper spreadsheet" + customer file).
    const cogsUpdate = supabase.updates.find((u) => u.table === "crm_quote_bookkeeping_entries");
    expect(cogsUpdate).toMatchObject({
      filters: { id: "entry-1" },
      patch: expect.objectContaining({
        cogs_amount: 617.26,
        manufacturer_order_ref: "8880976230",
        manufacturer_name: "Norman"
      })
    });

    // The job is flipped to "ordered".
    const jobUpdate = supabase.updates.find((u) => u.table === "crm_jobs");
    expect(jobUpdate).toMatchObject({ filters: { id: "job-1" }, patch: { status: "ordered" } });

    // The status change is logged as activity.
    const activity = supabase.inserts.find((i) => i.table === "crm_activity_events");
    expect(activity?.row).toMatchObject({ entity_type: "job", entity_id: "job-1", action: "status.ordered" });

    // Records: the Norman email auto-applied; the amount-less generic email needs review.
    expect(supabase.records.map((record) => record.match_status)).toEqual(["matched", "needs_review"]);
  });

  it("matches a Norman order to a first-name CRM record using the customer email surname", async () => {
    vi.stubEnv("GMAIL_805_CLIENT_ID", "client");
    vi.stubEnv("GMAIL_805_CLIENT_SECRET", "secret");
    vi.stubEnv("GMAIL_805_REFRESH_TOKEN", "refresh");

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.includes("oauth2.googleapis.com/token")) {
          return jsonResponse({ access_token: "token" });
        }
        if (url.includes("/messages?")) {
          return jsonResponse({ messages: [{ id: "msg-jason" }] });
        }
        if (url.includes("/modify")) {
          return jsonResponse({ id: "archived" });
        }
        return jsonResponse({
          id: "msg-jason",
          threadId: "thread-jason",
          historyId: "hist-jason",
          snippet: "Online Order Confirmation",
          payload: {
            headers: [
              { name: "From", value: "OrderConfirmation@normanusa.com" },
              { name: "To", value: "805shutters@gmail.com" },
              { name: "Subject", value: "Online Order Confirmation: R00743 | WO# 888097777 | PO#: Jason Chappelle" },
              { name: "Date", value: "Mon, 20 Jul 2026 13:29:00 -0700" }
            ],
            mimeType: "text/plain",
            body: { data: gmailTextBody(NORMAN_FIRST_NAME_BODY) }
          }
        });
      })
    );

    const supabase = new FakeSupabase();
    supabase.jobs[0].customer_name = "Jason";
    supabase.jobs[0].email = "jason.chappelle@outlook.com";
    supabase.entries[0].customer_name = "Jason";

    const result = await processOrderCogsInbox(supabase as never, { maxResults: 1 });

    expect(result.matched).toBe(1);
    expect(result.needsReview).toBe(0);
    expect(supabase.records[0]).toMatchObject({
      extracted_customer_name: "Jason Chappelle",
      match_status: "matched",
      matched_job_id: "job-1"
    });
    expect(supabase.updates.find((u) => u.table === "crm_quote_bookkeeping_entries")).toMatchObject({
      filters: { id: "entry-1" },
      patch: expect.objectContaining({
        cogs_amount: 1233.45,
        manufacturer_order_ref: "888097777",
        manufacturer_name: "Norman"
      })
    });
  });

  it("adds a second Norman order for the same customer to existing COGS", async () => {
    vi.stubEnv("GMAIL_805_CLIENT_ID", "client");
    vi.stubEnv("GMAIL_805_CLIENT_SECRET", "secret");
    vi.stubEnv("GMAIL_805_REFRESH_TOKEN", "refresh");

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.endsWith("/labels")) return jsonResponse({ labels: [{ id: "label-processed", name: "Processed" }] });
        if (url.includes("oauth2.googleapis.com/token")) {
          return jsonResponse({ access_token: "token" });
        }
        if (url.includes("/messages?")) {
          return jsonResponse({ messages: [{ id: "msg-norman-first" }, { id: "msg-norman-second" }] });
        }
        if (url.includes("/modify")) {
          return jsonResponse({ id: "archived" });
        }
        if (url.includes("/messages/msg-norman-first")) {
          return jsonResponse({
            id: "msg-norman-first",
            threadId: "thread-norman-first",
            historyId: "hist-norman-first",
            snippet: "Online Order Confirmation",
            payload: {
              headers: [
                { name: "From", value: "OrderConfirmation@normanusa.com" },
                { name: "To", value: "805shutters@gmail.com" },
                { name: "Subject", value: "Online Order Confirmation: R00743 | WO# 8880976230" },
                { name: "Date", value: "Mon, 22 Jun 2026 10:03:00 -0700" }
              ],
              mimeType: "text/plain",
              body: { data: gmailTextBody(NORMAN_BODY) }
            }
          });
        }
        return jsonResponse({
          id: "msg-norman-second",
          threadId: "thread-norman-second",
          historyId: "hist-norman-second",
          snippet: "Online Order Confirmation",
          payload: {
            headers: [
              { name: "From", value: "OrderConfirmation@normanusa.com" },
              { name: "To", value: "805shutters@gmail.com" },
              { name: "Subject", value: "Online Order Confirmation: R00743 | WO# 8800217950" },
              { name: "Date", value: "Tue, 23 Jun 2026 10:03:00 -0700" }
            ],
            mimeType: "text/plain",
            body: { data: gmailTextBody(NORMAN_SECOND_BODY) }
          }
        });
      })
    );

    const supabase = new FakeSupabase();
    const result = await processOrderCogsInbox(supabase as never, { maxResults: 2 });

    expect(result.scanned).toBe(2);
    expect(result.processed).toBe(2);
    expect(result.matched).toBe(2);
    expect(result.needsReview).toBe(0);
    expect(result.applied).toBe(2);
    expect(result.archived).toBe(2);

    const cogsUpdates = supabase.updates.filter((u) => u.table === "crm_quote_bookkeeping_entries");
    expect(cogsUpdates).toHaveLength(2);
    expect(cogsUpdates[0].patch).toMatchObject({
      cogs_amount: 617.26,
      manufacturer_order_ref: "8880976230",
      manufacturer_name: "Norman"
    });
    expect(cogsUpdates[1].patch).toMatchObject({
      cogs_amount: 929.66,
      manufacturer_order_ref: "8880976230, 8800217950",
      manufacturer_name: "Norman"
    });
    expect(supabase.entries[0]).toMatchObject({
      cogs_amount: 929.66,
      manufacturer_order_ref: "8880976230, 8800217950"
    });
    expect(supabase.records.map((record) => record.match_status)).toEqual(["matched", "matched"]);
  });

  it("does not add COGS twice for an already applied Gmail message", async () => {
    vi.stubEnv("GMAIL_805_CLIENT_ID", "client");
    vi.stubEnv("GMAIL_805_CLIENT_SECRET", "secret");
    vi.stubEnv("GMAIL_805_REFRESH_TOKEN", "refresh");

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.endsWith("/labels")) return jsonResponse({ labels: [{ id: "label-processed", name: "Processed" }] });
        if (url.includes("oauth2.googleapis.com/token")) {
          return jsonResponse({ access_token: "token" });
        }
        if (url.includes("/messages?")) {
          return jsonResponse({ messages: [{ id: "msg-norman" }] });
        }
        if (url.includes("/modify")) {
          return jsonResponse({ id: "archived" });
        }
        return new Response("message should not be fetched after duplicate guard", { status: 500 });
      })
    );

    const supabase = new FakeSupabase();
    Object.assign(supabase.entries[0], {
      cogs_amount: 617.26,
      manufacturer_order_ref: "8880976230",
      manufacturer_name: "Norman"
    });
    supabase.records.push({
      id: "order-cogs-existing",
      gmail_message_id: "msg-norman",
      match_status: "matched",
      applied_at: "2026-06-22T17:03:00.000Z"
    });

    const result = await processOrderCogsInbox(supabase as never, { maxResults: 1 });

    expect(result.processed).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.matched).toBe(0);
    expect(result.archived).toBe(1);
    expect(supabase.updates.filter((u) => u.table === "crm_quote_bookkeeping_entries")).toHaveLength(0);
    expect(supabase.entries[0]).toMatchObject({
      cogs_amount: 617.26,
      manufacturer_order_ref: "8880976230"
    });
  });

  it("does not add COGS twice when the audit table has no applied record", async () => {
    vi.stubEnv("GMAIL_805_CLIENT_ID", "client");
    vi.stubEnv("GMAIL_805_CLIENT_SECRET", "secret");
    vi.stubEnv("GMAIL_805_REFRESH_TOKEN", "refresh");

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.endsWith("/labels")) return jsonResponse({ labels: [{ id: "label-processed", name: "Processed" }] });
        if (url.includes("oauth2.googleapis.com/token")) {
          return jsonResponse({ access_token: "token" });
        }
        if (url.includes("/messages?")) {
          return jsonResponse({ messages: [{ id: "msg-norman" }] });
        }
        if (url.includes("/modify")) {
          return jsonResponse({ id: "archived" });
        }
        if (url.includes("/messages/msg-norman")) {
          return jsonResponse({
            id: "msg-norman",
            threadId: "thread-norman",
            snippet: "Online Order Confirmation",
            payload: {
              headers: [
                { name: "From", value: "OrderConfirmation@normanusa.com" },
                { name: "To", value: "805shutters@gmail.com" },
                { name: "Subject", value: "Online Order Confirmation: R00743 | WO# 8880976230" }
              ],
              mimeType: "text/plain",
              body: { data: gmailTextBody(NORMAN_BODY) }
            }
          });
        }
        return jsonResponse({});
      })
    );

    const supabase = new FakeSupabase();
    Object.assign(supabase.entries[0], {
      cogs_amount: 617.26,
      manufacturer_order_ref: "8880976230",
      manufacturer_name: "Norman",
      meta: {}
    });

    const result = await processOrderCogsInbox(supabase as never, { maxResults: 1 });

    expect(result.processed).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.archived).toBe(1);
    expect(supabase.updates.filter((u) => u.table === "crm_quote_bookkeeping_entries")).toHaveLength(0);
    expect(supabase.entries[0]).toMatchObject({
      cogs_amount: 617.26,
      manufacturer_order_ref: "8880976230"
    });
  });

  it("records an activity fallback when the order COGS audit table write fails", async () => {
    vi.stubEnv("GMAIL_805_CLIENT_ID", "client");
    vi.stubEnv("GMAIL_805_CLIENT_SECRET", "secret");
    vi.stubEnv("GMAIL_805_REFRESH_TOKEN", "refresh");

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.includes("oauth2.googleapis.com/token")) return jsonResponse({ access_token: "token" });
        if (url.includes("/messages?")) return jsonResponse({ messages: [{ id: "msg-norman" }] });
        if (url.includes("/modify")) return jsonResponse({ id: "archived" });
        return jsonResponse({
          id: "msg-norman",
          threadId: "thread-norman",
          historyId: "hist-norman",
          snippet: "Online Order Confirmation",
          payload: {
            headers: [
              { name: "From", value: "OrderConfirmation@normanusa.com" },
              { name: "To", value: "805shutters@gmail.com" },
              { name: "Subject", value: "Online Order Confirmation: R00743 | WO# 8880976230" }
            ],
            mimeType: "text/plain",
            body: { data: gmailTextBody(NORMAN_BODY) }
          }
        });
      })
    );

    const supabase = new FakeSupabase();
    supabase.failOrderCogsRecordWrites = true;

    const result = await processOrderCogsInbox(supabase as never, { maxResults: 1 });

    expect(result.matched).toBe(1);
    expect(result.applied).toBe(1);
    expect(result.archived).toBe(1);
    expect(result.recordErrors).toBe(1);
    const fallback = supabase.inserts.find(
      (insert) => insert.table === "crm_activity_events" && insert.row.action === "order_cogs_email_audit_fallback"
    );
    expect(fallback?.row.metadata).toMatchObject({
      fallbackStore: "crm_activity_events",
      orderCogsEmail: expect.objectContaining({
        gmail_message_id: "msg-norman",
        match_status: "matched"
      })
    });
  });

  it("keeps duplicate customer names in review when there is no customer signal to break the tie", async () => {
    vi.stubEnv("GMAIL_805_CLIENT_ID", "client");
    vi.stubEnv("GMAIL_805_CLIENT_SECRET", "secret");
    vi.stubEnv("GMAIL_805_REFRESH_TOKEN", "refresh");

    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("oauth2.googleapis.com/token")) return jsonResponse({ access_token: "token" });
      if (url.includes("/messages?")) return jsonResponse({ messages: [{ id: "msg-katie" }] });
      if (url.includes("/modify")) return new Response("ambiguous order should not be archived", { status: 500 });
      return jsonResponse({
        id: "msg-katie",
        threadId: "thread-katie",
        snippet: "Order for Katie",
        payload: {
          headers: [
            { name: "From", value: "vendor@example.com" },
            { name: "To", value: "805shutters@gmail.com" },
            { name: "Subject", value: "Order confirmation KT-1000" }
          ],
          mimeType: "text/plain",
          body: {
            data: gmailTextBody("Customer: Katie Kushner Order Total: $300.00 Order # KT-1000")
          }
        }
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const supabase = new FakeSupabase();
    supabase.jobs = [
      { id: "job-katie-1", customer_name: "Katie Kushner", status: "sold", estimated_total: 1000, phone: "8051112222", address: "1 Oak St", product_interest: "shutters", meta: {} },
      { id: "job-katie-2", customer_name: "Katie Kushner", status: "sold", estimated_total: 1200, phone: "8052223333", address: "2 Oak St", product_interest: "shutters", meta: {} }
    ];
    supabase.entries = [
      { id: "entry-katie-1", quote_id: null, job_id: "job-katie-1", customer_name: "Katie Kushner", sold_date: "2026-06-01", total_amount: 1000, cogs_amount: 0, meta: {} },
      { id: "entry-katie-2", quote_id: null, job_id: "job-katie-2", customer_name: "Katie Kushner", sold_date: "2026-06-02", total_amount: 1200, cogs_amount: 0, meta: {} }
    ];

    const result = await processOrderCogsInbox(supabase as never, { maxResults: 1 });

    expect(result.matched).toBe(0);
    expect(result.needsReview).toBe(1);
    expect(result.archived).toBe(0);
    expect(result.applied || 0).toBe(0);
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes("/modify"))).toBe(false);
    expect(supabase.updates.filter((u) => u.table === "crm_quote_bookkeeping_entries")).toHaveLength(0);
    expect(supabase.records[0]).toMatchObject({
      match_status: "needs_review",
      matched_bookkeeping_entry_id: "entry-katie-1"
    });
  });

  it("breaks a duplicate customer name tie with a customer phone signal", async () => {
    vi.stubEnv("GMAIL_805_CLIENT_ID", "client");
    vi.stubEnv("GMAIL_805_CLIENT_SECRET", "secret");
    vi.stubEnv("GMAIL_805_REFRESH_TOKEN", "refresh");

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.includes("oauth2.googleapis.com/token")) return jsonResponse({ access_token: "token" });
        if (url.includes("/messages?")) return jsonResponse({ messages: [{ id: "msg-katie" }] });
        if (url.includes("/modify")) return jsonResponse({ id: "archived" });
        return jsonResponse({
          id: "msg-katie",
          threadId: "thread-katie",
          snippet: "Order for Katie",
          payload: {
            headers: [
              { name: "From", value: "vendor@example.com" },
              { name: "To", value: "805shutters@gmail.com" },
              { name: "Subject", value: "Order confirmation KT-1000" }
            ],
            mimeType: "text/plain",
            body: {
              data: gmailTextBody("Customer: Katie Kushner Phone: 805-222-3333 Order Total: $300.00 Order # KT-1000")
            }
          }
        });
      })
    );

    const supabase = new FakeSupabase();
    supabase.jobs = [
      { id: "job-katie-1", customer_name: "Katie Kushner", status: "sold", estimated_total: 1000, phone: "8051112222", address: "1 Oak St", product_interest: "shutters", meta: {} },
      { id: "job-katie-2", customer_name: "Katie Kushner", status: "sold", estimated_total: 1200, phone: "8052223333", address: "2 Oak St", product_interest: "shutters", meta: {} }
    ];
    supabase.entries = [
      { id: "entry-katie-1", quote_id: null, job_id: "job-katie-1", customer_name: "Katie Kushner", sold_date: "2026-06-01", total_amount: 1000, cogs_amount: 0, meta: {} },
      { id: "entry-katie-2", quote_id: null, job_id: "job-katie-2", customer_name: "Katie Kushner", sold_date: "2026-06-02", total_amount: 1200, cogs_amount: 0, meta: {} }
    ];

    const result = await processOrderCogsInbox(supabase as never, { maxResults: 1 });

    expect(result.matched).toBe(1);
    expect(result.needsReview).toBe(0);
    expect(result.archived).toBe(1);
    const cogsUpdate = supabase.updates.find((u) => u.table === "crm_quote_bookkeeping_entries");
    expect(cogsUpdate).toMatchObject({
      filters: { id: "entry-katie-2" },
      patch: expect.objectContaining({ cogs_amount: 300, manufacturer_order_ref: "KT-1000" })
    });
  });
});
