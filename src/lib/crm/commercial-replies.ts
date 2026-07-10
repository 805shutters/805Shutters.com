import type { SupabaseClient } from "@supabase/supabase-js";
import { CrmAuthError } from "@/lib/crm/auth";
import { getBrokeredGmailAccessToken } from "@/lib/crm/installation-invoices";

type GmailHeader = { name: string; value: string };
type GmailPart = {
  mimeType?: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: { data?: string; attachmentId?: string; size?: number };
  parts?: GmailPart[];
};
type GmailMessage = {
  id: string;
  threadId?: string;
  internalDate?: string;
  snippet?: string;
  payload?: GmailPart;
};

function extractEmailAddress(value?: string | null) {
  if (!value) return null;
  const angle = value.match(/<([^<>@\s]+@[^<>\s]+)>/);
  if (angle?.[1]) return angle[1].trim();
  return value.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i)?.[0]?.trim() || null;
}

function decodeBase64Url(data: string) {
  const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, "base64").toString("utf8");
}

function htmlToText(value: string) {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|td|th|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function collectMessagePayload(message: GmailMessage) {
  const plain: string[] = [];
  const html: string[] = [];
  const walk = (part: GmailPart | undefined) => {
    if (!part) return;
    if (part.body?.data && part.mimeType === "text/plain") plain.push(decodeBase64Url(part.body.data));
    if (part.body?.data && part.mimeType === "text/html") html.push(decodeBase64Url(part.body.data));
    for (const child of part.parts || []) walk(child);
  };
  walk(message.payload);
  return { bodyText: plain.join("\n\n").trim() || html.map(htmlToText).join("\n\n").trim() || message.snippet || "" };
}

function envValue(keys: string[]) {
  return keys.map((key) => process.env[key]?.trim()).find(Boolean);
}

async function commercialGmailToken(mailbox: string) {
  const clientId = envValue(["GMAIL_805_CLIENT_ID", "GOOGLE_CLIENT_ID", "GOOGLE_CALENDAR_CLIENT_ID"]);
  const clientSecret = envValue(["GMAIL_805_CLIENT_SECRET", "GOOGLE_CLIENT_SECRET", "GOOGLE_CALENDAR_CLIENT_SECRET"]);
  const refreshToken = envValue(["GMAIL_805_REFRESH_TOKEN", "GMAIL_REFRESH_TOKEN", "GOOGLE_CALENDAR_REFRESH_TOKEN"]);

  if (!clientId || !clientSecret || !refreshToken) {
    const brokered = await getBrokeredGmailAccessToken(mailbox);
    if (brokered) return brokered;
    throw new CrmAuthError(503, "Gmail reply sync is not configured for the commercial workspace.");
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" })
  });
  const data = (await response.json().catch(() => null)) as { access_token?: string; error_description?: string; error?: string } | null;
  if (!response.ok || !data?.access_token) {
    throw new CrmAuthError(502, `Gmail token refresh failed: ${data?.error_description || data?.error || response.status}`);
  }
  return data.access_token;
}

async function gmailFetch<T>(token: string, path: string) {
  const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }
  });
  if (!response.ok) throw new CrmAuthError(502, `Gmail reply sync failed: ${response.status} ${await response.text()}`);
  return (await response.json()) as T;
}

function header(message: GmailMessage, name: string) {
  return message.payload?.headers?.find((item) => item.name.toLowerCase() === name.toLowerCase())?.value || null;
}

function occurredAt(message: GmailMessage) {
  const date = header(message, "Date");
  const parsed = date ? Date.parse(date) : Number.NaN;
  if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
  const internal = Number(message.internalDate || 0);
  return internal > 0 ? new Date(internal).toISOString() : new Date().toISOString();
}

export function isCommercialOptOut(text: string) {
  return /(^|\b)(unsubscribe|remove me|stop emailing|do not email|opt[ -]?out)(\b|$)/i.test(text);
}

export async function syncCommercialReplies(supabase: SupabaseClient, actorEmail: string) {
  const mailbox = process.env.EMAIL_FORWARD_SOURCE_MAILBOX?.trim() || "805shutters@gmail.com";
  const destination = process.env.EMAIL_FORWARD_DESTINATION?.trim() || "805@805shutters.com";
  const token = await commercialGmailToken(mailbox);
  const query = process.env.COMMERCIAL_REPLY_GMAIL_QUERY?.trim() || `in:inbox newer_than:90d -from:${mailbox} -from:${destination}`;
  const maxResults = Math.min(Math.max(Number(process.env.COMMERCIAL_REPLY_GMAIL_MAX_RESULTS || 100), 1), 250);
  const listed = await gmailFetch<{ messages?: Array<{ id: string; threadId?: string }> }>(
    token,
    `messages?${new URLSearchParams({ q: query, maxResults: String(maxResults) }).toString()}`
  );
  const messages = listed.messages || [];

  const { data: accountRows, error: accountError } = await supabase
    .from("crm_commercial_accounts")
    .select("id,email,status,do_not_email")
    .not("email", "is", null);
  if (accountError) throw new CrmAuthError(502, "Commercial contacts could not be loaded for reply sync.");
  const accountsByEmail = new Map((accountRows || []).map((account) => [String(account.email).trim().toLowerCase(), account]));

  const ids = messages.map((message) => message.id);
  let existingIds = new Set<string>();
  if (ids.length) {
    const { data: existing, error: existingError } = await supabase
      .from("crm_commercial_activities")
      .select("gmail_message_id")
      .in("gmail_message_id", ids);
    if (existingError) throw new CrmAuthError(502, "Commercial reply history could not be checked.");
    existingIds = new Set((existing || []).map((row) => String(row.gmail_message_id)));
  }

  const result = { scanned: messages.length, matched: 0, optOuts: 0, skipped: 0, unmatched: 0, errors: 0 };
  for (const listedMessage of messages) {
    if (existingIds.has(listedMessage.id)) {
      result.skipped += 1;
      continue;
    }

    try {
      const message = await gmailFetch<GmailMessage>(token, `messages/${encodeURIComponent(listedMessage.id)}?format=full`);
      const from = extractEmailAddress(header(message, "Reply-To")) || extractEmailAddress(header(message, "From"));
      const account = from ? accountsByEmail.get(from.toLowerCase()) : null;
      if (!account) {
        result.unmatched += 1;
        continue;
      }

      const payload = collectMessagePayload(message);
      const optedOut = isCommercialOptOut(`${header(message, "Subject") || ""}\n${payload.bodyText}`);
      const when = occurredAt(message);
      const gmailUrl = `https://mail.google.com/mail/u/0/#inbox/${message.threadId || message.id}`;
      const { error: activityError } = await supabase.from("crm_commercial_activities").insert({
        account_id: account.id,
        activity_type: optedOut ? "opt_out" : "reply_received",
        actor_email: actorEmail,
        subject: header(message, "Subject"),
        body_preview: payload.bodyText.slice(0, 5000),
        gmail_message_id: message.id,
        gmail_thread_id: message.threadId || null,
        occurred_at: when,
        meta: { from, gmailUrl, automatedSync: true }
      });
      if (activityError) throw new Error(activityError.message);

      await supabase
        .from("crm_commercial_accounts")
        .update(
          optedOut
            ? { status: "do_not_contact", do_not_email: true, last_replied_at: when, next_action: null, next_action_due: null }
            : { status: "replied", last_replied_at: when, next_action: "Respond to commercial reply", next_action_due: new Date().toISOString().slice(0, 10) }
        )
        .eq("id", account.id);
      result.matched += 1;
      if (optedOut) result.optOuts += 1;
    } catch (error) {
      console.warn("commercial reply sync", listedMessage.id, error);
      result.errors += 1;
    }
  }

  return result;
}
