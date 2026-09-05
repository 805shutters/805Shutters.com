import { describe, expect, it, vi } from "vitest";
import { acceptPublicQuote, loadPublicQuoteById } from "./public-quote";

function fixture() {
  const mutate = vi.fn(() => {
    throw new Error("Unexpected contract mutation");
  });
  const quote = {
    id: "quote-test",
    job_id: "job-test",
    share_token: "test-token",
    quote_number: "805-test",
    customer_name: "Jamie Sample",
    customer_address: "100 Example Lane",
    customer_phone: "8055550100",
    customer_email: "sample@example.com",
    status: "draft",
    signed_at: null,
    quote_group_id: null,
    meta: {},
  };
  const design = {
    id: "design",
    product_id: "roller",
    program_id: null,
    fabric: "Garden",
    details: {},
    surcharges: [],
    motorization: [],
    unit_price: 450,
    price_status: "ok",
    price_breakdown: {},
  };
  const line = {
    id: "line",
    quote_id: quote.id,
    room: "Living Room",
    quantity: 1,
    sort_order: 0,
    selected_design_id: design.id,
    discount_percent: 0,
    designs: [design],
  };
  const db = {
    from(table: string) {
      const result = () => ({
        data:
          table === "crm_quotes"
            ? quote
            : table === "crm_quote_line_items"
              ? [line]
              : [],
        error: null,
      });
      const builder = {
        select() {
          return builder;
        },
        eq() {
          return builder;
        },
        maybeSingle: async () => result(),
        then(resolve: (value: ReturnType<typeof result>) => unknown) {
          return Promise.resolve(resolve(result()));
        },
        update: mutate,
        insert: mutate,
        upsert: mutate,
        delete: mutate,
      };
      return builder;
    },
    rpc: mutate,
  };
  return {
    quote,
    design,
    mutate,
    db: db as unknown as Parameters<typeof loadPublicQuoteById>[0],
  };
}

describe("authenticated mobile document and existing signing guard", () => {
  it("loads an unsigned document without a share token using only reads", async () => {
    const { db, quote, mutate } = fixture();
    Object.assign(quote, { share_token: null });
    const document = await loadPublicQuoteById(db, quote.id);
    expect(document).toMatchObject({
      token: "",
      total: 450,
      signed: false,
      allPriced: true,
    });
    expect(document?.lines[0]).toMatchObject({
      room: "Living Room",
      unitPrice: 450,
      lineTotal: 450,
    });
    expect(mutate).not.toHaveBeenCalled();
  });
  it("rejects a signature for a stale total before any acceptance mutation", async () => {
    const { db, mutate } = fixture();
    await expect(
      acceptPublicQuote(db, "test-token", {
        printedName: "Jamie Sample",
        signature: "Jamie Sample",
        acknowledgedTotal: 400,
        notify: false,
      }),
    ).rejects.toMatchObject({
      status: 409,
      message: expect.stringContaining("review the new total"),
    });
    expect(mutate).not.toHaveBeenCalled();
  });
  it("rejects an unpriced document before any acceptance mutation", async () => {
    const { db, design, mutate } = fixture();
    design.price_status = "missing";
    await expect(
      acceptPublicQuote(db, "test-token", {
        printedName: "Jamie Sample",
        acknowledgedTotal: 450,
        notify: false,
      }),
    ).rejects.toMatchObject({
      status: 409,
      message: expect.stringContaining("isn't finalized"),
    });
    expect(mutate).not.toHaveBeenCalled();
  });
});
