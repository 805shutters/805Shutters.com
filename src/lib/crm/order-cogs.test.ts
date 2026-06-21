import { afterEach, describe, expect, it, vi } from "vitest";
import { extractOrderCogsFromText, processOrderCogsInbox } from "@/lib/crm/order-cogs";

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

class FakeSupabaseQuery {
  private action: "select" | "update" | "upsert" = "select";
  private patch: Record<string, unknown> | null = null;
  private input: Record<string, unknown> | null = null;
  private filters: Record<string, unknown> = {};

  constructor(private readonly db: FakeSupabase, private readonly table: string) {}

  select() {
    this.action = this.action === "upsert" ? "upsert" : "select";
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

  single() {
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
      return { error: null };
    }

    if (this.action === "upsert") {
      const record = {
        id: `order-cogs-${this.db.records.length + 1}`,
        created_at: "2026-06-20T00:00:00.000Z",
        updated_at: "2026-06-20T00:00:00.000Z",
        ...(this.input || {})
      };
      this.db.records.push(record);
      return { data: record, error: null };
    }

    return { data: this.db.selectRows(this.table), error: null };
  }
}

class FakeSupabase {
  records: Array<Record<string, unknown>> = [];
  updates: Array<{ table: string; patch: Record<string, unknown>; filters: Record<string, unknown> }> = [];

  from(table: string) {
    return new FakeSupabaseQuery(this, table);
  }

  selectRows(table: string) {
    if (table === "crm_quote_bookkeeping_entries") {
      return [
        {
          id: "entry-1",
          quote_id: null,
          job_id: "job-1",
          customer_name: "Jane Doe",
          sold_date: "2026-06-01",
          total_amount: 5000,
          cogs_amount: 0
        }
      ];
    }
    if (table === "crm_quotes") return [];
    if (table === "crm_jobs") {
      return [{ id: "job-1", customer_name: "Jane Doe", estimated_total: 5000 }];
    }
    return [];
  }
}

describe("extractOrderCogsFromText", () => {
  it("extracts customer, total, and order number from a vendor order email", () => {
    const result = extractOrderCogsFromText("Customer: Jane Doe Order Total: $1,234.56 Order # ABC-1234");

    expect(result.customerName).toBe("Jane Doe");
    expect(result.orderAmount).toBe(1234.56);
    expect(result.orderNumber).toBe("ABC-1234");
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
  });
});

describe("processOrderCogsInbox", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("auto-applies high-confidence COGS and stores review records for incomplete matches", async () => {
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
          return jsonResponse({ messages: [{ id: "msg-apply" }, { id: "msg-review" }] });
        }
        if (url.includes("/messages/msg-apply")) {
          return jsonResponse({
            id: "msg-apply",
            threadId: "thread-apply",
            historyId: "hist-apply",
            snippet: "Order total for Jane Doe",
            payload: {
              headers: [
                { name: "From", value: "vendor@example.com" },
                { name: "To", value: "805shutters@gmail.com" },
                { name: "Subject", value: "Order confirmation ABC-1234" },
                { name: "Date", value: "Sat, 20 Jun 2026 10:00:00 -0700" }
              ],
              mimeType: "text/plain",
              body: {
                data: gmailTextBody("Customer: Jane Doe Order Total: $1,234.56 Order # ABC-1234")
              }
            }
          });
        }
        return jsonResponse({
          id: "msg-review",
          threadId: "thread-review",
          historyId: "hist-review",
          snippet: "Order for Jane Doe",
          payload: {
            headers: [
              { name: "From", value: "vendor@example.com" },
              { name: "To", value: "805shutters@gmail.com" },
              { name: "Subject", value: "Order confirmation DEF-5678" },
              { name: "Date", value: "Sat, 20 Jun 2026 10:05:00 -0700" }
            ],
            mimeType: "text/plain",
            body: {
              data: gmailTextBody("Customer: Jane Doe Order # DEF-5678")
            }
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
    expect(supabase.updates).toEqual([
      {
        table: "crm_quote_bookkeeping_entries",
        filters: { id: "entry-1" },
        patch: expect.objectContaining({
          cogs_amount: 1234.56,
          manufacturer_order_ref: "ABC-1234",
          manufacturer_order_url: "https://mail.google.com/mail/u/0/#inbox/thread-apply"
        })
      }
    ]);
    expect(supabase.records.map((record) => record.match_status)).toEqual(["matched", "needs_review"]);
    expect(supabase.records[1]).toMatchObject({
      gmail_message_id: "msg-review",
      matched_bookkeeping_entry_id: "entry-1",
      match_reason: "Order total could not be confidently extracted."
    });
  });
});
