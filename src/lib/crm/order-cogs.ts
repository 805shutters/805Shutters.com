import { SupabaseClient } from "@supabase/supabase-js";
import { CrmAuthError } from "@/lib/crm/auth";
import { recordCrmActivity } from "@/lib/crm/backend";
import { advanceQuoteStatus } from "@/lib/crm/quote-builder";
import { getBrokeredGmailAccessToken } from "@/lib/crm/installation-invoices";
import { sendTelegramMessage } from "@/lib/notify/telegram";
import { advanceJobStatus, statusRank } from "@/lib/quote/lifecycle";
import { CrmJobStatus, CrmQuoteStatus, CrmOrderCogsEmail, CrmOrderCogsEmailStatus } from "@/lib/crm/types";

type CrmSupabaseClient = SupabaseClient;
type CrmActor = { email: string; userId?: string };

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

type GmailAttachmentResponse = {
  data?: string;
};

type OrderCogsCandidate = {
  source: "entry" | "quote" | "job";
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  customerAddress: string | null;
  productInterest: string | null;
  jobId: string | null;
  quoteId: string | null;
  entryId: string | null;
  quoteNumber: string | null;
  quoteLabel: string | null;
  totalAmount: number;
  cogsAmount: number;
  soldDate: string | null;
  manufacturerName: string | null;
  manufacturerOrderRef: string | null;
  manufacturerOrderUrl: string | null;
  meta: Record<string, unknown>;
};

export type ExtractedOrderCogs = {
  customerName: string | null;
  orderAmount: number | null;
  orderNumber: string | null;
  confidence: number;
  amountConfidence: number;
  text: string;
  /** Vendor name when the email matched a vendor-specific parser (e.g. "Norman"). */
  manufacturer?: string | null;
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
  days?: number;
  target?: ProcessOrderCogsTarget;
  /** Archive (remove from inbox) each recognized order email after processing. Default on. */
  archive?: boolean;
};

export type ProcessOrderCogsTarget = {
  customerName: string;
  jobId?: string | null;
  quoteId?: string | null;
  entryId?: string | null;
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
  archived: number;
  archiveErrors: number;
  telegramSent: number;
  telegramErrors: number;
  /** Emails whose job was actually marked ordered + COGS written. */
  applied?: number;
  /** Sum added by this pull, even when the optional audit-log write fails. */
  addedCogs?: number;
  /** Emails whose audit-log record could not be saved (core job update still applied). */
  recordErrors?: number;
  /** First processing error (diagnostic), if any. */
  lastError?: string;
  /** First audit-log insert failure (diagnostic), if any. */
  lastInsertError?: string;
  targetCogsTotal?: number | null;
  emails: CrmOrderCogsEmail[];
};

function defaultQuery(mailbox: string) {
  return `in:inbox to:${mailbox} newer_than:30d -label:Processed (from:normanusa.com OR from:orders@onyxshutters.com OR from:lotusblind.com OR subject:"Lotus & Windoware")`;
}

export function customerOrderCogsQuery(mailbox: string, customerName: string, days = 14) {
  const safeDays = Math.min(Math.max(Math.trunc(days) || 14, 1), 60);
  const nameTerms = customerName
    .replace(/[^a-z0-9&.' -]/gi, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1)
    .map((token) => `"${token.replace(/"/g, "")}"`)
    .join(" ");
  const vendorTerms = `(from:normanusa.com OR from:orders@onyxshutters.com OR from:lotusblind.com OR subject:"Lotus & Windoware")`;
  return `in:anywhere to:${mailbox} newer_than:${safeDays}d ${vendorTerms}${nameTerms ? ` ${nameTerms}` : ""}`;
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

  if (!clientId || !clientSecret || !refreshToken) return null;
  return { clientId, clientSecret, refreshToken };
}

async function refreshDirectAccessToken(credentials: { clientId: string; clientSecret: string; refreshToken: string }) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      refresh_token: credentials.refreshToken,
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

// Mirror the installation-invoice puller: use the direct GMAIL_805_* OAuth creds when
// present, otherwise fall back to the shared Gmail access-token broker (the 805 prod
// setup only has the broker configured). Same token is reused for read + archive.
async function getGmailAccessToken(mailbox: string) {
  const credentials = googleOAuthCredentials();
  if (credentials) return refreshDirectAccessToken(credentials);

  const brokered = await getBrokeredGmailAccessToken(mailbox);
  if (brokered) return brokered;

  throw new CrmAuthError(
    503,
    "805 Gmail order COGS puller is missing OAuth credentials. Set GMAIL_805_CLIENT_ID/SECRET/REFRESH_TOKEN (Gmail scope) or the GMAIL_ACCESS_TOKEN_BROKER_URL/SECRET broker."
  );
}

/**
 * Archive a processed message (remove it from the inbox). Needs Gmail `modify` scope —
 * a readonly token returns 403, which the caller swallows so processing never fails just
 * because archiving is unavailable.
 */
async function ensureProcessedLabel(accessToken: string) {
  const labels = await gmailJson<{ labels?: Array<{ id?: string; name?: string }> }>(
    accessToken,
    "https://gmail.googleapis.com/gmail/v1/users/me/labels"
  );
  const existing = labels.labels?.find((label) => label.name?.toLowerCase() === "processed");
  if (existing?.id) return existing.id;

  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/labels", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Processed", labelListVisibility: "labelShow", messageListVisibility: "show" })
  });
  if (!response.ok) throw new CrmAuthError(502, `Gmail Processed label creation failed with ${response.status}.`);
  const created = (await response.json()) as { id?: string };
  if (!created.id) throw new CrmAuthError(502, "Gmail did not return an id for the Processed label.");
  return created.id;
}

async function fileProcessedGmailMessage(accessToken: string, messageId: string, processedLabelId: string) {
  const response = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/modify`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ addLabelIds: [processedLabelId], removeLabelIds: ["INBOX"] })
    }
  );
  if (!response.ok) {
    throw new CrmAuthError(
      response.status === 403 ? 403 : 502,
      `Gmail archive failed with ${response.status}${response.status === 403 ? " (token lacks gmail.modify scope)" : ""}.`
    );
  }
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

async function getGmailAttachment(accessToken: string, messageId: string, attachmentId: string) {
  const url = new URL(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`
  );
  return gmailJson<GmailAttachmentResponse>(accessToken, url.toString());
}

function decodeBody(data?: string) {
  if (!data) return "";
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

function decodeBodyBuffer(data: string) {
  const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, "base64");
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

function collectMessageParts(part?: GmailMessagePart, output: GmailMessagePart[] = []) {
  if (!part) return output;
  output.push(part);
  for (const child of part.parts || []) collectMessageParts(child, output);
  return output;
}

function pdfAttachmentParts(part?: GmailMessagePart) {
  return collectMessageParts(part).filter((candidate) => {
    const filename = candidate.filename?.trim() || "";
    return Boolean(filename) && (/\.pdf$/i.test(filename) || candidate.mimeType === "application/pdf");
  });
}

async function parsePdfText(buffer: Buffer) {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText({ first: 4, pageJoiner: "\n" });
    return result.text.replace(/\r/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  } finally {
    await parser.destroy();
  }
}

async function extractPdfText(accessToken: string, message: GmailMessage) {
  const texts: string[] = [];
  const errors: string[] = [];
  for (const part of pdfAttachmentParts(message.payload)) {
    const filename = part.filename?.trim() || "confirmation.pdf";
    try {
      const encoded = part.body?.data || (part.body?.attachmentId
        ? (await getGmailAttachment(accessToken, message.id, part.body.attachmentId)).data
        : null);
      if (!encoded) throw new Error("Attachment data was missing.");
      const text = await parsePdfText(decodeBodyBuffer(encoded));
      if (text) texts.push(`PDF Attachment: ${filename}\n${text}`);
    } catch (error) {
      errors.push(`${filename}: ${error instanceof Error ? error.message : "PDF extraction failed."}`);
    }
  }
  return { text: texts.join("\n\n"), errors };
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

// ---------------------------------------------------------------------------
// Vendor-specific parsers. The generic extractor above handles unknown vendors;
// vendors that send a fixed, labeled layout get a dedicated parser that reads
// their structured fields. Add a vendor by writing an extractor + detector and
// registering both in `extractOrderCogs` below.
// ---------------------------------------------------------------------------

// Trailing tokens to peel off a Norman side mark to recover the bare customer name:
// product words ("Roller", "Shade") and re-order/unit markers ("2", "#2", "redo") —
// e.g. "Jim Derenthal Roller" -> "Jim Derenthal", "SAUCEDO MICHELLE 2" -> "SAUCEDO MICHELLE".
const NORMAN_SIDE_MARK_SUFFIX =
  /\s+(#?\d+|roller|shades?|shutters?|blinds?|honeycomb|cellular|romans?|sheers?|drapery|drapes?|drape|verticals?|wood|faux|aluminum|smartdrape|pleated|solar|zebra|dual|motorized|cordless|re-?do|remake|reorder)$/i;

/** Side marks read "<customer> <product...> <rev#>"; peel the trailing markers off. */
function stripProductSuffix(value: string) {
  let out = value.trim();
  while (NORMAN_SIDE_MARK_SUFFIX.test(out)) out = out.replace(NORMAN_SIDE_MARK_SUFFIX, "").trim();
  return out;
}

/** The next Norman label after a field's value (used to bound a captured value). */
const NORMAN_FIELD_STOP =
  /\||WO\s*#|PO\s*#|Side\s*Mark|Ship\s*Via|Payment\s*Terms|Customer\s*ID|Company\s*Name|Owner\s*Name|Phone|Order\s*Date|Sales\s*Amount|Additional\s*Tariff|Freight\s*Handling|Processing\s*Fee|Tax\s*Amount|Miscellaneous\s*Fee|Total\s*Amount|Checked\s*Out|Ship\s*To|Special\s*Delivery|Pricing|Contact|Online\s*Order\s*Confirmation/;

/** Value of a labeled field on the whitespace-collapsed Norman email body. */
function normanLabeledValue(text: string, label: RegExp) {
  const source = `${label.source}\\s*[:#-]?\\s*(.+?)\\s*(?=${NORMAN_FIELD_STOP.source}|$)`;
  return text.match(new RegExp(source, "i"))?.[1]?.trim() || null;
}

export function isNormanOrderEmail(text: string, fromEmail: string | null) {
  const haystack = `${fromEmail || ""} ${text}`.toLowerCase();
  return haystack.includes("normanusa.com") || haystack.includes("norman window fashions");
}

/**
 * Parse a Norman "Online Order Confirmation". The end-customer is the dealer's
 * side mark (PO# / Side Mark), NOT the Company/Owner fields (those are the dealer,
 * SNS Interiors / Ken Hill). COGS is the Total Amount — the full landed cost the
 * dealer pays Norman (product + freight + processing fee + tax). WO# is the order ref.
 */
export function extractNormanOrderCogs(text: string): ExtractedOrderCogs {
  const normalized = text.replace(/\s+/g, " ").trim();

  const sideMark =
    normanLabeledValue(normalized, /\bPO\s*#/) || normanLabeledValue(normalized, /\bSide\s*Mark/);
  const customerName = sideMark ? stripProductSuffix(sideMark) || null : null;

  const totalMatch = normalized.match(/\bTotal\s*Amount\b\s*[:#-]?\s*\$?\s*([\d,]+(?:\.\d{2})?)/i);
  const orderAmount = moneyFrom(totalMatch?.[1]);

  const woMatch =
    normalized.match(/\bWO\s*#\s*[:#-]?\s*([A-Za-z0-9-]{4,})/i) ||
    normalized.match(/\bOrder\s*(?:No\.?|Number|#)\s*[:#-]?\s*([A-Za-z0-9-]{4,})/i) ||
    normalized.match(/\b(\d{8,})\s+Confirmation\s+Sheet\b/i);
  const orderNumber = woMatch?.[1] || null;

  const confidence = Math.min(1, (customerName ? 0.6 : 0) + (orderAmount ? 0.35 : 0) + (orderNumber ? 0.05 : 0));

  return {
    customerName,
    orderAmount,
    orderNumber,
    confidence,
    amountConfidence: orderAmount ? 0.95 : 0,
    text: normalized,
    manufacturer: "Norman"
  };
}

function customerNameFromOnyx(value: string | null) {
  if (!value) return null;
  const withoutSideMarkPrefix = value.replace(/^[A-Z]{2,}\d+-/i, "").trim();
  const lastFirst = withoutSideMarkPrefix.match(/^([^,]{2,}),\s*(.+)$/);
  return cleanName(lastFirst ? `${lastFirst[2]} ${lastFirst[1]}` : withoutSideMarkPrefix);
}

export function isOnyxOrderEmail(text: string, fromEmail: string | null) {
  const haystack = `${fromEmail || ""} ${text}`.toLowerCase();
  return haystack.includes("orders@onyxshutters.com") || haystack.includes("onyx shutters");
}

/** Parse Onyx order confirmations. Grand Total is COGS; Proposed Deposit is not. */
export function extractOnyxOrderCogs(text: string): ExtractedOrderCogs {
  const normalized = text.replace(/\s+/g, " ").trim();
  const poMatch = normalized.match(/\bPO\s*No\.?\s*[:#-]?\s*(.+?)\s+(?=Side\s*Mark|Total\s*Area|Grand\s*Total|Proposed\s*Deposit|$)/i);
  const sideMarkMatch = normalized.match(/\bSide\s*Mark\s*[:#-]?\s*(.+?)\s+(?=Total\s*Area|Grand\s*Total|Proposed\s*Deposit|$)/i);
  const amountMatch = normalized.match(/\bGrand\s*Total\s*[:#-]?\s*\$?\s*([\d,]+(?:\.\d{2})?)/i);
  const orderMatch = normalized.match(/\bOrder\s*(?:No\.?|Number|#)\s*[:#-]?\s*([A-Za-z0-9-]{4,})/i);
  const customerName = customerNameFromOnyx(poMatch?.[1] || sideMarkMatch?.[1] || null);
  const orderAmount = moneyFrom(amountMatch?.[1]);
  const orderNumber = orderMatch?.[1] || null;
  const confidence = Math.min(1, (customerName ? 0.6 : 0) + (orderAmount ? 0.35 : 0) + (orderNumber ? 0.05 : 0));
  return {
    customerName,
    orderAmount,
    orderNumber,
    confidence,
    amountConfidence: orderAmount ? 0.98 : 0,
    text: normalized,
    manufacturer: "Onyx"
  };
}

export function isLotusOrderEmail(text: string, fromEmail: string | null) {
  const haystack = `${fromEmail || ""} ${text}`.toLowerCase();
  return haystack.includes("lotusblind.com") || haystack.includes("lotus & windoware");
}

function lotusSideMark(text: string) {
  const explicit = text.match(/\bSide\s*Mark\s*[:#-]\s*([A-Za-z][A-Za-z&.' -]{2,80}?)(?=\s+(?:Qty\s+Ordered|Item|Description|Subtotal|Total)\b|$)/i)?.[1];
  if (explicit) return cleanName(explicit);

  const tableValue = text.match(/\bSide\s*Mark\b\s+(.+?)\s+(?=Qty\s+Ordered\b)/i)?.[1]
    ?.replace(/^#?\d+\s+/, "")
    .replace(/^(?:UPS|FedEx)\s+Ground\b/i, "")
    .replace(/^(?:Will\s+Call|Customer\s+Pickup)\b/i, "")
    .trim();
  return tableValue ? cleanName(tableValue) : null;
}

/** Parse Lotus & Windoware sales-order PDFs. Total is the full dealer COGS. */
export function extractLotusOrderCogs(text: string): ExtractedOrderCogs {
  const normalized = text.replace(/\s+/g, " ").trim();
  const totalMatches = Array.from(normalized.matchAll(/\bTotal\s*[:#-]?\s*\$\s*([\d,]+(?:\.\d{2})?)/gi));
  const orderAmount = moneyFrom(totalMatches.at(-1)?.[1]);
  const orderNumber = normalized.match(/\bSales\s+Order(?:\s*[#:_-]|_)+\s*(SO\d{4,})\b/i)?.[1] || null;
  const customerName = lotusSideMark(normalized);
  const confidence = Math.min(1, (customerName ? 0.6 : 0) + (orderAmount ? 0.35 : 0) + (orderNumber ? 0.05 : 0));

  return {
    customerName,
    orderAmount,
    orderNumber,
    confidence,
    amountConfidence: orderAmount ? 0.98 : 0,
    text: normalized,
    manufacturer: "Lotus & Windoware"
  };
}

/** Dispatch to a vendor-specific parser when recognised; else the generic parser. */
export function extractOrderCogs(text: string, fromEmail: string | null): ExtractedOrderCogs {
  if (isLotusOrderEmail(text, fromEmail)) return extractLotusOrderCogs(text);
  if (isOnyxOrderEmail(text, fromEmail)) return extractOnyxOrderCogs(text);
  if (isNormanOrderEmail(text, fromEmail)) return extractNormanOrderCogs(text);
  return extractOrderCogsFromText(text);
}

function normalizeTokens(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 1);
}

function customerEmailTokens(value: string | null) {
  const localPart = value?.split("@")[0] || "";
  const ignored = new Set(["admin", "billing", "contact", "hello", "info", "office", "sales", "service", "support"]);
  return normalizeTokens(localPart).filter((token) => token.length > 2 && !ignored.has(token));
}

function candidateNameTokens(candidate: Pick<OrderCogsCandidate, "customerName" | "customerEmail">) {
  return Array.from(new Set([...normalizeTokens(candidate.customerName), ...customerEmailTokens(candidate.customerEmail)]));
}

function tokenOverlapScore(extractedTokens: string[], candidateTokens: string[]) {
  if (!extractedTokens.length || !candidateTokens.length) return 0;
  const matched = extractedTokens.filter((token) => candidateTokens.includes(token)).length;
  return matched / Math.max(extractedTokens.length, candidateTokens.length);
}

function nameScore(extracted: string | null, candidate: Pick<OrderCogsCandidate, "customerName" | "customerEmail">) {
  if (!extracted) return 0;
  const extractedTokens = normalizeTokens(extracted);
  const customerNameTokens = normalizeTokens(candidate.customerName);
  const identityTokens = candidateNameTokens(candidate);

  // Email tokens may fill in a missing surname (for example, a CRM name of
  // "Jason" plus jason.chappelle@...), but an unrelated or joined local part
  // such as lplasmyer@... must not weaken an exact "Jack Plasmyer" name match.
  return Math.max(
    tokenOverlapScore(extractedTokens, customerNameTokens),
    tokenOverlapScore(extractedTokens, identityTokens)
  );
}

function roundMoney(value: number) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function addMoney(left: number, right: number) {
  return roundMoney((Number(left) || 0) + (Number(right) || 0));
}

function formatCogsMoney(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(roundMoney(value));
}

export function orderCogsTelegramText(input: {
  customerName: string;
  manufacturer: string | null | undefined;
  orderNumber: string | null | undefined;
  addedAmount: number;
  totalCogs: number;
}) {
  return [
    "✅ COGS processed",
    `Customer: ${input.customerName}`,
    `Manufacturer: ${input.manufacturer || "Unknown"}`,
    `Order: ${input.orderNumber || "Not provided"}`,
    `Added to COGS: ${formatCogsMoney(input.addedAmount)}`,
    `New total COGS: ${formatCogsMoney(input.totalCogs)}`
  ].join("\n");
}

function mergeOrderRefs(existing: string | null, next: string | null) {
  const refs = new Set(
    (existing || "")
      .split(/[,\n]+/)
      .map((ref) => ref.trim())
      .filter(Boolean)
  );
  if (next?.trim()) refs.add(next.trim());
  return refs.size ? Array.from(refs).join(", ") : null;
}

function recordMeta(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stringList(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => String(item || "").trim()).filter(Boolean);
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

function appendUnique(values: string[], next: string | null | undefined) {
  const out = new Set(values.map((value) => value.trim()).filter(Boolean));
  if (next?.trim()) out.add(next.trim());
  return Array.from(out);
}

function orderRefList(value: string | null) {
  return (value || "")
    .split(/[,\n]+/)
    .map((ref) => ref.trim())
    .filter(Boolean);
}

function candidateAppliedMessageIds(candidate: OrderCogsCandidate) {
  return [
    ...stringList(candidate.meta.orderCogsMessageIds),
    ...stringList(candidate.meta.orderCogsMessageId),
    ...stringList(candidate.meta.orderCogsGmailMessageIds)
  ];
}

function candidateAppliedOrderRefs(candidate: OrderCogsCandidate) {
  return [
    ...stringList(candidate.meta.orderCogsOrderRefs),
    ...stringList(candidate.meta.orderCogsOrderRef),
    ...orderRefList(candidate.manufacturerOrderRef)
  ];
}

function orderKey(manufacturer: string | null | undefined, orderNumber: string | null | undefined) {
  return manufacturer && orderNumber ? `${manufacturer.toLowerCase()}:${orderNumber.toLowerCase()}` : null;
}

function candidateAppliedOrderKeys(candidate: OrderCogsCandidate) {
  return stringList(candidate.meta.orderCogsOrderKeys).map((value) => value.toLowerCase());
}

function candidateAlreadyApplied(candidate: OrderCogsCandidate, extraction: ExtractedOrderCogs, gmailMessageId: string) {
  if (candidateAppliedMessageIds(candidate).includes(gmailMessageId)) return true;
  const key = orderKey(extraction.manufacturer, extraction.orderNumber);
  if (key && candidateAppliedOrderKeys(candidate).includes(key)) return true;
  return Boolean(
    extraction.orderNumber &&
      roundMoney(candidate.cogsAmount) > 0 &&
      (!candidate.manufacturerName || candidate.manufacturerName === extraction.manufacturer) &&
      candidateAppliedOrderRefs(candidate).includes(extraction.orderNumber)
  );
}

function nextOrderCogsMeta(
  candidate: OrderCogsCandidate,
  extraction: ExtractedOrderCogs,
  message: GmailMessage,
  previousCogsAmount: number,
  nextCogsAmount: number,
  now: string
) {
  const applications = Array.isArray(candidate.meta.orderCogsApplications)
    ? candidate.meta.orderCogsApplications.filter((item) => typeof item === "object" && item)
    : [];
  const nextApplication = {
    gmailMessageId: message.id,
    manufacturer: extraction.manufacturer || null,
    orderNumber: extraction.orderNumber,
    orderAmount: extraction.orderAmount,
    previousCogsAmount,
    nextCogsAmount,
    appliedAt: now
  };

  return {
    ...candidate.meta,
    orderCogsSource: "gmail",
    orderCogsMessageId: message.id,
    orderCogsMessageIds: appendUnique(candidateAppliedMessageIds(candidate), message.id),
    orderCogsOrderRefs: appendUnique(candidateAppliedOrderRefs(candidate), extraction.orderNumber),
    orderCogsOrderKeys: appendUnique(candidateAppliedOrderKeys(candidate), orderKey(extraction.manufacturer, extraction.orderNumber)),
    orderCogsAppliedAt: now,
    orderCogsPreviousAmount: previousCogsAmount,
    orderCogsAddedAmount: extraction.orderAmount,
    orderCogsTotalAmount: nextCogsAmount,
    orderCogsApplications: [...applications, nextApplication].slice(-20)
  };
}

function normalizePhone(value: string | null) {
  return (value || "").replace(/\D/g, "");
}

function meaningfulAddressTokens(value: string | null) {
  return (value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 2 && !["usa", "unit", "apt", "the"].includes(token));
}

function candidateReferenceScore(extraction: ExtractedOrderCogs, candidate: OrderCogsCandidate) {
  const text = extraction.text.toLowerCase();
  let score = 0;

  if (candidate.quoteNumber && text.includes(candidate.quoteNumber.toLowerCase())) score += 0.45;
  if (candidate.quoteLabel && text.includes(` ${candidate.quoteLabel.toLowerCase()} `)) score += 0.25;

  const phone = normalizePhone(candidate.customerPhone);
  if (phone && extraction.text.replace(/\D/g, "").includes(phone)) score += 0.35;

  const addressTokens = meaningfulAddressTokens(candidate.customerAddress);
  if (addressTokens.length >= 2) {
    const matched = addressTokens.filter((token) => text.includes(token)).length;
    if (matched >= Math.min(3, addressTokens.length)) score += 0.35;
  }

  if (candidate.productInterest && text.includes(candidate.productInterest.toLowerCase())) score += 0.15;
  return score;
}

function matchOrderCogs(extraction: ExtractedOrderCogs, candidates: OrderCogsCandidate[]): OrderCogsMatch {
  if (!extraction.customerName) {
    return { candidate: null, status: "unmatched", confidence: 0, reason: "No customer name was found in the order email." };
  }

  const ranked = candidates
    .map((candidate) => {
      const score = nameScore(extraction.customerName, candidate);
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
    const tied = ranked.filter((item) => top.confidence - item.confidence < 0.04);
    const signalMatches = tied
      .map((item) => ({ ...item, referenceScore: candidateReferenceScore(extraction, item.candidate) }))
      .filter((item) => item.referenceScore >= 0.3)
      .sort((left, right) => right.referenceScore - left.referenceScore);
    if (signalMatches.length === 1 || (signalMatches[0] && signalMatches[1] && signalMatches[0].referenceScore - signalMatches[1].referenceScore >= 0.2)) {
      return {
        candidate: signalMatches[0].candidate,
        status: "matched",
        confidence: top.confidence,
        reason: `Matched customer name ${signalMatches[0].candidate.customerName} with an order email quote/customer signal.`
      };
    }
    return {
      candidate: top.candidate,
      status: "needs_review",
      confidence: top.confidence,
      reason: `Ambiguous customer match: ${top.candidate.customerName} and ${second.candidate.customerName}.`
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
      .select("id,quote_id,job_id,customer_name,sold_date,total_amount,cogs_amount,manufacturer_name,manufacturer_order_ref,manufacturer_order_url,meta")
      .in("source", ["crm_quote", "legacy_sheet", "manual"])
      .limit(1000),
    supabase
      .from("crm_quotes")
      .select("id,job_id,status,quote_number,quote_label,quote_total,materials_cost,sold_at,approved_at,ordered_at,manufacturer_name,manufacturer_order_ref,manufacturer_order_url,meta")
      .in("status", ["sold", "approved", "ordered", "received", "installed", "invoiced", "paid"])
      .limit(500),
    supabase
      .from("crm_jobs")
      .select("id,customer_name,status,estimated_total,phone,email,address,product_interest,meta")
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
    manufacturer_name: string | null;
    manufacturer_order_ref: string | null;
    manufacturer_order_url: string | null;
    meta?: Record<string, unknown> | null;
  }>;
  const quotes = (quotesResult.data || []) as Array<{
    id: string;
    job_id: string;
    quote_number: string | null;
    quote_label: string | null;
    quote_total: number;
    materials_cost: number;
    sold_at: string | null;
    approved_at: string | null;
    ordered_at: string | null;
    manufacturer_name: string | null;
    manufacturer_order_ref: string | null;
    manufacturer_order_url: string | null;
    meta?: Record<string, unknown> | null;
  }>;
  const jobs = (jobsResult.data || []) as Array<{
    id: string;
    customer_name: string;
    estimated_total: number;
    phone: string | null;
    email: string | null;
    address: string | null;
    product_interest: string | null;
    meta?: Record<string, unknown> | null;
  }>;
  const jobsById = new Map(jobs.map((job) => [job.id, job]));
  const entryQuoteIds = new Set(entries.map((entry) => entry.quote_id).filter(Boolean));
  const entryJobIds = new Set(entries.map((entry) => entry.job_id).filter(Boolean));
  const quoteJobIds = new Set(quotes.map((quote) => quote.job_id).filter(Boolean));
  const candidates: OrderCogsCandidate[] = [];

  for (const entry of entries) {
    candidates.push({
      source: "entry",
      customerName: entry.customer_name,
      customerEmail: jobsById.get(String(entry.job_id || ""))?.email || null,
      customerPhone: jobsById.get(String(entry.job_id || ""))?.phone || null,
      customerAddress: jobsById.get(String(entry.job_id || ""))?.address || null,
      productInterest: jobsById.get(String(entry.job_id || ""))?.product_interest || null,
      jobId: entry.job_id,
      quoteId: entry.quote_id,
      entryId: entry.id,
      quoteNumber: null,
      quoteLabel: null,
      totalAmount: Number(entry.total_amount) || 0,
      cogsAmount: Number(entry.cogs_amount) || 0,
      soldDate: entry.sold_date,
      manufacturerName: entry.manufacturer_name || null,
      manufacturerOrderRef: entry.manufacturer_order_ref || null,
      manufacturerOrderUrl: entry.manufacturer_order_url || null,
      meta: recordMeta(entry.meta)
    });
  }

  for (const quote of quotes) {
    if (entryQuoteIds.has(quote.id)) continue;
    const job = jobsById.get(quote.job_id);
    if (!job?.customer_name) continue;
    candidates.push({
      source: "quote",
      customerName: job.customer_name,
      customerEmail: job.email || null,
      customerPhone: job.phone || null,
      customerAddress: job.address || null,
      productInterest: job.product_interest || null,
      jobId: quote.job_id,
      quoteId: quote.id,
      entryId: null,
      quoteNumber: quote.quote_number || null,
      quoteLabel: quote.quote_label || null,
      totalAmount: Number(quote.quote_total) || 0,
      cogsAmount: Number(quote.materials_cost) || 0,
      soldDate: quote.sold_at || quote.approved_at || quote.ordered_at || null,
      manufacturerName: quote.manufacturer_name || null,
      manufacturerOrderRef: quote.manufacturer_order_ref || null,
      manufacturerOrderUrl: quote.manufacturer_order_url || null,
      meta: recordMeta(quote.meta)
    });
  }

  for (const job of jobs) {
    if (entryJobIds.has(job.id) || quoteJobIds.has(job.id)) continue;
    candidates.push({
      source: "job",
      customerName: job.customer_name,
      customerEmail: job.email || null,
      customerPhone: job.phone || null,
      customerAddress: job.address || null,
      productInterest: job.product_interest || null,
      jobId: job.id,
      quoteId: null,
      entryId: null,
      quoteNumber: null,
      quoteLabel: null,
      totalAmount: Number(job.estimated_total) || 0,
      cogsAmount: 0,
      soldDate: null,
      manufacturerName: null,
      manufacturerOrderRef: null,
      manufacturerOrderUrl: null,
      meta: recordMeta(job.meta)
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

/**
 * Mark the matched candidate's job as "ordered" (the order confirmation means the
 * order was placed with the manufacturer). The quote is the source of truth: advancing
 * it stamps `ordered_at`, forward-drives the job, logs activity, and safely recalcs
 * (recalc never touches COGS). Legacy/manual ledger rows with no quote advance the job
 * directly. Forward-only — never drags a received/installed record back to "ordered".
 */
async function markCandidateOrdered(
  supabase: CrmSupabaseClient,
  candidate: OrderCogsCandidate,
  actor: CrmActor
) {
  if (candidate.quoteId) {
    const { data: quoteRow } = await supabase
      .from("crm_quotes")
      .select("status")
      .eq("id", candidate.quoteId)
      .maybeSingle();
    const status = (quoteRow as { status?: CrmQuoteStatus } | null)?.status;
    if (status && statusRank(status) < statusRank("ordered")) {
      await advanceQuoteStatus(supabase, candidate.quoteId, "ordered", actor);
    }
    return;
  }

  if (candidate.jobId) {
    const { data: jobRow } = await supabase
      .from("crm_jobs")
      .select("status")
      .eq("id", candidate.jobId)
      .maybeSingle();
    const current = (jobRow as { status?: CrmJobStatus } | null)?.status;
    if (!current) return;
    const next = advanceJobStatus(current, "ordered");
    if (next === current) return;
    const { error } = await supabase.from("crm_jobs").update({ status: next }).eq("id", candidate.jobId);
    if (error) throw new CrmAuthError(502, "Order email matched, but the job could not be marked ordered.");
    await recordCrmActivity(supabase, actor, {
      entityType: "job",
      entityId: candidate.jobId,
      action: "status.ordered",
      metadata: { via: "order-cogs-email", from: current, to: next }
    });
  }
}

async function applyOrderCogs(
  supabase: CrmSupabaseClient,
  candidate: OrderCogsCandidate,
  extraction: ExtractedOrderCogs,
  message: GmailMessage,
  actor: CrmActor
): Promise<{ cogsApplied: boolean; previousCogsAmount: number; nextCogsAmount: number }> {
  const amount = extraction.orderAmount;
  if (!amount) throw new CrmAuthError(400, "Order COGS amount is required.");
  const previousCogsAmount = roundMoney(candidate.cogsAmount);
  const nextCogsAmount = addMoney(previousCogsAmount, amount);
  const now = new Date().toISOString();
  const manufacturerOrderRef = mergeOrderRefs(candidate.manufacturerOrderRef, extraction.orderNumber);
  const manufacturerName = candidate.manufacturerName && extraction.manufacturer && candidate.manufacturerName !== extraction.manufacturer
    ? "Other"
    : extraction.manufacturer || candidate.manufacturerName;
  const manufacturerOrderUrl = gmailUrl(message) || candidate.manufacturerOrderUrl;
  const meta = nextOrderCogsMeta(candidate, extraction, message, previousCogsAmount, nextCogsAmount, now);
  const patch = {
    cogs_amount: nextCogsAmount,
    ...(manufacturerOrderRef ? { manufacturer_order_ref: manufacturerOrderRef } : {}),
    ...(manufacturerName ? { manufacturer_name: manufacturerName } : {}),
    ...(manufacturerOrderUrl ? { manufacturer_order_url: manufacturerOrderUrl } : {}),
    meta
  };
  const rememberAppliedCogs = () => {
    candidate.cogsAmount = nextCogsAmount;
    candidate.manufacturerName = manufacturerName || null;
    candidate.manufacturerOrderRef = manufacturerOrderRef;
    candidate.manufacturerOrderUrl = manufacturerOrderUrl || null;
    candidate.meta = meta;
  };

  if (candidate.entryId) {
    const { error } = await supabase.from("crm_quote_bookkeeping_entries").update(patch).eq("id", candidate.entryId);
    if (error) throw new CrmAuthError(502, "Order email matched, but COGS could not be updated.");
    await markCandidateOrdered(supabase, candidate, actor);
    rememberAppliedCogs();
    return { cogsApplied: true, previousCogsAmount, nextCogsAmount };
  }

  if (candidate.quoteId) {
    const { error: quoteError } = await supabase
      .from("crm_quotes")
      .update({
        materials_cost: nextCogsAmount,
        ...(manufacturerOrderRef ? { manufacturer_order_ref: manufacturerOrderRef } : {}),
        ...(manufacturerName ? { manufacturer_name: manufacturerName } : {}),
        ...(manufacturerOrderUrl ? { manufacturer_order_url: manufacturerOrderUrl } : {}),
        meta
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
          ...meta,
          orderCogsSource: "gmail"
        }
      },
      { onConflict: "quote_id" }
    );
    if (error) throw new CrmAuthError(502, "Order email matched, but quote bookkeeping COGS could not be saved.");
    await markCandidateOrdered(supabase, candidate, actor);
    rememberAppliedCogs();
    return { cogsApplied: true, previousCogsAmount, nextCogsAmount };
  }

  // Matched a bare sold job with no ledger target: still mark it ordered, but the COGS
  // has nowhere to land — surface it for manual entry instead of dropping the email.
  await markCandidateOrdered(supabase, candidate, actor);
  return { cogsApplied: false, previousCogsAmount, nextCogsAmount: previousCogsAmount };
}

async function alreadyAppliedOrderCogsRecord(supabase: CrmSupabaseClient, gmailMessageId: string) {
  const { data, error } = await supabase
    .from("crm_order_cogs_emails")
    .select("id,applied_at,match_status")
    .eq("gmail_message_id", gmailMessageId)
    .maybeSingle();
  if (error) return false;
  const record = data as { applied_at?: string | null; match_status?: CrmOrderCogsEmailStatus } | null;
  return Boolean(record?.applied_at && record.match_status === "matched");
}

async function insertOrderCogsRecord(
  supabase: CrmSupabaseClient,
  input: Omit<CrmOrderCogsEmail, "id" | "created_at" | "updated_at">
) {
  // Manual upsert keyed on gmail_message_id instead of PostgREST `onConflict`: the
  // latter requires the unique-constraint target to be present in the schema cache,
  // which fails (PGRST205) right after the table is provisioned. Read + insert/update
  // uses only the (already-cached) table.
  const { data: existing } = await supabase
    .from("crm_order_cogs_emails")
    .select("id")
    .eq("gmail_message_id", input.gmail_message_id)
    .maybeSingle();

  const writer = existing?.id
    ? supabase.from("crm_order_cogs_emails").update(input).eq("id", existing.id)
    : supabase.from("crm_order_cogs_emails").insert(input);

  const { data, error } = await writer.select("*").single();
  if (error || !data) {
    throw new CrmAuthError(502, `Order COGS email record could not be saved: ${error?.message || "no row returned"}`);
  }
  return data as CrmOrderCogsEmail;
}

async function recordOrderCogsAuditFallback(
  supabase: CrmSupabaseClient,
  actor: CrmActor,
  input: Omit<CrmOrderCogsEmail, "id" | "created_at" | "updated_at">,
  error: unknown
) {
  await recordCrmActivity(supabase, actor, {
    entityType: "order_cogs_email",
    action: "order_cogs_email_audit_fallback",
    after: input,
    metadata: {
      fallbackStore: "crm_activity_events",
      auditError: error instanceof Error ? error.message : String(error),
      orderCogsEmail: input
    }
  });
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
  const query = options.query || (options.target?.customerName
    ? customerOrderCogsQuery(mailbox, options.target.customerName, options.days)
    : process.env.ORDER_COGS_GMAIL_QUERY || defaultQuery(mailbox));
  const maxResults = maxResultsValue(options.maxResults);
  const actor: CrmActor = { email: options.actorEmail || "order-cogs" };
  const archiveEnabled = options.archive ?? process.env.ORDER_COGS_ARCHIVE !== "false";
  const allCandidates = await loadOrderCogsCandidates(supabase);
  const targetName = options.target?.customerName.trim().toLowerCase() || "";
  const candidates = options.target
    ? allCandidates.filter((candidate) => {
        const hasTargetId = Boolean(options.target?.jobId || options.target?.quoteId || options.target?.entryId);
        if (hasTargetId) {
          return Boolean(
            (options.target?.jobId && candidate.jobId === options.target.jobId) ||
            (options.target?.quoteId && candidate.quoteId === options.target.quoteId) ||
            (options.target?.entryId && candidate.entryId === options.target.entryId)
          );
        }
        return candidate.customerName.trim().toLowerCase() === targetName;
      })
    : allCandidates;
  const accessToken = options.messageIds?.length ? null : await getGmailAccessToken(mailbox);
  const processedLabelId = archiveEnabled && accessToken ? await ensureProcessedLabel(accessToken) : null;
  const messages = options.messageIds?.length
    ? options.messageIds.map((id) => ({ id }))
    : await listGmailMessages(accessToken as string, query, maxResults);
  const records: CrmOrderCogsEmail[] = [];
  const result: ProcessOrderCogsResult = {
    mailbox,
    query,
    scanned: messages.length,
    processed: 0,
    matched: 0,
    needsReview: 0,
    unmatched: 0,
    skipped: 0,
    errors: 0,
    archived: 0,
    archiveErrors: 0,
    telegramSent: 0,
    telegramErrors: 0,
    emails: records
  };

  for (const listed of messages) {
    try {
      const alreadyApplied = await alreadyAppliedOrderCogsRecord(supabase, listed.id);
      if (alreadyApplied) {
        result.processed += 1;
        result.skipped += 1;
        if (archiveEnabled && accessToken) {
          try {
            await fileProcessedGmailMessage(accessToken, listed.id, processedLabelId as string);
            result.archived += 1;
          } catch {
            result.archiveErrors += 1;
          }
        }
        continue;
      }

      const message = accessToken ? await getGmailMessage(accessToken, listed.id) : ({ id: listed.id } as GmailMessage);
      const headers = message.payload?.headers;
      const bodyText = [message.snippet || "", ...collectMessageText(message.payload)].join("\n");
      const fromEmail = getHeader(headers, "From");
      const subject = getHeader(headers, "Subject") || "";
      const orderIdentityText = `${subject} ${bodyText}`;
      const pdf = accessToken && (
        isNormanOrderEmail(orderIdentityText, fromEmail) || isLotusOrderEmail(orderIdentityText, fromEmail)
      )
        ? await extractPdfText(accessToken, message)
        : { text: "", errors: [] as string[] };
      const text = [subject, bodyText, pdf.text].filter(Boolean).join("\n");
      const extraction = extractOrderCogs(text, fromEmail);
      const match = matchOrderCogs(extraction, candidates);
      const review = reviewStatus(extraction, match);
      const now = new Date().toISOString();

      // A confident match flips the matched job to "ordered" and writes COGS. If the
      // match has no ledger row (a bare sold job), the job is still marked ordered but
      // the COGS lands in "needs_review" for manual entry rather than being lost.
      let cogsApplied = false;
      let appliedTotalCogs: number | null = null;
      const duplicateApplied = Boolean(
        review.canApply && match.candidate && candidateAlreadyApplied(match.candidate, extraction, message.id)
      );
      if (duplicateApplied) {
        cogsApplied = false;
      } else if (review.canApply && match.candidate) {
        const applied = await applyOrderCogs(supabase, match.candidate, extraction, message, actor);
        cogsApplied = applied.cogsApplied;
        appliedTotalCogs = applied.cogsApplied ? applied.nextCogsAmount : null;
      }
      if (cogsApplied && match.candidate && extraction.orderAmount && appliedTotalCogs !== null) {
        const telegram = await sendTelegramMessage({
          text: orderCogsTelegramText({
            customerName: match.candidate.customerName,
            manufacturer: extraction.manufacturer,
            orderNumber: extraction.orderNumber,
            addedAmount: extraction.orderAmount,
            totalCogs: appliedTotalCogs
          })
        });
        if (telegram.sent) result.telegramSent += 1;
        else if (telegram.error) result.telegramErrors += 1;
      }
      const status = duplicateApplied ? "skipped" : review.canApply && !cogsApplied ? "needs_review" : review.status;
      const reason = duplicateApplied
        ? "This Gmail order was already applied to the matched job/quote."
        : review.canApply && !cogsApplied
          ? `${review.reason} Job marked ordered, but no ledger row exists yet — enter COGS manually.`
          : review.reason;

      // The audit/review log (crm_order_cogs_emails) is best-effort and OFF the critical
      // path: the job's status + COGS were already written above to tables that the
      // schema cache always has. A failure here (e.g. the new table's PostgREST schema
      // cache is stale) must not undo the applied COGS or block archiving.
      const auditInput = {
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
        match_status: status,
        match_confidence: match.confidence,
        match_reason: reason,
        processed_at: now,
        applied_at: review.canApply && cogsApplied ? now : null,
        error_message: null,
        raw: {
          actorEmail: options.actorEmail || null,
          duplicateApplied,
          pdfExtractionErrors: pdf.errors,
          textPreview: extraction.text.slice(0, 1000)
        }
      } satisfies Omit<CrmOrderCogsEmail, "id" | "created_at" | "updated_at">;
      try {
        const record = await insertOrderCogsRecord(supabase, auditInput);
        records.push(record);
      } catch (recordError) {
        result.recordErrors = (result.recordErrors || 0) + 1;
        if (!result.lastInsertError) {
          result.lastInsertError = recordError instanceof Error ? recordError.message : String(recordError);
        }
        await recordOrderCogsAuditFallback(supabase, actor, auditInput, recordError);
      }

      result.processed += 1;
      if (status === "matched") result.matched += 1;
      if (status === "needs_review") result.needsReview += 1;
      if (status === "unmatched") result.unmatched += 1;
      if (status === "skipped") result.skipped += 1;
      if (status === "error") result.errors += 1;
      if (review.canApply && cogsApplied) result.applied = (result.applied || 0) + 1;
      if (review.canApply && cogsApplied && extraction.orderAmount) {
        result.addedCogs = addMoney(result.addedCogs || 0, extraction.orderAmount);
      }

      // Archive ONLY emails we actually applied or proved were already applied.
      // needs_review / unmatched stay in the inbox so a human can act on them — never
      // archive an unresolved order out of sight (especially while the audit-log table
      // is unavailable and can't track them). Archive failure never fails the pull.
      if (archiveEnabled && accessToken && ((review.canApply && cogsApplied && status === "matched") || duplicateApplied)) {
        try {
          await fileProcessedGmailMessage(accessToken, message.id, processedLabelId as string);
          result.archived += 1;
        } catch {
          result.archiveErrors += 1;
        }
      }
    } catch (error) {
      result.errors += 1;
      if (!result.lastError) result.lastError = error instanceof Error ? error.message : String(error);
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
      } catch (insertError) {
        // Keep the batch moving even if the error record cannot be persisted.
        if (!result.lastInsertError) {
          result.lastInsertError = insertError instanceof Error ? insertError.message : String(insertError);
        }
      }
    }
  }

  if (options.target) {
    result.targetCogsTotal = candidates.length ? roundMoney(candidates[0].cogsAmount) : null;
  }

  return result;
}
