import type { SupabaseClient } from "@supabase/supabase-js";
import { CrmAuthError } from "@/lib/crm/auth";

export type QuotePaymentType = "deposit" | "balance";

export type QuotePaymentState = {
  available: boolean;
  dueType: QuotePaymentType | null;
  amountDue: number;
  outstanding: number;
  depositPaid: number;
  paidTotal: number;
};

export type QuoteLedgerPayment = { amount?: number | string | null; payment_label?: string | null };
export type QuoteLedgerCredit = { amount?: number | string | null };

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function sumAmounts(rows: Array<{ amount?: number | string | null }>) {
  return roundMoney(rows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0));
}

function isDepositPayment(payment: QuoteLedgerPayment) {
  return String(payment.payment_label || "").toLowerCase().includes("deposit");
}

export function unavailableQuotePaymentState(): QuotePaymentState {
  return {
    available: false,
    dueType: null,
    amountDue: 0,
    outstanding: 0,
    depositPaid: 0,
    paidTotal: 0,
  };
}

/**
 * Derive the amount due now from the bookkeeping ledger without changing the
 * contract's configured deposit or balance calculations.
 */
export function quotePaymentState(input: {
  total: number;
  depositRequired: number;
  payments?: QuoteLedgerPayment[];
  creditsIn?: QuoteLedgerCredit[];
  creditsOut?: QuoteLedgerCredit[];
}): QuotePaymentState {
  const payments = input.payments || [];
  const paidTotal = sumAmounts(payments);
  const depositPaid = sumAmounts(payments.filter(isDepositPayment));
  const creditIn = sumAmounts(input.creditsIn || []);
  const creditOut = sumAmounts(input.creditsOut || []);
  const outstanding = roundMoney(Math.max(input.total - paidTotal - creditIn + creditOut, 0));
  const deposit = roundMoney(Math.min(Math.max(input.depositRequired - depositPaid, 0), outstanding));
  const balance = roundMoney(Math.max(outstanding - deposit, 0));
  const dueType: QuotePaymentType | null = deposit > 0 ? "deposit" : balance > 0 ? "balance" : null;
  const amountDue = dueType === "deposit" ? deposit : dueType === "balance" ? balance : 0;

  return { available: true, dueType, amountDue, outstanding, depositPaid, paidTotal };
}

export async function loadQuotePaymentState(
  supabase: SupabaseClient,
  quoteId: string,
  input: { total: number; depositRequired: number },
): Promise<QuotePaymentState> {
  const [paymentsResult, creditsInResult, creditsOutResult] = await Promise.all([
    supabase.from("crm_quote_bookkeeping_payments").select("amount,payment_label").eq("quote_id", quoteId),
    supabase.from("crm_quote_bookkeeping_credits").select("amount").eq("to_quote_id", quoteId),
    supabase.from("crm_quote_bookkeeping_credits").select("amount").eq("from_quote_id", quoteId),
  ]);

  if (paymentsResult.error || creditsInResult.error || creditsOutResult.error) {
    return unavailableQuotePaymentState();
  }

  return quotePaymentState({
    ...input,
    payments: (paymentsResult.data || []) as QuoteLedgerPayment[],
    creditsIn: (creditsInResult.data || []) as QuoteLedgerCredit[],
    creditsOut: (creditsOutResult.data || []) as QuoteLedgerCredit[],
  });
}

/** Revalidate a public card-payment request against the current ledger state. */
export function amountDueForPaymentType(state: QuotePaymentState, requestedType: QuotePaymentType) {
  if (!state.available) {
    throw new CrmAuthError(502, "The current payment balance could not be verified.");
  }
  if (!state.dueType || !(state.amountDue > 0)) {
    throw new CrmAuthError(400, "No payment is currently due on this quote.");
  }
  if (state.dueType !== requestedType) {
    throw new CrmAuthError(409, "The payment amount changed. Refresh this contract before continuing.");
  }
  return state.amountDue;
}
