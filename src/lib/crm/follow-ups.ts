// Automated follow-ups (#2 overdue deposit/balance alerts, #3 stale-quote nudges).
// Pure selectors are unit-tested. Overdue alerts send one internal digest email.
// Stale-quote nudges still use the customer email and SMS path.

import { buildBookkeepingRows, effectiveBookkeepingStatus } from "@/lib/crm/bookkeeping";
import { round2 } from "@/lib/crm/quote-builder";
import { sendSms } from "@/lib/notify/twilio";
import { sendEmail } from "@/lib/notify/email";
import type { CrmBookkeepingEntry, CrmBookkeepingPayment, CrmQuote } from "@/lib/crm/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { brandIdentity, officialContactLine } from "@/lib/brand-identity";

export const OVERDUE_ALERT_RECIPIENT = "wcbot+805@mail.grokbot.com";

export class OverdueAlertsSendError extends Error {
  readonly status = 502;
  readonly body: OverdueAlertsResult = { alerted: 0, emailed: 0, resendId: null };

  constructor() {
    super("Overdue alert email was not sent.");
    this.name = "OverdueAlertsSendError";
  }
}

export type OverdueAlertsResult = {
  alerted: number;
  emailed: number;
  resendId: string | null;
};

const DAY = 24 * 60 * 60 * 1000;
const SOLD_LIKE = new Set(["sold", "approved"]);
const COMPLETED = new Set(["installed", "invoiced", "closed"]);

const DEPOSIT_OVERDUE_DAYS = Number(process.env.DEPOSIT_OVERDUE_DAYS) || 3;
const BALANCE_OVERDUE_DAYS = Number(process.env.BALANCE_OVERDUE_DAYS) || 7;
const ALERT_COOLDOWN_DAYS = Number(process.env.ALERT_COOLDOWN_DAYS) || 3;
const QUOTE_STALE_DAYS = Number(process.env.QUOTE_STALE_DAYS) || 5;
const QUOTE_NUDGE_COOLDOWN_DAYS = Number(process.env.QUOTE_NUDGE_COOLDOWN_DAYS) || 5;

function parseMs(date: string | null | undefined): number | null {
  if (!date) return null;
  const t = Date.parse(date);
  return Number.isFinite(t) ? t : null;
}

// ---------------- pure selectors (unit-tested) ----------------

export type FollowUpEntry = {
  status: string;
  soldDate: string | null;
  depositDue: number;
  depositPaid: number;
  balance: number;
  isPaidInFull: boolean;
  lastAlertedAt: string | null;
};

export function isOverdueDeposit(e: FollowUpEntry, nowMs: number, daysOverdue: number): boolean {
  if (!SOLD_LIKE.has(e.status)) return false;
  if (!(e.depositDue > 0) || e.depositPaid >= e.depositDue) return false;
  const sold = parseMs(e.soldDate);
  if (sold == null) return false;
  return nowMs - sold >= daysOverdue * DAY;
}

export function isOverdueBalance(e: FollowUpEntry, nowMs: number, daysOverdue: number): boolean {
  if (!COMPLETED.has(e.status)) return false;
  if (e.isPaidInFull || !(e.balance > 0)) return false;
  const sold = parseMs(e.soldDate);
  if (sold == null) return false;
  return nowMs - sold >= daysOverdue * DAY;
}

export function shouldAlert(e: Pick<FollowUpEntry, "lastAlertedAt">, nowMs: number, cooldownDays: number): boolean {
  const last = parseMs(e.lastAlertedAt);
  return last == null ? true : nowMs - last >= cooldownDays * DAY;
}

export type FollowUpQuote = {
  status: string;
  sentAt: string | null;
  signedAt: string | null;
  lastNudgedAt: string | null;
};

export function isStaleQuote(q: FollowUpQuote, nowMs: number, daysStale: number): boolean {
  if (q.status !== "sent" || q.signedAt) return false;
  const sent = parseMs(q.sentAt);
  if (sent == null) return false;
  return nowMs - sent >= daysStale * DAY;
}

export function shouldNudge(q: Pick<FollowUpQuote, "lastNudgedAt">, nowMs: number, cooldownDays: number): boolean {
  const last = parseMs(q.lastNudgedAt);
  return last == null ? true : nowMs - last >= cooldownDays * DAY;
}

// ---------------- run functions (cron-driven) ----------------

function readMetaLastAlerted(entry: CrmBookkeepingEntry | undefined): string | null {
  const meta = (entry?.meta ?? {}) as Record<string, unknown>;
  return typeof meta.lastAlertedAt === "string" ? meta.lastAlertedAt : null;
}

function pacificDate(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function readQuoteOverdueAlerted(quote: CrmQuote | undefined): string | null {
  const meta = (quote?.meta ?? {}) as Record<string, unknown>;
  return typeof meta.lastOverdueAlertedAt === "string" ? meta.lastOverdueAlertedAt : null;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

type OverdueDigestRow = {
  quoteId: string | null;
  entry?: CrmBookkeepingEntry;
  quote?: CrmQuote;
  customerName: string;
  quoteNumber: string | null;
  kind: "deposit" | "balance";
  amount: number;
  soldDate: string | null;
};

async function recordOverdueAlertEvent(
  supabase: SupabaseClient,
  action: "overdue-alerts.sent" | "overdue-alerts.failed",
  metadata: Record<string, unknown>,
) {
  const { error } = await supabase.from("crm_activity_events").insert({
    entity_type: "system",
    action,
    metadata,
  });
  return error;
}

export async function runOverdueAlerts(
  supabase: SupabaseClient,
  now: Date = new Date(),
): Promise<OverdueAlertsResult> {
  const nowMs = now.getTime();
  const { data: quotes } = await supabase.from("crm_quotes").select("*");
  const { data: entries } = await supabase.from("crm_quote_bookkeeping_entries").select("*");
  const { data: payments } = await supabase.from("crm_quote_bookkeeping_payments").select("*");
  const quoteRows = (quotes as CrmQuote[]) ?? [];
  const entryRows = (entries as CrmBookkeepingEntry[]) ?? [];
  const rows = buildBookkeepingRows({
    quotes: quoteRows,
    entries: entryRows,
    payments: (payments as CrmBookkeepingPayment[]) ?? [],
  });
  const entryByQuote = new Map(entryRows.map((entry) => [entry.quote_id, entry]));
  const entryById = new Map(entryRows.map((entry) => [entry.id, entry]));
  const quoteById = new Map(quoteRows.map((quote) => [quote.id, quote]));
  const overdue: OverdueDigestRow[] = [];

  for (const row of rows) {
    const linkedEntry = row.quoteId ? entryByQuote.get(row.quoteId) : undefined;
    const entry = linkedEntry || (row.source === "crm_quote" ? undefined : entryById.get(row.id));
    const quote = row.quoteId ? quoteById.get(row.quoteId) : undefined;
    const followUp: FollowUpEntry = {
      status: effectiveBookkeepingStatus(row),
      soldDate: row.soldDate,
      depositDue: Number(row.depositDue) || 0,
      depositPaid: Number(row.depositPaid) || 0,
      balance: Number(row.balance) || 0,
      isPaidInFull: Boolean(row.isPaidInFull),
      lastAlertedAt: entry ? readMetaLastAlerted(entry) : readQuoteOverdueAlerted(quote),
    };
    const overdueDeposit = isOverdueDeposit(followUp, nowMs, DEPOSIT_OVERDUE_DAYS);
    const overdueBalance = isOverdueBalance(followUp, nowMs, BALANCE_OVERDUE_DAYS);
    if (!overdueDeposit && !overdueBalance) continue;
    if (!shouldAlert(followUp, nowMs, ALERT_COOLDOWN_DAYS)) continue;

    const kind = overdueDeposit ? "deposit" : "balance";
    overdue.push({
      quoteId: row.quoteId,
      entry,
      quote,
      customerName: row.customerName || "customer",
      quoteNumber: row.quoteNumber || quote?.quote_number || null,
      kind,
      amount: kind === "deposit" ? round2(followUp.depositDue - followUp.depositPaid) : round2(followUp.balance),
      soldDate: row.soldDate,
    });
  }

  if (overdue.length === 0) return { alerted: 0, emailed: 0, resendId: null };

  const lines = overdue.map((item) => {
    const name = item.customerName.trim() || "customer";
    const quoteNumber = item.quoteNumber?.trim() || "—";
    const sold = item.soldDate?.trim() || "—";
    const amount = `$${item.amount.toFixed(2)}`;
    return { name, quoteNumber, kind: item.kind, amount, sold };
  });
  const text = [
    "Overdue deposit and balance alerts",
    "",
    ...lines.map((line) => `${line.name} | ${line.quoteNumber} | ${line.kind} | ${line.amount} | sold ${line.sold}`),
  ].join("\n");
  const html = `<p>Overdue deposit and balance alerts</p><ul>${lines
    .map((line) => `<li>${escapeHtml(line.name)} | ${escapeHtml(line.quoteNumber)} | ${escapeHtml(line.kind)} | ${escapeHtml(line.amount)} | sold ${escapeHtml(line.sold)}</li>`)
    .join("")}</ul>`;
  const quoteIds = overdue.flatMap((item) => (item.quoteId ? [item.quoteId] : []));
  const email = await sendEmail({
    to: OVERDUE_ALERT_RECIPIENT,
    from: process.env.RESEND_FROM,
    subject: `Overdue deposit and balance alerts (${overdue.length})`,
    html,
    text,
    idempotencyKey: `overdue-alerts-${pacificDate(now)}`,
  });

  if (email.sent !== true) {
    const error = await recordOverdueAlertEvent(supabase, "overdue-alerts.failed", {
      count: overdue.length,
      quoteIds,
      error: email.error || email.skipped || "send failed",
    });
    if (error) console.error("Could not record overdue alert failure.", error);
    throw new OverdueAlertsSendError();
  }

  const alertedAt = now.toISOString();
  for (const item of overdue) {
    if (item.entry) {
      const meta = { ...((item.entry.meta ?? {}) as Record<string, unknown>), lastAlertedAt: alertedAt };
      const { error } = await supabase.from("crm_quote_bookkeeping_entries").update({ meta }).eq("id", item.entry.id);
      if (error) throw new Error(error.message || "Could not record the overdue alert.");
    } else if (item.quote) {
      const meta = { ...(item.quote.meta ?? {}), lastOverdueAlertedAt: alertedAt };
      const { error } = await supabase.from("crm_quotes").update({ meta }).eq("id", item.quote.id);
      if (error) throw new Error(error.message || "Could not record the overdue alert.");
    }
  }

  const resendId = email.id ?? null;
  const eventError = await recordOverdueAlertEvent(supabase, "overdue-alerts.sent", {
    count: overdue.length,
    quoteIds,
    resendId,
  });
  if (eventError) throw new Error(eventError.message || "Could not record the overdue alert.");
  return { alerted: overdue.length, emailed: 1, resendId };
}

export async function runStaleQuoteNudges(supabase: SupabaseClient, now: Date = new Date()) {
  const nowMs = now.getTime();
  const { data: rows } = await supabase.from("crm_quotes").select("*").eq("status", "sent");
  const quotes = (rows as CrmQuote[]) ?? [];
  const base = (process.env.NEXT_PUBLIC_SITE_URL || brandIdentity.website).replace(/\/+$/, "");
  const url = (token: string) => `${base}/quote/${token}`;
  let nudged = 0;

  for (const quote of quotes) {
    const meta = (quote.meta ?? {}) as Record<string, unknown>;
    if (meta.communication_hub_managed === true) continue;
    const q: FollowUpQuote = {
      status: quote.status,
      sentAt: quote.sent_at,
      signedAt: quote.signed_at,
      lastNudgedAt: typeof meta.lastNudgedAt === "string" ? meta.lastNudgedAt : null,
    };
    if (!isStaleQuote(q, nowMs, QUOTE_STALE_DAYS)) continue;
    if (!shouldNudge(q, nowMs, QUOTE_NUDGE_COOLDOWN_DAYS)) continue;
    if (!quote.share_token) continue;

    const name = quote.customer_name || "there";
    const link = url(quote.share_token);
    const text = `Hi ${name}, your 805 Shutters contract is still waiting for your approval. Review + approve here: ${link}\n\n${officialContactLine}`;
    const html = `<p>Hi ${name},</p><p>Your 805 Shutters contract is still waiting for your approval.</p><p><a href="${link}">Review and approve your contract</a></p><p><strong>Official 805 Shutters contact</strong><br><a href="${brandIdentity.website}">${brandIdentity.domain}</a> &middot; ${brandIdentity.phone} &middot; <a href="${brandIdentity.emailHref}">${brandIdentity.email}</a></p>`;
    if (quote.customer_email) await sendEmail({ to: quote.customer_email, subject: "Your 805 Shutters contract is waiting", html, text });
    if (quote.customer_phone) await sendSms({ to: quote.customer_phone, body: text });

    await supabase
      .from("crm_quotes")
      .update({ meta: { ...meta, lastNudgedAt: now.toISOString() } })
      .eq("id", quote.id);
    nudged += 1;
  }
  return { nudged };
}
