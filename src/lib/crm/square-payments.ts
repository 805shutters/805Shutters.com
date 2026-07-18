import { SupabaseClient } from "@supabase/supabase-js";
import { CrmBookkeepingPaymentType, CrmJobStatus, CrmQuoteStatus } from "@/lib/crm/types";
import { SquarePaymentFacts } from "@/lib/finance/square";

type CrmSupabaseClient = SupabaseClient;

type ExistingPayment = {
  payment_label?: string | null;
  amount?: number | string | null;
};

type QuoteRow = {
  id: string;
  job_id: string | null;
  status: CrmQuoteStatus;
  quote_total: number | string | null;
};

type PaymentRow = ExistingPayment & {
  id: string;
  meta?: Record<string, unknown> | null;
  external_source?: string | null;
  external_id?: string | null;
};

export type SquareReconcileResult = {
  status: "recorded" | "duplicate" | "skipped";
  reason?: string;
  quoteId: string | null;
  squarePaymentId: string;
  amount: number;
  paymentLabel?: "Deposit" | "Balance payment";
  markedPaid?: boolean;
};

function roundMoney(value: unknown) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return 0;
  return Math.round(amount * 100) / 100;
}

function isDepositPayment(payment: ExistingPayment) {
  return String(payment.payment_label || "").toLowerCase().includes("deposit");
}

export function summarizeExistingSquareLedger(payments: ExistingPayment[]) {
  const depositPaid = roundMoney(
    payments.filter(isDepositPayment).reduce((sum, payment) => sum + roundMoney(payment.amount), 0)
  );
  const balancePaid = roundMoney(
    payments.filter((payment) => !isDepositPayment(payment)).reduce((sum, payment) => sum + roundMoney(payment.amount), 0)
  );
  return {
    depositPaid,
    balancePaid,
    paidTotal: roundMoney(depositPaid + balancePaid),
  };
}

export function resolveSquarePaymentLabel(
  payments: ExistingPayment[],
  paymentType?: string | null,
): "Deposit" | "Balance payment" {
  if (paymentType === "deposit") return "Deposit";
  if (paymentType === "balance") return "Balance payment";
  const summary = summarizeExistingSquareLedger(payments);
  return summary.depositPaid <= 0 && summary.balancePaid <= 0 ? "Deposit" : "Balance payment";
}

export function squarePaymentWillCloseQuote(input: {
  quoteTotal: number;
  existingPayments: ExistingPayment[];
  incomingAmount: number;
}) {
  const current = summarizeExistingSquareLedger(input.existingPayments);
  const total = roundMoney(input.quoteTotal);
  const paidAfterPayment = roundMoney(current.paidTotal + input.incomingAmount);
  return total > 0 && paidAfterPayment >= roundMoney(total - 0.005);
}

function paymentDate(facts: Pick<SquarePaymentFacts, "paidAt">) {
  const parsed = facts.paidAt ? new Date(facts.paidAt) : null;
  if (parsed && !Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return new Date().toISOString().slice(0, 10);
}

async function loadQuote(supabase: CrmSupabaseClient, quoteId: string) {
  const { data, error } = await supabase
    .from("crm_quotes")
    .select("id,job_id,status,quote_total")
    .eq("id", quoteId)
    .maybeSingle();
  if (error) throw new Error(`Square payment quote lookup failed: ${error.message}`);
  return data as QuoteRow | null;
}

async function loadQuotePayments(supabase: CrmSupabaseClient, quoteId: string) {
  const { data, error } = await supabase
    .from("crm_quote_bookkeeping_payments")
    .select("id,payment_label,amount,meta,external_source,external_id")
    .eq("quote_id", quoteId);
  if (error) throw new Error(`Square payment ledger lookup failed: ${error.message}`);
  return (data || []) as PaymentRow[];
}

function isDuplicateSquarePayment(payments: PaymentRow[], squarePaymentId: string) {
  return payments.some((payment) => {
    if (payment.external_source === "square" && payment.external_id === squarePaymentId) return true;
    return payment.meta?.square_payment_id === squarePaymentId;
  });
}

async function markQuotePaidIfCovered(
  supabase: CrmSupabaseClient,
  quote: QuoteRow,
  payments: ExistingPayment[],
  amount: number,
) {
  if (!squarePaymentWillCloseQuote({ quoteTotal: roundMoney(quote.quote_total), existingPayments: payments, incomingAmount: amount })) {
    return false;
  }

  if (quote.status !== "paid" && quote.status !== "archived" && quote.status !== "lost") {
    const { error } = await supabase.from("crm_quotes").update({ status: "paid" }).eq("id", quote.id);
    if (error) throw new Error(`Square payment recorded, but quote could not be marked paid: ${error.message}`);
  }

  if (quote.job_id) {
    const { data: job, error: readError } = await supabase
      .from("crm_jobs")
      .select("status")
      .eq("id", quote.job_id)
      .maybeSingle();
    if (readError) throw new Error(`Square payment recorded, but job status could not be checked: ${readError.message}`);
    const status = (job as { status?: CrmJobStatus } | null)?.status;
    if (status && status !== "closed" && status !== "lost") {
      const { error } = await supabase.from("crm_jobs").update({ status: "closed" }).eq("id", quote.job_id);
      if (error) throw new Error(`Square payment recorded, but job could not be marked closed: ${error.message}`);
    }
  }

  return true;
}

export async function reconcileSquareQuotePayment(
  supabase: CrmSupabaseClient,
  facts: SquarePaymentFacts,
): Promise<SquareReconcileResult> {
  const amount = roundMoney(facts.amountCents / 100);
  if (!facts.quoteId) {
    return {
      status: "skipped",
      reason: "Square payment did not include a CRM quote id.",
      quoteId: null,
      squarePaymentId: facts.squarePaymentId,
      amount,
    };
  }
  if (!(amount > 0)) {
    return {
      status: "skipped",
      reason: "Square payment amount was zero.",
      quoteId: facts.quoteId,
      squarePaymentId: facts.squarePaymentId,
      amount,
    };
  }

  const quote = await loadQuote(supabase, facts.quoteId);
  if (!quote) {
    return {
      status: "skipped",
      reason: "CRM quote was not found.",
      quoteId: facts.quoteId,
      squarePaymentId: facts.squarePaymentId,
      amount,
    };
  }

  const payments = await loadQuotePayments(supabase, facts.quoteId);
  if (isDuplicateSquarePayment(payments, facts.squarePaymentId)) {
    return {
      status: "duplicate",
      quoteId: facts.quoteId,
      squarePaymentId: facts.squarePaymentId,
      amount,
    };
  }

  const paymentLabel = resolveSquarePaymentLabel(payments, facts.paymentType);
  const paymentType: CrmBookkeepingPaymentType = "credit_card";
  const record = {
    quote_id: facts.quoteId,
    job_id: quote.job_id,
    payment_label: paymentLabel,
    payment_type: paymentType,
    amount,
    paid_at: paymentDate(facts),
    source: "crm_quote",
    external_source: "square",
    external_id: facts.squarePaymentId,
    meta: {
      square_payment_id: facts.squarePaymentId,
      square_order_id: facts.orderId,
      square_payment_type: facts.paymentType,
      createdBy: "square-webhook",
    },
  };

  const { error } = await supabase.from("crm_quote_bookkeeping_payments").insert(record);
  if (error) throw new Error(`Square payment could not be recorded: ${error.message}`);

  const markedPaid = await markQuotePaidIfCovered(supabase, quote, payments, amount);
  return {
    status: "recorded",
    quoteId: facts.quoteId,
    squarePaymentId: facts.squarePaymentId,
    amount,
    paymentLabel,
    markedPaid,
  };
}
