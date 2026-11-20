import type { SupabaseClient } from "@supabase/supabase-js";

/** Quotes in these statuses are not signed contracts awaiting collection. */
const UNSIGNED_STATUSES = new Set(["draft", "lost", "archived"]);

export type SquareClearanceReviewRequest = {
  id: string;
  orderId: string | null;
  url: string;
  amountCents: number | null;
  paymentType: string | null;
  createdAt: string | null;
  /** Present only when the stored Square request row itself has a status. */
  status: string | null;
};

export type SquareClearanceReviewRow = {
  quoteId: string;
  quoteNumber: string | null;
  customerName: string;
  quoteTotalCents: number;
  openBalanceCents: number;
  clearance: {
    state: "none" | "uncovered";
    reviewedThrough: string | null;
  };
  squareRequests: SquareClearanceReviewRequest[];
};

export type SquareClearanceQuoteRecord = {
  id: string;
  job_id?: string | null;
  quote_number?: string | null;
  status?: string | null;
  quote_total?: number | string | null;
  signed_at?: string | null;
  customer_signature?: string | null;
  customer_printed_name?: string | null;
  archived_at?: string | null;
  meta?: unknown;
};

export type SquareClearanceRequestRecord = {
  environment?: string | null;
  id?: string | null;
  order_id?: string | null;
  quote_id?: string | null;
  bookkeeping_entry_id?: string | null;
  amount_cents?: number | string | null;
  payment_type?: string | null;
  url?: string | null;
  created_at?: string | null;
  status?: string | null;
};

export type SquareClearanceLedgerRecord = {
  id?: string | null;
  quote_id?: string | null;
  amount?: number | string | null;
};

export type SquareClearanceCreditRecord = {
  id?: string | null;
  amount?: number | string | null;
  from_quote_id?: string | null;
  to_quote_id?: string | null;
};

export type SquareClearanceRecord = {
  target_id?: string | null;
  reviewed_through?: string | null;
};

export type SquareClearanceJobRecord = {
  id?: string | null;
  customer_name?: string | null;
};

export type SquareClearanceReviewInput = {
  quotes: SquareClearanceQuoteRecord[];
  requests: SquareClearanceRequestRecord[];
  payments: SquareClearanceLedgerRecord[];
  credits: SquareClearanceCreditRecord[];
  clearances: SquareClearanceRecord[];
  jobs: SquareClearanceJobRecord[];
};

type Filter =
  | { kind: "eq"; column: string; value: unknown }
  | { kind: "in"; column: string; values: readonly unknown[] };

type PageResult = { data: unknown[] | null; error: { message: string } | null };

type ReadQuery = {
  select: (columns: string) => ReadQuery;
  eq: (column: string, value: unknown) => ReadQuery;
  in: (column: string, values: readonly unknown[]) => ReadQuery;
  order: (column: string, options?: { ascending?: boolean }) => ReadQuery;
  range: (from: number, to: number) => PromiseLike<PageResult>;
};

const READ_ERROR = "Square clearance review could not be read.";

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function dollars(value: unknown): number | null {
  if (value == null || value === "") return 0;
  const amount = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(amount) ? amount : null;
}

function cents(amount: number) {
  return Math.round(amount * 100);
}

function deleted(meta: unknown) {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return false;
  const record = meta as Record<string, unknown>;
  return Boolean(record.deleted_at || record.bookkeeping_deleted_at);
}

export function quoteIsSignedForClearanceReview(quote: SquareClearanceQuoteRecord) {
  const status = text(quote.status).toLowerCase();
  if (!quote.id || UNSIGNED_STATUSES.has(status) || quote.archived_at || deleted(quote.meta)) return false;
  return Boolean(text(quote.signed_at) || text(quote.customer_signature));
}

function time(value: string | null | undefined) {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function storedStatus(request: SquareClearanceRequestRecord) {
  const status = text(request.status);
  return status || null;
}

function requestAmountCents(request: SquareClearanceRequestRecord) {
  if (request.amount_cents == null || request.amount_cents === "") return null;
  const amount = typeof request.amount_cents === "number" ? request.amount_cents : Number(request.amount_cents);
  return Number.isSafeInteger(amount) ? amount : null;
}

function productionRequestsForQuote(quoteId: string, requests: SquareClearanceRequestRecord[]) {
  return requests.filter((request) => request.quote_id === quoteId && text(request.environment) === "production" && text(request.id));
}

/**
 * Open balance matches the Stripe collection gate: quote total, minus recorded
 * payments and credits applied to the quote, plus credits moved to another quote.
 * Returns null when a stored amount cannot be read.
 */
export function openBalanceCentsForClearanceReview(
  quote: SquareClearanceQuoteRecord,
  payments: SquareClearanceLedgerRecord[],
  credits: SquareClearanceCreditRecord[],
) {
  const total = dollars(quote.quote_total);
  if (total == null) return null;
  let paid = 0;
  for (const payment of payments) {
    if (payment.quote_id !== quote.id) continue;
    const amount = dollars(payment.amount);
    if (amount == null) return null;
    paid += amount;
  }
  const seen = new Set<string>();
  let creditTowardPaid = 0;
  for (const credit of credits) {
    const id = text(credit.id) || `${credit.from_quote_id}:${credit.to_quote_id}:${credit.amount}`;
    if (seen.has(id)) continue;
    const toQuote = credit.to_quote_id === quote.id;
    const fromQuote = credit.from_quote_id === quote.id;
    if (!toQuote && !fromQuote) continue;
    seen.add(id);
    const amount = dollars(credit.amount);
    if (amount == null) return null;
    creditTowardPaid += toQuote ? amount : -amount;
  }
  return Math.max(cents(total - paid - creditTowardPaid), 0);
}

function clearanceCovers(clearance: SquareClearanceRecord | undefined, requests: SquareClearanceRequestRecord[]) {
  if (!clearance) return false;
  const reviewed = time(clearance.reviewed_through);
  if (reviewed == null) return false;
  return requests.every((request) => {
    const created = time(request.created_at);
    return created != null && reviewed >= created;
  });
}

export function buildSquareClearanceReview(input: SquareClearanceReviewInput): SquareClearanceReviewRow[] {
  const jobs = new Map(input.jobs.filter((job) => job.id).map((job) => [job.id as string, job]));
  const clearances = new Map(
    input.clearances.filter((row) => row.target_id).map((row) => [row.target_id as string, row]),
  );
  const rows: SquareClearanceReviewRow[] = [];
  for (const quote of input.quotes) {
    if (!quoteIsSignedForClearanceReview(quote)) continue;
    const requests = productionRequestsForQuote(quote.id, input.requests);
    if (!requests.length) continue;
    const clearance = clearances.get(quote.id);
    if (clearanceCovers(clearance, requests)) continue;
    const openBalanceCents = openBalanceCentsForClearanceReview(quote, input.payments, input.credits);
    if (openBalanceCents == null || openBalanceCents <= 0) continue;
    const total = dollars(quote.quote_total);
    if (total == null) continue;
    const customerName = text(quote.job_id ? jobs.get(quote.job_id)?.customer_name : "") || text(quote.customer_printed_name) || "Customer unavailable";
    rows.push({
      quoteId: quote.id,
      quoteNumber: text(quote.quote_number) || null,
      customerName,
      quoteTotalCents: cents(total),
      openBalanceCents,
      clearance: {
        state: clearance ? "uncovered" : "none",
        reviewedThrough: clearance?.reviewed_through ?? null,
      },
      squareRequests: requests
        .map((request) => ({
          id: text(request.id),
          orderId: text(request.order_id) || null,
          url: text(request.url),
          amountCents: requestAmountCents(request),
          paymentType: text(request.payment_type) || null,
          createdAt: text(request.created_at) || null,
          status: storedStatus(request),
        }))
        .sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || "") || a.id.localeCompare(b.id)),
    });
  }
  return rows.sort((a, b) => a.customerName.localeCompare(b.customerName) || (a.quoteNumber || "").localeCompare(b.quoteNumber || "") || a.quoteId.localeCompare(b.quoteId));
}

async function readRows<T>(supabase: SupabaseClient, table: string, columns: string, filters: Filter[], identity: string) {
  const collected: T[] = [];
  for (let page = 0; page < 10_000; page += 1) {
    let query = (supabase.from(table) as unknown as ReadQuery).select(columns);
    for (const filter of filters) {
      query = filter.kind === "eq" ? query.eq(filter.column, filter.value) : query.in(filter.column, filter.values);
    }
    const from = collected.length;
    const result = await query.order(identity, { ascending: true }).range(from, from + 499);
    if (result.error) throw new Error(READ_ERROR);
    const batch = (result.data || []) as T[];
    if (!batch.length) return collected;
    collected.push(...batch);
    if (batch.length < 500) return collected;
  }
  throw new Error(READ_ERROR);
}

async function readIn<T>(supabase: SupabaseClient, table: string, columns: string, column: string, ids: string[], identity: string) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return [] as T[];
  const rows: T[] = [];
  for (let index = 0; index < unique.length; index += 100) {
    rows.push(...await readRows<T>(supabase, table, columns, [{ kind: "in", column, values: unique.slice(index, index + 100) }], identity));
  }
  return rows;
}

export async function loadSquareClearanceReview(supabase: SupabaseClient) {
  const requests = await readRows<SquareClearanceRequestRecord>(supabase, "crm_square_requests", "*", [{ kind: "eq", column: "environment", value: "production" }], "id");
  const quoteIds = [...new Set(requests.map((request) => text(request.quote_id)).filter(Boolean))];
  if (!quoteIds.length) return [];
  const quotes = await readIn<SquareClearanceQuoteRecord>(
    supabase,
    "crm_quotes",
    "id,job_id,quote_number,status,quote_total,signed_at,customer_signature,customer_printed_name,archived_at,meta",
    "id",
    quoteIds,
    "id",
  );
  const jobIds = quotes.map((quote) => text(quote.job_id)).filter(Boolean);
  const [payments, creditsFrom, creditsTo, clearances, jobs] = await Promise.all([
    readIn<SquareClearanceLedgerRecord>(supabase, "crm_quote_bookkeeping_payments", "id,quote_id,amount", "quote_id", quoteIds, "id"),
    readIn<SquareClearanceCreditRecord>(supabase, "crm_quote_bookkeeping_credits", "id,amount,from_quote_id,to_quote_id", "from_quote_id", quoteIds, "id"),
    readIn<SquareClearanceCreditRecord>(supabase, "crm_quote_bookkeeping_credits", "id,amount,from_quote_id,to_quote_id", "to_quote_id", quoteIds, "id"),
    readIn<SquareClearanceRecord>(supabase, "crm_card_migration_clearances", "target_id,reviewed_through", "target_id", quoteIds, "target_id"),
    readIn<SquareClearanceJobRecord>(supabase, "crm_jobs", "id,customer_name", "id", jobIds, "id"),
  ]);
  const credits = new Map<string, SquareClearanceCreditRecord>();
  for (const credit of [...creditsFrom, ...creditsTo]) {
    const id = text(credit.id);
    if (id) credits.set(id, credit);
  }
  return buildSquareClearanceReview({ quotes, requests, payments, credits: [...credits.values()], clearances, jobs });
}
