import type { SupabaseClient } from "@supabase/supabase-js";
import { CrmAuthError } from "@/lib/crm/auth";
import { getBrokeredGmailAccessToken } from "@/lib/crm/installation-invoices";
import {
  ensureGmailLabel,
  fileProcessedGmailMessage,
  matchSquarePaymentEmail,
} from "@/lib/crm/square-payment-emails";

type GmailMessagePart = {
  mimeType?: string;
  body?: { data?: string };
  headers?: Array<{ name?: string; value?: string }>;
  parts?: GmailMessagePart[];
};

export type PeerPaymentGmailMessage = {
  id: string;
  threadId?: string;
  internalDate?: string;
  payload?: GmailMessagePart;
};

export type PeerPaymentReceipt = {
  provider: "zelle" | "venmo";
  gmailMessageId: string;
  gmailThreadId: string | null;
  payerName: string;
  amount: number;
  paidDate: string;
  subject: string;
  sourceReference: string;
};

const PROCESSED_LABEL = "Processed";
const DEFAULT_MAILBOX = "805shutters@gmail.com";

function headerValue(message: PeerPaymentGmailMessage, name: string) {
  return message.payload?.headers?.find(
    (header) => String(header.name || "").toLowerCase() === name.toLowerCase(),
  )?.value?.trim() || "";
}

function decodeBase64Url(data: string) {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

function collectText(part: GmailMessagePart | undefined): string[] {
  if (!part) return [];
  const own = part.body?.data ? [decodeBase64Url(part.body.data)] : [];
  return own.concat((part.parts || []).flatMap(collectText));
}

function cleanPayer(value: string) {
  return value
    .replace(/^(?:notification|alert|payment)[:\s-]*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parsedAmount(value: string) {
  const amount = Number(value.replace(/,/g, ""));
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) / 100 : null;
}

export function parsePeerPaymentEmail(message: PeerPaymentGmailMessage): PeerPaymentReceipt | null {
  const from = headerValue(message, "from").toLowerCase();
  const subject = headerValue(message, "subject");
  const body = collectText(message.payload).join(" ").replace(/<[^>]+>/g, " ");
  const text = `${subject} ${body}`.replace(/\s+/g, " ").trim();

  // Outgoing payment and vendor-payment notices are never customer receipts.
  if (/\byou (?:sent|paid)\b|\bpayment sent to\b|\byour payment to\b/i.test(text)) return null;

  let provider: PeerPaymentReceipt["provider"] | null = null;
  let payerValue = "";
  let amountValue: number | null = null;
  const parseIncoming = (value: string, verb: "paid" | "sent") => {
    const direct = value.match(new RegExp(`(?:^|[.!?]\\s+)([^.!?$]{2,80}?)\\s+${verb} you\\s+\\$([\\d,]+(?:\\.\\d{2})?)`, "i"))
      || value.match(new RegExp(`^([^$]{2,80}?)\\s+${verb} you\\s+\\$([\\d,]+(?:\\.\\d{2})?)`, "i"));
    if (direct) return { payer: direct[1], amount: parsedAmount(direct[2]) };
    const received = value.match(/you(?:'ve| have)? received\s+\$([\d,]+(?:\.\d{2})?)\s+from\s+(.+?)(?:\s+(?:with|through|via)\s+(?:zelle|venmo)|[.!?]|$)/i);
    return received ? { payer: received[2], amount: parsedAmount(received[1]) } : null;
  };
  if (from.includes("venmo.com")) {
    const parsed = parseIncoming(subject, "paid") || parseIncoming(text, "paid");
    if (parsed) {
      provider = "venmo";
      payerValue = parsed.payer;
      amountValue = parsed.amount;
    }
  } else if (/\bzelle\b/i.test(text)) {
    const parsed = parseIncoming(subject, "sent") || parseIncoming(text, "sent");
    if (parsed) {
      provider = "zelle";
      payerValue = parsed.payer;
      amountValue = parsed.amount;
    }
  }

  const amount = amountValue;
  const payerName = cleanPayer(payerValue);
  if (!provider || !amount || !payerName) return null;

  const receivedAt = message.internalDate ? new Date(Number(message.internalDate)) : new Date();
  const paidDate = Number.isNaN(receivedAt.getTime())
    ? new Date().toISOString().slice(0, 10)
    : receivedAt.toISOString().slice(0, 10);

  return {
    provider,
    gmailMessageId: message.id,
    gmailThreadId: message.threadId || null,
    payerName,
    amount,
    paidDate,
    subject,
    sourceReference: `${provider}:gmail:${message.id}`,
  };
}

async function gmailFetch<T>(accessToken: string, path: string) {
  const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  if (!response.ok) throw new CrmAuthError(502, `Payment Gmail request failed: ${response.status}`);
  return (await response.json()) as T;
}

async function listMessages(accessToken: string, query: string, maxResults: number) {
  const params = new URLSearchParams({ q: query, maxResults: String(maxResults) });
  const data = await gmailFetch<{ messages?: Array<{ id: string }> }>(accessToken, `messages?${params}`);
  return data.messages || [];
}

async function getMessage(accessToken: string, id: string) {
  return gmailFetch<PeerPaymentGmailMessage>(accessToken, `messages/${encodeURIComponent(id)}?format=full`);
}

export function peerPaymentEmailQuery() {
  return `newer_than:14d -label:${PROCESSED_LABEL} {from:venmo.com "sent you" "payment received"} ` +
    `-{subject:"you sent" subject:"payment sent" subject:"your payment to"}`;
}

export async function processPeerPaymentEmails(
  supabase: SupabaseClient,
  options: { maxResults?: number } = {},
) {
  const mailbox = process.env.PEER_PAYMENT_EMAIL_MAILBOX?.trim()
    || process.env.SQUARE_PAYMENT_EMAIL_MAILBOX?.trim()
    || process.env.INSTALLATION_INVOICE_GMAIL_MAILBOX?.trim()
    || DEFAULT_MAILBOX;
  const accessToken = await getBrokeredGmailAccessToken(mailbox);
  if (!accessToken) throw new CrmAuthError(503, "Peer-payment intake is missing Gmail broker access.");
  const query = peerPaymentEmailQuery();
  const listed = await listMessages(accessToken, query, Math.min(Math.max(options.maxResults || 50, 1), 100));

  const [quotesResult, jobsResult, paymentsResult, creditsResult, entriesResult] = await Promise.all([
    supabase.from("crm_quotes").select("id,job_id,quote_number,status,quote_total,deposit_required,customer_email").limit(2000),
    supabase.from("crm_jobs").select("id,customer_name,email").limit(2000),
    supabase.from("crm_quote_bookkeeping_payments").select("id,quote_id,job_id,payment_label,amount,paid_at,payment_type,external_source,external_id,meta").limit(5000),
    supabase.from("crm_quote_bookkeeping_credits").select("amount,from_quote_id,to_quote_id").limit(5000),
    supabase.from("crm_quote_bookkeeping_entries").select("id,quote_id").limit(2000),
  ]);
  const loadError = quotesResult.error || jobsResult.error || paymentsResult.error || creditsResult.error || entriesResult.error;
  if (loadError) throw new CrmAuthError(502, `Peer-payment matching data could not be loaded: ${loadError.message}`);

  const payments = (paymentsResult.data || []) as Array<Record<string, unknown>>;
  const entryByQuote = new Map((entriesResult.data || []).map((entry) => [String(entry.quote_id || ""), entry.id]));
  let processedLabelId: string | null = null;
  const summary = { mailbox, query, checked: listed.length, recorded: 0, duplicates: 0, review: 0, ignored: 0, errors: 0 };

  async function markProcessed(messageId: string) {
    processedLabelId ||= await ensureGmailLabel(accessToken as string, PROCESSED_LABEL);
    await fileProcessedGmailMessage(accessToken as string, messageId, processedLabelId);
  }

  async function ensureExistingPaymentAudit(payment: Record<string, unknown>) {
    const paymentId = typeof payment.id === "string" ? payment.id : null;
    if (!paymentId) throw new CrmAuthError(502, "Existing peer payment is missing its durable identity.");
    const { data: existingAudit, error: auditLookupError } = await supabase
      .from("crm_activity_events")
      .select("id")
      .eq("entity_type", "bookkeeping_payment")
      .eq("entity_id", paymentId)
      .eq("action", "peer_payment_email.reconciled")
      .limit(1);
    if (auditLookupError) throw new CrmAuthError(502, "Existing peer-payment audit could not be checked.");
    if (existingAudit?.length) return;

    const meta = payment.meta && typeof payment.meta === "object" ? payment.meta as Record<string, unknown> : {};
    const { error: auditError } = await supabase.from("crm_activity_events").insert({
      actor_email: "peer-payment-email-poller",
      entity_type: "bookkeeping_payment",
      entity_id: paymentId,
      action: "peer_payment_email.reconciled",
      after_data: {
        quoteId: payment.quote_id || null,
        jobId: payment.job_id || null,
        provider: String(payment.external_source || "").replace(/_email$/, ""),
        payerName: meta.payer_name || null,
        amount: payment.amount,
        paidDate: payment.paid_at,
      },
      metadata: {
        gmailMessageId: payment.external_id,
        gmailThreadId: meta.gmail_thread_id || null,
        sourceReference: meta.source_reference || null,
        recovered: true,
      },
    });
    if (auditError) throw new CrmAuthError(502, "Existing peer-payment audit could not be repaired.");
  }

  for (const listedMessage of listed) {
    try {
      const existing = payments.find((payment) => payment.external_id === listedMessage.id && String(payment.external_source || "").endsWith("_email"));
      if (existing) {
        await ensureExistingPaymentAudit(existing);
        await markProcessed(listedMessage.id);
        summary.duplicates += 1;
        continue;
      }

      const receipt = parsePeerPaymentEmail(await getMessage(accessToken, listedMessage.id));
      if (!receipt) {
        summary.ignored += 1;
        continue;
      }

      const match = matchSquarePaymentEmail({
        receipt: {
          gmailMessageId: receipt.gmailMessageId,
          gmailThreadId: receipt.gmailThreadId,
          amount: receipt.amount,
          customerName: receipt.payerName,
          customerEmail: null,
          paidDate: receipt.paidDate,
          cardLastFour: null,
          subject: receipt.subject,
        },
        quotes: (quotesResult.data || []) as never,
        jobs: (jobsResult.data || []) as never,
        payments: payments as never,
        credits: (creditsResult.data || []) as never,
      });

      if (!match.candidate) {
        const { data: priorReview } = await supabase
          .from("crm_activity_events")
          .select("id")
          .eq("action", "peer_payment_email.needs_review")
          .contains("metadata", { gmailMessageId: receipt.gmailMessageId })
          .limit(1);
        if (!priorReview?.length) {
          const { error: reviewAuditError } = await supabase.from("crm_activity_events").insert({
            actor_email: "peer-payment-email-poller",
            entity_type: "system",
            action: "peer_payment_email.needs_review",
            after_data: { provider: receipt.provider, payerName: receipt.payerName, amount: receipt.amount, paidDate: receipt.paidDate },
            metadata: { gmailMessageId: receipt.gmailMessageId, gmailThreadId: receipt.gmailThreadId, sourceReference: receipt.sourceReference, reason: match.reason || null },
          });
          if (reviewAuditError) throw new CrmAuthError(502, "Peer-payment review item could not be recorded.");
        }
        summary.review += 1;
        continue;
      }

      const externalSource = `${receipt.provider}_email`;
      const { data: inserted, error: insertError } = await supabase
        .from("crm_quote_bookkeeping_payments")
        .insert({
          quote_id: match.candidate.quoteId,
          job_id: match.candidate.jobId,
          bookkeeping_entry_id: entryByQuote.get(match.candidate.quoteId) || null,
          payment_label: match.candidate.paymentType === "deposit" ? "Deposit" : "Balance payment",
          payment_type: receipt.provider,
          amount: receipt.amount,
          paid_at: receipt.paidDate,
          source: "crm_quote",
          external_source: externalSource,
          external_id: receipt.gmailMessageId,
          notes: null,
          meta: {
            payer_name: receipt.payerName,
            gmail_message_id: receipt.gmailMessageId,
            gmail_thread_id: receipt.gmailThreadId,
            source_reference: receipt.sourceReference,
            receipt_subject: receipt.subject,
            reconciled_by: "peer-payment-email-poller",
          },
        })
        .select("id")
        .single();
      if (insertError) {
        if (insertError.code === "23505") {
          const { data: racedPayment, error: racedPaymentError } = await supabase
            .from("crm_quote_bookkeeping_payments")
            .select("id,quote_id,job_id,amount,paid_at,payment_type,external_source,external_id,meta")
            .eq("external_source", externalSource)
            .eq("external_id", receipt.gmailMessageId)
            .maybeSingle();
          if (racedPaymentError || !racedPayment) {
            throw new CrmAuthError(502, "Concurrent peer payment could not be verified.");
          }
          await ensureExistingPaymentAudit(racedPayment as Record<string, unknown>);
          await markProcessed(receipt.gmailMessageId);
          summary.duplicates += 1;
          continue;
        }
        throw insertError;
      }

      const { error: auditError } = await supabase.from("crm_activity_events").insert({
        actor_email: "peer-payment-email-poller",
        entity_type: "bookkeeping_payment",
        entity_id: inserted.id,
        action: "peer_payment_email.reconciled",
        after_data: { quoteId: match.candidate.quoteId, jobId: match.candidate.jobId, provider: receipt.provider, payerName: receipt.payerName, amount: receipt.amount, paidDate: receipt.paidDate },
        metadata: { gmailMessageId: receipt.gmailMessageId, gmailThreadId: receipt.gmailThreadId, sourceReference: receipt.sourceReference },
      });
      if (auditError) throw new CrmAuthError(502, "Payment was saved but its audit event could not be recorded.");

      await markProcessed(receipt.gmailMessageId);
      payments.push({
        id: inserted.id,
        quote_id: match.candidate.quoteId,
        job_id: match.candidate.jobId,
        payment_label: match.candidate.paymentType === "deposit" ? "Deposit" : "Balance payment",
        payment_type: receipt.provider,
        amount: receipt.amount,
        paid_at: receipt.paidDate,
        external_source: externalSource,
        external_id: receipt.gmailMessageId,
      });
      summary.recorded += 1;
    } catch (error) {
      console.error("peer payment email processing failed", { gmailMessageId: listedMessage.id, error });
      summary.errors += 1;
    }
  }

  return summary;
}
