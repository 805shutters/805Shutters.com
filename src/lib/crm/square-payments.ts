import { SupabaseClient } from "@supabase/supabase-js";
import { CrmBookkeepingPaymentType, CrmQuoteStatus } from "@/lib/crm/types";
import { SquareOrderFacts, SquarePaymentFacts } from "@/lib/finance/square";
import { maybeSendCustomerCloseoutForQuote } from "@/lib/crm/customer-closeout";

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

export type SquareReconcileOptions = {
  externalSource?: string;
  externalId?: string;
  createdBy?: string;
  metadata?: Record<string, unknown>;
};

export type VerifiedSquareReconcileInput = {
  payment: SquarePaymentFacts;
  order: SquareOrderFacts;
};

export function validateVerifiedSquarePayment(input: VerifiedSquareReconcileInput) {
  const { payment, order } = input;
  if (!payment.orderId || !order.quoteId || !order.jobId || !order.paymentType) {
    throw new Error("Square order metadata is missing an exact CRM quote, job, or payment intent.");
  }
  if (!order.expectedAmountCents || payment.amountCents !== order.expectedAmountCents) {
    throw new Error("Square payment amount does not exactly match the linked order.");
  }
  if (payment.amountCents <= 0 || payment.refundedAmountCents > 0) {
    throw new Error("Square payment is zero or includes a refund.");
  }
  if (payment.currency && payment.currency !== "USD") {
    throw new Error("Square payment currency is not USD.");
  }
  if (order.currency && order.currency !== "USD") {
    throw new Error("Square order currency is not USD.");
  }
  return {
    quoteId: order.quoteId,
    jobId: order.jobId,
    paymentType: order.paymentType,
    amount: roundMoney(payment.amountCents / 100),
    expectedAmount: roundMoney(order.expectedAmountCents / 100),
  };
}

export async function reconcileVerifiedSquareOrderPayment(
  supabase: CrmSupabaseClient,
  input: VerifiedSquareReconcileInput,
): Promise<SquareReconcileResult> {
  const verified = validateVerifiedSquarePayment(input);
  const paidAt = paymentDate(input.payment);
  const { data, error } = await supabase.rpc("reconcile_square_quote_payment", {
    p_quote_id: verified.quoteId,
    p_job_id: verified.jobId,
    p_square_payment_id: input.payment.squarePaymentId,
    p_square_order_id: input.payment.orderId,
    p_payment_intent: verified.paymentType,
    p_amount: verified.amount,
    p_expected_amount: verified.expectedAmount,
    p_paid_at: paidAt,
    p_square_event_id: input.payment.eventId,
    p_receipt_url: input.payment.receiptUrl,
    p_audit: {
      payment_currency: input.payment.currency,
      order_currency: input.order.currency,
      expected_amount_cents: input.order.expectedAmountCents,
    },
  });
  if (error) throw new Error(`Square payment could not be reconciled atomically: ${error.message}`);
  const result = data as {
    status?: "recorded" | "duplicate";
    markedPaid?: boolean;
  } | null;
  if (result?.status !== "recorded" && result?.status !== "duplicate") {
    throw new Error("Square reconciliation returned an invalid result.");
  }
  return {
    status: result.status,
    quoteId: verified.quoteId,
    squarePaymentId: input.payment.squarePaymentId,
    amount: verified.amount,
    paymentLabel: verified.paymentType === "deposit" ? "Deposit" : "Balance payment",
    markedPaid: Boolean(result.markedPaid),
  };
}

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

function isDuplicateSquarePayment(payments: PaymentRow[], squarePaymentId: string, externalSource = "square", externalId = squarePaymentId) {
  return payments.some((payment) => {
    if (payment.external_source === externalSource && payment.external_id === externalId) return true;
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

  return true;
}

export async function reconcileSquareQuotePayment(
  supabase: CrmSupabaseClient,
  facts: SquarePaymentFacts,
  options: SquareReconcileOptions = {},
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
  const externalSource = options.externalSource || "square";
  const externalId = options.externalId || facts.squarePaymentId;
  if (isDuplicateSquarePayment(payments, facts.squarePaymentId, externalSource, externalId)) {
    await maybeSendCustomerCloseoutForQuote(
      supabase,
      quote.id,
      { email: options.createdBy || "square-webhook" },
      `${options.createdBy || "square-webhook"}-retry`,
      String(options.metadata?.square_customer_email || "") || null
    );
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
    external_source: externalSource,
    external_id: externalId,
    meta: {
      square_payment_id: facts.squarePaymentId,
      square_order_id: facts.orderId,
      square_payment_type: facts.paymentType,
      createdBy: options.createdBy || "square-webhook",
      ...options.metadata,
    },
  };

  const { error } = await supabase.from("crm_quote_bookkeeping_payments").insert(record);
  if (error) throw new Error(`Square payment could not be recorded: ${error.message}`);

  const markedPaid = await markQuotePaidIfCovered(supabase, quote, payments, amount);
  if (markedPaid) {
    await maybeSendCustomerCloseoutForQuote(
      supabase,
      quote.id,
      { email: options.createdBy || "square-webhook" },
      options.createdBy || "square-webhook",
      String(options.metadata?.square_customer_email || "") || null
    );
  }
  return {
    status: "recorded",
    quoteId: facts.quoteId,
    squarePaymentId: facts.squarePaymentId,
    amount,
    paymentLabel,
    markedPaid,
  };
}
