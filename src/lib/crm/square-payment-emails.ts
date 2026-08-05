import type { SupabaseClient } from "@supabase/supabase-js";
import { CrmAuthError } from "@/lib/crm/auth";
import { getBrokeredGmailAccessToken } from "@/lib/crm/installation-invoices";
import { reconcileSquareQuotePayment } from "@/lib/crm/square-payments";
import { sendTelegramMessage } from "@/lib/notify/telegram";

type CrmSupabaseClient = SupabaseClient;

type GmailMessagePart = {
  mimeType?: string;
  body?: { data?: string };
  headers?: Array<{ name?: string; value?: string }>;
  parts?: GmailMessagePart[];
};

type GmailMessage = {
  id: string;
  threadId?: string;
  internalDate?: string;
  payload?: GmailMessagePart;
};

type GmailLabel = {
  id?: string;
  name?: string;
};

type PaymentRow = {
  id?: string | null;
  quote_id?: string | null;
  job_id?: string | null;
  payment_label?: string | null;
  amount?: number | string | null;
  paid_at?: string | null;
  external_source?: string | null;
  external_id?: string | null;
  meta?: Record<string, unknown> | null;
};

type CreditRow = {
  amount?: number | string | null;
  from_quote_id?: string | null;
  to_quote_id?: string | null;
};

type PaymentLinkEventRow = {
  entity_id?: string | null;
  action?: string | null;
  metadata?: Record<string, unknown> | null;
};

type QuoteRow = {
  id: string;
  job_id: string | null;
  quote_number?: string | null;
  status?: string | null;
  quote_total?: number | string | null;
  deposit_required?: number | string | null;
  customer_name?: string | null;
  customer_email?: string | null;
};

type JobRow = {
  id: string;
  customer_name?: string | null;
  email?: string | null;
};

export type SquarePaymentEmailReceipt = {
  gmailMessageId: string;
  gmailThreadId: string | null;
  amount: number;
  customerName: string;
  customerEmail: string | null;
  paidDate: string;
  cardLastFour: string | null;
  subject: string;
};

export type SquarePaymentEmailCandidate = {
  quoteId: string;
  jobId: string | null;
  quoteNumber: string | null;
  customerName: string;
  customerEmail: string | null;
  paymentType: "deposit" | "balance";
  amount: number;
  paidDate: string;
};

export type SquarePaymentEmailRunResult = {
  mailbox: string;
  query: string;
  checked: number;
  recorded: number;
  duplicates: number;
  review: number;
  ignored: number;
  errors: number;
  labeled: number;
  telegramSent: number;
  telegramErrors: number;
  results: Array<{
    gmailMessageId: string;
    customerName?: string;
    amount?: number;
    status: "recorded" | "duplicate" | "review" | "ignored" | "error";
    quoteId?: string;
    paymentType?: "deposit" | "balance";
    reason?: string;
  }>;
};

export type SquarePaymentEmailProcessingOutcome =
  | "recorded"
  | "unmatched"
  | "ambiguous"
  | "duplicate"
  | "malformed"
  | "failed"
  | "partial";

export function shouldArchiveSquarePaymentEmail(outcome: SquarePaymentEmailProcessingOutcome) {
  return outcome === "recorded";
}

const SQUARE_SENDER = "noreply@messaging.squareup.com";
const DEFAULT_MAILBOX = "805shutters@gmail.com";
const PROCESSED_LABEL = "Processed";
const ACTIVE_PAYMENT_STATUSES = new Set(["sold", "approved", "ordered", "received", "installed", "invoiced"]);

function roundMoney(value: unknown) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0;
}

function moneyMatches(left: unknown, right: unknown) {
  return Math.abs(roundMoney(left) - roundMoney(right)) < 0.01;
}

function formatPaymentMoney(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(roundMoney(value));
}

export function squarePaymentTelegramText(input: {
  customerName: string;
  quoteNumber: string | null;
  paymentType: "deposit" | "balance";
  amount: number;
  paidDate: string;
}) {
  const paymentLabel = input.paymentType === "deposit" ? "Deposit" : "Balance";
  return [
    `✅ Square ${paymentLabel.toLowerCase()} processed`,
    `Customer: ${input.customerName}`,
    `Quote: ${input.quoteNumber || "Not provided"}`,
    `Payment: ${paymentLabel}`,
    `Amount recorded: ${formatPaymentMoney(input.amount)}`,
    `Paid date: ${input.paidDate}`
  ].join("\n");
}

function normalizedIdentity(value: string | null | undefined) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizedEmail(value: string | null | undefined) {
  return String(value || "").trim().toLowerCase();
}

function headerValue(message: GmailMessage, name: string) {
  const target = name.toLowerCase();
  return message.payload?.headers?.find((header) => String(header.name || "").toLowerCase() === target)?.value?.trim() || "";
}

function decodeBase64Url(data: string) {
  const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, "base64").toString("utf8");
}

function collectParts(part: GmailMessagePart | undefined, output: GmailMessagePart[] = []) {
  if (!part) return output;
  output.push(part);
  for (const child of part.parts || []) collectParts(child, output);
  return output;
}

function htmlToText(value: string) {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|td|th|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function messageText(message: GmailMessage) {
  const parts = collectParts(message.payload);
  const plain = parts.find((part) => part.mimeType === "text/plain" && part.body?.data);
  if (plain?.body?.data) return decodeBase64Url(plain.body.data);
  const html = parts.find((part) => part.mimeType === "text/html" && part.body?.data);
  if (html?.body?.data) return htmlToText(decodeBase64Url(html.body.data));
  if (message.payload?.body?.data) return decodeBase64Url(message.payload.body.data);
  return "";
}

function monthNumber(month: string) {
  const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const index = months.indexOf(month.slice(0, 3).toLowerCase());
  return index >= 0 ? String(index + 1).padStart(2, "0") : null;
}

function parsePaidDate(body: string, fallbackInternalDate?: string) {
  const match = body.match(/Paid on\s+([A-Za-z]{3,9})\s+(\d{1,2}),\s+(\d{4})/i);
  if (match) {
    const month = monthNumber(match[1]);
    if (month) return `${match[3]}-${month}-${String(Number(match[2])).padStart(2, "0")}`;
  }
  const fallback = fallbackInternalDate ? new Date(Number(fallbackInternalDate)) : new Date();
  return Number.isNaN(fallback.getTime()) ? new Date().toISOString().slice(0, 10) : fallback.toISOString().slice(0, 10);
}

export function parseSquarePaymentEmail(message: GmailMessage): SquarePaymentEmailReceipt | null {
  const from = headerValue(message, "from").toLowerCase();
  if (!from.includes(SQUARE_SENDER)) return null;

  const subject = headerValue(message, "subject");
  const subjectMatch = subject.match(/^\$([\d,]+(?:\.\d{2})?)\s+payment received from\s+(.+)$/i);
  if (!subjectMatch) return null;

  const amount = roundMoney(subjectMatch[1].replace(/,/g, ""));
  const customerName = subjectMatch[2].trim();
  if (!(amount > 0) || !customerName) return null;

  const body = messageText(message);
  if (!/Payment Link/i.test(body)) return null;
  const emailCandidates = body.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  const customerEmail = emailCandidates.find((email) => !email.toLowerCase().includes("square")) || null;
  const cardMatch = body.match(/(?:VISA|MASTERCARD|AMEX|DISCOVER)\s+(\d{4})/i);

  return {
    gmailMessageId: message.id,
    gmailThreadId: message.threadId || null,
    amount,
    customerName,
    customerEmail,
    paidDate: parsePaidDate(body, message.internalDate),
    cardLastFour: cardMatch?.[1] || null,
    subject,
  };
}

function sumPayments(payments: PaymentRow[], deposit: boolean) {
  return roundMoney(payments
    .filter((payment) => String(payment.payment_label || "").toLowerCase().includes("deposit") === deposit)
    .reduce((sum, payment) => sum + roundMoney(payment.amount), 0));
}

function quotePaymentAmounts(quote: QuoteRow, payments: PaymentRow[], creditsIn: CreditRow[], creditsOut: CreditRow[]) {
  const total = roundMoney(quote.quote_total);
  const depositRequired = roundMoney(quote.deposit_required);
  const paidTotal = roundMoney(payments.reduce((sum, payment) => sum + roundMoney(payment.amount), 0));
  const depositPaid = sumPayments(payments, true);
  const creditIn = roundMoney(creditsIn.reduce((sum, credit) => sum + roundMoney(credit.amount), 0));
  const creditOut = roundMoney(creditsOut.reduce((sum, credit) => sum + roundMoney(credit.amount), 0));
  const outstanding = roundMoney(Math.max(total - paidTotal - creditIn + creditOut, 0));
  const deposit = roundMoney(Math.min(Math.max(depositRequired - depositPaid, 0), outstanding));
  const balance = roundMoney(Math.max(outstanding - deposit, 0));
  return { deposit, balance, outstanding };
}

export function matchSquarePaymentEmail(input: {
  receipt: SquarePaymentEmailReceipt;
  quotes: QuoteRow[];
  jobs: JobRow[];
  payments: PaymentRow[];
  credits: CreditRow[];
  paymentLinkEvents?: PaymentLinkEventRow[];
}): { candidate: SquarePaymentEmailCandidate | null; reason?: string } {
  const jobsById = new Map(input.jobs.map((job) => [job.id, job]));
  const receiptName = normalizedIdentity(input.receipt.customerName);
  const receiptEmail = normalizedEmail(input.receipt.customerEmail);
  const candidates: Array<SquarePaymentEmailCandidate & { identityScore: number }> = [];

  for (const quote of input.quotes) {
    if (!ACTIVE_PAYMENT_STATUSES.has(String(quote.status || "").toLowerCase())) continue;
    const job = quote.job_id ? jobsById.get(quote.job_id) : null;
    const customerName = String(quote.customer_name || job?.customer_name || "").trim();
    const customerEmail = String(quote.customer_email || job?.email || "").trim() || null;
    const nameMatches = Boolean(receiptName && normalizedIdentity(customerName) === receiptName);
    const emailMatches = Boolean(receiptEmail && normalizedEmail(customerEmail) === receiptEmail);
    if (!nameMatches && !emailMatches) continue;

    const quotePayments = input.payments.filter((payment) => payment.quote_id === quote.id);
    const creditsIn = input.credits.filter((credit) => credit.to_quote_id === quote.id);
    const creditsOut = input.credits.filter((credit) => credit.from_quote_id === quote.id);
    const amounts = quotePaymentAmounts(quote, quotePayments, creditsIn, creditsOut);
    const paymentType = moneyMatches(input.receipt.amount, amounts.deposit) && amounts.deposit > 0
      ? "deposit"
      : moneyMatches(input.receipt.amount, amounts.balance) && amounts.balance > 0
        ? "balance"
        : null;
    if (!paymentType) continue;

    candidates.push({
      quoteId: quote.id,
      jobId: quote.job_id,
      quoteNumber: quote.quote_number || null,
      customerName,
      customerEmail,
      paymentType,
      amount: input.receipt.amount,
      paidDate: input.receipt.paidDate,
      identityScore: (nameMatches ? 1 : 0) + (emailMatches ? 2 : 0),
    });
  }

  if (!candidates.length && receiptEmail) {
    const linkedQuoteIds = new Set(
      (input.paymentLinkEvents || [])
        .filter((event) => {
          const metadata = event.metadata || {};
          return normalizedEmail(String(metadata.recipient || "")) === receiptEmail && moneyMatches(metadata.amount, input.receipt.amount);
        })
        .map((event) => String(event.entity_id || ""))
        .filter(Boolean)
    );
    for (const quote of input.quotes.filter((row) => linkedQuoteIds.has(row.id))) {
      if (!ACTIVE_PAYMENT_STATUSES.has(String(quote.status || "").toLowerCase())) continue;
      const quotePayments = input.payments.filter((payment) => payment.quote_id === quote.id);
      const creditsIn = input.credits.filter((credit) => credit.to_quote_id === quote.id);
      const creditsOut = input.credits.filter((credit) => credit.from_quote_id === quote.id);
      const amounts = quotePaymentAmounts(quote, quotePayments, creditsIn, creditsOut);
      const paymentType = moneyMatches(input.receipt.amount, amounts.deposit) && amounts.deposit > 0
        ? "deposit"
        : moneyMatches(input.receipt.amount, amounts.balance) && amounts.balance > 0
          ? "balance"
          : null;
      if (!paymentType) continue;
      const job = quote.job_id ? jobsById.get(quote.job_id) : null;
      candidates.push({
        quoteId: quote.id,
        jobId: quote.job_id,
        quoteNumber: quote.quote_number || null,
        customerName: String(quote.customer_name || job?.customer_name || "").trim(),
        customerEmail: input.receipt.customerEmail,
        paymentType,
        amount: input.receipt.amount,
        paidDate: input.receipt.paidDate,
        identityScore: 3,
      });
    }
  }

  if (!candidates.length) return { candidate: null, reason: "No active CRM quote uniquely matched the Square customer and amount." };
  const bestScore = Math.max(...candidates.map((candidate) => candidate.identityScore));
  const strongest = candidates.filter((candidate) => candidate.identityScore === bestScore);
  if (strongest.length !== 1) return { candidate: null, reason: `${strongest.length} CRM quotes matched the Square customer and amount.` };
  const { identityScore: _identityScore, ...candidate } = strongest[0];
  return { candidate };
}

function isEquivalentExistingPayment(receipt: SquarePaymentEmailReceipt, quoteId: string, payments: PaymentRow[]) {
  return payments.some((payment) => {
    if (payment.quote_id !== quoteId || !moneyMatches(payment.amount, receipt.amount)) return false;
    const paidDate = String(payment.paid_at || "").slice(0, 10);
    return paidDate === receipt.paidDate;
  });
}

async function gmailFetch<T>(accessToken: string, path: string, init: RequestInit = {}) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/json",
  };
  if (init.body) headers["Content-Type"] = "application/json";
  const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
    ...init,
    headers,
  });
  if (!response.ok) throw new CrmAuthError(502, `Square payment Gmail request failed: ${response.status} ${await response.text()}`);
  return (await response.json()) as T;
}

export async function ensureGmailLabel(accessToken: string, labelName: string) {
  const labels = await gmailFetch<{ labels?: GmailLabel[] }>(accessToken, "labels");
  const existing = (labels.labels || []).find((label) => label.name?.toLowerCase() === labelName.toLowerCase());
  if (existing?.id) return existing.id;

  const created = await gmailFetch<GmailLabel>(accessToken, "labels", {
    method: "POST",
    body: JSON.stringify({
      name: labelName,
      labelListVisibility: "labelShow",
      messageListVisibility: "show",
    }),
  });
  if (!created.id) throw new CrmAuthError(502, `Gmail did not return an id for the ${labelName} label.`);
  return created.id;
}

export async function addGmailMessageLabel(accessToken: string, messageId: string, labelId: string) {
  await gmailFetch<Record<string, unknown>>(accessToken, `messages/${encodeURIComponent(messageId)}/modify`, {
    method: "POST",
    body: JSON.stringify({ addLabelIds: [labelId] }),
  });
}

export async function fileProcessedGmailMessage(accessToken: string, messageId: string, labelId: string) {
  await gmailFetch(accessToken, `messages/${encodeURIComponent(messageId)}/modify`, {
    method: "POST",
    body: JSON.stringify({ addLabelIds: [labelId], removeLabelIds: ["INBOX"] }),
  });
}

async function listMessages(accessToken: string, query: string, maxResults: number) {
  const params = new URLSearchParams({ q: query, maxResults: String(maxResults) });
  const result = await gmailFetch<{ messages?: Array<{ id: string; threadId?: string }> }>(accessToken, `messages?${params.toString()}`);
  return result.messages || [];
}

async function getMessage(accessToken: string, id: string) {
  return gmailFetch<GmailMessage>(accessToken, `messages/${encodeURIComponent(id)}?format=full`);
}

function configuredMailbox() {
  return process.env.SQUARE_PAYMENT_EMAIL_MAILBOX?.trim()
    || process.env.INSTALLATION_INVOICE_GMAIL_MAILBOX?.trim()
    || DEFAULT_MAILBOX;
}

export function squarePaymentEmailQuery() {
  return `newer_than:14d from:${SQUARE_SENDER} subject:"payment received from" -label:${PROCESSED_LABEL}`;
}

export async function processSquarePaymentEmails(
  supabase: CrmSupabaseClient,
  options: { maxResults?: number } = {},
): Promise<SquarePaymentEmailRunResult> {
  const mailbox = configuredMailbox();
  const accessToken = await getBrokeredGmailAccessToken(mailbox);
  if (!accessToken) throw new CrmAuthError(503, "Square payment email polling is missing Gmail broker access.");
  const gmailAccessToken = accessToken;

  const query = squarePaymentEmailQuery();
  const listed = await listMessages(gmailAccessToken, query, Math.min(Math.max(options.maxResults || 50, 1), 100));
  const result: SquarePaymentEmailRunResult = {
    mailbox,
    query,
    checked: listed.length,
    recorded: 0,
    duplicates: 0,
    review: 0,
    ignored: 0,
    errors: 0,
    labeled: 0,
    telegramSent: 0,
    telegramErrors: 0,
    results: [],
  };

  const [quotesResult, jobsResult, paymentsResult, creditsResult, paymentLinkEventsResult] = await Promise.all([
    supabase.from("crm_quotes").select("id,job_id,quote_number,status,quote_total,deposit_required,customer_email").limit(2000),
    supabase.from("crm_jobs").select("id,customer_name,email").limit(2000),
    supabase.from("crm_quote_bookkeeping_payments").select("id,quote_id,job_id,payment_label,amount,paid_at,external_source,external_id,meta").limit(5000),
    supabase.from("crm_quote_bookkeeping_credits").select("amount,from_quote_id,to_quote_id").limit(5000),
    supabase.from("crm_activity_events").select("entity_id,action,metadata").in("action", ["square_deposit_link.send", "square_balance_link.send"]).limit(2000),
  ]);
  const loadError = quotesResult.error || jobsResult.error || paymentsResult.error || creditsResult.error || paymentLinkEventsResult.error;
  if (loadError) throw new CrmAuthError(502, `Square payment CRM matching data could not be loaded: ${loadError.message}`);

  const quotes = (quotesResult.data || []) as QuoteRow[];
  const jobs = (jobsResult.data || []) as JobRow[];
  const payments = (paymentsResult.data || []) as PaymentRow[];
  const credits = (creditsResult.data || []) as CreditRow[];
  const paymentLinkEvents = (paymentLinkEventsResult.data || []) as PaymentLinkEventRow[];
  let processedLabelId: string | null = null;

  async function markProcessed(messageId: string) {
    const labelId = processedLabelId || await ensureGmailLabel(gmailAccessToken, PROCESSED_LABEL);
    processedLabelId = labelId;
    await fileProcessedGmailMessage(gmailAccessToken, messageId, labelId);
    result.labeled += 1;
  }

  for (const listedMessage of listed) {
    try {
      if (payments.some((payment) => payment.external_source === "square_email" && payment.external_id === listedMessage.id)) {
        result.duplicates += 1;
        result.results.push({ gmailMessageId: listedMessage.id, status: "duplicate", reason: "Gmail receipt was already recorded." });
        continue;
      }

      const message = await getMessage(gmailAccessToken, listedMessage.id);
      const receipt = parseSquarePaymentEmail(message);
      if (!receipt) {
        result.ignored += 1;
        result.results.push({ gmailMessageId: listedMessage.id, status: "ignored", reason: "Email was not a supported Square payment receipt." });
        continue;
      }

      const match = matchSquarePaymentEmail({ receipt, quotes, jobs, payments, credits, paymentLinkEvents });
      if (!match.candidate) {
        result.review += 1;
        result.results.push({
          gmailMessageId: receipt.gmailMessageId,
          customerName: receipt.customerName,
          amount: receipt.amount,
          status: "review",
          reason: match.reason,
        });
        continue;
      }

      if (isEquivalentExistingPayment(receipt, match.candidate.quoteId, payments)) {
        const { maybeSendCustomerCloseoutForQuote } = await import("@/lib/crm/customer-closeout");
        await maybeSendCustomerCloseoutForQuote(
          supabase,
          match.candidate.quoteId,
          { email: "square-payment-email-poller" },
          "square-payment-email-poller-retry",
          receipt.customerEmail
        );
        result.duplicates += 1;
        result.results.push({
          gmailMessageId: receipt.gmailMessageId,
          customerName: receipt.customerName,
          amount: receipt.amount,
          status: "duplicate",
          quoteId: match.candidate.quoteId,
          paymentType: match.candidate.paymentType,
          reason: "An equivalent CRM payment is already recorded for this date and amount.",
        });
        continue;
      }

      const reconciled = await reconcileSquareQuotePayment(supabase, {
        squarePaymentId: `gmail:${receipt.gmailMessageId}`,
        amountCents: Math.round(receipt.amount * 100),
        currency: "USD",
        quoteId: match.candidate.quoteId,
        jobId: match.candidate.jobId,
        paymentType: match.candidate.paymentType,
        orderId: null,
        paidAt: `${receipt.paidDate}T12:00:00.000Z`,
        eventId: null,
        receiptUrl: null,
        refundedAmountCents: 0,
      }, {
        externalSource: "square_email",
        externalId: receipt.gmailMessageId,
        createdBy: "square-payment-email-poller",
        metadata: {
          gmail_message_id: receipt.gmailMessageId,
          gmail_thread_id: receipt.gmailThreadId,
          square_customer_name: receipt.customerName,
          square_customer_email: receipt.customerEmail,
          square_card_last_four: receipt.cardLastFour,
          square_receipt_subject: receipt.subject,
        },
      });

      if (reconciled.status === "recorded") {
        const { data: persistedPayment, error: persistedPaymentError } = await supabase
          .from("crm_quote_bookkeeping_payments")
          .select("id,quote_id,job_id")
          .eq("external_source", "square_email")
          .eq("external_id", receipt.gmailMessageId)
          .maybeSingle();
        if (
          persistedPaymentError
          || !persistedPayment?.id
          || !persistedPayment.job_id
          || persistedPayment.quote_id !== match.candidate.quoteId
          || persistedPayment.job_id !== match.candidate.jobId
        ) {
          throw new CrmAuthError(502, "Square email payment was saved but could not be durably verified.");
        }

        const { error: auditError } = await supabase.from("crm_activity_events").insert({
          actor_email: "square-payment-email-poller",
          entity_type: "bookkeeping_payment",
          entity_id: persistedPayment.id,
          action: "square_payment_email.reconciled",
          after_data: {
            quoteId: match.candidate.quoteId,
            jobId: persistedPayment.job_id || match.candidate.jobId,
            paymentType: match.candidate.paymentType,
            amount: receipt.amount,
            paidDate: receipt.paidDate,
            customerName: match.candidate.customerName,
          },
          metadata: {
            gmailMessageId: receipt.gmailMessageId,
            gmailThreadId: receipt.gmailThreadId,
            sourceReference: `square:gmail:${receipt.gmailMessageId}`,
          },
        });
        if (auditError) {
          throw new CrmAuthError(502, "Square email payment was saved but its audit event could not be recorded.");
        }

        const telegram = await sendTelegramMessage({
          text: squarePaymentTelegramText({
            customerName: match.candidate.customerName,
            quoteNumber: match.candidate.quoteNumber,
            paymentType: match.candidate.paymentType,
            amount: receipt.amount,
            paidDate: receipt.paidDate
          })
        });
        if (telegram.sent) result.telegramSent += 1;
        else if (telegram.error) result.telegramErrors += 1;

        if (shouldArchiveSquarePaymentEmail("recorded")) {
          await markProcessed(receipt.gmailMessageId);
        }
      }

      if (reconciled.status === "recorded") {
        result.recorded += 1;
        payments.push({
          quote_id: match.candidate.quoteId,
          payment_label: reconciled.paymentLabel,
          amount: receipt.amount,
          paid_at: receipt.paidDate,
          external_source: "square_email",
          external_id: receipt.gmailMessageId,
          meta: { createdBy: "square-payment-email-poller" },
        });
      } else {
        result.duplicates += 1;
      }
      result.results.push({
        gmailMessageId: receipt.gmailMessageId,
        customerName: receipt.customerName,
        amount: receipt.amount,
        status: reconciled.status === "recorded" ? "recorded" : "duplicate",
        quoteId: match.candidate.quoteId,
        paymentType: match.candidate.paymentType,
        reason: reconciled.reason,
      });
    } catch (error) {
      result.errors += 1;
      result.results.push({
        gmailMessageId: listedMessage.id,
        status: "error",
        reason: error instanceof Error ? error.message : "Square payment email processing failed.",
      });
    }
  }

  return result;
}
