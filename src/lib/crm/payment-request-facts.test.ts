import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  STRIPE_COLLECTIBLE_STATUSES,
  blockingSquareRequests,
  selectOpenStripeRequest,
  type SquareRequestFact,
  type StripeRequestFact,
} from "./payment-request-facts";

const quoteId = "11111111-1111-4111-8111-111111111111";
const target = { quoteId, bookkeepingEntryId: null };
const square = (patch: Partial<SquareRequestFact>): SquareRequestFact => ({
  id: "sq-1",
  environment: "production",
  quoteId,
  bookkeepingEntryId: null,
  createdAt: "2026-04-01T00:00:00.000Z",
  ...patch,
});
const stripe = (patch: Partial<StripeRequestFact>): StripeRequestFact => ({
  id: "st-1",
  accountId: "acct_fixture",
  livemode: true,
  quoteId,
  bookkeepingEntryId: null,
  status: "open",
  purpose: "deposit",
  amountCents: 150000,
  sessionId: "cs_1",
  createdAt: "2026-11-01T00:00:00.000Z",
  ...patch,
});
const account = { accountId: "acct_fixture", livemode: true };

describe("Stripe guard facts", () => {
  it("matches the reservation guard's production clearance predicate and collectible statuses", () => {
    const sql = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../../../supabase/migrations/20261120203721_stripe_collection.sql"), "utf8");
    const reserve = sql.slice(sql.indexOf("create function public.reserve_stripe_request"), sql.indexOf("create function public.allocate_stripe_payment"));
    expect(reserve).toContain("s.environment='production'");
    expect(reserve).toContain("c.target_id=coalesce(p_quote,p_entry)");
    expect(reserve).toContain("c.reviewed_through>=s.created_at");
    expect(reserve).toContain(`status in (${STRIPE_COLLECTIBLE_STATUSES.map((status) => `'${status}'`).join(",")})`);
  });

  it("blocks every uncovered production Square request and ignores sandbox rows", () => {
    expect(blockingSquareRequests([
      square({ id: "sq-b", createdAt: "2026-06-01T00:00:00.000Z" }),
      square({ id: "sq-sandbox", environment: "sandbox" }),
      square({ id: "sq-a", createdAt: "2026-04-01T00:00:00.000Z" }),
      square({ id: "sq-other", quoteId: "other-quote" }),
    ], null, target)).toEqual([
      { id: "sq-a", createdAt: "2026-04-01T00:00:00.000Z", clearanceState: "absent", reviewedThrough: null },
      { id: "sq-b", createdAt: "2026-06-01T00:00:00.000Z", clearanceState: "absent", reviewedThrough: null },
    ]);
  });

  it("treats an equal reviewed_through as cleared and a later Square request as stale", () => {
    const clearance = { targetId: quoteId, reviewedThrough: "2026-03-01T00:00:00.000Z" };
    expect(blockingSquareRequests([
      square({ id: "sq-covered", createdAt: "2026-03-01T00:00:00.000Z" }),
      square({ id: "sq-new", createdAt: "2026-03-01T00:00:00.001Z" }),
    ], clearance, target)).toEqual([
      { id: "sq-new", createdAt: "2026-03-01T00:00:00.001Z", clearanceState: "stale", reviewedThrough: clearance.reviewedThrough },
    ]);
    expect(blockingSquareRequests([
      square({ id: "sq-old" }),
    ], { targetId: "other-target", reviewedThrough: "2099-01-01T00:00:00.000Z" }, target)).toEqual([
      { id: "sq-old", createdAt: "2026-04-01T00:00:00.000Z", clearanceState: "absent", reviewedThrough: null },
    ]);
  });

  it("uses the bookkeeping entry as the guard target when the quote is absent", () => {
    const entryId = "22222222-2222-4222-8222-222222222222";
    expect(blockingSquareRequests([
      square({ id: "sq-entry", quoteId: null, bookkeepingEntryId: entryId }),
      square({ id: "sq-quote" }),
    ], null, { quoteId: null, bookkeepingEntryId: entryId })).toEqual([
      { id: "sq-entry", createdAt: "2026-04-01T00:00:00.000Z", clearanceState: "absent", reviewedThrough: null },
    ]);
  });

  it("returns only the collectible request for the configured Stripe account", () => {
    const open = stripe({ id: "st-open" });
    expect(selectOpenStripeRequest([
      stripe({ id: "st-paid", status: "paid", createdAt: "2026-10-01T00:00:00.000Z" }),
      stripe({ id: "st-expired", status: "expired" }),
      stripe({ id: "st-other", accountId: "acct_other" }),
      stripe({ id: "st-test", livemode: false, status: "creating", sessionId: null }),
      stripe({ id: "st-review", status: "review", createdAt: "2026-12-01T00:00:00.000Z" }),
      open,
    ], target, account)).toEqual(open);
    expect(selectOpenStripeRequest([open], target, null)).toBeNull();
    expect(selectOpenStripeRequest([
      stripe({ id: "st-processing", status: "processing", createdAt: "2026-11-02T00:00:00.000Z" }),
      stripe({ id: "st-creating", status: "creating", sessionId: null, createdAt: "2026-11-01T00:00:00.000Z" }),
    ], target, account)?.id).toBe("st-creating");
  });
});
