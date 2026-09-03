import type { SupabaseClient } from "@supabase/supabase-js";
import { CrmAuthError } from "@/lib/crm/auth";
import { recordCrmActivity } from "@/lib/crm/backend";
import { collectCrmPages } from "@/lib/crm/pagination";
import { squareOrderPaymentAmounts, verifySquarePaymentConfirmation, type SquareOrderPaymentType, type SquarePaymentConfirmation } from "@/lib/crm/square-payment-links";
import { createSquarePaymentLink, dollarsToCents, isSquareConfigured } from "@/lib/finance/square";
import { buildSquareOrderPaymentEmail, sendEmail } from "@/lib/notify/email";
import { brandIdentity } from "@/lib/brand-identity";

type Entry = {
  id: string; source: string; customer_name: string; total_amount: number | string;
  job_id: string | null; quote_id: string | null; meta: Record<string, unknown> | null;
};
type LinkedQuote = { id: string; job_id: string | null; customer_email: string | null; meta?: Record<string, unknown> | null };
type LinkedJob = { id: string; email: string | null; meta?: Record<string, unknown> | null };
type LedgerItem = { amount?: number | string | null; payment_label?: string | null };

function optionalText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function sendSquareEntryPaymentLink(
  supabase: SupabaseClient,
  entryId: string,
  paymentType: SquareOrderPaymentType,
  actor: { email: string; userId?: string },
  confirmation: SquarePaymentConfirmation,
) {
  if (!confirmation || !Number.isFinite(confirmation.expectedAmount) || typeof confirmation.expectedRecipient !== "string") {
    throw new CrmAuthError(400, "Confirm the payment amount and recipient before sending.");
  }
  if (paymentType !== "deposit" && paymentType !== "balance") throw new CrmAuthError(400, "Choose either a deposit or balance payment link.");
  if (!isSquareConfigured()) throw new CrmAuthError(503, "Square card payments are not configured.");
  const result = await supabase.from("crm_quote_bookkeeping_entries")
    .select("id,source,customer_name,total_amount,job_id,quote_id,meta").eq("id", entryId).maybeSingle();
  if (result.error) throw new CrmAuthError(502, "The job ledger could not be verified.");
  const entry = result.data as Entry | null;
  if (!entry || entry.meta?.bookkeeping_deleted_at || entry.meta?.deleted_at) throw new CrmAuthError(404, "Job ledger was not found.");
  if (entry.source !== "manual" && entry.source !== "legacy_sheet") {
    throw new CrmAuthError(409, "Use this job's CRM quote to request its payment.");
  }
  let quote: LinkedQuote | null = null;
  if (entry.quote_id) {
    const result = await supabase.from("crm_quotes").select("id,job_id,customer_email,meta").eq("id", entry.quote_id).maybeSingle();
    if (result.error || !result.data) throw new CrmAuthError(409, "The exact linked quote could not be verified.");
    quote = result.data as LinkedQuote;
    if (quote.meta?.deleted_at || quote.meta?.bookkeeping_deleted_at) throw new CrmAuthError(409, "The linked quote was deleted. Review the ledger links before sending.");
    if (entry.job_id && quote.job_id && entry.job_id !== quote.job_id) {
      throw new CrmAuthError(409, "The job and quote links disagree. Correct the ledger links before sending.");
    }
  }
  let job: LinkedJob | null = null;
  const jobId = entry.job_id || quote?.job_id;
  if (jobId) {
    const result = await supabase.from("crm_jobs").select("id,email,meta").eq("id", jobId).maybeSingle();
    if (result.error || !result.data) throw new CrmAuthError(409, "The exact linked job could not be verified.");
    job = result.data as LinkedJob;
    if (job.meta?.deleted_at || job.meta?.bookkeeping_deleted_at) throw new CrmAuthError(409, "The linked job was deleted. Review the ledger links before sending.");
  }
  const recipient = optionalText(entry.meta?.customer_email) || optionalText(quote?.customer_email) || optionalText(job?.email);
  if (!recipient || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
    throw new CrmAuthError(400, "Add a valid customer email to this exact job before sending a Square payment link.");
  }
  const loadLedger = (table: string, key: string) => collectCrmPages<LedgerItem>(async (from, to) => {
    const result = await supabase.from(table).select(table.endsWith("payments") ? "amount,payment_label" : "amount")
      .eq(key, entryId).order("id").range(from, to);
    return { data: result.data as LedgerItem[] | null, error: result.error };
  });
  const [payments, creditsIn, creditsOut] = await Promise.all([
    loadLedger("crm_quote_bookkeeping_payments", "bookkeeping_entry_id"),
    loadLedger("crm_quote_bookkeeping_credits", "to_bookkeeping_entry_id"),
    loadLedger("crm_quote_bookkeeping_credits", "from_bookkeeping_entry_id"),
  ]);
  if (payments.error || creditsIn.error || creditsOut.error) throw new CrmAuthError(502, "The current payment balance could not be verified.");
  const total = Number(entry.total_amount);
  const target = entry.meta?.deposit_required;
  const depositRequired = target !== null && target !== undefined && target !== "" && Number.isFinite(Number(target))
    ? Math.max(Number(target), 0) : total * 0.5;
  if (!Number.isFinite(total) || total < 0) throw new CrmAuthError(409, "Correct this job's total before requesting a payment.");
  const amount = squareOrderPaymentAmounts({ total, depositRequired,
    payments: payments.data || [], creditsIn: creditsIn.data || [], creditsOut: creditsOut.data || [] })[paymentType];
  if (!(amount > 0)) throw new CrmAuthError(400, paymentType === "deposit" ? "No deposit is currently due." : "No remaining balance is currently due.");
  verifySquarePaymentConfirmation(amount, recipient, confirmation);
  const link = await createSquarePaymentLink({
    bookkeepingEntryId: entry.id, amountCents: dollarsToCents(amount), paymentType,
    title: `${paymentType === "deposit" ? "Deposit" : "Order balance"} — 805 Shutters`, buyerEmail: recipient,
  });
  const mail = buildSquareOrderPaymentEmail(entry.customer_name, link.url, {
    paymentType, amount, logoUrl: `${brandIdentity.website}/brand/805-shutters-logo-header.png`,
  });
  const email = await sendEmail({ to: recipient, from: "805 Shutters <805@805shutters.com>", ...mail });
  let auditRecorded = false;
  try {
    const audit = await recordCrmActivity(supabase, actor, {
      entityType: "bookkeeping_entry", entityId: entry.id, action: `square_${paymentType}_link.send`,
      metadata: { amount, recipient, squarePaymentLinkId: link.id, squarePaymentLinkUrl: link.url,
        emailSent: email.sent, emailError: email.error || email.skipped || null },
    });
    auditRecorded = audit.recorded;
  } catch {
    // Provider success is not rolled back by a logging failure. Returning that
    // distinction avoids encouraging another send of an already delivered link.
  }
  return { paymentType, amount, recipient, url: link.url, email, auditRecorded,
    warning: auditRecorded ? null : email.sent
      ? "Payment email sent, but the activity log could not be recorded. Do not resend just to repair the log."
      : "Payment link created, but the failed email attempt could not be added to the activity log." };
}
