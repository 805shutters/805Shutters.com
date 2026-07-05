import { SupabaseClient } from "@supabase/supabase-js";
import { CrmAuthError } from "@/lib/crm/auth";
import {
  CrmBookkeepingEntry,
  CrmInstallationInvoiceEmail,
  CrmInstallationInvoiceEmailStatus,
  CrmJob,
  CrmJobStatus,
  CrmQuote,
  CrmQuoteStatus
} from "@/lib/crm/types";

type CrmSupabaseClient = SupabaseClient;

export const DEFAULT_INSTALLATION_INVOICE_MAILBOX = "805shutters@gmail.com";
const LEGACY_INSTALLATION_INVOICE_MAILBOX = "805@805shutters.com";
const DEFAULT_MAX_RESULTS = 50;
const INVOICE_CANDIDATE_LIMIT = 5000;
const AUTO_APPLY_MIN_NAME_CONFIDENCE = 0.78;
const AUTO_APPLY_MIN_AMOUNT_CONFIDENCE = 0.7;
const INSTALLATION_COMPLETE_QUOTE_STATUS: CrmQuoteStatus = "invoiced";
const PAYMENT_COLLECTION_JOB_STATUS: CrmJobStatus = "invoiced";
const SERVICE_REPORT_COMPLETE_QUOTE_STATUS: CrmQuoteStatus = "installed";
const SERVICE_REPORT_COMPLETE_JOB_STATUS: CrmJobStatus = "installed";
const PAYMENT_COLLECTION_NEXT_ACTION = "Collect payment";

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
  size?: number;
};

type InvoiceCandidateSource = "entry" | "quote" | "job";

export type InstallationInvoiceCandidate = {
  source: InvoiceCandidateSource;
  customerName: string;
  jobId: string | null;
  quoteId: string | null;
  entryId: string | null;
  totalAmount: number;
  cogsAmount: number;
  salesOwner: string | null;
  soldDate: string | null;
  existingInstallationAmount: number;
  existingInstallationMatchStatus: string | null;
};

export type ExtractedInstallationInvoice = {
  customerName: string | null;
  invoiceAmount: number | null;
  invoiceNumber: string | null;
  confidence: number;
  amountConfidence: number;
  text: string;
};

export type ExtractedCompletedServiceReport = {
  isCompletedServiceReport: boolean;
  customerName: string | null;
  jobNumber: string | null;
  codAmount: number | null;
  paymentMethod: string | null;
  reportDate: string | null;
  confidence: number;
  text: string;
};

export type InstallationInvoiceMatch = {
  candidate: InstallationInvoiceCandidate | null;
  status: CrmInstallationInvoiceEmailStatus;
  confidence: number;
  reason: string;
};

export type ProcessInstallationInvoiceOptions = {
  mailbox?: string;
  query?: string;
  maxResults?: number;
  messageIds?: string[];
  actorEmail?: string;
};

export type ProcessInstallationInvoiceResult = {
  mailbox: string;
  query: string;
  scanned: number;
  processed: number;
  matched: number;
  serviceReports: number;
  needsReview: number;
  unmatched: number;
  skipped: number;
  errors: number;
  auditTableAvailable: boolean;
  auditError: string | null;
  invoices: CrmInstallationInvoiceEmail[];
};

type EntryRow = Pick<
  CrmBookkeepingEntry,
  | "id"
  | "quote_id"
  | "job_id"
  | "customer_name"
  | "sold_date"
  | "total_amount"
  | "cogs_amount"
  | "sales_owner"
  | "installation_invoice_amount"
  | "installation_match_status"
>;

type QuoteRow = Pick<
  CrmQuote,
  "id" | "job_id" | "status" | "quote_total" | "materials_cost" | "sold_by" | "sold_at" | "approved_at" | "ordered_at"
>;

type JobRow = Pick<CrmJob, "id" | "customer_name" | "status" | "estimated_total">;
type WorkflowPatch = {
  quotePatch: Record<string, unknown> | null;
  jobPatch: Record<string, unknown> | null;
};

export function buildInstallationInvoiceGmailQuery(mailbox: string) {
  return `to:${mailbox} newer_than:30d ("MTS Installations" OR "Service Report" OR "work reported complete" OR "COD collected" OR invoice OR "amount due" OR "balance due" OR "invoice total")`;
}

export function normalizeInstallationInvoiceMailbox(value?: string | null) {
  const mailbox = (value || DEFAULT_INSTALLATION_INVOICE_MAILBOX).trim().toLowerCase();
  if (!mailbox || mailbox === LEGACY_INSTALLATION_INVOICE_MAILBOX) return DEFAULT_INSTALLATION_INVOICE_MAILBOX;
  return mailbox;
}

export function resolveInstallationInvoiceGmailQuery(mailbox: string, value?: string | null) {
  const query = value?.trim();
  if (!query || query.includes(`to:${LEGACY_INSTALLATION_INVOICE_MAILBOX}`)) {
    return buildInstallationInvoiceGmailQuery(mailbox);
  }
  return query;
}

function envValue(keys: string[]) {
  return keys.map((key) => process.env[key]).find((value) => value && value.trim());
}

function normalizedMailbox(value?: string) {
  return normalizeInstallationInvoiceMailbox(value || process.env.INSTALLATION_INVOICE_MAILBOX);
}

function maxResultsValue(value?: number) {
  const configured = value ?? Number(process.env.INSTALLATION_INVOICE_GMAIL_MAX_RESULTS || DEFAULT_MAX_RESULTS);
  if (!Number.isFinite(configured)) return DEFAULT_MAX_RESULTS;
  return Math.min(Math.max(Math.trunc(configured), 1), 100);
}

function googleOAuthCredentials() {
  const clientId = envValue(["GMAIL_805_CLIENT_ID", "GOOGLE_CLIENT_ID", "GOOGLE_CALENDAR_CLIENT_ID"]);
  const clientSecret = envValue(["GMAIL_805_CLIENT_SECRET", "GOOGLE_CLIENT_SECRET", "GOOGLE_CALENDAR_CLIENT_SECRET"]);
  const refreshToken = envValue(["GMAIL_805_REFRESH_TOKEN", "GMAIL_REFRESH_TOKEN", "GOOGLE_CALENDAR_REFRESH_TOKEN"]);

  if (!clientId || !clientSecret || !refreshToken) {
    return null;
  }

  return { clientId, clientSecret, refreshToken };
}

function gmailAccessTokenBrokerConfig() {
  const url = envValue(["GMAIL_ACCESS_TOKEN_BROKER_URL", "INSTALLATION_INVOICE_GMAIL_ACCESS_TOKEN_BROKER_URL"]);
  const secret = envValue(["GMAIL_ACCESS_TOKEN_BROKER_SECRET", "INSTALLATION_INVOICE_GMAIL_ACCESS_TOKEN_BROKER_SECRET"]);

  if (!url || !secret) return null;
  return { url, secret };
}

export function hasInstallationInvoiceGmailAuth() {
  return Boolean(googleOAuthCredentials() || gmailAccessTokenBrokerConfig());
}

// The broker reads an `action` field, but its exact vocabulary isn't documented in this
// repo (the broker is an external service). Pin it with GMAIL_ACCESS_TOKEN_BROKER_ACTION
// if known; otherwise try the likely names and use whichever returns a token.
const BROKER_ACTION_CANDIDATES = [
  "access-token",
  "get-access-token",
  "getAccessToken",
  "access_token",
  "accessToken",
  "token",
  "get-token",
  "getToken",
  "mint-access-token",
  "mint",
  "gmail-access-token",
  "refresh"
];

async function requestBrokerToken(url: string, secret: string, action: string, mailbox: string) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${secret}`
    },
    body: JSON.stringify({ action, emailAddress: mailbox })
  });

  const data = (await response.json().catch(() => null)) as {
    success?: boolean;
    accessToken?: string;
    access_token?: string;
    token?: string;
    error?: string;
  } | null;

  const token = data?.accessToken || data?.access_token || data?.token || null;
  return { ok: response.ok, status: response.status, token, error: data?.error };
}

export async function getBrokeredGmailAccessToken(mailbox: string) {
  const broker = gmailAccessTokenBrokerConfig();
  if (!broker) return null;

  const pinned = envValue(["GMAIL_ACCESS_TOKEN_BROKER_ACTION", "INSTALLATION_INVOICE_GMAIL_ACCESS_TOKEN_BROKER_ACTION"]);
  const actions = pinned ? [pinned] : BROKER_ACTION_CANDIDATES;

  let lastDetail = "no broker action accepted";
  for (const action of actions) {
    let result: Awaited<ReturnType<typeof requestBrokerToken>>;
    try {
      result = await requestBrokerToken(broker.url, broker.secret, action, mailbox);
    } catch (err) {
      lastDetail = err instanceof Error ? err.message : String(err);
      continue;
    }

    if (result.ok && result.token) return result.token;

    lastDetail = result.error || `HTTP ${result.status}`;
    // Keep trying only while the broker is rejecting the *action* name. Any other
    // failure (auth, scope, mailbox) means the action was accepted — surface it.
    if (!/unsupported|unknown|invalid|not.?supported|action/i.test(lastDetail)) break;
  }

  throw new CrmAuthError(502, `805 Gmail token broker failed: ${lastDetail}`);
}

async function getGmailAccessToken() {
  const credentials = googleOAuthCredentials();
  if (!credentials) {
    const accessToken = await getBrokeredGmailAccessToken(normalizedMailbox());
    if (accessToken) return accessToken;

    throw new CrmAuthError(
      503,
      "805 Gmail invoice puller is missing OAuth credentials. Set GMAIL_805_CLIENT_ID, GMAIL_805_CLIENT_SECRET, and GMAIL_805_REFRESH_TOKEN or GMAIL_ACCESS_TOKEN_BROKER_URL and GMAIL_ACCESS_TOKEN_BROKER_SECRET."
    );
  }

  const { clientId, clientSecret, refreshToken } = credentials;
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

  const data = (await response.json().catch(() => null)) as {
    access_token?: string;
    scope?: string;
    error?: string;
    error_description?: string;
  } | null;

  if (!response.ok || !data?.access_token) {
    const detail = data?.error_description || data?.error || `HTTP ${response.status}`;
    throw new CrmAuthError(502, `805 Gmail token refresh failed: ${detail}`);
  }

  const scopes = data.scope || "";
  if (scopes && !scopes.includes("gmail.readonly") && !scopes.includes("gmail.modify") && !scopes.includes("mail.google.com")) {
    throw new CrmAuthError(
      403,
      "805 Gmail OAuth token does not include Gmail read access. Recreate the refresh token with https://www.googleapis.com/auth/gmail.readonly."
    );
  }

  return data.access_token;
}

async function gmailFetch<T>(path: string, accessToken: string) {
  const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new CrmAuthError(502, `Gmail API request failed: ${response.status} ${await response.text()}`);
  }

  return (await response.json()) as T;
}

async function listGmailMessageIds(accessToken: string, query: string, maxResults: number) {
  const messages: Array<{ id: string; threadId?: string }> = [];
  let pageToken: string | undefined;
  let pages = 0;

  while (messages.length < maxResults && pages < 5) {
    const params = new URLSearchParams({
      q: query,
      maxResults: String(Math.min(100, maxResults - messages.length))
    });
    if (pageToken) params.set("pageToken", pageToken);

    const data = await gmailFetch<GmailListResponse>(`messages?${params.toString()}`, accessToken);
    messages.push(...(data.messages || []));
    pageToken = data.nextPageToken;
    pages += 1;
    if (!pageToken) break;
  }

  return messages;
}

async function getGmailMessage(accessToken: string, messageId: string) {
  const params = new URLSearchParams({ format: "full" });
  return gmailFetch<GmailMessage>(`messages/${encodeURIComponent(messageId)}?${params.toString()}`, accessToken);
}

async function getGmailAttachment(accessToken: string, messageId: string, attachmentId: string) {
  return gmailFetch<GmailAttachmentResponse>(
    `messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`,
    accessToken
  );
}

function decodeBase64Url(data: string) {
  const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, "base64").toString("utf8");
}

function decodeBase64UrlBuffer(data: string) {
  const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, "base64");
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
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function collectParts(part: GmailMessagePart | undefined, output: GmailMessagePart[] = []) {
  if (!part) return output;
  output.push(part);
  for (const child of part.parts || []) collectParts(child, output);
  return output;
}

function getHeader(headers: GmailHeader[] | undefined, name: string) {
  return headers?.find((header) => header.name.toLowerCase() === name.toLowerCase())?.value || "";
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

function attachmentNames(message: GmailMessage) {
  return collectParts(message.payload)
    .map((part) => part.filename?.trim())
    .filter((filename): filename is string => Boolean(filename));
}

function pdfAttachmentParts(message: GmailMessage) {
  return collectParts(message.payload).filter((part) => {
    const filename = part.filename?.trim() || "";
    return Boolean(filename) && (/\.pdf$/i.test(filename) || part.mimeType === "application/pdf");
  });
}

async function parsePdfText(buffer: Buffer) {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: buffer });

  try {
    const result = await parser.getText({ first: 3, pageJoiner: "\n" });
    return cleanPdfText(result.text);
  } finally {
    await parser.destroy();
  }
}

function cleanPdfText(value: string) {
  return value
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function extractPdfAttachmentText(input: {
  accessToken: string;
  messageId: string;
  message: GmailMessage;
}) {
  const pdfParts = pdfAttachmentParts(input.message);
  const texts: string[] = [];
  const errors: string[] = [];

  for (const part of pdfParts) {
    const filename = part.filename?.trim() || "invoice.pdf";

    try {
      const data =
        part.body?.data ||
        (part.body?.attachmentId
          ? (await getGmailAttachment(input.accessToken, input.messageId, part.body.attachmentId)).data
          : null);
      if (!data) continue;

      const text = await parsePdfText(decodeBase64UrlBuffer(data));
      if (text) texts.push(`PDF Attachment: ${filename}\n${text}`);
    } catch (error) {
      errors.push(`${filename}: ${error instanceof Error ? error.message : "PDF extraction failed"}`);
    }
  }

  return { text: texts.join("\n\n"), errors };
}

function cleanText(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.replace(/\s+/g, " ").trim();
  return trimmed || null;
}

function roundMoney(value: unknown) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return 0;
  return Math.round(Math.max(amount, 0) * 100) / 100;
}

function parseMoney(value: string | undefined) {
  if (!value) return null;
  const numeric = value.replace(/[^0-9.-]/g, "");
  if (!numeric) return null;
  const parsed = Number.parseFloat(numeric);
  return Number.isFinite(parsed) ? roundMoney(parsed) : null;
}

function extractMoneyAfterLabel(text: string) {
  const money = "\\$?\\s*([0-9]{1,3}(?:,[0-9]{3})+|[0-9]+)(?:\\.([0-9]{2}))?";
  const labels = [
    "final\\s+invoice\\s+(?:price|amount)",
    "invoice\\s+(?:total|amount)",
    "amount\\s+due",
    "balance\\s+due",
    "total\\s+due",
    "grand\\s+total",
    "total"
  ];
  const pattern = new RegExp(`\\b(?:${labels.join("|")})\\b\\s*[:\\-]?\\s*${money}`, "gi");
  const matches = Array.from(text.matchAll(pattern))
    .map((match) => parseMoney(`${match[1] || ""}${match[2] ? `.${match[2]}` : ""}`))
    .filter((amount): amount is number => amount !== null && amount > 0);

  if (!matches.length) return null;
  return matches[matches.length - 1];
}

function extractStandaloneMoney(text: string) {
  const matches = Array.from(text.matchAll(/\$\s*([0-9]{1,3}(?:,[0-9]{3})+|[0-9]+)(?:\.([0-9]{2}))?/g))
    .map((match) => parseMoney(`${match[1] || ""}${match[2] ? `.${match[2]}` : ""}`))
    .filter((amount): amount is number => amount !== null && amount > 0);

  if (matches.length === 1) return { amount: matches[0], confidence: 0.75 };
  if (matches.length > 1) return { amount: Math.max(...matches), confidence: 0.55 };
  return { amount: null, confidence: 0 };
}

export function normalizeCustomerName(value: string | null | undefined) {
  return (value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function searchableText(value: string) {
  return ` ${normalizeCustomerName(value)} `;
}

function firstNameEquivalent(left: string, right: string) {
  if (left === right) return true;
  const aliases: Record<string, string[]> = {
    ken: ["kenneth"],
    kenneth: ["ken"]
  };
  return aliases[left]?.includes(right) || aliases[right]?.includes(left) || false;
}

function equivalentPersonNameScore(extractedCustomerName: string | null | undefined, candidateName: string) {
  const extracted = normalizeCustomerName(extractedCustomerName);
  const candidate = normalizeCustomerName(candidateName);
  const extractedParts = extracted.split(" ").filter(Boolean);
  const candidateParts = candidate.split(" ").filter(Boolean);
  if (extractedParts.length < 2 || candidateParts.length < 2) return 0;

  const extractedFirst = extractedParts[0];
  const extractedLast = extractedParts[extractedParts.length - 1];
  const candidateFirst = candidateParts[0];
  const candidateLast = candidateParts[candidateParts.length - 1];

  if (extractedLast === candidateLast && firstNameEquivalent(extractedFirst, candidateFirst)) return 0.94;
  return 0;
}

function extractInvoiceNumber(text: string) {
  const match = text.match(/\binvoice\s*(?:#|number|no\.?)?\s*[:#-]?\s*([A-Z0-9][A-Z0-9-]{2,})\b/i);
  return cleanText(match?.[1]);
}

function extractExplicitCustomerName(text: string) {
  const match = text.match(
    /\bcustomer\s+name\s*:\s*([\s\S]{2,140}?)(?=\s+(?:technician|service\s+type|invoice|date|due\s+date|bill\s+to|ship\s+to)\s*:|$)/i
  );
  return cleanText(match?.[1]);
}

function isPlausibleInvoiceCustomerName(value: string | null) {
  if (!value) return false;
  return !/\b(?:invoice|installations?|quickbooks|shutters|customer|balance|payment|new\s+mexico)\b/i.test(value);
}

function extractGreetingCustomerName(text: string) {
  const match = text.match(/\bDear\s+([A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){1,4})\s*,/);
  const value = cleanText(match?.[1]);
  return isPlausibleInvoiceCustomerName(value) ? value : null;
}

function extractNamedCustomer(text: string) {
  const explicit = extractExplicitCustomerName(text);
  if (explicit) return explicit;

  const greeting = extractGreetingCustomerName(text);
  if (greeting) return greeting;

  const patterns = [
    /\b(?:customer|client|bill\s+to|invoice\s+for)\s*[:#-]?\s*([A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){1,4})\b/,
    /\bfor\s+([A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){1,4})\b/
  ];

  for (const line of text.split(/\n+/)) {
    for (const pattern of patterns) {
      const value = cleanText(line.match(pattern)?.[1]);
      if (isPlausibleInvoiceCustomerName(value)) return value;
    }
  }

  return null;
}

export function extractInstallationInvoiceDetails(input: {
  subject?: string | null;
  body?: string | null;
  attachmentText?: string | null;
  attachmentNames?: string[];
}): ExtractedInstallationInvoice {
  const subject = input.subject || "";
  const body = input.body || "";
  const attachmentText = input.attachmentText || "";
  const attachments = (input.attachmentNames || []).join("\n");
  const text = `${subject}\n${body}\n${attachmentText}\n${attachments}`.replace(/\r/g, "\n");
  const labeledAmount = extractMoneyAfterLabel(text);
  const fallbackAmount = labeledAmount === null ? extractStandaloneMoney(text) : null;
  const invoiceAmount = labeledAmount ?? fallbackAmount?.amount ?? null;
  const amountConfidence = labeledAmount !== null ? 0.92 : fallbackAmount?.confidence || 0;
  const customerName = extractNamedCustomer(text);

  return {
    customerName,
    invoiceAmount,
    invoiceNumber: extractInvoiceNumber(text),
    confidence: Math.max(amountConfidence, customerName ? 0.7 : 0),
    amountConfidence,
    text
  };
}

function serviceReportSourceText(input: {
  subject?: string | null;
  body?: string | null;
  attachmentText?: string | null;
  attachmentNames?: string[];
}) {
  return `${input.subject || ""}\n${input.body || ""}\n${input.attachmentText || ""}\n${(input.attachmentNames || []).join("\n")}`.replace(/\r/g, "\n");
}

function trimServiceReportValue(value: string | null) {
  if (!value) return null;
  const nextLabelPattern =
    /\s+(?=ADDRESS\b|PHONE\b|ACCOUNT\b|JOB\s+NUMBER\b|INSTALLER\b|REPORT\s+DATE\b|CUSTOMER\s+SIGN-OFF\b|PAYMENT\s+METHOD\b|COD\b|ORIGINAL\s+COD\b)/i;
  return cleanText(value.split(nextLabelPattern)[0]);
}

function serviceReportLineValue(text: string, label: string, options: { exclude?: RegExp } = {}) {
  const labelPattern = new RegExp(`^${label}\\b\\s*:?\\s*(.*)$`, "i");
  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (options.exclude?.test(line)) continue;

    if (new RegExp(`^${label}$`, "i").test(line)) {
      return trimServiceReportValue(lines[index + 1] || null);
    }

    const inline = line.match(labelPattern);
    if (inline) {
      const value = trimServiceReportValue(inline[1] || null);
      if (value) return value;
    }
  }

  return null;
}

function extractServiceReportJobNumber(text: string) {
  const explicit = text.match(/\bjob\s*#\s*([0-9][0-9-]{3,})\b/i);
  if (explicit?.[1]) return cleanText(explicit[1]);

  const labeled = serviceReportLineValue(text, "JOB\\s+NUMBER");
  const match = labeled?.match(/\b([0-9][0-9-]{3,})\b/);
  return cleanText(match?.[1]);
}

function extractServiceReportCodAmount(text: string) {
  const match = text.match(
    /\bCOD\s+(?:collected\/due|collected|due)\s*:\s*(\$?\s*(?:[0-9]{1,3}(?:,[0-9]{3})+|[0-9]+)(?:\.[0-9]{2})?)/i
  );
  return parseMoney(match?.[1]);
}

function extractServiceReportPaymentMethod(text: string) {
  const match = text.match(/\bpayment\s+method\s*:\s*([^|\n]+)/i);
  return cleanText(match?.[1]);
}

export function extractCompletedServiceReportDetails(input: {
  subject?: string | null;
  body?: string | null;
  attachmentText?: string | null;
  attachmentNames?: string[];
}): ExtractedCompletedServiceReport {
  const text = serviceReportSourceText(input);
  const reportSignal = /\bservice\s+report\b/i.test(text) || /\bwork\s+reported\s+complete\b/i.test(text);
  const completeSignal =
    /\bwork\s+reported\s+complete\b/i.test(text) ||
    (/\bcomplete\b/i.test(text) && /\bcustomer\s+sign-?off\b/i.test(text));
  const isCompletedServiceReport = reportSignal && completeSignal;
  const customerName =
    serviceReportLineValue(text, "CUSTOMER", { exclude: /^CUSTOMER\s+SIGN-OFF\b/i }) ||
    extractNamedCustomer(text);
  const jobNumber = extractServiceReportJobNumber(text);
  const codAmount = extractServiceReportCodAmount(text);
  const confidence = isCompletedServiceReport
    ? Math.min(1, 0.65 + (customerName ? 0.2 : 0) + (jobNumber ? 0.1 : 0) + (codAmount ? 0.05 : 0))
    : 0;

  return {
    isCompletedServiceReport,
    customerName,
    jobNumber,
    codAmount,
    paymentMethod: extractServiceReportPaymentMethod(text),
    reportDate: serviceReportLineValue(text, "REPORT\\s+DATE"),
    confidence,
    text
  };
}

function scoreNameMatch(text: string, candidateName: string, extractedCustomerName?: string | null) {
  const candidate = normalizeCustomerName(candidateName);
  if (!candidate) return 0;
  const extracted = normalizeCustomerName(extractedCustomerName);
  const search = searchableText(text);
  const tokens = candidate.split(" ").filter((token) => token.length > 1);
  if (tokens.length < 2) return 0;

  if (extracted && extracted === candidate) return 0.99;
  const equivalentScore = equivalentPersonNameScore(extractedCustomerName, candidateName);
  if (equivalentScore) return equivalentScore;
  if (search.includes(` ${candidate} `)) return 0.97;
  if (extracted && (extracted.includes(candidate) || candidate.includes(extracted))) return 0.9;

  const matchedTokens = tokens.filter((token) => search.includes(` ${token} `)).length;
  if (matchedTokens === tokens.length) return 0.86;
  if (tokens.length >= 3 && matchedTokens >= tokens.length - 1) return 0.72;
  return 0;
}

export function matchInstallationInvoiceToCandidate(input: {
  text: string;
  extractedCustomerName?: string | null;
  candidates: InstallationInvoiceCandidate[];
}): InstallationInvoiceMatch {
  const ranked = input.candidates
    .map((candidate) => {
      const priority = candidate.source === "entry" ? 0.02 : candidate.source === "quote" ? 0.01 : 0;
      const confidence = Math.min(
        scoreNameMatch(input.text, candidate.customerName, input.extractedCustomerName) + priority,
        1
      );
      return { candidate, confidence };
    })
    .filter((item) => item.confidence > 0)
    .sort((left, right) => right.confidence - left.confidence);

  const top = ranked[0];
  if (!top || top.confidence < AUTO_APPLY_MIN_NAME_CONFIDENCE) {
    return {
      candidate: null,
      status: "unmatched",
      confidence: top?.confidence || 0,
      reason: "No sold customer name matched the invoice email."
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

  return {
    candidate: top.candidate,
    status: "matched",
    confidence: top.confidence,
    reason: `Matched customer name ${top.candidate.customerName}.`
  };
}

async function loadInvoiceCandidates(supabase: CrmSupabaseClient) {
  const [entriesResult, quotesResult, jobsResult] = await Promise.all([
    supabase
      .from("crm_quote_bookkeeping_entries")
      .select(
        "id,quote_id,job_id,customer_name,sold_date,total_amount,cogs_amount,sales_owner,installation_invoice_amount,installation_match_status"
      )
      .order("sold_date", { ascending: false, nullsFirst: false })
      .limit(INVOICE_CANDIDATE_LIMIT),
    supabase
      .from("crm_quotes")
      .select("id,job_id,status,quote_total,materials_cost,sold_by,sold_at,approved_at,ordered_at")
      .in("status", ["sold", "approved", "ordered", "received", "installed", "invoiced", "paid"])
      .limit(500),
    supabase
      .from("crm_jobs")
      .select("id,customer_name,status,estimated_total")
      .in("status", ["sold", "ordered", "installed", "invoiced", "closed"])
      .limit(500)
  ]);

  if (entriesResult.error || quotesResult.error || jobsResult.error) {
    throw new CrmAuthError(502, "CRM data failed to load for installation invoice matching.");
  }

  const entries = (entriesResult.data || []) as EntryRow[];
  const quotes = (quotesResult.data || []) as QuoteRow[];
  const jobs = (jobsResult.data || []) as JobRow[];
  const jobsById = new Map(jobs.map((job) => [job.id, job]));
  const entryQuoteIds = new Set(entries.map((entry) => entry.quote_id).filter(Boolean));
  const entryJobIds = new Set(entries.map((entry) => entry.job_id).filter(Boolean));
  const quoteJobIds = new Set(quotes.map((quote) => quote.job_id).filter(Boolean));

  const candidates: InstallationInvoiceCandidate[] = [];

  for (const entry of entries) {
    candidates.push({
      source: "entry",
      customerName: entry.customer_name,
      jobId: entry.job_id,
      quoteId: entry.quote_id,
      entryId: entry.id,
      totalAmount: roundMoney(entry.total_amount),
      cogsAmount: roundMoney(entry.cogs_amount),
      salesOwner: entry.sales_owner,
      soldDate: entry.sold_date,
      existingInstallationAmount: roundMoney(entry.installation_invoice_amount),
      existingInstallationMatchStatus: entry.installation_match_status
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
      totalAmount: roundMoney(quote.quote_total),
      cogsAmount: roundMoney(quote.materials_cost),
      salesOwner: quote.sold_by,
      soldDate: quote.sold_at || quote.approved_at || quote.ordered_at || null,
      existingInstallationAmount: 0,
      existingInstallationMatchStatus: null
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
      totalAmount: roundMoney(job.estimated_total),
      cogsAmount: 0,
      salesOwner: null,
      soldDate: null,
      existingInstallationAmount: 0,
      existingInstallationMatchStatus: null
    });
  }

  return candidates;
}

function targetedCustomerSearchTerm(customerName: string | null) {
  const parts = normalizeCustomerName(customerName).split(" ").filter(Boolean);
  const last = parts.at(-1);
  return last && last.length >= 3 ? last : null;
}

async function loadTargetedInvoiceCandidates(supabase: CrmSupabaseClient, customerName: string | null) {
  const term = targetedCustomerSearchTerm(customerName);
  if (!term) return [];

  const [entriesResult, jobsResult] = await Promise.all([
    supabase
      .from("crm_quote_bookkeeping_entries")
      .select(
        "id,quote_id,job_id,customer_name,sold_date,total_amount,cogs_amount,sales_owner,installation_invoice_amount,installation_match_status"
      )
      .ilike("customer_name", `%${term}%`)
      .limit(100),
    supabase
      .from("crm_jobs")
      .select("id,customer_name,status,estimated_total")
      .ilike("customer_name", `%${term}%`)
      .in("status", ["sold", "ordered", "installed", "invoiced", "closed"])
      .limit(100)
  ]);

  if (entriesResult.error || jobsResult.error) return [];

  const entries = (entriesResult.data || []) as EntryRow[];
  const jobs = (jobsResult.data || []) as JobRow[];
  const entryJobIds = new Set(entries.map((entry) => entry.job_id).filter(Boolean));
  const candidates: InstallationInvoiceCandidate[] = entries.map((entry) => ({
    source: "entry",
    customerName: entry.customer_name,
    jobId: entry.job_id,
    quoteId: entry.quote_id,
    entryId: entry.id,
    totalAmount: roundMoney(entry.total_amount),
    cogsAmount: roundMoney(entry.cogs_amount),
    salesOwner: entry.sales_owner,
    soldDate: entry.sold_date,
    existingInstallationAmount: roundMoney(entry.installation_invoice_amount),
    existingInstallationMatchStatus: entry.installation_match_status
  }));

  for (const job of jobs) {
    if (entryJobIds.has(job.id)) continue;
    candidates.push({
      source: "job",
      customerName: job.customer_name,
      jobId: job.id,
      quoteId: null,
      entryId: null,
      totalAmount: roundMoney(job.estimated_total),
      cogsAmount: 0,
      salesOwner: null,
      soldDate: null,
      existingInstallationAmount: 0,
      existingInstallationMatchStatus: null
    });
  }

  return candidates;
}

function normalizeOwner(value: string | null | undefined) {
  const lower = String(value || "").toLowerCase();
  if (lower.includes("jessica")) return "jessica";
  if (lower.includes("mike")) return "mike";
  return null;
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

function isSameMoney(left: number, right: number) {
  return Math.abs(roundMoney(left) - roundMoney(right)) < 0.01;
}

function metadataRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function buildInstallationInvoiceWorkflowPatches(input: {
  currentQuote?: { status?: string | null; installed_at?: string | null; meta?: unknown } | null;
  currentJob?: { status?: string | null; meta?: unknown } | null;
  messageId: string;
  threadId?: string | null;
  actorEmail?: string;
  now: string;
}): WorkflowPatch {
  const workflowMeta = {
    installationInvoiceSource: "gmail",
    installationInvoiceMessageId: input.messageId,
    installationInvoiceThreadId: input.threadId || null,
    installationInvoiceWorkflowAppliedBy: input.actorEmail || "installation-invoice-puller",
    installationInvoiceWorkflowAppliedAt: input.now
  };
  const quoteStatus = String(input.currentQuote?.status || "");
  const quoteIsTerminal = quoteStatus === "paid" || quoteStatus === "archived" || quoteStatus === "lost";
  const jobStatus = String(input.currentJob?.status || "");
  const jobIsTerminal = jobStatus === "closed" || jobStatus === "lost";

  return {
    quotePatch: input.currentQuote
      ? {
          status: quoteIsTerminal ? quoteStatus : INSTALLATION_COMPLETE_QUOTE_STATUS,
          installed_at: input.currentQuote.installed_at || input.now,
          meta: {
            ...metadataRecord(input.currentQuote.meta),
            ...workflowMeta,
            installationInvoicePreviousQuoteStatus: quoteStatus || null
          }
        }
      : null,
    jobPatch: input.currentJob
      ? {
          ...(jobIsTerminal
            ? {}
            : {
                status: PAYMENT_COLLECTION_JOB_STATUS,
                next_action: PAYMENT_COLLECTION_NEXT_ACTION
              }),
          meta: {
            ...metadataRecord(input.currentJob.meta),
            ...workflowMeta,
            installationInvoicePreviousJobStatus: jobStatus || null
          }
        }
      : null
  };
}

export function buildCompletedServiceReportWorkflowPatches(input: {
  currentQuote?: { status?: string | null; installed_at?: string | null; meta?: unknown } | null;
  currentJob?: { status?: string | null; meta?: unknown } | null;
  serviceReport: ExtractedCompletedServiceReport;
  messageId: string;
  threadId?: string | null;
  actorEmail?: string;
  now: string;
}): WorkflowPatch {
  const workflowMeta = {
    completedServiceReportSource: "gmail",
    completedServiceReportMessageId: input.messageId,
    completedServiceReportThreadId: input.threadId || null,
    completedServiceReportJobNumber: input.serviceReport.jobNumber,
    completedServiceReportCodAmount: input.serviceReport.codAmount,
    completedServiceReportPaymentMethod: input.serviceReport.paymentMethod,
    completedServiceReportAppliedBy: input.actorEmail || "installation-email-puller",
    completedServiceReportAppliedAt: input.now
  };
  const quoteStatus = String(input.currentQuote?.status || "");
  const quoteAlreadyComplete = ["installed", "invoiced", "paid", "archived", "lost"].includes(quoteStatus);
  const jobStatus = String(input.currentJob?.status || "");
  const jobAlreadyComplete = ["installed", "invoiced", "closed", "lost"].includes(jobStatus);
  const jobIsTerminal = jobStatus === "closed" || jobStatus === "lost";

  return {
    quotePatch: input.currentQuote
      ? {
          status: quoteAlreadyComplete ? quoteStatus : SERVICE_REPORT_COMPLETE_QUOTE_STATUS,
          installed_at: input.currentQuote.installed_at || input.now,
          meta: {
            ...metadataRecord(input.currentQuote.meta),
            ...workflowMeta,
            completedServiceReportPreviousQuoteStatus: quoteStatus || null
          }
        }
      : null,
    jobPatch: input.currentJob
      ? {
          ...(jobIsTerminal
            ? {}
            : {
                status: jobAlreadyComplete ? jobStatus : SERVICE_REPORT_COMPLETE_JOB_STATUS,
                next_action: PAYMENT_COLLECTION_NEXT_ACTION
              }),
          meta: {
            ...metadataRecord(input.currentJob.meta),
            ...workflowMeta,
            completedServiceReportPreviousJobStatus: jobStatus || null
          }
        }
      : null
  };
}

function autoApplyDecision(
  match: InstallationInvoiceMatch,
  extraction: ExtractedInstallationInvoice
): { status: CrmInstallationInvoiceEmailStatus; reason: string; canApply: boolean } {
  if (!match.candidate) return { status: match.status, reason: match.reason, canApply: false };
  if (match.status !== "matched") return { status: "needs_review", reason: match.reason, canApply: false };
  if (!extraction.invoiceAmount || extraction.amountConfidence < AUTO_APPLY_MIN_AMOUNT_CONFIDENCE) {
    return {
      status: "needs_review",
      reason: "Customer matched, but the final invoice amount was not reliable enough to auto-apply.",
      canApply: false
    };
  }
  if (match.candidate.source === "job") {
    return {
      status: "needs_review",
      reason: "Customer matched a job without a bookkeeping row or sold quote; review before creating ledger data.",
      canApply: false
    };
  }

  const existingAmount = roundMoney(match.candidate.existingInstallationAmount);
  if (existingAmount > 0 && !isSameMoney(existingAmount, extraction.invoiceAmount)) {
    return {
      status: "needs_review",
      reason: `Existing installation invoice amount ${existingAmount.toFixed(2)} differs from pulled amount ${extraction.invoiceAmount.toFixed(2)}.`,
      canApply: false
    };
  }
  if (
    existingAmount > 0 &&
    isSameMoney(existingAmount, extraction.invoiceAmount) &&
    match.candidate.existingInstallationMatchStatus === "matched"
  ) {
    return {
      status: "skipped",
      reason: "Bookkeeping row already has this matched installation invoice amount.",
      canApply: false
    };
  }

  return { status: "matched", reason: match.reason, canApply: true };
}

function autoApplyCompletedServiceReportDecision(
  match: InstallationInvoiceMatch,
  serviceReport: ExtractedCompletedServiceReport
): { status: CrmInstallationInvoiceEmailStatus; reason: string; canApply: boolean } {
  if (!serviceReport.isCompletedServiceReport) {
    return { status: "skipped", reason: "Email is not a completed service report.", canApply: false };
  }
  if (!match.candidate) return { status: match.status, reason: match.reason, canApply: false };
  if (match.status !== "matched") return { status: "needs_review", reason: match.reason, canApply: false };
  if (!match.candidate.jobId && !match.candidate.quoteId) {
    return {
      status: "needs_review",
      reason: "Completed service report matched a bookkeeping row without a linked job or quote; review before applying.",
      canApply: false
    };
  }

  return {
    status: "matched",
    reason: serviceReport.jobNumber
      ? `Completed service report ${serviceReport.jobNumber} matched ${match.candidate.customerName}; moved job to Balance Needed.`
      : `Completed service report matched ${match.candidate.customerName}; moved job to Balance Needed.`,
    canApply: true
  };
}

async function advanceInstallationInvoiceWorkflow(
  supabase: CrmSupabaseClient,
  candidate: InstallationInvoiceCandidate,
  message: GmailMessage,
  actorEmail: string | undefined,
  now: string
) {
  let currentQuote: { status?: string | null; installed_at?: string | null; meta?: unknown } | null = null;
  let currentJob: { status?: string | null; meta?: unknown } | null = null;

  if (candidate.quoteId) {
    const { data, error } = await supabase
      .from("crm_quotes")
      .select("status,installed_at,meta")
      .eq("id", candidate.quoteId)
      .maybeSingle();
    if (error) {
      throw new CrmAuthError(502, "Installation invoice matched, but the quote status could not be loaded.");
    }
    currentQuote = data;
  }

  if (candidate.jobId) {
    const { data, error } = await supabase
      .from("crm_jobs")
      .select("status,meta")
      .eq("id", candidate.jobId)
      .maybeSingle();
    if (error) {
      throw new CrmAuthError(502, "Installation invoice matched, but the job status could not be loaded.");
    }
    currentJob = data;
  }

  const { quotePatch, jobPatch } = buildInstallationInvoiceWorkflowPatches({
    currentQuote,
    currentJob,
    messageId: message.id,
    threadId: message.threadId || null,
    actorEmail,
    now
  });

  if (quotePatch && candidate.quoteId) {
    const { error } = await supabase.from("crm_quotes").update(quotePatch).eq("id", candidate.quoteId);
    if (error) {
      throw new CrmAuthError(502, "Installation invoice matched, but the quote could not be moved to payment collection.");
    }
  }

  if (jobPatch && candidate.jobId) {
    const { error } = await supabase.from("crm_jobs").update(jobPatch).eq("id", candidate.jobId);
    if (error) {
      throw new CrmAuthError(502, "Installation invoice matched, but the job could not be moved to payment collection.");
    }
    await triggerReviewRequestForWorkflowPatch(supabase, candidate.jobId, currentJob?.status, jobPatch, actorEmail, "installation_invoice");
  }
}

async function triggerReviewRequestForWorkflowPatch(
  supabase: CrmSupabaseClient,
  jobId: string,
  previousStatus: string | null | undefined,
  jobPatch: Record<string, unknown>,
  actorEmail: string | undefined,
  source: string
) {
  try {
    const { isReviewRequestTransition, maybeSendReviewRequestForJob } = await import("@/lib/crm/review-request");
    if (!isReviewRequestTransition(previousStatus, jobPatch.status)) return;
    const actor = { email: actorEmail || "installation-email-puller" };
    const { activatePaymentPlanForJob } = await import("@/lib/crm/payment-plans");
    await activatePaymentPlanForJob(supabase, jobId, actor);
    await maybeSendReviewRequestForJob(supabase, jobId, actor, source);
  } catch (error) {
    console.error("review-request automation failed", error);
  }
}

async function advanceCompletedServiceReportWorkflow(
  supabase: CrmSupabaseClient,
  candidate: InstallationInvoiceCandidate,
  serviceReport: ExtractedCompletedServiceReport,
  message: GmailMessage,
  actorEmail: string | undefined,
  now: string
) {
  let currentQuote: { status?: string | null; installed_at?: string | null; meta?: unknown } | null = null;
  let currentJob: { status?: string | null; meta?: unknown } | null = null;

  if (candidate.quoteId) {
    const { data, error } = await supabase
      .from("crm_quotes")
      .select("status,installed_at,meta")
      .eq("id", candidate.quoteId)
      .maybeSingle();
    if (error) {
      throw new CrmAuthError(502, "Completed service report matched, but the quote status could not be loaded.");
    }
    currentQuote = data;
  }

  if (candidate.jobId) {
    const { data, error } = await supabase
      .from("crm_jobs")
      .select("status,meta")
      .eq("id", candidate.jobId)
      .maybeSingle();
    if (error) {
      throw new CrmAuthError(502, "Completed service report matched, but the job status could not be loaded.");
    }
    currentJob = data;
  }

  const { quotePatch, jobPatch } = buildCompletedServiceReportWorkflowPatches({
    currentQuote,
    currentJob,
    serviceReport,
    messageId: message.id,
    threadId: message.threadId || null,
    actorEmail,
    now
  });

  if (quotePatch && candidate.quoteId) {
    const { error } = await supabase.from("crm_quotes").update(quotePatch).eq("id", candidate.quoteId);
    if (error) {
      throw new CrmAuthError(502, "Completed service report matched, but the quote could not be marked installed.");
    }
  }

  if (jobPatch && candidate.jobId) {
    const { error } = await supabase.from("crm_jobs").update(jobPatch).eq("id", candidate.jobId);
    if (error) {
      throw new CrmAuthError(502, "Completed service report matched, but the job could not be moved to Balance Needed.");
    }
    await triggerReviewRequestForWorkflowPatch(supabase, candidate.jobId, currentJob?.status, jobPatch, actorEmail, "completed_service_report");
  }
}

async function applyInstallationInvoice(
  supabase: CrmSupabaseClient,
  candidate: InstallationInvoiceCandidate,
  extraction: ExtractedInstallationInvoice,
  message: GmailMessage,
  actorEmail: string | undefined
) {
  const amount = extraction.invoiceAmount;
  if (!amount) throw new CrmAuthError(400, "Installation invoice amount is required.");
  const now = new Date().toISOString();
  const patch = {
    installation_invoice_document_id: message.id,
    installation_invoice_amount: amount,
    installation_invoice_number: extraction.invoiceNumber,
    installation_invoice_url: gmailUrl(message),
    installation_match_status: "matched",
    installation_matched_at: now
  };
  const meta = {
    installationInvoiceSource: "gmail",
    installationInvoiceMessageId: message.id,
    installationInvoiceThreadId: message.threadId || null,
    installationInvoiceAppliedBy: actorEmail || "installation-invoice-puller",
    installationInvoiceAppliedAt: now
  };

  if (candidate.entryId) {
    const { error } = await supabase
      .from("crm_quote_bookkeeping_entries")
      .update(patch)
      .eq("id", candidate.entryId);
    if (error) throw new CrmAuthError(502, "Installation invoice matched, but the bookkeeping row could not be updated.");
    await advanceInstallationInvoiceWorkflow(supabase, candidate, message, actorEmail, now);
    return;
  }

  if (candidate.quoteId) {
    const { error } = await supabase.from("crm_quote_bookkeeping_entries").upsert(
      {
        quote_id: candidate.quoteId,
        job_id: candidate.jobId,
        source: "crm_quote",
        customer_name: candidate.customerName,
        sold_date: candidate.soldDate ? candidate.soldDate.slice(0, 10) : null,
        total_amount: candidate.totalAmount,
        cogs_amount: candidate.cogsAmount,
        sales_owner: normalizeOwner(candidate.salesOwner),
        sales_owner_set_at: normalizeOwner(candidate.salesOwner) ? now : null,
        ...patch,
        meta
      },
      { onConflict: "quote_id" }
    );
    if (error) throw new CrmAuthError(502, "Installation invoice matched, but the quote bookkeeping row could not be created.");
    await advanceInstallationInvoiceWorkflow(supabase, candidate, message, actorEmail, now);
    return;
  }

  throw new CrmAuthError(400, "Installation invoice matched a job that has no ledger target.");
}

async function applyCompletedServiceReport(
  supabase: CrmSupabaseClient,
  candidate: InstallationInvoiceCandidate,
  serviceReport: ExtractedCompletedServiceReport,
  message: GmailMessage,
  actorEmail: string | undefined
) {
  if (!candidate.jobId && !candidate.quoteId) {
    throw new CrmAuthError(400, "Completed service report matched a row that has no job or quote target.");
  }
  const now = new Date().toISOString();
  await advanceCompletedServiceReportWorkflow(supabase, candidate, serviceReport, message, actorEmail, now);
}

type InstallationInvoiceRecordInput = Omit<CrmInstallationInvoiceEmail, "id" | "created_at" | "updated_at">;

function fallbackInvoiceRecord(input: InstallationInvoiceRecordInput, auditError: string | null) {
  const now = new Date().toISOString();
  return {
    id: `gmail:${input.gmail_message_id}`,
    created_at: now,
    updated_at: now,
    ...input,
    raw: {
      ...input.raw,
      auditTableFallback: true,
      auditError
    }
  } satisfies CrmInstallationInvoiceEmail;
}

async function insertInvoiceRecord(
  supabase: CrmSupabaseClient,
  input: InstallationInvoiceRecordInput,
  persist: boolean,
  auditError: string | null
) {
  if (!persist) return fallbackInvoiceRecord(input, auditError);

  const { data, error } = await supabase
    .from("crm_installation_invoice_emails")
    .upsert(input, { onConflict: "gmail_message_id" })
    .select("*")
    .single();

  if (error || !data) return fallbackInvoiceRecord(input, error?.message || "Installation invoice email could not be recorded.");
  return data as CrmInstallationInvoiceEmail;
}

export async function processInstallationInvoiceInbox(
  supabase: CrmSupabaseClient,
  options: ProcessInstallationInvoiceOptions = {}
): Promise<ProcessInstallationInvoiceResult> {
  const mailbox = normalizedMailbox(options.mailbox);
  const query = resolveInstallationInvoiceGmailQuery(mailbox, options.query || process.env.INSTALLATION_INVOICE_GMAIL_QUERY);
  const maxResults = maxResultsValue(options.maxResults);
  const accessToken = await getGmailAccessToken();
  const messageRefs = options.messageIds?.length
    ? options.messageIds.map((id) => ({ id }))
    : await listGmailMessageIds(accessToken, query, maxResults);
  const messageIds = messageRefs.map((message) => message.id).filter(Boolean);

  const result: ProcessInstallationInvoiceResult = {
    mailbox,
    query,
    scanned: messageIds.length,
    processed: 0,
    matched: 0,
    serviceReports: 0,
    needsReview: 0,
    unmatched: 0,
    skipped: 0,
    errors: 0,
    auditTableAvailable: true,
    auditError: null,
    invoices: []
  };

  if (!messageIds.length) return result;

  const existingResult = await supabase
    .from("crm_installation_invoice_emails")
    .select("gmail_message_id")
    .in("gmail_message_id", messageIds);
  if (existingResult.error) {
    result.auditTableAvailable = false;
    result.auditError = existingResult.error.message;
  }
  const existingIds = result.auditTableAvailable
    ? new Set((existingResult.data || []).map((row) => String(row.gmail_message_id)))
    : new Set<string>();
  const candidates = await loadInvoiceCandidates(supabase);

  for (const messageId of messageIds) {
    if (existingIds.has(messageId)) {
      result.skipped += 1;
      continue;
    }

    let message: GmailMessage | null = null;
    try {
      message = await getGmailMessage(accessToken, messageId);
      const body = messageText(message);
      const headers = message.payload?.headers || [];
      const subject = getHeader(headers, "Subject");
      const from = getHeader(headers, "From");
      const to = getHeader(headers, "To");
      const names = attachmentNames(message);
      const pdfExtraction = await extractPdfAttachmentText({ accessToken, messageId, message });
      const serviceReport = extractCompletedServiceReportDetails({
        subject,
        body,
        attachmentText: pdfExtraction.text,
        attachmentNames: names
      });
      const isCompletedServiceReport = serviceReport.isCompletedServiceReport;
      let extraction: ExtractedInstallationInvoice | null = null;
      let match: InstallationInvoiceMatch;
      let decision: { status: CrmInstallationInvoiceEmailStatus; reason: string; canApply: boolean };

      if (isCompletedServiceReport) {
        match = matchInstallationInvoiceToCandidate({
          text: serviceReport.text,
          extractedCustomerName: serviceReport.customerName,
          candidates
        });
        if (match.status === "unmatched" && serviceReport.customerName) {
          const targetedCandidates = await loadTargetedInvoiceCandidates(supabase, serviceReport.customerName);
          if (targetedCandidates.length) {
            match = matchInstallationInvoiceToCandidate({
              text: serviceReport.text,
              extractedCustomerName: serviceReport.customerName,
              candidates: targetedCandidates
            });
          }
        }
        decision = autoApplyCompletedServiceReportDecision(match, serviceReport);
      } else {
        extraction = extractInstallationInvoiceDetails({
          subject,
          body,
          attachmentText: pdfExtraction.text,
          attachmentNames: names
        });
        match = matchInstallationInvoiceToCandidate({
          text: extraction.text,
          extractedCustomerName: extraction.customerName,
          candidates
        });
        if (match.status === "unmatched" && extraction.customerName) {
          const targetedCandidates = await loadTargetedInvoiceCandidates(supabase, extraction.customerName);
          if (targetedCandidates.length) {
            match = matchInstallationInvoiceToCandidate({
              text: extraction.text,
              extractedCustomerName: extraction.customerName,
              candidates: targetedCandidates
            });
          }
        }
        decision = autoApplyDecision(match, extraction);
      }

      const candidate = match.candidate;
      let appliedAt: string | null = null;

      if (decision.canApply && candidate) {
        if (isCompletedServiceReport) {
          await applyCompletedServiceReport(supabase, candidate, serviceReport, message, options.actorEmail);
        } else if (extraction) {
          await applyInstallationInvoice(supabase, candidate, extraction, message, options.actorEmail);
        }
        appliedAt = new Date().toISOString();
      }

      const invoice = await insertInvoiceRecord(supabase, {
        mailbox_email: mailbox,
        gmail_message_id: message.id,
        gmail_thread_id: message.threadId || null,
        gmail_history_id: message.historyId || null,
        from_email: from || null,
        to_email: to || null,
        subject: subject || null,
        sent_at: messageSentAt(message),
        snippet: message.snippet || null,
        attachment_names: names,
        email_url: gmailUrl(message),
        extracted_customer_name: isCompletedServiceReport
          ? serviceReport.customerName || candidate?.customerName || null
          : extraction?.customerName || candidate?.customerName || null,
        extracted_invoice_amount: isCompletedServiceReport ? null : extraction?.invoiceAmount || null,
        extracted_invoice_number: isCompletedServiceReport ? serviceReport.jobNumber : extraction?.invoiceNumber || null,
        extraction_confidence: isCompletedServiceReport ? serviceReport.confidence : extraction?.confidence || 0,
        matched_job_id: candidate?.jobId || null,
        matched_quote_id: candidate?.quoteId || null,
        matched_bookkeeping_entry_id: candidate?.entryId || null,
        match_status: decision.status,
        match_confidence: match.confidence,
        match_reason: decision.reason,
        processed_at: new Date().toISOString(),
        applied_at: appliedAt,
        error_message: null,
        raw: {
          emailKind: isCompletedServiceReport ? "completed_service_report" : "installation_invoice",
          amountConfidence: extraction?.amountConfidence || null,
          serviceReportCodAmount: isCompletedServiceReport ? serviceReport.codAmount : null,
          serviceReportPaymentMethod: isCompletedServiceReport ? serviceReport.paymentMethod : null,
          serviceReportDate: isCompletedServiceReport ? serviceReport.reportDate : null,
          candidateSource: candidate?.source || null,
          pdfAttachmentCount: pdfAttachmentParts(message).length,
          pdfExtractionErrors: pdfExtraction.errors,
          bodyPreview: (isCompletedServiceReport ? serviceReport.text : extraction?.text || "").slice(0, 1000)
        }
      }, result.auditTableAvailable, result.auditError);

      result.invoices.push(invoice);
      result.processed += 1;
      if (invoice.match_status === "matched") {
        result.matched += 1;
        if (isCompletedServiceReport) result.serviceReports += 1;
      } else if (invoice.match_status === "needs_review") result.needsReview += 1;
      else if (invoice.match_status === "unmatched") result.unmatched += 1;
      else if (invoice.match_status === "skipped") result.skipped += 1;
      else if (invoice.match_status === "error") result.errors += 1;
    } catch (error) {
      result.errors += 1;
      if (message) {
        const invoice = await insertInvoiceRecord(supabase, {
          mailbox_email: mailbox,
          gmail_message_id: message.id,
          gmail_thread_id: message.threadId || null,
          gmail_history_id: message.historyId || null,
          from_email: getHeader(message.payload?.headers, "From") || null,
          to_email: getHeader(message.payload?.headers, "To") || null,
          subject: getHeader(message.payload?.headers, "Subject") || null,
          sent_at: messageSentAt(message),
          snippet: message.snippet || null,
          attachment_names: attachmentNames(message),
          email_url: gmailUrl(message),
          extracted_customer_name: null,
          extracted_invoice_amount: null,
          extracted_invoice_number: null,
          extraction_confidence: 0,
          matched_job_id: null,
          matched_quote_id: null,
          matched_bookkeeping_entry_id: null,
          match_status: "error",
          match_confidence: 0,
          match_reason: "Processing failed.",
          processed_at: new Date().toISOString(),
          applied_at: null,
          error_message: error instanceof Error ? error.message : "Unknown installation invoice processing error.",
          raw: {}
        }, result.auditTableAvailable, result.auditError);
        result.invoices.push(invoice);
      }
    }
  }

  return result;
}
