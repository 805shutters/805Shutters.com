import * as gmailAccess from "./installation-invoices";
import * as productEmailWorkflow from "./apply-order-email-product";
import { listGmailMessages } from "./order-cogs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { customerOrderCogsQuery, extractLotusOrderCogs, extractNormanOrderCogs, extractOnyxOrderCogs, extractOrderCogsFromText, matchOrderCogs, orderCogsAssignmentLocked, orderCogsTelegramText, processOrderCogsInbox, reviewStatus } from "@/lib/crm/order-cogs";

describe("recorded order reference matching", () => {
  const candidate = { source: "entry" as const, customerName: "Ashley Soto", customerEmail: null, customerPhone: null, customerAddress: null, productInterest: null, jobId: "job", quoteId: "quote", entryId: "entry", quoteNumber: null, quoteLabel: null, totalAmount: 5517.36, cogsAmount: 2424.23, soldDate: null, manufacturerName: "Norman", manufacturerOrderRef: null, manufacturerOrderUrl: null, meta: {orderCogsOrderRefs:["8880987043"]} };
  const extraction = { customerName: "Ashley Soto HC", orderAmount: 764.88, orderNumber: "8880987043", confidence: 1, amountConfidence: 1, text: "", manufacturer: "Norman" };
  it("resolves a vendor product suffix using the recorded exact order", () => {
    expect(matchOrderCogs(extraction,[candidate])).toMatchObject({status:"matched",confidence:1,candidate});
  });
  it("leaves duplicated order references across sales for review", () => {
    expect(matchOrderCogs(extraction,[candidate,{...candidate,entryId:"another-sale"}])).toMatchObject({status:"needs_review",candidate:null});
  });
});

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

  quotes: Array<Record<string, unknown>> = [];
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
    if (table === "crm_quotes") return this.quotes;
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

describe("contract-number manufacturer POs", () => {
  it("keeps the Norman subject side mark separate from the greeting and body", () => {
    const text = [
      "Online Order Confirmation: R00743 | WO# 8880988962 | PO#: 805-0233 | Side Mark: 805 Shutters - Paul Lee",
      "Dear Customer, Thank you for your order! If you have any questions, please contact your customer service representative.",
      "Norman Window Fashions",
      "Order Date: 10/5/2026",
      "WO#: 8880988962",
      "PO#: 805-0233",
      "Side Mark: 805 Shutters - Paul Lee",
      "SalesNo: S88058588",
      "Payment Terms: NET 15 DAY",
      "Total Amount: $1,666.61"
    ].join("\n");
    expect(extractNormanOrderCogs(text))
      .toMatchObject({customerName:"Paul Lee",orderNumber:"8880988962",orderAmount:1666.61});
  });
  it("bounds a collapsed Norman side mark at its sales number", () => {
    expect(extractNormanOrderCogs("WO#: 8880988962 PO#: 805-0233 Side Mark: 805 Shutters - Paul Lee SalesNo: S88058588 Payment Terms: NET 15 DAY Total Amount: $1,666.61").customerName).toBe("Paul Lee");
  });
  it("reads a Norman customer from Side Mark instead of the contract PO", () => {
    expect(extractNormanOrderCogs("Online Order Confirmation: R00743 | WO# 8880988962 | PO#: 805-0233 | Side Mark: 805 Shutters - Paul Lee Total Amount: $1,666.61"))
      .toMatchObject({customerName:"Paul Lee",orderNumber:"8880988962",orderAmount:1666.61});
  });
  it("keeps a named Norman PO fallback when Side Mark is empty", () => {
    expect(extractNormanOrderCogs("WO#: 8880988962 PO#: Linda Brown Side Mark: Ship Via: Air Total Amount: $1,666.61").customerName).toBe("Linda Brown");
  });
});

describe("extractOnyxOrderCogs", () => {
  it("reads the customer from the Side Mark when the PO is an 805 contract number", () => {
    const result = extractOnyxOrderCogs(
      "Order No.: 52610061484 PO No.: 805-0462 Side Mark: CHE01-805 Shutters - Eduardo Arce Total Area: 85.089 Grand Total: 1120.62 Proposed Deposit: 560.31"
    );
    expect(result.customerName).toBe("Eduardo Arce");
    expect(result.orderNumber).toBe("52610061484");
    expect(result.orderAmount).toBe(1120.62);
    expect(result.confidence).toBe(1);
  });

  it("does not invent a customer from a contract-only PO", () => {
    const result = extractOnyxOrderCogs("Order No.: 52610061484 PO No.: 805-0462 Grand Total: 1120.62");
    expect(result.customerName).toBeNull();
  });

  it("retains named PO fallback when no Side Mark is present", () => {
    expect(extractOnyxOrderCogs("Order No.: 52607181014 PO No.: Brown, Linda Grand Total: 1646.25").customerName).toBe("Linda Brown");
  });
  it("retains named PO fallback when Side Mark is empty", () => {
    expect(extractOnyxOrderCogs("Order No.: 52607181014 PO No.: Brown, Linda Side Mark: Total Area: 125.000 Grand Total: 1646.25").customerName).toBe("Linda Brown");
  });

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

describe("extractLotusOrderCogs", () => {
  it("extracts the final total and order number without inventing a blank side mark", () => {
    const result = extractLotusOrderCogs([
      "Lotus & Windoware, Inc.",
      "Sales Order #SO287277",
      "Payment Method Customer PO # Freight Method Side Mark",
      "#18289 UPS Ground",
      "Qty Ordered Item Description Unit Price Extended Price",
      "2 Custom 1-inch Aluminum Blind $105.00 $210.00",
      "Subtotal $210.00",
      "Tax (7.25%) $17.61",
      "Total $260.54"
    ].join("\n"));

    expect(result).toMatchObject({
      customerName: null,
      orderAmount: 260.54,
      orderNumber: "SO287277",
      manufacturer: "Lotus & Windoware"
    });
  });

  it("extracts a populated Lotus side mark", () => {
    const result = extractLotusOrderCogs([
      "Lotus & Windoware, Inc.: Sales Order #SO287278",
      "Side Mark: Michael Lee",
      "Qty Ordered 2",
      "Subtotal $210.00 Tax $17.61 Total $260.54"
    ].join("\n"));

    expect(result.customerName).toBe("Michael Lee");
  });
});

describe("customerOrderCogsQuery", () => {
  it("searches the selected mailbox, recent date range, vendors, and every customer-name token", () => {
    expect(customerOrderCogsQuery("805shutters@gmail.com", "Jack Plasmyer", 14)).toBe(
      'in:anywhere {to:805shutters@gmail.com to:805@805shutters.com} newer_than:14d (from:normanusa.com OR from:orders@onyxshutters.com OR from:lotusblind.com OR subject:"Lotus & Windoware" OR subject:"Lotus Blind Order Fulfillment Notification") "Jack" "Plasmyer"'
    );
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
    const result = await processOrderCogsInbox(supabase as never, {
      mailbox: "805shutters@gmail.com",
      days: 14,
      maxResults: 2,
      target: { customerName: "Jim Derenthal", jobId: "job-1", entryId: "entry-1" }
    });

    expect(result.scanned).toBe(2);
    expect(result.processed).toBe(2);
    expect(result.matched).toBe(2);
    expect(result.needsReview).toBe(0);
    expect(result.applied).toBe(2);
    expect(result.addedCogs).toBe(929.66);
    expect(result.archived).toBe(2);
    expect(result.targetCogsTotal).toBe(929.66);
    expect(result.query).toContain('newer_than:14d');
    expect(result.query).toContain('"Jim" "Derenthal"');

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

  function stubNormanGmail(messageId = "msg-norman") {
    vi.stubEnv("GMAIL_805_CLIENT_ID", "client");
    vi.stubEnv("GMAIL_805_CLIENT_SECRET", "secret");
    vi.stubEnv("GMAIL_805_REFRESH_TOKEN", "refresh");
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/labels")) return jsonResponse({ labels: [{ id: "label-processed", name: "Processed" }] });
      if (url.includes("oauth2.googleapis.com/token")) return jsonResponse({ access_token: "token" });
      if (url.includes("/messages?")) return jsonResponse({ messages: [{ id: messageId }] });
      if (url.includes("/modify")) return jsonResponse({ id: "archived" });
      if (url.includes(`/messages/${messageId}`)) {
        return jsonResponse({
          id: messageId,
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
      return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("does not apply COGS, status, Telegram, or Gmail archive when autoApply is false", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "bot-token");
    vi.stubEnv("TELEGRAM_CHAT_ID", "chat-id");
    const fetchMock = stubNormanGmail();
    const supabase = new FakeSupabase();

    const result = await processOrderCogsInbox(supabase as never, {
      maxResults: 1,
      autoApply: false,
      actorEmail: "order-cogs-cron"
    });

    expect(result.scanned).toBe(1);
    expect(result.processed).toBe(1);
    expect(result.matched).toBe(0);
    expect(result.needsReview).toBe(1);
    expect(result.applied || 0).toBe(0);
    expect(result.addedCogs || 0).toBe(0);
    expect(result.archived).toBe(0);
    expect(result.telegramSent).toBe(0);
    expect(supabase.updates.filter((u) => u.table === "crm_quote_bookkeeping_entries")).toHaveLength(0);
    expect(supabase.updates.filter((u) => u.table === "crm_jobs")).toHaveLength(0);
    expect(supabase.entries[0]).toMatchObject({ cogs_amount: 0 });
    expect(supabase.jobs[0]).toMatchObject({ status: "sold" });
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes("/modify"))).toBe(false);
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes("api.telegram.org"))).toBe(false);
  });

  it("writes an auditable needs_review row when auto-apply is disabled", async () => {
    stubNormanGmail();
    const supabase = new FakeSupabase();

    await processOrderCogsInbox(supabase as never, {
      maxResults: 1,
      autoApply: false,
      actorEmail: "order-cogs-cron"
    });

    expect(supabase.records).toHaveLength(1);
    expect(supabase.records[0]).toMatchObject({
      gmail_message_id: "msg-norman",
      extracted_customer_name: "Jim Derenthal",
      extracted_order_amount: 617.26,
      extracted_order_number: "8880976230",
      matched_job_id: "job-1",
      matched_bookkeeping_entry_id: "entry-1",
      match_status: "needs_review",
      match_reason: "auto-apply disabled (COGS cutover)",
      applied_at: null,
      raw: expect.objectContaining({
        actorEmail: "order-cogs-cron",
        autoApplyDisabled: true
      })
    });
  });

  it("honors ORDER_COGS_AUTO_APPLY=false when the option is omitted", async () => {
    vi.stubEnv("ORDER_COGS_AUTO_APPLY", "false");
    stubNormanGmail();
    const supabase = new FakeSupabase();

    const result = await processOrderCogsInbox(supabase as never, { maxResults: 1 });

    expect(result.needsReview).toBe(1);
    expect(result.applied || 0).toBe(0);
    expect(supabase.updates.filter((u) => u.table === "crm_quote_bookkeeping_entries")).toHaveLength(0);
    expect(supabase.records[0]).toMatchObject({
      match_status: "needs_review",
      match_reason: "auto-apply disabled (COGS cutover)",
      applied_at: null
    });
  });

  it("skips any existing audit row when auto-apply is disabled so dual schedulers do not churn", async () => {
    const fetchMock = stubNormanGmail();
    const supabase = new FakeSupabase();
    supabase.records.push({
      id: "order-cogs-existing",
      gmail_message_id: "msg-norman",
      match_status: "needs_review",
      applied_at: null,
      match_reason: "auto-apply disabled (COGS cutover)"
    });

    const result = await processOrderCogsInbox(supabase as never, {
      maxResults: 1,
      autoApply: false
    });

    expect(result.processed).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.needsReview).toBe(0);
    expect(supabase.records).toHaveLength(1);
    expect(supabase.updates.filter((u) => u.table === "crm_quote_bookkeeping_entries")).toHaveLength(0);
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes("/messages/msg-norman"))).toBe(false);
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes("/modify"))).toBe(false);
  });
});


describe("product-mode order ingestion", () => {
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
  function gmail(mailbox = "805shutters@gmail.com") {
    vi.stubEnv("GMAIL_805_CLIENT_ID", "client"); vi.stubEnv("GMAIL_805_CLIENT_SECRET", "secret"); vi.stubEnv("GMAIL_805_REFRESH_TOKEN", "refresh");
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("oauth2.googleapis.com/token")) return jsonResponse({ access_token: "token" });
      if (url.endsWith("/profile")) return jsonResponse({ emailAddress: mailbox });
      if (url.includes("/messages?")) return jsonResponse({ messages: [{ id: "msg-norman" }] });
      return jsonResponse({ id: "msg-norman", payload: { headers: [{ name: "From", value: "OrderConfirmation@normanusa.com" }], mimeType: "text/plain", body: { data: gmailTextBody(NORMAN_BODY) } } });
    });
    vi.stubGlobal("fetch", fetcher); return fetcher;
  }
  it("retries a contract-number Onyx confirmation against the named sale and verifies its product cost", async () => {
    const fetcher = gmail(); const original = fetcher.getMockImplementation()!;
    fetcher.mockImplementation(async input => String(input).includes("/messages/msg-norman")
      ? jsonResponse({ id: "msg-norman", payload: { headers: [{name:"From",value:"orders@onyxshutters.com"}], mimeType:"text/plain", body:{ data:gmailTextBody("Order No.: 52610061484 PO No.: 805-0462 Side Mark: CHE01-805 Shutters - Eduardo Arce Total Area: 85.089 Grand Total: 1120.62 Proposed Deposit: 560.31") } } })
      : original(input));
    const db = new FakeSupabase();
    db.jobs[0].customer_name = "Eduardo Arce"; db.entries[0].customer_name = "Eduardo Arce";
    db.records.push({ id:"prior-unmatched", gmail_message_id:"msg-norman", mailbox_email:"805shutters@gmail.com", match_status:"unmatched", extracted_customer_name:"805-0462", applied_at:null });
    const apply = vi.spyOn(productEmailWorkflow,"applyOrderEmailProduct").mockResolvedValue({addedCogs:1120.62,totalCogs:1120.62});
    const options = {productAutoApply:true,archive:false,messageIds:["msg-norman"]};
    expect(await processOrderCogsInbox(db as never,options)).toMatchObject({applied:1,addedCogs:1120.62,errors:0});
    expect(apply).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({extracted_customer_name:"Eduardo Arce",matched_job_id:"job-1",extracted_order_amount:1120.62,extracted_order_number:"52610061484"}),"Onyx",expect.anything());
    await processOrderCogsInbox(db as never,options);
    expect(apply).toHaveBeenCalledOnce();
  });
  it("persists invoice evidence before saving, marks verified only afterward, and skips a proven retry", async () => {
    const fetcher = gmail(); const db = new FakeSupabase();
    const apply = vi.spyOn(productEmailWorkflow, "applyOrderEmailProduct").mockImplementation(async (_db, email) => {
      expect(db.records).toHaveLength(1); expect(email.match_status).toBe("matched");
      expect((db.records[0].raw as any).productCompletionVerified).toBeUndefined();
      return { addedCogs: 617.26, totalCogs: 617.26 };
    });
    const options = { autoApply: false, productAutoApply: true, archive: false };
    const result = await processOrderCogsInbox(db as never, options);
    expect(result).toMatchObject({ applied: 1, addedCogs: 617.26, errors: 0, telegramSent: 0, archived: 0 });
    expect(db.records[0]).toMatchObject({ match_status: "matched", raw: { productCompletionVerified: true } });
    await processOrderCogsInbox(db as never, options); expect(apply).toHaveBeenCalledOnce();
    expect(db.updates.every(write => write.table === "crm_order_cogs_emails")).toBe(true);
    expect(fetcher.mock.calls.some(([url]) => /modify|telegram/.test(String(url)))).toBe(false);
    const query = new URL(String(fetcher.mock.calls.find(([url]) => String(url).includes("/messages?"))![0])).searchParams.get("q");
    expect(query).not.toContain("in:inbox"); expect(query).not.toContain("-label:Processed");
  });
  it("uses the broker-selected business account and finds mail originally sent to either 805 address", async () => {
    const mailbox = "805@805shutters.com";
    const fetcher = gmail(mailbox); const db = new FakeSupabase();
    const broker = vi.spyOn(gmailAccess, "getBrokeredGmailAccessToken").mockResolvedValue("business-token");
    vi.spyOn(productEmailWorkflow, "applyOrderEmailProduct").mockResolvedValue({ addedCogs: 617.26, totalCogs: 617.26 });
    expect(await processOrderCogsInbox(db as never, { mailbox, productAutoApply: true, archive: false })).toMatchObject({ mailbox, applied: 1 });
    expect(broker).toHaveBeenCalledWith(mailbox);
    expect(fetcher.mock.calls.some(([url]) => String(url).includes("oauth2"))).toBe(false);
    const query = new URL(String(fetcher.mock.calls.find(([url]) => String(url).includes("/messages?"))![0])).searchParams.get("q");
    expect(query).toContain("{to:805shutters@gmail.com to:805@805shutters.com}");
    expect(db.records[0].mailbox_email).toBe(mailbox);
  });
  it("fails closed before reading messages or writing invoices when Gmail returns another account", async () => {
    const fetcher = gmail(); const original = fetcher.getMockImplementation()!;
    fetcher.mockImplementation(async input => String(input).endsWith("/profile")
      ? jsonResponse({ emailAddress: "other@example.com" }) : original(input));
    const db = new FakeSupabase();
    await expect(processOrderCogsInbox(db as never, { productAutoApply: true, archive: false })).rejects.toThrow("different mailbox");
    expect(db.updates).toHaveLength(0);
    expect(fetcher.mock.calls.some(([url]) => String(url).includes("/messages"))).toBe(false);
  });
  it("retries failed product work and preserves a prior aggregate applied receipt", async () => {
    gmail(); const db = new FakeSupabase();
    db.records.push({ id: "receipt", gmail_message_id: "msg-norman", mailbox_email: "805shutters@gmail.com", applied_at: "2026-09-16", match_status: "matched", raw: {} });
    const apply = vi.spyOn(productEmailWorkflow, "applyOrderEmailProduct").mockRejectedValueOnce(new Error("Temporary outage"))
      .mockImplementationOnce(async (_db, email) => { expect(email.applied_at).toBe("2026-09-16"); return { addedCogs: 0, totalCogs: 617.26 }; });
    const options = { autoApply: false, productAutoApply: true, archive: false };
    expect(await processOrderCogsInbox(db as never, options)).toMatchObject({ errors: 1 });
    expect(await processOrderCogsInbox(db as never, options)).toMatchObject({ applied: 1, addedCogs: 0 });
    expect(apply).toHaveBeenCalledTimes(2);
  });
  it("carries forward a legacy recorded manufacturer reference to prevent duplicate aggregate COGS", async () => {
    gmail(); const db = new FakeSupabase();
    db.entries[0].cogs_amount = 617.26; db.entries[0].manufacturer_order_ref = "8880976230"; db.entries[0].manufacturer_name = "Norman";
    vi.spyOn(productEmailWorkflow, "applyOrderEmailProduct").mockImplementation(async (_db, email) => {
      expect(email.raw).toMatchObject({ duplicateApplied: true }); return { addedCogs: 0, totalCogs: 617.26 };
    });
    expect(await processOrderCogsInbox(db as never, { productAutoApply: true, archive: false })).toMatchObject({ addedCogs: 0 });
  });
  it("does not change financial records when the evidence store fails", async () => {
    gmail(); const db = new FakeSupabase(); db.failOrderCogsRecordWrites = true;
    const apply = vi.spyOn(productEmailWorkflow, "applyOrderEmailProduct");
    expect(await processOrderCogsInbox(db as never, { productAutoApply: true, archive: false })).toMatchObject({ errors: 1 });
    expect(apply).not.toHaveBeenCalled(); expect(db.updates).toHaveLength(0);
  });
  it("fetches the real email body on an explicit retry", async () => {
    const fetcher = gmail(); const db = new FakeSupabase();
    vi.spyOn(productEmailWorkflow, "applyOrderEmailProduct").mockResolvedValue({ addedCogs: 617.26, totalCogs: 617.26 });
    await processOrderCogsInbox(db as never, { productAutoApply: true, archive: false, messageIds: ["msg-norman"] });
    expect(fetcher.mock.calls.some(([url]) => String(url).includes("/messages/msg-norman"))).toBe(true);
    expect(db.records[0].extracted_order_amount).toBe(617.26);
  });
  it("follows every Gmail page and deduplicates repeated ids", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(jsonResponse({ messages: [{ id: "one" }], nextPageToken: "next" }))
      .mockResolvedValueOnce(jsonResponse({ messages: [{ id: "one" }, { id: "two" }] }));
    vi.stubGlobal("fetch", fetcher);
    expect(await listGmailMessages("token", "orders", 50, true)).toEqual([{ id: "one" }, { id: "two" }]);
    expect(new URL(fetcher.mock.calls[1][0]).searchParams.get("pageToken")).toBe("next");
  });
  it("fails visibly instead of silently losing an oversized or looping result set", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ messages: [{ id: "one" }], nextPageToken: "loop" })));
    await expect(listGmailMessages("token", "orders", 50, true)).rejects.toThrow("exceeded 20 pages");
  });
});

describe("fuzzy name fallback and manual assignment lock", () => {
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  const castileText = "Order No.: 52609301462 PO No.: Side Mark: CHE01-Mike Castile Total Area: 310.514 Grand Total: 100.00";

  function person(patch: Record<string, unknown>) {
    return {
      source: "quote" as const,
      customerName: "Castiel",
      customerEmail: null,
      customerPhone: null,
      customerAddress: null,
      productInterest: null,
      jobId: "job-0431",
      quoteId: "quote-0431",
      entryId: null,
      quoteNumber: "805-0431",
      quoteLabel: null,
      totalAmount: 1000,
      cogsAmount: 0,
      soldDate: "2026-10-01",
      manufacturerName: "Onyx",
      manufacturerOrderRef: null,
      manufacturerOrderUrl: null,
      meta: {},
      status: "sold",
      signerName: null,
      ...patch,
    };
  }

  it("suggests Castiel and does not allow a COGS write", () => {
    const extraction = extractOnyxOrderCogs(castileText);
    expect(extraction).toMatchObject({ customerName: "Mike Castile", orderNumber: "52609301462" });
    const match = matchOrderCogs(extraction, [person({})]);
    expect(match).toMatchObject({
      status: "needs_review",
      candidate: null,
      reason: "fuzzy_name, distance 2",
      suggestions: [expect.objectContaining({ quoteId: "quote-0431", quoteNumber: "805-0431", distance: 2 })],
    });
    expect(reviewStatus(extraction, match).canApply).toBe(false);
  });

  it("gives no suggestion at distance 3 and lists two close names", () => {
    const extraction = extractOnyxOrderCogs(castileText);
    const distant = matchOrderCogs(extraction, [person({ customerName: "Cast", quoteNumber: "805-0999" })]);
    expect(distant.status).toBe("unmatched");
    expect(distant.suggestions).toBeUndefined();
    const match = matchOrderCogs(extraction, [
      person({}),
      person({ customerName: "Castrile", quoteId: "quote-b", quoteNumber: "805-0502", jobId: "job-b" }),
    ]);
    expect(match.status).toBe("needs_review");
    expect(match.candidate).toBeNull();
    expect(match.reason).toContain("805-0431");
    expect(match.reason).toContain("805-0502");
    expect(reviewStatus(extraction, match).canApply).toBe(false);
  });

  it("lets an exact order number auto-apply ahead of a fuzzy name", () => {
    const extraction = extractOnyxOrderCogs(castileText);
    const exact = person({
      customerName: "Other Person",
      quoteId: "quote-exact",
      quoteNumber: "805-0100",
      manufacturerOrderRef: "52609301462",
    });
    const match = matchOrderCogs(extraction, [exact, person({})]);
    expect(match).toMatchObject({ status: "matched", confidence: 1, candidate: exact });
    expect(match.suggestions).toBeUndefined();
    expect(reviewStatus(extraction, match)).toMatchObject({ canApply: true, status: "matched" });
  });

  function onyxMailbox() {
    vi.stubEnv("GMAIL_805_CLIENT_ID", "client");
    vi.stubEnv("GMAIL_805_CLIENT_SECRET", "secret");
    vi.stubEnv("GMAIL_805_REFRESH_TOKEN", "refresh");
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("oauth2.googleapis.com/token")) return jsonResponse({ access_token: "token" });
      if (url.endsWith("/profile")) return jsonResponse({ emailAddress: "805shutters@gmail.com" });
      if (url.includes("/messages?")) return jsonResponse({ messages: [] });
      return jsonResponse({
        id: "msg-castile",
        payload: { headers: [{ name: "From", value: "orders@onyxshutters.com" }], mimeType: "text/plain", body: { data: gmailTextBody(castileText) } },
      });
    }));
  }

  function castileBooks() {
    const db = new FakeSupabase();
    db.jobs = [
      { id: "job-0431", customer_name: "Pat Smith", status: "sold", estimated_total: 1, phone: "8055550100", email: null, address: null, product_interest: "shutters", meta: {} },
      { id: "job-exact", customer_name: "Other Person", status: "sold", estimated_total: 1, phone: "8055550101", email: null, address: null, product_interest: "shutters", meta: {} },
      { id: "job-fuzzy", customer_name: "Castiel", status: "sold", estimated_total: 1, phone: "8055550102", email: null, address: null, product_interest: "shutters", meta: {} },
    ];
    db.quotes = [
      { id: "quote-0431", job_id: "job-0431", status: "sold", quote_number: "805-0431", quote_label: null, quote_total: 1, materials_cost: 0, customer_printed_name: "Pat Smith", manufacturer_name: "Onyx", manufacturer_order_ref: null, meta: {} },
      { id: "quote-exact", job_id: "job-exact", status: "sold", quote_number: "805-0100", quote_label: null, quote_total: 1, materials_cost: 0, customer_printed_name: "Other Person", manufacturer_name: "Onyx", manufacturer_order_ref: "52609301462", meta: {} },
      { id: "quote-fuzzy", job_id: "job-fuzzy", status: "sold", quote_number: "805-0444", quote_label: null, quote_total: 1, materials_cost: 0, customer_printed_name: null, manufacturer_name: "Onyx", manufacturer_order_ref: null, meta: {} },
    ];
    db.entries = [
      { id: "entry-0431", quote_id: "quote-0431", job_id: "job-0431", customer_name: "Pat Smith", sold_date: "2026-10-01", total_amount: 1, cogs_amount: 0, manufacturer_name: "Onyx", manufacturer_order_ref: null, meta: {} },
      { id: "entry-exact", quote_id: "quote-exact", job_id: "job-exact", customer_name: "Other Person", sold_date: "2026-10-01", total_amount: 1, cogs_amount: 0, manufacturer_name: "Onyx", manufacturer_order_ref: "52609301462", meta: {} },
      { id: "entry-fuzzy", quote_id: "quote-fuzzy", job_id: "job-fuzzy", customer_name: "Castiel", sold_date: "2026-10-01", total_amount: 1, cogs_amount: 0, manufacturer_name: "Onyx", manufacturer_order_ref: null, meta: {} },
    ];
    return db;
  }

  function assignedRow(raw: Record<string, unknown>) {
    return {
      id: "email-0431",
      gmail_message_id: "msg-castile",
      mailbox_email: "805shutters@gmail.com",
      match_status: "needs_review",
      matched_quote_id: "quote-0431",
      matched_job_id: "job-0431",
      matched_bookkeeping_entry_id: "entry-0431",
      applied_at: null,
      raw,
    };
  }

  it("keeps a Financial assignment to 805-0431 when an exact or fuzzy match points elsewhere", async () => {
    onyxMailbox();
    const apply = vi.spyOn(productEmailWorkflow, "applyOrderEmailProduct").mockResolvedValue({ addedCogs: 100, totalCogs: 100 });
    const exactDb = castileBooks();
    const financial = { actorEmail: "805-financial", manual_assignment: { by: "financial", at: "2026-11-14T00:00:00Z", quote_id: "quote-0431" } };
    exactDb.records.push(assignedRow(financial));
    await processOrderCogsInbox(exactDb as never, { productAutoApply: true, archive: false, messageIds: ["msg-castile"], actorEmail: "order-cogs-cron" });
    expect(apply).not.toHaveBeenCalled();
    expect(exactDb.records[0]).toMatchObject({ matched_quote_id: "quote-0431", raw: financial });
    expect(exactDb.updates).toHaveLength(0);

    const fuzzyDb = castileBooks();
    fuzzyDb.entries = fuzzyDb.entries.filter(entry => entry.id !== "entry-exact");
    fuzzyDb.quotes = fuzzyDb.quotes.filter(quote => quote.id !== "quote-exact");
    fuzzyDb.records.push(assignedRow({ actorEmail: "805-financial" }));
    await processOrderCogsInbox(fuzzyDb as never, { productAutoApply: true, archive: false, messageIds: ["msg-castile"], actorEmail: "order-cogs-cron" });
    expect(apply).not.toHaveBeenCalled();
    expect(fuzzyDb.records[0]).toMatchObject({ matched_quote_id: "quote-0431", matched_job_id: "job-0431", raw: { actorEmail: "805-financial" } });
    expect(fuzzyDb.updates).toHaveLength(0);
  });

  it("still reprocesses an unlocked needs_review row, including a cron-owned quote id", async () => {
    onyxMailbox();
    const apply = vi.spyOn(productEmailWorkflow, "applyOrderEmailProduct").mockResolvedValue({ addedCogs: 100, totalCogs: 100 });
    const db = castileBooks();
    db.records.push({
      id: "email-open",
      gmail_message_id: "msg-castile",
      mailbox_email: "805shutters@gmail.com",
      match_status: "needs_review",
      matched_quote_id: null,
      applied_at: null,
      raw: { actorEmail: "order-cogs-cron" },
    });
    const options = { productAutoApply: true, archive: false, messageIds: ["msg-castile"], actorEmail: "order-cogs-cron" };
    await processOrderCogsInbox(db as never, options);
    expect(apply).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ matched_quote_id: "quote-exact", extracted_order_number: "52609301462" }), "Onyx", expect.anything());
    expect(db.records[0]).toMatchObject({ match_status: "matched", matched_quote_id: "quote-exact" });

    const cronOwned = castileBooks();
    cronOwned.records.push(assignedRow({ actorEmail: "order-cogs-cron" }));
    await processOrderCogsInbox(cronOwned as never, options);
    expect(cronOwned.records[0].matched_quote_id).toBe("quote-exact");
    expect(orderCogsAssignmentLocked({ matched_quote_id: "quote-0431", raw: { actorEmail: "805-financial" } })).toBe(true);
    expect(orderCogsAssignmentLocked({ matched_quote_id: "quote-0431", raw: { actorEmail: "order-cogs-cron", manual_assignment: { quote_id: "quote-0431" } } })).toBe(true);
    expect(orderCogsAssignmentLocked({ matched_quote_id: null, raw: { actorEmail: "order-cogs-cron" } })).toBe(false);
  });

  it("does not put a locked needs_review row back on the retry queue", async () => {
    onyxMailbox();
    const db = castileBooks();
    db.records.push(assignedRow({ actorEmail: "805-financial" }));
    const result = await processOrderCogsInbox(db as never, { productAutoApply: true, archive: false, actorEmail: "order-cogs-cron" });
    expect(result.scanned).toBe(0);
    expect(db.records[0]).toMatchObject({ matched_quote_id: "quote-0431", raw: { actorEmail: "805-financial" } });
    expect(db.updates).toHaveLength(0);
  });

  it("records a fuzzy suggestion and does not apply COGS while writes would otherwise be allowed", async () => {
    onyxMailbox();
    const apply = vi.spyOn(productEmailWorkflow, "applyOrderEmailProduct").mockResolvedValue({ addedCogs: 100, totalCogs: 100 });
    const db = castileBooks();
    db.entries = db.entries.filter(entry => entry.id === "entry-fuzzy");
    db.quotes = db.quotes.filter(quote => quote.id === "quote-fuzzy");
    const result = await processOrderCogsInbox(db as never, { productAutoApply: true, archive: false, messageIds: ["msg-castile"], actorEmail: "order-cogs-cron" });
    expect(apply).not.toHaveBeenCalled();
    expect(result.needsReview).toBe(1);
    expect(result.applied || 0).toBe(0);
    expect(db.records[0]).toMatchObject({
      match_status: "needs_review",
      match_reason: "fuzzy_name, distance 2",
      matched_quote_id: null,
      raw: {
        actorEmail: "order-cogs-cron",
        suggested_quote_id: "quote-fuzzy",
        suggested_quote_number: "805-0444",
      },
    });
    expect(db.updates.filter(update => update.table !== "crm_order_cogs_emails")).toHaveLength(0);
  });
});
