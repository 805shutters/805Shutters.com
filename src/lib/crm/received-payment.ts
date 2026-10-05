import type { SupabaseClient } from "@supabase/supabase-js";
import { CrmAuthError } from "@/lib/crm/auth";

type ReceivedPaymentRecord = Record<string, unknown> & {
  quote_id?: string | null;
  job_id?: string | null;
  bookkeeping_entry_id?: string | null;
  payment_label: string;
  payment_type: string;
  amount: number;
  paid_at: unknown;
  notes: string | null;
  source: string;
};

const uuidPattern = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;

type PaymentBalanceGuard = { total: number; expectedBalance: unknown };

async function verifyOutstandingBalance(supabase: SupabaseClient, payment: ReceivedPaymentRecord, guard: PaymentBalanceGuard) {
  const expected = guard.expectedBalance;
  if (typeof expected !== "number" || !Number.isFinite(expected) || expected <= 0 || !Number.isFinite(guard.total)) {
    throw new CrmAuthError(400, "A positive outstanding balance is required. Refresh the payment ledger.");
  }
  const quote = Boolean(payment.quote_id);
  const target = quote ? payment.quote_id : payment.bookkeeping_entry_id;
  if (!target) throw new CrmAuthError(400, "A payment ledger is required.");
  const [receipts, creditsIn, creditsOut] = await Promise.all([
    supabase.from("crm_quote_bookkeeping_payments").select("amount").eq(quote ? "quote_id" : "bookkeeping_entry_id", target),
    supabase.from("crm_quote_bookkeeping_credits").select("amount").eq(quote ? "to_quote_id" : "to_bookkeeping_entry_id", target),
    supabase.from("crm_quote_bookkeeping_credits").select("amount").eq(quote ? "from_quote_id" : "from_bookkeeping_entry_id", target)
  ]);
  if ([receipts, creditsIn, creditsOut].some(result => result.error)) {
    throw new CrmAuthError(502, "The outstanding balance could not be verified. Refresh before recording a payment.");
  }
  const sum = (rows: { amount: unknown }[] | null) => (rows || []).reduce((total, row) => total + Math.round(Number(row.amount) * 100), 0);
  const outstanding = Math.round(guard.total * 100) - sum(receipts.data) - sum(creditsIn.data) + sum(creditsOut.data);
  if (!Number.isFinite(outstanding) || outstanding !== Math.round(expected * 100)) {
    throw new CrmAuthError(409, "This balance changed. Refresh and review the recorded payments before recording another receipt.");
  }
  if (Math.round(payment.amount * 100) > outstanding) {
    throw new CrmAuthError(409, "This amount exceeds the outstanding balance. Review the recorded payments first.");
  }
}

function paymentRequestId(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !uuidPattern.test(value.trim())) {
    throw new CrmAuthError(400, "A valid payment request ID is required. Reopen the payment editor and try again.");
  }
  return value.trim().toLowerCase();
}

function equivalentPayment(existing: Record<string, unknown>, payment: ReceivedPaymentRecord) {
  const ids = ["quote_id", "job_id", "bookkeeping_entry_id"] as const;
  const id = (value: unknown) => typeof value === "string" ? value.toLowerCase() : value || null;
  if (ids.some((key) => id(existing[key]) !== id(payment[key]))) return false;
  const exactFields = ["payment_label", "payment_type", "source", "notes"] as const;
  if (exactFields.some((key) => (existing[key] ?? null) !== (payment[key] ?? null))) return false;
  const amount = Number(existing.amount);
  if (!Number.isFinite(amount) || Math.round(amount * 100) !== Math.round(payment.amount * 100)) return false;
  // paid_at is a database date, even if a legacy caller supplied an ISO value.
  const date = (value: unknown) => value === null || value === undefined ? null : String(value).slice(0, 10);
  return date(existing.paid_at) === date(payment.paid_at);
}

/**
 * Record money already received, not a charge. A stable request UUID prevents a
 * refresh/network/later-sync failure from recording that same receipt twice.
 * Callers without a request ID keep the existing generated-ID insert behavior.
 */
export async function insertReceivedPayment(
  supabase: SupabaseClient,
  payment: ReceivedPaymentRecord,
  requestId?: unknown,
  failureMessage = "Payment failed to save.",
  balanceGuard?: PaymentBalanceGuard
) {
  const id = paymentRequestId(requestId);
  if (balanceGuard) {
    // An acknowledged/lost-response retry must still succeed after its original
    // receipt reduced the balance. Verify receipt identity before the balance.
    if (!id) throw new CrmAuthError(400, "A payment request ID is required. Reopen the payment editor.");
    const { data: existing, error } = await supabase.from("crm_quote_bookkeeping_payments")
      .select("quote_id,job_id,bookkeeping_entry_id,payment_label,payment_type,amount,paid_at,notes,source")
      .eq("id", id).maybeSingle();
    if (error) throw new CrmAuthError(502, "The payment retry could not be verified. Refresh the ledger before trying again.");
    if (existing) {
      if (!equivalentPayment(existing, payment)) throw new CrmAuthError(409, "This payment request was already used for different payment details. Refresh the ledger before recording another payment.");
      return { reused: true };
    }
    await verifyOutstandingBalance(supabase, payment, balanceGuard);
  }
  const { error } = await supabase.from("crm_quote_bookkeeping_payments").insert({ ...payment, ...(id ? { id } : {}) });
  if (!error) return { reused: false };
  if (!id || error.code !== "23505") throw new CrmAuthError(502, failureMessage);

  // A unique conflict alone does not prove this is the same receipt. Never
  // swallow a collision unless its complete payment identity matches.
  const { data: existing, error: lookupError } = await supabase
    .from("crm_quote_bookkeeping_payments")
    .select("quote_id,job_id,bookkeeping_entry_id,payment_label,payment_type,amount,paid_at,notes,source")
    .eq("id", id)
    .maybeSingle();
  if (lookupError || !existing) {
    throw new CrmAuthError(502, "The payment retry could not be verified. Refresh the ledger before trying again.");
  }
  if (!equivalentPayment(existing as Record<string, unknown>, payment)) {
    throw new CrmAuthError(409, "This payment request was already used for different payment details. Refresh the ledger before recording another payment.");
  }
  return { reused: true };
}
