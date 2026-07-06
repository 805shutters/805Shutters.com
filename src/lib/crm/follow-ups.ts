// Automated follow-ups (#2 overdue deposit/balance alerts, #3 stale-quote nudges).
// Pure selectors are unit-tested; the run* functions are driven by Vercel cron
// routes (/api/cron/overdue-alerts, /api/cron/stale-quotes) and reuse the existing
// bookkeeping row projection + Twilio/Resend notify infra.

import { buildBookkeepingRows, effectiveBookkeepingStatus } from "@/lib/crm/bookkeeping";
import { round2 } from "@/lib/crm/quote-builder";
import { sendSms } from "@/lib/notify/twilio";
import { sendEmail } from "@/lib/notify/email";
import type { CrmBookkeepingEntry, CrmBookkeepingPayment, CrmQuote } from "@/lib/crm/types";
import { MIKE_PAYMENT_ADMIN_EMAIL } from "@/lib/crm/allowed-users";
import type { SupabaseClient } from "@supabase/supabase-js";

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

function shopSmsNumbers(): string[] {
  const list = [
    process.env.JESSICA_805_SALES_SMS_NUMBER,
    process.env.MIKE_805_SALES_SMS_NUMBER,
    ...(process.env.CRM_SOLD_QUOTE_SMS_NUMBERS || "").split(","),
  ];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const n of list) {
    const v = (n || "").trim();
    if (v && !seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  return out;
}

export async function runOverdueAlerts(supabase: SupabaseClient, now: Date = new Date()) {
  const nowMs = now.getTime();
  const { data: quotes } = await supabase.from("crm_quotes").select("*");
  const { data: entries } = await supabase.from("crm_quote_bookkeeping_entries").select("*");
  const { data: payments } = await supabase.from("crm_quote_bookkeeping_payments").select("*");
  const rows = buildBookkeepingRows({
    quotes: (quotes as CrmQuote[]) ?? [],
    entries: (entries as CrmBookkeepingEntry[]) ?? [],
    payments: (payments as CrmBookkeepingPayment[]) ?? [],
  });
  const entryByQuote = new Map(((entries as CrmBookkeepingEntry[]) ?? []).map((e) => [e.quote_id, e]));
  const numbers = shopSmsNumbers();
  const shopEmail = process.env.CRM_SIGNED_QUOTE_EMAIL || MIKE_PAYMENT_ADMIN_EMAIL;
  let alerted = 0;

  for (const row of rows) {
    const entry = row.quoteId ? entryByQuote.get(row.quoteId) : undefined;
    const e: FollowUpEntry = {
      status: effectiveBookkeepingStatus(row),
      soldDate: row.soldDate,
      depositDue: Number(row.depositDue) || 0,
      depositPaid: Number(row.depositPaid) || 0,
      balance: Number(row.balance) || 0,
      isPaidInFull: Boolean(row.isPaidInFull),
      lastAlertedAt: readMetaLastAlerted(entry),
    };
    const overdueDeposit = isOverdueDeposit(e, nowMs, DEPOSIT_OVERDUE_DAYS);
    const overdueBalance = isOverdueBalance(e, nowMs, BALANCE_OVERDUE_DAYS);
    if (!overdueDeposit && !overdueBalance) continue;
    if (!shouldAlert(e, nowMs, ALERT_COOLDOWN_DAYS)) continue;

    const kind = overdueDeposit ? "deposit" : "balance";
    const amount = overdueDeposit ? round2(e.depositDue - e.depositPaid) : round2(e.balance);
    const msg = `805 Shutters: OVERDUE ${kind} — ${row.customerName || "customer"} ($${amount}). Sold ${row.soldDate || "?"}.`;
    for (const num of numbers) await sendSms({ to: num, body: msg });
    if (shopEmail) {
      await sendEmail({ to: shopEmail, subject: `Overdue ${kind}: ${row.customerName || "customer"}`, html: `<p>${msg}</p>`, text: msg });
    }
    if (entry) {
      const meta = (entry.meta ?? {}) as Record<string, unknown>;
      await supabase
        .from("crm_quote_bookkeeping_entries")
        .update({ meta: { ...meta, lastAlertedAt: now.toISOString() } })
        .eq("id", entry.id);
    }
    alerted += 1;
  }
  return { alerted };
}

export async function runStaleQuoteNudges(supabase: SupabaseClient, now: Date = new Date()) {
  const nowMs = now.getTime();
  const { data: rows } = await supabase.from("crm_quotes").select("*").eq("status", "sent");
  const quotes = (rows as CrmQuote[]) ?? [];
  const base = (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/+$/, "");
  const url = (token: string) => (base ? `${base}/quote/${token}` : `/quote/${token}`);
  let nudged = 0;

  for (const quote of quotes) {
    const meta = (quote.meta ?? {}) as Record<string, unknown>;
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
    const text = `Hi ${name}, your 805 Shutters contract is still waiting for your approval. Review + approve here: ${link}`;
    const html = `<p>Hi ${name},</p><p>Your 805 Shutters contract is still waiting for your approval.</p><p><a href="${link}">Review and approve your contract</a></p>`;
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
