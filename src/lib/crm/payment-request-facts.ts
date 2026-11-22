/**
 * Pure view of the Stripe reservation guard in
 * `reserve_stripe_request` (supabase/migrations/20261120203721_stripe_collection.sql).
 * The database function remains the write-time enforcement. Callers that only
 * need to explain a block must use these predicates so they cannot drift.
 */

export const STRIPE_COLLECTIBLE_STATUSES = ["creating", "open", "processing", "review"] as const;

export type PaymentRequestTarget = {
  quoteId: string | null;
  bookkeepingEntryId: string | null;
};

export type SquareRequestFact = {
  id: string;
  environment: string;
  quoteId: string | null;
  bookkeepingEntryId: string | null;
  createdAt: string;
};

export type ClearanceFact = {
  targetId: string;
  reviewedThrough: string;
} | null;

export type SquareRequestClearanceState = "absent" | "stale";

export type BlockingSquareRequest = {
  id: string;
  createdAt: string;
  clearanceState: SquareRequestClearanceState;
  reviewedThrough: string | null;
};

export type StripeRequestFact = {
  id: string;
  accountId: string;
  livemode: boolean;
  quoteId: string | null;
  bookkeepingEntryId: string | null;
  status: string;
  purpose: string;
  amountCents: number;
  sessionId: string | null;
  createdAt: string;
};

export type StripeAccountFact = {
  accountId: string;
  livemode: boolean;
};

function guardTargetId(target: PaymentRequestTarget) {
  return target.quoteId ?? target.bookkeepingEntryId;
}

function matchesGuardTarget(
  row: { quoteId: string | null; bookkeepingEntryId: string | null },
  target: PaymentRequestTarget,
) {
  const quoteMatch = target.quoteId !== null && row.quoteId === target.quoteId;
  const entryMatch = target.bookkeepingEntryId !== null && row.bookkeepingEntryId === target.bookkeepingEntryId;
  return quoteMatch || entryMatch;
}

function timestamp(value: string) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function byCreatedThenId<T extends { createdAt: string; id: string }>(left: T, right: T) {
  const leftTime = timestamp(left.createdAt);
  const rightTime = timestamp(right.createdAt);
  if (leftTime !== null && rightTime !== null && leftTime !== rightTime) return leftTime - rightTime;
  if (left.id < right.id) return -1;
  if (left.id > right.id) return 1;
  return 0;
}

/**
 * Production Square requests the reservation guard rejects until a clearance
 * for this exact ledger covers `reviewed_through >= created_at`.
 * Sandbox requests and a clearance stored on a different target are not blocks.
 */
export function blockingSquareRequests(
  requests: readonly SquareRequestFact[],
  clearance: ClearanceFact,
  target: PaymentRequestTarget,
): BlockingSquareRequest[] {
  const targetId = guardTargetId(target);
  const applicable = clearance && targetId && clearance.targetId === targetId ? clearance : null;
  const reviewedThrough = applicable ? timestamp(applicable.reviewedThrough) : null;
  return requests
    .filter((request) => request.environment === "production" && matchesGuardTarget(request, target))
    .flatMap((request) => {
      const createdAt = timestamp(request.createdAt);
      const covered = reviewedThrough !== null && createdAt !== null && reviewedThrough >= createdAt;
      if (covered) return [];
      return [{
        id: request.id,
        createdAt: request.createdAt,
        clearanceState: applicable ? "stale" as const : "absent" as const,
        reviewedThrough: applicable ? applicable.reviewedThrough : null,
      }];
    })
    .sort(byCreatedThenId);
}

/** The collectible Stripe request `reserve_stripe_request` would resume for this account. */
export function selectOpenStripeRequest(
  requests: readonly StripeRequestFact[],
  target: PaymentRequestTarget,
  account: StripeAccountFact | null,
): StripeRequestFact | null {
  if (!account) return null;
  const collectible = new Set<string>(STRIPE_COLLECTIBLE_STATUSES);
  const matches = requests.filter((request) =>
    request.accountId === account.accountId
    && request.livemode === account.livemode
    && collectible.has(request.status)
    && matchesGuardTarget(request, target));
  return matches.sort(byCreatedThenId)[0] ?? null;
}
