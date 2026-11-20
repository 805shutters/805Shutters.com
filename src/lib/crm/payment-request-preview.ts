import type { SupabaseClient } from "@supabase/supabase-js";
import { CrmAuthError } from "@/lib/crm/auth";
import { collectCrmPages } from "@/lib/crm/pagination";
import {
  blockingSquareRequests,
  selectOpenStripeRequest,
  type ClearanceFact,
  type PaymentRequestTarget,
  type SquareRequestFact,
  type StripeAccountFact,
  type StripeRequestFact,
} from "@/lib/crm/payment-request-facts";
import { loadPublicQuoteById } from "@/lib/crm/public-quote";
import {
  collectiblePaymentAmount,
  loadOrderPaymentLedger,
  paymentRecipientAddress,
  squareOrderPaymentAmounts,
  type SquareOrderPaymentType,
} from "@/lib/crm/square-payment-links";
import type { QuoteLedgerCredit, QuoteLedgerPayment } from "@/lib/crm/quote-payment-state";
import { stripeConfig } from "@/lib/finance/stripe";

export type PaymentRequestPreview = {
  paymentType: SquareOrderPaymentType;
  amount: number;
  outstanding: number;
  recipient: { name: string; email: string | null };
  signed: boolean;
  superseded: boolean;
  blockingSquareRequests: ReturnType<typeof blockingSquareRequests>;
  openStripeRequest: {
    id: string;
    accountId: string;
    livemode: boolean;
    status: string;
    purpose: string;
    amountCents: number;
    sessionId: string | null;
    createdAt: string;
  } | null;
};

type PreviewFacts = {
  quoteId: string;
  paymentType: SquareOrderPaymentType;
  total: number;
  depositDue: number;
  customerName: string;
  customerEmail: string | null;
  signed: boolean;
  superseded: boolean;
  payments: QuoteLedgerPayment[];
  creditsIn: QuoteLedgerCredit[];
  creditsOut: QuoteLedgerCredit[];
  squareRequests: SquareRequestFact[];
  clearance: ClearanceFact;
  stripeRequests: StripeRequestFact[];
  stripeAccount: StripeAccountFact | null;
};

const BLOCKER_READ_ERROR = "Payment request blockers could not be verified.";

function text(value: unknown) {
  return typeof value === "string" && value ? value : null;
}

function requireText(value: unknown) {
  const parsed = text(value);
  if (!parsed) throw new CrmAuthError(502, BLOCKER_READ_ERROR);
  return parsed;
}

function nullableText(value: unknown) {
  if (value === null || value === undefined) return null;
  return requireText(value);
}

/** The configured Stripe account, or null when it cannot be read. Never calls Stripe. */
function readStripeAccount(): StripeAccountFact | null {
  try {
    const config = stripeConfig();
    return { accountId: config.account, livemode: config.livemode };
  } catch {
    return null;
  }
}

export function buildPaymentRequestPreview(facts: PreviewFacts): PaymentRequestPreview {
  return buildPaymentRequestPreviewForTarget(facts, { quoteId: facts.quoteId, bookkeepingEntryId: null });
}

function buildPaymentRequestPreviewForTarget(facts: PreviewFacts, target: PaymentRequestTarget): PaymentRequestPreview {
  const amounts = squareOrderPaymentAmounts({
    total: facts.total,
    depositRequired: facts.depositDue,
    payments: facts.payments,
    creditsIn: facts.creditsIn,
    creditsOut: facts.creditsOut,
  });
  const open = selectOpenStripeRequest(facts.stripeRequests, target, facts.stripeAccount);
  return {
    paymentType: facts.paymentType,
    amount: collectiblePaymentAmount(amounts, facts.paymentType),
    outstanding: amounts.outstanding,
    recipient: {
      name: facts.customerName,
      email: paymentRecipientAddress(facts.customerEmail).email,
    },
    signed: facts.signed,
    superseded: facts.superseded,
    blockingSquareRequests: blockingSquareRequests(facts.squareRequests, facts.clearance, target),
    openStripeRequest: open ? {
      id: open.id,
      accountId: open.accountId,
      livemode: open.livemode,
      status: open.status,
      purpose: open.purpose,
      amountCents: open.amountCents,
      sessionId: open.sessionId,
      createdAt: open.createdAt,
    } : null,
  };
}

async function readQuoteRows(supabase: SupabaseClient, table: string, columns: string, quoteId: string) {
  const result = await collectCrmPages<Record<string, unknown>>(async (from, to) => {
    const page = await supabase.from(table).select(columns).eq("quote_id", quoteId).order("created_at", { ascending: true }).range(from, to);
    return {
      data: (page.data ?? null) as Record<string, unknown>[] | null,
      error: page.error ? { message: page.error.message } : null,
    };
  });
  if (result.error) throw new CrmAuthError(502, BLOCKER_READ_ERROR);
  return result.data || [];
}

function squareFact(row: Record<string, unknown>): SquareRequestFact {
  return {
    id: requireText(row.id),
    environment: requireText(row.environment),
    quoteId: nullableText(row.quote_id),
    bookkeepingEntryId: nullableText(row.bookkeeping_entry_id),
    createdAt: requireText(row.created_at),
  };
}

function cents(value: unknown) {
  const amount = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new CrmAuthError(502, BLOCKER_READ_ERROR);
  return amount;
}

function stripeFact(row: Record<string, unknown>): StripeRequestFact {
  if (typeof row.livemode !== "boolean") throw new CrmAuthError(502, BLOCKER_READ_ERROR);
  return {
    id: requireText(row.id),
    accountId: requireText(row.account_id),
    livemode: row.livemode,
    quoteId: nullableText(row.quote_id),
    bookkeepingEntryId: nullableText(row.bookkeeping_entry_id),
    status: requireText(row.status),
    purpose: requireText(row.purpose),
    amountCents: cents(row.amount_cents),
    sessionId: nullableText(row.session_id),
    createdAt: requireText(row.created_at),
  };
}

/**
 * Read-only explanation of the staff card-link send.
 * Does not create a share token, reserve a Stripe request, or call Square or Stripe.
 */
export async function loadPaymentRequestPreview(
  supabase: SupabaseClient,
  quoteId: string,
  paymentType: SquareOrderPaymentType,
): Promise<PaymentRequestPreview> {
  const quote = await loadPublicQuoteById(supabase, quoteId);
  if (!quote) throw new CrmAuthError(404, "Quote was not found.");
  const [ledger, squareRows, stripeRows, clearanceResult] = await Promise.all([
    loadOrderPaymentLedger(supabase, quoteId),
    readQuoteRows(supabase, "crm_square_requests", "id,environment,quote_id,bookkeeping_entry_id,created_at", quoteId),
    readQuoteRows(supabase, "crm_stripe_requests", "id,account_id,livemode,quote_id,bookkeeping_entry_id,status,purpose,amount_cents,session_id,created_at", quoteId),
    supabase.from("crm_card_migration_clearances").select("target_id,reviewed_through").eq("target_id", quoteId).maybeSingle(),
  ]);
  if (clearanceResult.error) throw new CrmAuthError(502, BLOCKER_READ_ERROR);
  const clearanceRow = clearanceResult.data as { target_id?: unknown; reviewed_through?: unknown } | null;
  const clearance: ClearanceFact = clearanceRow
    ? { targetId: requireText(clearanceRow.target_id), reviewedThrough: requireText(clearanceRow.reviewed_through) }
    : null;
  return buildPaymentRequestPreviewForTarget({
    quoteId,
    paymentType,
    total: quote.total,
    depositDue: quote.depositDue,
    customerName: quote.customerName,
    customerEmail: quote.customerEmail,
    signed: quote.signed,
    superseded: quote.superseded === true,
    ...ledger,
    squareRequests: squareRows.map(squareFact),
    clearance,
    stripeRequests: stripeRows.map(stripeFact),
    stripeAccount: readStripeAccount(),
  }, { quoteId, bookkeepingEntryId: null });
}
