import { SupabaseClient } from "@supabase/supabase-js";
import { CrmAuthError } from "@/lib/crm/auth";
import { CrmOrderCogsEmail, CrmOrderCogsEmailStatus } from "@/lib/crm/types";

type CrmSupabaseClient = SupabaseClient;

const DEFAULT_MAILBOX = "805shutters@gmail.com";
const DEFAULT_MAX_RESULTS = 50;
const AUTO_APPLY_MIN_NAME_CONFIDENCE = 0.78;
const AUTO_APPLY_MIN_AMOUNT_CONFIDENCE = 0.7;

type GmailHeader = {
  name: string;
  value: string;
};

type GmailMessagePart = {
  mimeType?: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: {
    data?: string;
    attachmentId?: string;
  };
  parts?: GmailMessagePart[];
};

type GmailMessage = {
  id: string;
  threadId?: string;
  historyId?: string;
  internalDate?: string;
  snippet?: string;
  payload?: GmailMessagePart;
};

type GmailListResponse = {
  messages?: Array<{ id: string; threadId?: string }>;
  nextPageToken?: string;
};

type OrderCogsCandidate = {
  source: "entry" | "quote" | "job";
  customerName: string;
  jobId: string | null;
  quoteId: string | null;
  entryId: string | null;
  totalAmount: number;
  cogsAmount: number;
  soldDate: string | null;
};

export type ExtractedOrderCogs = {
  customerName: string | null;
  orderAmount: number | null;
  orderNumber: string | null;
  confidence: number;
  amountConfidence: number;
  text: string;
};

type OrderCogsMatch = {
  candidate: OrderCogsCandidate | null;
  status: CrmOrderCogsEmailStatus;
  confidence: number;
  reason: string;
};

export type ProcessOrderCogsOptions = {
  mailbox?: string;
  query?: string;
  maxResults?: number;
  messageIds?: string[];
  actorEmail?: string;
};

export type ProcessOrderCogsResult = {
  mailbox: string;
  query: string;
  scanned: number;
  processed: number;
  matched: number;
  needsReview: number;
  unmatched: number;
  skipped: number;
  errors: number;
  emails: CrmOrderCogsEmail[];
};

function defaultQuery(mailbox: string) {
  return `to:${mailbox} newer_than:30d (order OR receipt OR confirmation OR invoice OR "order total" OR "grand total")`;
}

function envValue(keys: string[]) {
  return keys.map((key) => process.env[key]).find((value) => value && value.trim());
}

function normalizedMailbox(value?: string) {
  return (value || process.env.ORDER_COGS_MAILBOX || process.env.INSTALLATION_INVOICE_MAILBOX || DEFAULT_MAILBOX)
    .trim()
    .toLowerCase();
}

function maxResultsValue(value?: number) {
  const configured = value ?? Number(process.env.ORDER_COGS_GMAIL_MAX_RESULTS || DEFAULT_MAX_RESULTS);
  if (!Number.isFinite(configured)) return DEFAULT_MAX_RESULTS;
  return Math.min(Math.max(Math.trunc(configured), 1), 100);
}

function googleOAuthCredentials() {
  const clientId = envValue(["GMAIL_805_CLIENT_ID", "GOOGLE_CLIENT_ID", "GOOGLE_CALENDAR_CLIENT_ID"]);
  const clientSecret = envValue(["GMAIL_805_CLIENT_SECRET", "GOOGLE_CLIENT_SECRET", "GOOGLE_CALENDAR_CLIENT_SECRET"]);
  const refreshToken = envValue(["GMAIL_805_REFRESH_TOKEN", "GMAIL_REFRESH_TOKEN", "GOOGLE_CALENDAR_REFRESH_TOKEN"]);

  if (!clientId || !clientSecret || !refreshToken) {
    throw new CrmAuthError(
      503,
      "805 Gmail order COGS puller is missing OAuth credentials. Set GMAIL_805_CLIENT_ID, GMAIL_805_CLIENT_SECRET, and GMAIL_805_REFRESH_TOKEN with Gmail readonly scope."
    );
  }

  return { clientId, clientSecret, refreshToken };
}

async function getGmailAccessToken() {
  const { clientId, clientSecret, refreshToken } = googleOAuthCredentials();
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token"
    })
  });

  if (!response.ok) {
    throw new CrmAuthError(502, "805 Gmail order COGS puller could not refresh its Google access token.");
  }

  const body = (await response.json()) as { access_token?: string };
  if (!body.access_token) throw new CrmAuthError(502, "Google did not return an access token for order COGS.");
  return body.access_token;
}

async function gmailJson<T>(accessToken: string, url: string) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!response.ok) {
    throw new CrmAuthError(502, `Gmail order COGS request failed with ${response.status}.`);
  }
  return (await response.json()) as T;
}

async function listGmailMessages(accessToken: string, query: string, maxResults: number) {
  const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
  url.searchParams.set("q", query);
  url.searchParams.set("maxResults", String(maxResults));
  const result = await gmailJson<GmailListResponse>(accessToken, url.toString());
  return result.messages || [];
}

async function getGmailMessage(accessToken: string, id: string) {
  const url = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}`);
  url.searchParams.set("format", "full");
  return gmailJson<GmailMessage>(accessToken, url.toString());
}

function decodeBody(data?: string) {
  if (!data) return "";
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

function htmlToText(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function collectMessageText(part?: GmailMessagePart): string[] {
  if (!part) return [];
  const chunks: string[] = [];
  const decoded = decodeBody(part.body?.data);
  if (decoded && part.mimeType?.includes("html")) chunks.push(htmlToText(decoded));
  if (decoded && !part.mimeType?.includes("html")) chunks.push(decoded);
  for (const child of part.parts || []) chunks.push(...collectMessageText(child));
  return chunks;
}

function attachmentNames(part?: GmailMessagePart): string[] {
  if (!part) return [];
  return [
    part.filename || "",
    ...(part.parts || []).flatMap((child) => attachmentNames(child))
  ].filter(Boolean);
}

function getHeader(headers: GmailHeader[] | undefined, name: string) {
  return headers?.find((header) => header.name.toLowerCase() === name.toLowerCase())?.value || null;
}

function moneyFrom(value: string | undefined) {
  if (!value) return null;
  const amount = Number(value.replace(/[$,\s]/g, ""));
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : null;
}

function cleanName(value: string | null) {
  return value
    ?.replace(/\s+(order|invoice|total|ship|sold|email|phone).*$/i, "")
    .replace(/[^a-z0-9&.' -]/gi, " ")
    .replace(/\s+/g, " ")
    .trim() || null;
}

export function extractOrderCogsFromText(text: string): ExtractedOrderCogs {
  const normalized = text.replace(/\s+/g, " ").trim();
  const nameMatch =
    normalized.match(/\b(?:customer|client|sold to|ship to|name)\s*[:#-]\s*([A-Za-z][A-Za-z0-9&.' -]{2,80})/i) ||
    normalized.match(/\bfor\s+([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){0,3})\b/);
  const amountMatch =
    normalized.match(/\b(?:order total|grand total|amount charged|amount due|total due|invoice total|total)\s*[:#-]?\s*\$?\s*([\d,]+(?:\.\d{2})?)/i) ||
    normalized.match(/\$\s*([\d,]+(?:\.\d{2})?)\s*(?:total|charged|paid)/i);
  const orderMatch =
    normalized.match(/\b(?:order|confirmation|invoice|po)\s*(?:number|no\.|#)\s*[:#-]?\s*((?=[A-Z0-9-]*\d)[A-Z0-9][A-Z0-9-]{3,})/i) ||
    normalized.match(/\b(?:confirmation|invoice|po)\s*[:#-]\s*((?=[A-Z0-9-]*\d)[A-Z0-9][A-Z0-9-]{3,})/i) ||
    normalized.match(/\border\s*[:#-]\s*((?=[A-Z0-9-]*\d)[A-Z0-9][A-Z0-9-]{3,})/i);

  const customerName = cleanName(nameMatch?.[1] || null);
  const orderAmount = moneyFrom(amountMatch?.[1]);
  const orderNumber = orderMatch?.[1] || null;
  const confidence = Math.min(1, (customerName ? 0.45 : 0) + (orderAmount ? 0.4 : 0) + (orderNumber ? 0.15 : 0));

  return {
    customerName,
    orderAmount,
    orderNumber,
    confidence,
    amountConfidence: orderAmount ? 0.85 : 0,
    text: normalized
  };
}

function normalizeTokens(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 1);
}

function nameScore(extracted: string | null, candidateName: string) {
  if (!extracted) return 0;
  const extractedTokens = normalizeTokens(extracted);
  const candidateTokens = normalizeTokens(candidateName);
  if (!extractedTokens.length || !candidateTokens.length) return 0;
  const matched = extractedTokens.filter((token) => candidateTokens.includes(token)).length;
  return matched / Math.max(extractedTokens.length, candidateTokens.length);
}

function isSameMoney(left: number, right: number) {
  return Math.abs((Number(left) || 0) - (Number(right) || 0)) < 0.01;
}

function matchOrderCogs(extraction: ExtractedOrderCogs, candidates: OrderCogsCandidate[]): OrderCogsMatch {
  if (!extraction.customerName) {
    return { candidate: null, status: "unmatched", confidence: 0, reason: "No customer name was found in the order email." };
  }

  const ranked = candidates
    .map((candidate) => {
      const score = nameScore(extraction.customerName, candidate.customerName);
      return { candidate, confidence: score };
    })
    .filter((item) => item.confidence > 0)
    .sort((left, right) => right.confidence - left.confidence);

  const top = ranked[0];
  if (!top || top.confidence < AUTO_APPLY_MIN_NAME_CONFIDENCE) {
    return {
      candidate: null,
      status: "unmatched",
      confidence: top?.confidence || 0,
      reason: "No sold customer name matched the order email."
    };
  }

  const second = ranked[1];
  if (second && top.confidence - second.confidence < 0.04) {
    return {
      candidate: top.candidate,
      status: "needs_review",
      confidence: top.confidence,
      reason: `Ambiguous customer match: ${top.candidate.customerName} and ${second.candidate.customerName}.`
    };
  }

  if (top.candidate.cogsAmount > 0 && extraction.orderAmount && !isSameMoney(top.candidate.cogsAmount, extraction.orderAmount)) {
    return {
      candidate: top.candidate,
      status: "needs_review",
      confidence: top.confidence,
      reason: `${top.candidate.customerName} already has COGS entered.`
    };
  }

  return {
    candidate: top.candidate,
    status: "matched",
    confidence: top.confidence,
    reason: `Matched customer name ${top.candidate.customerName}.`
  };
}

async function loadOrderCogsCandidates(supabase: CrmSupabaseClient) {
  const [entriesResult, quotesResult, jobsResult] = await Promise.all([
    supabase
      .from("crm_quote_bookkeeping_entries")
      .select("id,quote_id,job_id,customer_name,sold_date,total_amount,cogs_amount")
      .in("source", ["crm_quote", "legacy_sheet", "manual"])
      .limit(1000),
    supabase
      .from("crm_quotes")
      .select("id,job_id,status,quote_total,materials_cost,sold_at,approved_at,ordered_at")
      .in("status", ["sold", "approved", "ordered", "received", "installed", "invoiced", "paid"])
      .limit(500),
    supabase
      .from("crm_jobs")
      .select("id,customer_name,status,estimated_total")
      .in("status", ["sold", "ordered", "installed", "invoiced", "closed"])
      .limit(500)
  ]);

  if (entriesResult.error || quotesResult.error || jobsResult.error) {
    throw new CrmAuthError(502, "CRM data failed to load for order COGS matching.");
  }

  const entries = (entriesResult.data || []) as Array<{
    id: string;
    quote_id: string | null;
    job_id: string | null;
    customer_name: string;
    sold_date: string | null;
    total_amount: number;
    cogs_amount: number;
  }>;
  const quotes = (quotesResult.data || []) as Array<{
    id: string;
    job_id: string;
    quote_total: number;
    materials_cost: number;
    sold_at: string | null;
    approved_at: string | null;
    ordered_at: string | null;
  }>;
  const jobs = (jobsResult.data || []) as Array<{ id: string; customer_name: string; estimated_total: number }>;
  const jobsById = new Map(jobs.map((job) => [job.id, job]));
  const entryQuoteIds = new Set(entries.map((entry) => entry.quote_id).filter(Boolean));
  const entryJobIds = new Set(entries.map((entry) => entry.job_id).filter(Boolean));
  const quoteJobIds = new Set(quotes.map((quote) => quote.job_id).filter(Boolean));
  const candidates: OrderCogsCandidate[] = [];

  for (const entry of entries) {
    candidates.push({
      source: "entry",
      customerName: entry.customer_name,
      jobId: entry.job_id,
      quoteId: entry.quote_id,
      entryId: entry.id,
      totalAmount: Number(entry.total_amount) || 0,
      cogsAmount: Number(entry.cogs_amount) || 0,
      soldDate: entry.sold_date
    });
  }

  for (const quote of quotes) {
    if (entryQuoteIds.has(quote.id)) continue;
    const job = jobsById.get(quote.job_id);
    if (!job?.customer_name) continue;
    candidates.push({
      source: "quote",
      customerName: job.customer_name,
      jobId: quote.job_id,
      quoteId: quote.id,
      entryId: null,
      totalAmount: Number(quote.quote_total) || 0,
      cogsAmount: Number(quote.materials_cost) || 0,
      soldDate: quote.sold_at || quote.approved_at || quote.ordered_at || null
    });
  }

  for (const job of jobs) {
    if (entryJobIds.has(job.id) || quoteJobIds.has(job.id)) continue;
    candidates.push({
      source: "job",
      customerName: job.customer_name,
      jobId: job.id,
      quoteId: null,
      entryId: null,
      totalAmount: Number(job.estimated_total) || 0,
      cogsAmount: 0,
      soldDate: null
    });
  }

  return candidates;
}

function gmailUrl(message: GmailMessage) {
  const target = message.threadId || message.id;
  return target ? `https://mail.google.com/mail/u/0/#inbox/${target}` : null;
}

function messageSentAt(message: GmailMessage) {
  const dateHeader = getHeader(message.payload?.headers, "Date");
  const parsedHeader = dateHeader ? Date.parse(dateHeader) : Number.NaN;
  if (Number.isFinite(parsedHeader)) return new Date(parsedHeader).toISOString();
  const internalDate = Number(message.internalDate || 0);
  return internalDate > 0 ? new Date(internalDate).toISOString() : null;
}

async function applyOrderCogs(
  supabase: CrmSupabaseClient,
  candidate: OrderCogsCandidate,
  extraction: ExtractedOrderCogs,
  message: GmailMessage
) {
  const amount = extraction.orderAmount;
  if (!amount) throw new CrmAuthError(400, "Order COGS amount is required.");
  const patch = {
    cogs_amount: amount,
    ...(extraction.orderNumber ? { manufacturer_order_ref: extraction.orderNumber } : {}),
    manufacturer_order_url: gmailUrl(message)
  };

  if (candidate.entryId) {
    const { error } = await supabase.from("crm_quote_bookkeeping_entries").update(patch).eq("id", candidate.entryId);
    if (error) throw new CrmAuthError(502, "Order email matched, but COGS could not be updated.");
    return;
  }

  if (candidate.quoteId) {
    const now = new Date().toISOString();
    const { error: quoteError } = await supabase
      .from("crm_quotes")
      .update({
        materials_cost: amount,
        ...(extraction.orderNumber ? { manufacturer_order_ref: extraction.orderNumber } : {}),
        manufacturer_order_url: gmailUrl(message)
      })
      .eq("id", candidate.quoteId);
    if (quoteError) throw new CrmAuthError(502, "Order email matched, but quote COGS could not be updated.");

    const { error } = await supabase.from("crm_quote_bookkeeping_entries").upsert(
      {
        quote_id: candidate.quoteId,
        job_id: candidate.jobId,
        source: "crm_quote",
        customer_name: candidate.customerName,
        sold_date: candidate.soldDate ? candidate.soldDate.slice(0, 10) : null,
        total_amount: candidate.totalAmount,
        ...patch,
        meta: {
          orderCogsSource: "gmail",
          orderCogsMessageId: message.id,
          orderCogsAppliedAt: now
        }
      },
      { onConflict: "quote_id" }
    );
    if (error) throw new CrmAuthError(502, "Order email matched, but quote bookkeeping COGS could not be saved.");
    return;
  }

  throw new CrmAuthError(400, "Order email matched a job that has no ledger target.");
}

async function insertOrderCogsRecord(
  supabase: CrmSupabaseClient,
  input: Omit<CrmOrderCogsEmail, "id" | "created_at" | "updated_at">
) {
  const { data, error } = await supabase
    .from("crm_order_cogs_emails")
    .upsert(input, { onConflict: "gmail_message_id" })
    .select("*")
    .single();
  if (error || !data) throw new CrmAuthError(502, "Order COGS email record could not be saved.");
  return data as CrmOrderCogsEmail;
}

function reviewStatus(extraction: ExtractedOrderCogs, match: OrderCogsMatch) {
  if (!extraction.orderAmount || extraction.amountConfidence < AUTO_APPLY_MIN_AMOUNT_CONFIDENCE) {
    return { status: "needs_review" as const, reason: "Order total could not be confidently extracted.", canApply: false };
  }
  if (match.status !== "matched" || !match.candidate) {
    return { status: match.status, reason: match.reason, canApply: false };
  }
  return { status: "matched" as const, reason: match.reason, canApply: true };
}

export async function processOrderCogsInbox(
  supabase: CrmSupabaseClient,
  options: ProcessOrderCogsOptions = {}
): Promise<ProcessOrderCogsResult> {
  const mailbox = normalizedMailbox(options.mailbox);
  const query = options.query || process.env.ORDER_COGS_GMAIL_QUERY || defaultQuery(mailbox);
  const maxResults = maxResultsValue(options.maxResults);
  const candidates = await loadOrderCogsCandidates(supabase);
  const accessToken = options.messageIds?.length ? null : await getGmailAccessToken();
  const messages = options.messageIds?.length
    ? options.messageIds.map((id) => ({ id }))
    : await listGmailMessages(accessToken as string, query, maxResults);
  const records: CrmOrderCogsEmail[] = [];
  const result = {
    mailbox,
    query,
    scanned: messages.length,
    processed: 0,
    matched: 0,
    needsReview: 0,
    unmatched: 0,
    skipped: 0,
    errors: 0,
    emails: records
  };

  for (const listed of messages) {
    try {
      const message = accessToken ? await getGmailMessage(accessToken, listed.id) : ({ id: listed.id } as GmailMessage);
      const headers = message.payload?.headers;
      const text = [message.snippet || "", ...collectMessageText(message.payload)].join("\n");
      const extraction = extractOrderCogsFromText(text);
      const match = matchOrderCogs(extraction, candidates);
      const review = reviewStatus(extraction, match);
      const now = new Date().toISOString();

      if (review.canApply && match.candidate) {
        await applyOrderCogs(supabase, match.candidate, extraction, message);
      }

      const record = await insertOrderCogsRecord(supabase, {
        mailbox_email: mailbox,
        gmail_message_id: message.id,
        gmail_thread_id: message.threadId || null,
        gmail_history_id: message.historyId || null,
        from_email: getHeader(headers, "From"),
        to_email: getHeader(headers, "To"),
        subject: getHeader(headers, "Subject"),
        sent_at: messageSentAt(message),
        snippet: message.snippet || null,
        attachment_names: attachmentNames(message.payload),
        email_url: gmailUrl(message),
        extracted_customer_name: extraction.customerName,
        extracted_order_amount: extraction.orderAmount,
        extracted_order_number: extraction.orderNumber,
        extraction_confidence: extraction.confidence,
        matched_job_id: match.candidate?.jobId || null,
        matched_quote_id: match.candidate?.quoteId || null,
        matched_bookkeeping_entry_id: match.candidate?.entryId || null,
        match_status: review.status,
        match_confidence: match.confidence,
        match_reason: review.reason,
        processed_at: now,
        applied_at: review.canApply ? now : null,
        error_message: null,
        raw: {
          actorEmail: options.actorEmail || null,
          textPreview: extraction.text.slice(0, 1000)
        }
      });

      records.push(record);
      result.processed += 1;
      if (record.match_status === "matched") result.matched += 1;
      if (record.match_status === "needs_review") result.needsReview += 1;
      if (record.match_status === "unmatched") result.unmatched += 1;
      if (record.match_status === "skipped") result.skipped += 1;
      if (record.match_status === "error") result.errors += 1;
    } catch (error) {
      result.errors += 1;
      try {
        const listedWithThread = listed as { threadId?: unknown };
        const listedThreadId = typeof listedWithThread.threadId === "string" ? listedWithThread.threadId : null;
        const record = await insertOrderCogsRecord(supabase, {
          mailbox_email: mailbox,
          gmail_message_id: listed.id,
          gmail_thread_id: listedThreadId,
          gmail_history_id: null,
          from_email: null,
          to_email: null,
          subject: null,
          sent_at: null,
          snippet: null,
          attachment_names: [],
          email_url: null,
          extracted_customer_name: null,
          extracted_order_amount: null,
          extracted_order_number: null,
          extraction_confidence: 0,
          matched_job_id: null,
          matched_quote_id: null,
          matched_bookkeeping_entry_id: null,
          match_status: "error",
          match_confidence: 0,
          match_reason: null,
          processed_at: new Date().toISOString(),
          applied_at: null,
          error_message: error instanceof Error ? error.message : "Order COGS email failed to process.",
          raw: {}
        });
        records.push(record);
      } catch {
        // Keep the batch moving even if the error record cannot be persisted.
      }
    }
  }

  return result;
}
