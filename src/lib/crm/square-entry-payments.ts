import type { SupabaseClient } from "@supabase/supabase-js";
import type { SquarePaymentFacts } from "@/lib/finance/square";

export type SquareEntryReconcileResult = {
  status: "recorded" | "duplicate" | "skipped";
  reason?: string; bookkeepingEntryId: string | null; quoteId: null;
  squarePaymentId: string; amount: number; paymentLabel?: "Deposit" | "Balance payment";
};

/** Entry payments remain entry-scoped, even when the imported entry has a linked
 * quote. No workflow statuses are changed by money arriving. */
export async function reconcileSquareEntryPayment(
  supabase: SupabaseClient,
  facts: SquarePaymentFacts,
): Promise<SquareEntryReconcileResult> {
  const amount = Math.round(facts.amountCents) / 100;
  const base = { bookkeepingEntryId: facts.bookkeepingEntryId || null, quoteId: null,
    squarePaymentId: facts.squarePaymentId, amount } as const;
  if (!facts.bookkeepingEntryId || facts.quoteId) throw new Error("Square payment must identify exactly one entry ledger.");
  if (!Number.isSafeInteger(facts.amountCents) || amount <= 0) throw new Error("Square payment amount is invalid.");
  if (facts.paymentType !== "deposit" && facts.paymentType !== "balance") throw new Error("Square entry payment type is missing or invalid.");
  const loadDuplicate = async () => {
    const result = await supabase.from("crm_quote_bookkeeping_payments")
      .select("id,bookkeeping_entry_id,quote_id,amount")
      .eq("external_source", "square").eq("external_id", facts.squarePaymentId).maybeSingle();
    if (result.error) throw new Error(`Square payment duplicate check failed: ${result.error.message}`);
    if (result.data && (result.data.bookkeeping_entry_id !== facts.bookkeepingEntryId || result.data.quote_id || Math.round(Number(result.data.amount) * 100) !== facts.amountCents)) {
      throw new Error("Square payment is already assigned to a different ledger or amount. Review is required.");
    }
    return Boolean(result.data);
  };
  if (await loadDuplicate()) return { ...base, status: "duplicate" };
  const result = await supabase.from("crm_quote_bookkeeping_entries")
    .select("id,job_id,source,meta").eq("id", facts.bookkeepingEntryId).maybeSingle();
  if (result.error) throw new Error(`Square entry lookup failed: ${result.error.message}`);
  if (!result.data || result.data.meta?.deleted_at || result.data.meta?.bookkeeping_deleted_at) {
    throw new Error("Square payment's job ledger is missing or deleted. Review is required.");
  }
  if (result.data.source !== "manual" && result.data.source !== "legacy_sheet") {
    throw new Error("Square entry payment references a quote-owned ledger. Review is required.");
  }
  const date = facts.paidAt ? new Date(facts.paidAt) : new Date();
  if (Number.isNaN(date.getTime())) throw new Error("Square payment date is invalid.");
  const paymentLabel = facts.paymentType === "deposit" ? "Deposit" : "Balance payment";
  const { error } = await supabase.from("crm_quote_bookkeeping_payments").insert({
    bookkeeping_entry_id: facts.bookkeepingEntryId, quote_id: null, job_id: result.data.job_id,
    payment_label: paymentLabel, payment_type: "credit_card", amount, paid_at: date.toISOString().slice(0, 10),
    source: "manual", external_source: "square", external_id: facts.squarePaymentId,
    meta: { square_payment_id: facts.squarePaymentId, square_order_id: facts.orderId,
      square_payment_type: facts.paymentType, createdBy: "square-webhook" },
  });
  if (error) {
    // The existing global external_source/external_id unique index also guards
    // concurrent webhook retries. Verify the winning record before accepting it.
    if (error.code === "23505" && await loadDuplicate()) return { ...base, status: "duplicate" };
    throw new Error(`Square entry payment could not be recorded: ${error.message}`);
  }
  return { ...base, status: "recorded", paymentLabel };
}
