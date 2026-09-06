import { collectCrmPages } from "@/lib/crm/pagination";
import type { SupabaseClient } from "@supabase/supabase-js";
import { brandIdentity } from "@/lib/brand-identity";
import { CrmAuthError } from "@/lib/crm/auth";
import { recordCrmActivity } from "@/lib/crm/backend";
import { ensureShareToken, loadPublicQuoteByToken } from "@/lib/crm/public-quote";
import { createSquarePaymentLink, dollarsToCents, isSquareConfigured } from "@/lib/finance/square";
import { buildSquareOrderPaymentEmail, sendEmail } from "@/lib/notify/email";
import { sendSms, toE164 } from "@/lib/notify/twilio";
import {
  quotePaymentState,
  type QuoteLedgerCredit,
  type QuoteLedgerPayment,
} from "@/lib/crm/quote-payment-state";

type CrmSupabaseClient = SupabaseClient;
type CrmActor = { email: string; userId?: string };
export type SquareOrderPaymentType = "deposit" | "balance";
export type SquarePaymentConfirmation = { expectedAmount: number; expectedRecipient: string; customAmount?: number };

/** A partial request keeps its original deposit/balance ledger classification. */
export function squarePaymentRequestAmount(amountDue: number, customAmount?: number) {
  if (customAmount === undefined) return amountDue;
  if (typeof customAmount !== "number" || !Number.isFinite(customAmount) || customAmount <= 0 ||
      !Number.isSafeInteger(Math.round(customAmount * 100)) ||
      Math.abs(customAmount * 100 - Math.round(customAmount * 100)) > 0.000001) {
    throw new CrmAuthError(400, "Enter a positive payment amount with no more than two decimal places.");
  }
  if (dollarsToCents(customAmount) > dollarsToCents(amountDue)) {
    throw new CrmAuthError(409, "The custom amount exceeds the current amount due. Refresh the job and review the payment request.");
  }
  return dollarsToCents(customAmount) / 100;
}

export function verifySquarePaymentConfirmation(
  amount: number,
  recipient: string,
  confirmation?: SquarePaymentConfirmation,
) {
  if (!confirmation) return;
  if (!Number.isFinite(confirmation.expectedAmount) || typeof confirmation.expectedRecipient !== "string") {
    throw new CrmAuthError(400, "Confirm the payment amount and recipient before sending.");
  }
  if (dollarsToCents(amount) !== dollarsToCents(confirmation.expectedAmount) ||
      recipient.trim().toLowerCase() !== confirmation.expectedRecipient.trim().toLowerCase()) {
    throw new CrmAuthError(409, "The amount or customer email has changed. Refresh the job and review the payment request again.");
  }
}

export type SquarePaymentDeliveryState = "accepted" | "failed" | "unknown";

export class SquarePaymentDeliveryError extends CrmAuthError {
  constructor(
    message: string,
    public readonly deliveryState: Exclude<SquarePaymentDeliveryState, "accepted">,
    public readonly details: {
      paymentType: SquareOrderPaymentType;
      amount: number;
      recipient: string;
      url: string;
      linkId: string;
      providerMessageId?: string;
      providerStatus?: string;
    },
  ) {
    super(502, message);
  }
}

export function squarePaymentRecipient(savedEmail: string | null | undefined, alternateEmail?: string | null) {
  const recipient = String(alternateEmail || "").trim() || String(savedEmail || "").trim();
  if (!recipient) throw new CrmAuthError(400, "Add a customer email or enter a different email before sending a Square payment link.");
  if (recipient.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
    throw new CrmAuthError(400, "Enter a valid email address before sending the Square payment link.");
  }
  return recipient;
}

export function squareOrderPaymentAmounts(input: {
  total: number;
  depositRequired: number;
  payments?: QuoteLedgerPayment[];
  creditsIn?: QuoteLedgerCredit[];
  creditsOut?: QuoteLedgerCredit[];
}) {
  const state = quotePaymentState(input);
  const deposit = state.dueType === "deposit" ? state.amountDue : 0;
  const balance = state.dueType === "balance" ? state.amountDue : Math.max(state.outstanding - deposit, 0);
  const { outstanding } = state;
  return { deposit, balance, outstanding };
}

export async function sendSquareOrderPaymentLink(
  supabase: CrmSupabaseClient,
  quoteId: string,
  paymentType: SquareOrderPaymentType,
  actor: CrmActor,
  alternateEmail?: string | null,
  delivery?: { channel: "email" | "text"; idempotencyKey?: string; phone?: string | null },
  confirmation?: SquarePaymentConfirmation,
) {
  if (!isSquareConfigured()) throw new CrmAuthError(503, "Square card payments are not configured.");

  const { token } = await ensureShareToken(supabase, quoteId, actor);
  const publicQuote = await loadPublicQuoteByToken(supabase, token);
  if (!publicQuote) throw new CrmAuthError(404, "Quote was not found.");

  const [paymentsResult, creditsInResult, creditsOutResult] = await Promise.all([
    collectCrmPages<QuoteLedgerPayment>((from, to) => supabase.from("crm_quote_bookkeeping_payments")
      .select("amount,payment_label").eq("quote_id", quoteId).order("id", { ascending: true }).range(from, to)),
    collectCrmPages<QuoteLedgerCredit>((from, to) => supabase.from("crm_quote_bookkeeping_credits")
      .select("amount").eq("to_quote_id", quoteId).order("id", { ascending: true }).range(from, to)),
    collectCrmPages<QuoteLedgerCredit>((from, to) => supabase.from("crm_quote_bookkeeping_credits")
      .select("amount").eq("from_quote_id", quoteId).order("id", { ascending: true }).range(from, to)),
  ]);
  if (paymentsResult.error || creditsInResult.error || creditsOutResult.error) {
    throw new CrmAuthError(502, "The current payment balance could not be verified.");
  }

  const amounts = squareOrderPaymentAmounts({
    total: publicQuote.total,
    depositRequired: publicQuote.depositDue,
    payments: (paymentsResult.data || []) as QuoteLedgerPayment[],
    creditsIn: (creditsInResult.data || []) as QuoteLedgerCredit[],
    creditsOut: (creditsOutResult.data || []) as QuoteLedgerCredit[],
  });
  const amount = squarePaymentRequestAmount(amounts[paymentType], confirmation?.customAmount);
  if (!(amount > 0)) {
    throw new CrmAuthError(400, paymentType === "deposit" ? "No deposit is currently due." : "No remaining balance is currently due.");
  }

  const savedCustomerEmail = publicQuote.customerEmail?.trim() || null;
  const customerEmail = delivery?.channel === "text" ? (savedCustomerEmail || null) : squarePaymentRecipient(savedCustomerEmail, alternateEmail);
  const phone = delivery?.channel === "text" ? toE164(delivery.phone) : null;
  if (delivery?.channel === "text" && !phone) throw new CrmAuthError(400, "A valid customer phone number is required to text a payment link.");

  if (confirmation) verifySquarePaymentConfirmation(amount, customerEmail || "", confirmation);

  const label = confirmation?.customAmount !== undefined ? "Order payment" : paymentType === "deposit" ? "Deposit" : "Order balance";
  const { data: quoteIdentity, error: quoteIdentityError } = await supabase
    .from("crm_quotes")
    .select("id,job_id")
    .eq("id", quoteId)
    .maybeSingle();
  if (quoteIdentityError || !quoteIdentity?.job_id) {
    throw new CrmAuthError(502, "The exact CRM job for this payment link could not be verified.");
  }
  const link = await createSquarePaymentLink({
    amountCents: dollarsToCents(amount),
    title: `${label} — 805 Shutters${publicQuote.quoteNumber ? ` (${publicQuote.quoteNumber})` : ""}`,
    quoteId,
    jobId: quoteIdentity.job_id,
    paymentType,
    buyerEmail: customerEmail,
    idempotencyKey: delivery?.idempotencyKey,
  });
  const mail = buildSquareOrderPaymentEmail(publicQuote.customerName, link.url, {
    paymentType,
    amount,
    quoteNumber: publicQuote.quoteNumber,
    customAmount: confirmation?.customAmount !== undefined,
    logoUrl: `${brandIdentity.website}/brand/805-shutters-logo-header.png`,
  });
  const email = delivery?.channel === "text" ? null : await sendEmail({
    to: customerEmail as string,
    from: "805 Shutters <805@805shutters.com>",
    ...mail,
    idempotencyKey: delivery?.idempotencyKey ? `square-payment-link-${delivery.idempotencyKey}` : undefined,
  });
  const sms = delivery?.channel === "text" ? await sendSms({to:phone,body:`805 Shutters ${label.toLowerCase()} payment link (${new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(amount)}): ${link.url}`}) : null;

  let auditRecorded = false;
  try {
  const audit = await recordCrmActivity(supabase, actor, {
    entityType: "quote",
    entityId: quoteId,
    action: `square_${paymentType}_link.send`,
    metadata: {
      amount,
      customAmount: confirmation?.customAmount !== undefined,
      recipient: delivery?.channel === "text" ? phone : customerEmail,
      channel: delivery?.channel || "email",
      idempotencyKey: delivery?.idempotencyKey || null,
      savedCustomerEmail,
      recipientOverridden: Boolean(alternateEmail?.trim() && customerEmail !== savedCustomerEmail),
      squarePaymentLinkId: link.id,
      squarePaymentLinkUrl: link.url,
      emailSent: email?.sent || false,
      emailProviderMessageId: email?.id || null,
      emailDeliveryState: email?.sent ? "accepted" : email?.uncertain ? "unknown" : "failed",
      emailError: email?.error || email?.skipped || null,
      smsSent: sms?.sent || false,
      smsProviderMessageId: sms?.sid || null,
      smsProviderStatus: sms?.providerStatus || null,
      smsDeliveryState: sms?.sent ? "accepted" : sms?.uncertain ? "unknown" : "failed",
      smsError: sms?.error || sms?.skipped || null,
    },
  });

  auditRecorded = audit.recorded;
  } catch { /* Provider acceptance remains valid when the separate audit fails. */ }

  if (delivery?.channel === "text" && !sms?.sent) {
    throw new SquarePaymentDeliveryError(
      sms?.uncertain ? "Text provider acceptance is unknown. Review the audit before retrying." : `The text provider rejected the payment link${sms?.error || sms?.skipped ? `: ${sms.error || sms.skipped}` : "."}`,
      sms?.uncertain ? "unknown" : "failed",
      {paymentType,amount,recipient:phone as string,url:link.url,linkId:link.id,providerMessageId:sms?.sid,providerStatus:sms?.providerStatus},
    );
  }
  if (delivery?.channel === "email" && !email?.sent) {
    throw new SquarePaymentDeliveryError(
      email?.uncertain ? "Email provider acceptance is unknown. Review the audit before retrying." : `The email provider rejected the payment link${email?.error || email?.skipped ? `: ${email.error || email.skipped}` : "."}`,
      email?.uncertain ? "unknown" : "failed",
      {paymentType,amount,recipient:customerEmail as string,url:link.url,linkId:link.id,providerMessageId:email?.id},
    );
  }

  return {
    paymentType,
    amount,
    recipient: delivery?.channel === "text" ? phone : customerEmail,
    url: link.url,
    linkId: link.id,
    auditRecorded,
    warning: auditRecorded ? null : "Payment request processed, but the activity log could not be recorded. Review delivery status before retrying.",
    deliveryState: "accepted" as const,
    providerMessageId: delivery?.channel === "text" ? sms?.sid : email?.id,
    providerStatus: delivery?.channel === "text" ? sms?.providerStatus : "accepted",
    email,
    sms,
  };
}
