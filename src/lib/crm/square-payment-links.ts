import type { SupabaseClient } from "@supabase/supabase-js";
import { brandIdentity } from "@/lib/brand-identity";
import { CrmAuthError } from "@/lib/crm/auth";
import { recordCrmActivity } from "@/lib/crm/backend";
import { ensureShareToken, loadPublicQuoteByToken } from "@/lib/crm/public-quote";
import { createSquarePaymentLink, dollarsToCents, isSquareConfigured } from "@/lib/finance/square";
import { buildSquareOrderPaymentEmail, sendEmail } from "@/lib/notify/email";
import { sendSms, toE164 } from "@/lib/notify/twilio";

type CrmSupabaseClient = SupabaseClient;
type CrmActor = { email: string; userId?: string };
export type SquareOrderPaymentType = "deposit" | "balance";

type LedgerPayment = { amount?: number | string | null; payment_label?: string | null };
type LedgerCredit = { amount?: number | string | null };

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function sumAmounts(rows: Array<{ amount?: number | string | null }>) {
  return roundMoney(rows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0));
}

function isDepositPayment(payment: LedgerPayment) {
  return String(payment.payment_label || "").toLowerCase().includes("deposit");
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
  payments?: LedgerPayment[];
  creditsIn?: LedgerCredit[];
  creditsOut?: LedgerCredit[];
}) {
  const payments = input.payments || [];
  const paidTotal = sumAmounts(payments);
  const depositPaid = sumAmounts(payments.filter(isDepositPayment));
  const creditIn = sumAmounts(input.creditsIn || []);
  const creditOut = sumAmounts(input.creditsOut || []);
  const outstanding = roundMoney(Math.max(input.total - paidTotal - creditIn + creditOut, 0));
  const deposit = roundMoney(Math.min(Math.max(input.depositRequired - depositPaid, 0), outstanding));
  const balance = roundMoney(Math.max(outstanding - deposit, 0));
  return { deposit, balance, outstanding };
}

export async function sendSquareOrderPaymentLink(
  supabase: CrmSupabaseClient,
  quoteId: string,
  paymentType: SquareOrderPaymentType,
  actor: CrmActor,
  alternateEmail?: string | null,
  delivery?: { channel: "email" | "text"; idempotencyKey?: string; phone?: string | null },
) {
  if (!isSquareConfigured()) throw new CrmAuthError(503, "Square card payments are not configured.");

  const { token } = await ensureShareToken(supabase, quoteId, actor);
  const publicQuote = await loadPublicQuoteByToken(supabase, token);
  if (!publicQuote) throw new CrmAuthError(404, "Quote was not found.");

  const [paymentsResult, creditsInResult, creditsOutResult] = await Promise.all([
    supabase.from("crm_quote_bookkeeping_payments").select("amount,payment_label").eq("quote_id", quoteId),
    supabase.from("crm_quote_bookkeeping_credits").select("amount").eq("to_quote_id", quoteId),
    supabase.from("crm_quote_bookkeeping_credits").select("amount").eq("from_quote_id", quoteId),
  ]);
  if (paymentsResult.error || creditsInResult.error || creditsOutResult.error) {
    throw new CrmAuthError(502, "The current payment balance could not be verified.");
  }

  const amounts = squareOrderPaymentAmounts({
    total: publicQuote.total,
    depositRequired: publicQuote.depositDue,
    payments: (paymentsResult.data || []) as LedgerPayment[],
    creditsIn: (creditsInResult.data || []) as LedgerCredit[],
    creditsOut: (creditsOutResult.data || []) as LedgerCredit[],
  });
  const amount = amounts[paymentType];
  if (!(amount > 0)) {
    throw new CrmAuthError(400, paymentType === "deposit" ? "No deposit is currently due." : "No remaining balance is currently due.");
  }

  const savedCustomerEmail = publicQuote.customerEmail?.trim() || null;
  const customerEmail = delivery?.channel === "text" ? (savedCustomerEmail || null) : squarePaymentRecipient(savedCustomerEmail, alternateEmail);
  const phone = delivery?.channel === "text" ? toE164(delivery.phone) : null;
  if (delivery?.channel === "text" && !phone) throw new CrmAuthError(400, "A valid customer phone number is required to text a payment link.");

  const label = paymentType === "deposit" ? "Deposit" : "Order balance";
  const link = await createSquarePaymentLink({
    amountCents: dollarsToCents(amount),
    title: `${label} — 805 Shutters${publicQuote.quoteNumber ? ` (${publicQuote.quoteNumber})` : ""}`,
    quoteId,
    paymentType,
    buyerEmail: customerEmail,
    idempotencyKey: delivery?.idempotencyKey,
  });
  const mail = buildSquareOrderPaymentEmail(publicQuote.customerName, link.url, {
    paymentType,
    amount,
    quoteNumber: publicQuote.quoteNumber,
    logoUrl: `${brandIdentity.website}/brand/805-shutters-logo-header.png`,
  });
  const email = delivery?.channel === "text" ? null : await sendEmail({ to: customerEmail as string, ...mail });
  const sms = delivery?.channel === "text" ? await sendSms({to:phone,body:`805 Shutters ${label.toLowerCase()} payment link (${new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(amount)}): ${link.url}`}) : null;

  await recordCrmActivity(supabase, actor, {
    entityType: "quote",
    entityId: quoteId,
    action: `square_${paymentType}_link.send`,
    metadata: {
      amount,
      recipient: delivery?.channel === "text" ? phone : customerEmail,
      channel: delivery?.channel || "email",
      idempotencyKey: delivery?.idempotencyKey || null,
      savedCustomerEmail,
      recipientOverridden: Boolean(alternateEmail?.trim() && customerEmail !== savedCustomerEmail),
      squarePaymentLinkId: link.id,
      squarePaymentLinkUrl: link.url,
      emailSent: email?.sent || false,
      emailError: email?.error || email?.skipped || null,
      smsSent: sms?.sent || false,
      smsError: sms?.error || sms?.skipped || null,
    },
  });

  if (delivery?.channel === "text" && !sms?.sent) {
    throw new CrmAuthError(502, sms?.uncertain ? "Text delivery could not be confirmed. Verify before retrying." : "The payment link text could not be sent.");
  }
  if (delivery?.channel === "email" && !email?.sent) {
    throw new CrmAuthError(502, "The payment link email could not be sent.");
  }

  return { paymentType, amount, recipient: delivery?.channel === "text" ? phone : customerEmail, url: link.url, email, sms };
}
