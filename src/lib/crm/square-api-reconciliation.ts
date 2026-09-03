import { reconcileSquareEntryPayment } from "@/lib/crm/square-entry-payments";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fetchSquareCustomerFacts,
  fetchSquareOrderFacts,
  fetchSquarePaymentFacts,
  listRecentCompletedSquarePayments,
  type SquareCustomerFacts,
  type SquarePaymentFacts,
} from "@/lib/finance/square";
import {
  reconcileResolvedSquarePayment,
  reconcileVerifiedSquareOrderPayment,
  type SquareReconcileResult,
} from "@/lib/crm/square-payments";
import { scheduleSquareContractReminder } from "@/lib/crm/square-contract-reminders";

type CrmSupabaseClient = SupabaseClient;

type QuoteRow = {
  id: string;
  job_id: string | null;
  quote_number: string | null;
  status: string | null;
  quote_total: number | string | null;
  deposit_required: number | string | null;
  customer_email: string | null;
  customer_phone: string | null;
  customer_address: string | null;
};

export const SQUARE_MATCH_QUOTE_COLUMNS =
  "id,job_id,quote_number,status,quote_total,deposit_required,customer_email,customer_phone,customer_address" as const;

type JobRow = {
  id: string;
  customer_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
};

type PaymentRow = {
  quote_id: string | null;
  payment_label: string | null;
  amount: number | string | null;
};

type CreditRow = {
  amount: number | string | null;
  from_quote_id: string | null;
  to_quote_id: string | null;
};

const ACTIVE_PAYMENT_STATUSES = new Set([
  "sold",
  "approved",
  "ordered",
  "received",
  "installed",
  "invoiced",
]);

function money(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
}

function identity(value: string | null | undefined) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function email(value: string | null | undefined) {
  return String(value || "").trim().toLowerCase();
}

function phone(value: string | null | undefined) {
  return String(value || "").replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
}

function quoteOutstanding(
  quote: QuoteRow,
  payments: PaymentRow[],
  credits: CreditRow[],
) {
  const paid = payments
    .filter((row) => row.quote_id === quote.id)
    .reduce((total, row) => total + money(row.amount), 0);
  const creditIn = credits
    .filter((row) => row.to_quote_id === quote.id)
    .reduce((total, row) => total + money(row.amount), 0);
  const creditOut = credits
    .filter((row) => row.from_quote_id === quote.id)
    .reduce((total, row) => total + money(row.amount), 0);
  return money(Math.max(money(quote.quote_total) - paid - creditIn + creditOut, 0));
}

export function matchSquareApiPayment(input: {
  payment: SquarePaymentFacts;
  customer: SquareCustomerFacts;
  quotes: QuoteRow[];
  jobs: JobRow[];
  payments: PaymentRow[];
  credits: CreditRow[];
}) {
  const jobs = new Map(input.jobs.map((job) => [job.id, job]));
  const amount = money(input.payment.amountCents / 100);
  const candidates: Array<{
    quoteId: string;
    jobId: string;
    paymentType: "deposit" | "balance";
    score: number;
    evidence: string[];
  }> = [];

  for (const quote of input.quotes) {
    if (!quote.job_id || !ACTIVE_PAYMENT_STATUSES.has(String(quote.status || "").toLowerCase())) continue;
    const outstanding = quoteOutstanding(quote, input.payments, input.credits);
    // Square can include a small customer-entered overpayment. It still clears
    // this stage, but never use amount proximity alone as identity evidence.
    if (!(outstanding > 0) || amount < outstanding || amount - outstanding > 5) continue;
    const job = jobs.get(quote.job_id);
    if (!job) continue;
    const evidence: string[] = [];
    let score = 0;
    const crmName = job.customer_name;
    const crmEmail = quote.customer_email || job.email;
    const crmPhone = quote.customer_phone || job.phone;
    const crmAddress = quote.customer_address || job.address;
    if (identity(input.customer.name) && identity(input.customer.name) === identity(crmName)) {
      evidence.push("exact_name");
      score += 2;
    }
    if (email(input.customer.email) && email(input.customer.email) === email(crmEmail)) {
      evidence.push("exact_email");
      score += 4;
    }
    if (phone(input.customer.phone) && phone(input.customer.phone) === phone(crmPhone)) {
      evidence.push("exact_phone");
      score += 4;
    }
    if (identity(input.customer.address) && identity(input.customer.address) === identity(crmAddress)) {
      evidence.push("exact_address");
      score += 5;
    }
    if (!score) continue;
    const quotePayments = input.payments.filter((row) => row.quote_id === quote.id);
    candidates.push({
      quoteId: quote.id,
      jobId: quote.job_id,
      paymentType: quotePayments.length ? "balance" : "deposit",
      score,
      evidence,
    });
  }

  if (!candidates.length) {
    return { candidate: null, reason: "No active CRM quote exactly matched the Square customer and remaining amount." };
  }
  const bestScore = Math.max(...candidates.map((candidate) => candidate.score));
  const strongest = candidates.filter((candidate) => candidate.score === bestScore);
  if (strongest.length !== 1) {
    return { candidate: null, reason: `${strongest.length} CRM quotes exactly matched the Square customer and remaining amount.` };
  }
  return { candidate: strongest[0] };
}

async function updateReceipt(
  supabase: CrmSupabaseClient,
  payment: SquarePaymentFacts,
  status: "processing" | "processed" | "needs_review" | "failed",
  detail: Record<string, unknown> = {},
) {
  const { error } = await supabase.from("crm_square_payment_receipts").upsert({
    square_payment_id: payment.squarePaymentId,
    latest_square_event_id: payment.eventId,
    status,
    attempts: status === "processing" ? 1 : undefined,
    amount: money(payment.amountCents / 100),
    currency: payment.currency,
    square_order_id: payment.orderId,
    square_customer_id: payment.customerId,
    paid_at: payment.paidAt,
    last_attempt_at: new Date().toISOString(),
    processed_at: status === "processed" ? new Date().toISOString() : null,
    error_message: status === "failed" ? String(detail.reason || "Square reconciliation failed.") : null,
    result: detail,
  }, { onConflict: "square_payment_id" });
  if (error) throw new Error(`Square webhook receipt could not be persisted: ${error.message}`);
}

export async function reconcileSquareApiPayment(
  supabase: CrmSupabaseClient,
  webhookFacts: SquarePaymentFacts,
): Promise<SquareReconcileResult> {
  await updateReceipt(supabase, webhookFacts, "processing");
  try {
    const payment = await fetchSquarePaymentFacts(webhookFacts.squarePaymentId);
    if (payment.status !== "COMPLETED" || payment.refundedAmountCents > 0) {
      const result: SquareReconcileResult = {
        status: "skipped",
        reason: "Square API does not report an unrefunded completed payment.",
        quoteId: null,
        squarePaymentId: payment.squarePaymentId,
        amount: money(payment.amountCents / 100),
      };
      await updateReceipt(supabase, payment, "needs_review", result);
      return result;
    }

    if (payment.orderId) {
      const order = await fetchSquareOrderFacts(payment.orderId);
      if (order.bookkeepingEntryId) {
        if (order.quoteId || !order.paymentType || payment.currency !== "USD" || order.currency !== "USD" || order.expectedAmountCents !== payment.amountCents) {
          throw new Error("Square entry order identity, currency, or amount could not be verified.");
        }
        const result = await reconcileSquareEntryPayment(supabase, { ...payment, quoteId: null, bookkeepingEntryId: order.bookkeepingEntryId, paymentType: order.paymentType });
        await updateReceipt(supabase, payment, "processed", result);
        return result;
      }
      if (order.quoteId && order.paymentType) {
        const result = await reconcileVerifiedSquareOrderPayment(supabase, { payment, order });
        if (result.quoteId && (result.status === "recorded" || result.status === "duplicate")) {
          result.contractReminder = await scheduleSquareContractReminder(supabase, {
            quoteId: result.quoteId,
            jobId: order.jobId,
            squarePaymentId: payment.squarePaymentId,
            paidAt: payment.paidAt,
          });
        }
        await updateReceipt(supabase, payment, "processed", result);
        return result;
      }
    }

    if (!payment.customerId) {
      const result: SquareReconcileResult = {
        status: "skipped",
        reason: "Completed Square payment has no exact order metadata or Square customer id.",
        quoteId: null,
        squarePaymentId: payment.squarePaymentId,
        amount: money(payment.amountCents / 100),
      };
      await updateReceipt(supabase, payment, "needs_review", result);
      return result;
    }

    const [customer, quotes, jobs, payments, credits] = await Promise.all([
      fetchSquareCustomerFacts(payment.customerId),
      supabase.from("crm_quotes").select(SQUARE_MATCH_QUOTE_COLUMNS).limit(2000),
      supabase.from("crm_jobs").select("id,customer_name,email,phone,address").limit(2000),
      supabase.from("crm_quote_bookkeeping_payments").select("quote_id,payment_label,amount").limit(5000),
      supabase.from("crm_quote_bookkeeping_credits").select("amount,from_quote_id,to_quote_id").limit(5000),
    ]);
    const loadError = quotes.error || jobs.error || payments.error || credits.error;
    if (loadError) throw new Error(`Square CRM matching data could not be loaded: ${loadError.message}`);
    const match = matchSquareApiPayment({
      payment,
      customer,
      quotes: (quotes.data || []) as QuoteRow[],
      jobs: (jobs.data || []) as JobRow[],
      payments: (payments.data || []) as PaymentRow[],
      credits: (credits.data || []) as CreditRow[],
    });
    if (!match.candidate) {
      const result: SquareReconcileResult = {
        status: "skipped",
        reason: match.reason,
        quoteId: null,
        squarePaymentId: payment.squarePaymentId,
        amount: money(payment.amountCents / 100),
      };
      await updateReceipt(supabase, payment, "needs_review", result);
      return result;
    }
    const result = await reconcileResolvedSquarePayment(supabase, {
      payment,
      quoteId: match.candidate.quoteId,
      jobId: match.candidate.jobId,
      paymentType: match.candidate.paymentType,
      audit: {
        square_customer_id: payment.customerId,
        square_match_evidence: match.candidate.evidence,
      },
    });
    if (result.quoteId && (result.status === "recorded" || result.status === "duplicate")) {
      result.contractReminder = await scheduleSquareContractReminder(supabase, {
        quoteId: result.quoteId,
        jobId: match.candidate.jobId,
        squarePaymentId: payment.squarePaymentId,
        paidAt: payment.paidAt,
      });
    }
    await updateReceipt(supabase, payment, "processed", result);
    return result;
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Unknown Square reconciliation error.";
    await updateReceipt(supabase, webhookFacts, "failed", { reason });
    throw error;
  }
}

export async function reconcileRecentSquarePayments(
  supabase: CrmSupabaseClient,
  lookbackDays = 7,
) {
  const begin = new Date(Date.now() - lookbackDays * 86_400_000).toISOString();
  const payments = await listRecentCompletedSquarePayments(begin);
  const results: SquareReconcileResult[] = [];
  for (const payment of payments) {
    results.push(await reconcileSquareApiPayment(supabase, payment));
  }
  return {
    checked: payments.length,
    recorded: results.filter((result) => result.status === "recorded").length,
    duplicates: results.filter((result) => result.status === "duplicate").length,
    review: results.filter((result) => result.status === "skipped").length,
    results,
  };
}
