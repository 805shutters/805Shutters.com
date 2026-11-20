import { expect, it } from "vitest";
import {
  buildSquareClearanceReview,
  openBalanceCentsForClearanceReview,
  quoteIsSignedForClearanceReview,
  type SquareClearanceQuoteRecord,
  type SquareClearanceRequestRecord,
  type SquareClearanceReviewInput,
} from "./stripe-clearance-review";

const signed = (id: string, extra: Partial<SquareClearanceQuoteRecord> = {}): SquareClearanceQuoteRecord => ({
  id,
  job_id: "job-1",
  quote_number: "Q-100",
  status: "sold",
  quote_total: 1000,
  signed_at: "2026-01-15T00:00:00.000Z",
  customer_printed_name: "Signed Customer",
  ...extra,
});

const request = (id: string, quoteId: string, extra: Partial<SquareClearanceRequestRecord> = {}): SquareClearanceRequestRecord => ({
  environment: "production",
  id,
  order_id: `order-${id}`,
  quote_id: quoteId,
  amount_cents: 25000,
  payment_type: "deposit",
  url: `https://square.example/${id}`,
  created_at: "2026-02-01T00:00:00.000Z",
  ...extra,
});

function review(extra: Partial<SquareClearanceReviewInput> & Pick<SquareClearanceReviewInput, "quotes">) {
  return buildSquareClearanceReview({
    requests: extra.quotes.map((quote) => request(`link-${quote.id}`, quote.id)),
    payments: [],
    credits: [],
    clearances: [],
    jobs: [{ id: "job-1", customer_name: "Ada Customer" }],
    ...extra,
  });
}

it("keeps a signed open-balance quote with a production Square request and no clearance", () => {
  const [row] = review({ quotes: [signed("quote-1", { quote_number: "Q-34", job_id: "job-1" })] });
  expect(row).toMatchObject({
    quoteId: "quote-1",
    quoteNumber: "Q-34",
    customerName: "Ada Customer",
    quoteTotalCents: 100000,
    openBalanceCents: 100000,
    clearance: { state: "none", reviewedThrough: null },
  });
  expect(row.squareRequests).toEqual([
    expect.objectContaining({
      id: "link-quote-1",
      orderId: "order-link-quote-1",
      amountCents: 25000,
      paymentType: "deposit",
      status: null,
      url: "https://square.example/link-quote-1",
    }),
  ]);
});

it("filters to signed quotes with an open balance, a production Square request, and no covering clearance", () => {
  const rows = buildSquareClearanceReview({
    quotes: [
      signed("open"),
      signed("unsigned", { status: "sent", signed_at: null, customer_signature: "  " }),
      signed("draft", { status: "draft", customer_signature: "Ada" }),
      signed("lost", { status: "lost" }),
      signed("archived", { status: "archived" }),
      signed("archived-at", { archived_at: "2026-03-01T00:00:00.000Z" }),
      signed("deleted", { meta: { deleted_at: "2026-03-01T00:00:00.000Z" } }),
      signed("bookkeeping-deleted", { meta: { bookkeeping_deleted_at: "2026-03-01T00:00:00.000Z" } }),
      signed("paid", { quote_total: 400 }),
      signed("credited"),
      signed("cleared"),
      signed("sandbox-only"),
      signed("entry-only"),
      signed("uncovered", { quote_number: "Q-2", customer_printed_name: "Later Customer", job_id: null }),
      signed("sent-signed", { status: "sent", customer_signature: "Ada Signed", signed_at: null, quote_number: "Q-3" }),
    ],
    requests: [
      request("open-link", "open"),
      request("unsigned-link", "unsigned"),
      request("draft-link", "draft"),
      request("lost-link", "lost"),
      request("archived-link", "archived"),
      request("archived-at-link", "archived-at"),
      request("deleted-link", "deleted"),
      request("bookkeeping-deleted-link", "bookkeeping-deleted"),
      request("paid-link", "paid"),
      request("credited-link", "credited"),
      request("cleared-link", "cleared", { created_at: "2026-02-01T00:00:00.000Z" }),
      request("sandbox-link", "sandbox-only", { environment: "sandbox" }),
      { ...request("entry-link", "entry-only"), quote_id: null, bookkeeping_entry_id: "entry-1" },
      request("old-link", "uncovered", { created_at: "2026-02-01T00:00:00.000Z", status: "PAID", amount_cents: 10000 }),
      request("new-link", "uncovered", { created_at: "2026-06-01T00:00:00.000Z", status: "  ", amount_cents: "15000", payment_type: "balance" }),
      request("sent-link", "sent-signed"),
      request("missing-quote", "missing-quote"),
    ],
    payments: [{ id: "pay-1", quote_id: "paid", amount: "400.00" }],
    credits: [{ id: "credit-1", amount: 1000, to_quote_id: "credited" }],
    clearances: [
      { target_id: "cleared", reviewed_through: "2026-02-01T00:00:00.000Z" },
      { target_id: "uncovered", reviewed_through: "2026-03-01T00:00:00.000Z" },
    ],
    jobs: [{ id: "job-1", customer_name: "Ada Customer" }],
  });

  expect(rows.map((row) => row.quoteId)).toEqual(["open", "sent-signed", "uncovered"]);
  const uncovered = rows.find((row) => row.quoteId === "uncovered");
  expect(uncovered).toMatchObject({
    customerName: "Later Customer",
    quoteNumber: "Q-2",
    clearance: { state: "uncovered", reviewedThrough: "2026-03-01T00:00:00.000Z" },
  });
  expect(uncovered?.squareRequests.map((item) => [item.id, item.status, item.amountCents, item.paymentType])).toEqual([
    ["old-link", "PAID", 10000, "deposit"],
    ["new-link", null, 15000, "balance"],
  ]);
  expect(rows.find((row) => row.quoteId === "open")?.clearance.state).toBe("none");
});

it("counts credits the same way the Stripe balance gate does", () => {
  const quote = signed("quote-1", { quote_total: 1000 });
  expect(openBalanceCentsForClearanceReview(quote, [{ quote_id: "quote-1", amount: 400 }], [])).toBe(60000);
  expect(openBalanceCentsForClearanceReview(quote, [], [{ id: "in", amount: 900, to_quote_id: "quote-1" }])).toBe(10000);
  expect(openBalanceCentsForClearanceReview(quote, [{ quote_id: "quote-1", amount: 1000 }], [{ id: "out", amount: 25, from_quote_id: "quote-1" }])).toBe(2500);
  expect(openBalanceCentsForClearanceReview(quote, [{ quote_id: "quote-1", amount: 1000 }], [])).toBe(0);
  expect(openBalanceCentsForClearanceReview(quote, [{ quote_id: "quote-1", amount: "not-money" }], [])).toBeNull();
  expect(quoteIsSignedForClearanceReview(signed("quote-1", { signed_at: null, customer_signature: null }))).toBe(false);
});

it("does not turn one Square request into more than one quote row", () => {
  const rows = review({
    quotes: [signed("quote-1")],
    requests: [request("a", "quote-1", { created_at: "2026-04-01T00:00:00.000Z" }), request("b", "quote-1")],
  });
  expect(rows).toHaveLength(1);
  expect(rows[0].squareRequests.map((item) => item.id)).toEqual(["b", "a"]);
});
