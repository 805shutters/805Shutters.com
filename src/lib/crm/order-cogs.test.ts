import { afterEach, describe, expect, it, vi } from "vitest";
import { extractNormanOrderCogs, extractOrderCogsFromText, processOrderCogsInbox } from "@/lib/crm/order-cogs";

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
        this.db.records.push(record);
        return { data: record, error: null };
      }
      this.db.inserts.push({ table: this.table, row: this.input || {} });
      return { data: this.input, error: null };
    }

    const rows = this.db.selectRows(this.table);
    const filtered = this.filters.id ? rows.filter((row) => row.id === this.filters.id) : rows;
    if (this.wantsSingle) return { data: filtered[0] ?? null, error: null };
    return { data: filtered, error: null };
  }
}

class FakeSupabase {
  records: Array<Record<string, unknown>> = [];
  updates: Array<{ table: string; patch: Record<string, unknown>; filters: Record<string, unknown> }> = [];
  inserts: Array<{ table: string; row: Record<string, unknown> }> = [];

  jobs: Array<Record<string, unknown>> = [
    { id: "job-1", customer_name: "Jim Derenthal", status: "sold", estimated_total: 5000 }
  ];
  entries: Array<Record<string, unknown>> = [
    {
      id: "entry-1",
      quote_id: null,
      job_id: "job-1",
      customer_name: "Jim Derenthal",
      sold_date: "2026-06-01",
      total_amount: 5000,
      cogs_amount: 0
    }
  ];

  from(table: string) {
    return new FakeSupabaseQuery(this, table);
  }

  selectRows(table: string) {
    if (table === "crm_quote_bookkeeping_entries") return this.entries;
    if (table === "crm_quotes") return [];
    if (table === "crm_jobs") return this.jobs;
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
});
