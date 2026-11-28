import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CHECK_DEPOSIT_KIND,
  confidentNameMatch,
  exactCents,
  isPlainObject,
  isPostedCheckStatus,
  isReversalStatus,
  mercuryDepositNotes,
  mercuryPaymentRequestId,
  mergeJsonPatch,
  paidOn,
  type MercuryTransactionEvent,
} from "@/lib/finance/mercury";
import { insertReceivedPayment } from "@/lib/crm/received-payment";
import { toE164 } from "@/lib/notify/phone";
import { sendSms } from "@/lib/notify/twilio";

const CLOSED_QUOTE_STATUSES = new Set(["archived", "lost"]);
const QUOTE_PAGE = 1000;
const LEASE_MS = 120_000;
const MATCH_STATUSES = new Set(["unmatched", "matched", "needs_review", "reversed"]);
const ALERT_STATUSES = new Set(["needs_review", "reversed"]);

type MatchStatus = "unmatched" | "matched" | "needs_review" | "reversed";

export type MercuryApplyResult =
  | { ok: true; duplicate?: boolean }
  | { ok: false; status: 503; message: string };

type CreditRow = {
  id?: string;
  amount?: unknown;
  raw?: unknown;
  match_status?: unknown;
  matched_quote_id?: unknown;
  matched_payment_id?: unknown;
  matched_at?: unknown;
  owner_alerted_for?: unknown;
};

type QuoteCandidate = {
  id: string;
  job_id: string;
  customer_name: string | null;
  customer_printed_name: string | null;
};

/**
 * Owner text, not a customer text. Payment alerts and Mike's weekly sales
 * text use sendSms({ ownerAlert: true }). The destination is
 * MIKE_805_SALES_SMS_NUMBER. Overdue alerts are a separate internal email
 * and are not used here.
 */
async function alertOwner(body: string): Promise<boolean> {
  const to = toE164(process.env.MIKE_805_SALES_SMS_NUMBER);
  if (!to) return false;
  try {
    const result = await sendSms({ to, ownerAlert: true, body, timeoutMs: 4000 });
    // An uncertain provider response may already have been accepted.
    return result.sent || result.uncertain === true;
  } catch {
    return false;
  }
}

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function matchStatus(value: unknown): MatchStatus {
  return typeof value === "string" && MATCH_STATUSES.has(value) ? (value as MatchStatus) : "unmatched";
}

function alertStatus(value: unknown): "needs_review" | "reversed" | null {
  return typeof value === "string" && ALERT_STATUSES.has(value) ? (value as "needs_review" | "reversed") : null;
}

function clean(value: string | null, max = 100): string {
  return (value || "Not recorded").replace(/[\r\n\t]+/g, " ").trim().slice(0, max) || "Not recorded";
}

function money(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function reviewBody(input: {
  amountCents: number;
  counterparty: string | null;
  date: string | null;
  transactionId: string;
  candidateCount: number;
  postingFailed: boolean;
}): string {
  const reason = input.postingFailed
    ? "A matching quote was found, but the check payment was not saved."
    : input.candidateCount === 0
      ? "No open quote had this amount and a matching customer name."
      : `${input.candidateCount} open quotes matched this amount and customer name.`;
  return [
    "805 Shutters: Mercury check deposit needs a match.",
    `Amount: ${money(input.amountCents)}`,
    `From: ${clean(input.counterparty)}`,
    `Date: ${input.date || "Not recorded"}`,
    `Mercury transaction: ${input.transactionId}`,
    reason,
    "Match this deposit in the CRM.",
  ].join("\n");
}

function reversalBody(input: {
  amountCents: number;
  counterparty: string | null;
  date: string | null;
  transactionId: string;
  status: string | null;
}): string {
  return [
    "805 Shutters: a matched Mercury check deposit came back.",
    `Amount: ${money(input.amountCents)}`,
    `From: ${clean(input.counterparty)}`,
    `Date: ${input.date || "Not recorded"}`,
    `Status: ${clean(input.status, 40)}`,
    `Mercury transaction: ${input.transactionId}`,
    "The check payment row was left as it is. Review it in the CRM.",
  ].join("\n");
}

function balanceDueCents(meta: unknown): number | null {
  if (!isPlainObject(meta) || !isPlainObject(meta.payment_progress)) return null;
  return exactCents(meta.payment_progress.balanceDue);
}

function quoteIsOpen(status: unknown, meta: unknown): boolean {
  if (typeof status !== "string" || CLOSED_QUOTE_STATUSES.has(status)) return false;
  if (!isPlainObject(meta)) return true;
  return !meta.deleted_at && !meta.bookkeeping_deleted_at;
}

function namesMatch(quote: QuoteCandidate, counterparty: string): boolean {
  return [quote.customer_name, quote.customer_printed_name].some(
    (name) => typeof name === "string" && confidentNameMatch(name, counterparty),
  );
}

async function findCandidates(
  db: SupabaseClient,
  amountCents: number,
  counterparty: string | null,
): Promise<QuoteCandidate[]> {
  if (!counterparty) return [];
  const candidates: QuoteCandidate[] = [];
  for (let from = 0; ; from += QUOTE_PAGE) {
    const page = await db
      .from("crm_quotes")
      .select("id,job_id,customer_name,customer_printed_name,status,meta")
      .not("status", "in", "(archived,lost)")
      .range(from, from + QUOTE_PAGE - 1);
    if (page.error) throw new Error("Quote lookup failed.");
    const rows = Array.isArray(page.data) ? page.data : [];
    for (const row of rows) {
      if (!isPlainObject(row) || !quoteIsOpen(row.status, row.meta)) continue;
      if (balanceDueCents(row.meta) !== amountCents) continue;
      const id = text(row.id);
      const jobId = text(row.job_id);
      if (!id || !jobId) continue;
      const candidate = {
        id,
        job_id: jobId,
        customer_name: text(row.customer_name),
        customer_printed_name: text(row.customer_printed_name),
      };
      if (namesMatch(candidate, counterparty)) candidates.push(candidate);
    }
    if (rows.length < QUOTE_PAGE) break;
  }
  return candidates;
}

async function loadEvent(db: SupabaseClient, id: string) {
  const result = await db.from("crm_mercury_events").select("id,processed_at,lease_until").eq("id", id).maybeSingle();
  if (result.error) throw new Error("Event lookup failed.");
  return isPlainObject(result.data) ? result.data : null;
}

function leaseActive(until: unknown, now: number): boolean {
  if (typeof until !== "string" || !until) return false;
  const time = Date.parse(until);
  return Number.isFinite(time) && time > now;
}

async function claimEvent(db: SupabaseClient, event: MercuryTransactionEvent): Promise<"owned" | "duplicate" | "busy"> {
  const now = Date.now();
  const existing = await loadEvent(db, event.id);
  if (existing?.processed_at) return "duplicate";
  const leaseUntil = new Date(now + LEASE_MS).toISOString();
  if (!existing) {
    const inserted = await db.from("crm_mercury_events").insert({
      id: event.id,
      event_type: event.type,
      resource_id: event.resourceId,
      lease_until: leaseUntil,
    });
    if (!inserted.error) return "owned";
    if (inserted.error.code !== "23505") throw new Error("Event could not be recorded.");
    return "busy";
  }
  if (leaseActive(existing.lease_until, now)) return "busy";
  const claim = await db
    .from("crm_mercury_events")
    .update({ lease_until: leaseUntil })
    .eq("id", event.id)
    .is("processed_at", null)
    .select("id");
  if (claim.error) throw new Error("Event could not be claimed.");
  return Array.isArray(claim.data) && claim.data.length > 0 ? "owned" : "busy";
}

async function releaseLease(db: SupabaseClient, eventId: string) {
  await db.from("crm_mercury_events").update({ lease_until: null }).eq("id", eventId).is("processed_at", null).select("id");
}

async function markProcessed(db: SupabaseClient, eventId: string) {
  const saved = await db
    .from("crm_mercury_events")
    .update({ processed_at: new Date().toISOString(), lease_until: null })
    .eq("id", eventId)
    .select("id");
  if (saved.error) throw new Error("Event could not be completed.");
}

async function loadCredit(db: SupabaseClient, transactionId: string): Promise<CreditRow | null> {
  const result = await db
    .from("crm_bank_credits")
    .select("id,amount,raw,match_status,matched_quote_id,matched_payment_id,matched_at,owner_alerted_for")
    .eq("mercury_transaction_id", transactionId)
    .maybeSingle();
  if (result.error) throw new Error("Bank credit lookup failed.");
  return isPlainObject(result.data) ? (result.data as CreditRow) : null;
}

async function applyDeposit(db: SupabaseClient, event: MercuryTransactionEvent): Promise<"ok" | "alert_failed"> {
  const existing = await loadCredit(db, event.resourceId);
  const raw = mergeJsonPatch(existing?.raw, event.mergePatch);
  const patchCents = exactCents(raw.amount);
  const storedCents = exactCents(existing?.amount);
  const creditCents = patchCents !== null && patchCents > 0 ? patchCents : storedCents;
  if (creditCents === null || creditCents <= 0) return "ok";

  const status = text(raw.status)?.toLowerCase() ?? null;
  const kind = text(raw.kind);
  const counterparty = text(raw.counterpartyName);
  const postedAt = text(raw.postedAt);
  const createdAt = text(raw.createdAt);
  const paidDate = paidOn(postedAt);
  let statusName = matchStatus(existing?.match_status);
  let matchedQuoteId = text(existing?.matched_quote_id);
  let matchedPaymentId = text(existing?.matched_payment_id);
  let matchedAt = text(existing?.matched_at);
  const ownerAlertedFor = alertStatus(existing?.owner_alerted_for);
  let candidateCount = 0;
  let postingFailed = false;

  if (isReversalStatus(status) && (statusName === "matched" || statusName === "needs_review")) {
    statusName = "reversed";
  } else if (statusName !== "matched" && statusName !== "reversed" && statusName !== "needs_review" && kind === CHECK_DEPOSIT_KIND && isPostedCheckStatus(status)) {
    const candidates = await findCandidates(db, creditCents, counterparty);
    candidateCount = candidates.length;
    const candidate = candidates.length === 1 ? candidates[0] : null;
    if (candidate && paidDate) {
      const requestId = mercuryPaymentRequestId(event.resourceId);
      try {
        await insertReceivedPayment(
          db,
          {
            quote_id: candidate.id,
            job_id: candidate.job_id,
            payment_label: "Check deposit",
            payment_type: "check",
            amount: creditCents / 100,
            paid_at: paidDate,
            notes: mercuryDepositNotes(event.resourceId),
            source: "manual",
            external_source: "mercury",
            external_id: event.resourceId,
            meta: { mercury_transaction_id: event.resourceId, createdBy: "mercury-webhook" },
          },
          requestId,
        );
        statusName = "matched";
        matchedQuoteId = candidate.id;
        matchedPaymentId = requestId;
        matchedAt = matchedAt || new Date().toISOString();
      } catch {
        postingFailed = true;
        statusName = "needs_review";
      }
    } else {
      statusName = "needs_review";
    }
  }

  const saved = await db.from("crm_bank_credits").upsert(
    {
      ...(existing?.id ? { id: existing.id } : {}),
      mercury_transaction_id: event.resourceId,
      account_id: text(raw.accountId),
      amount: creditCents / 100,
      posted_at: postedAt,
      created_at_mercury: createdAt,
      status,
      counterparty_name: counterparty,
      kind,
      last_event_id: event.id,
      raw,
      match_status: statusName,
      matched_quote_id: matchedQuoteId,
      matched_payment_id: matchedPaymentId,
      matched_at: matchedAt,
      owner_alerted_for: ownerAlertedFor,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "mercury_transaction_id" },
  );
  if (saved.error) throw new Error("Bank credit could not be saved.");

  if ((statusName === "needs_review" || statusName === "reversed") && ownerAlertedFor !== statusName) {
    const body =
      statusName === "reversed"
        ? reversalBody({
            amountCents: creditCents,
            counterparty,
            date: paidDate || paidOn(createdAt),
            transactionId: event.resourceId,
            status,
          })
        : reviewBody({
            amountCents: creditCents,
            counterparty,
            date: paidDate || paidOn(createdAt),
            transactionId: event.resourceId,
            candidateCount,
            postingFailed,
          });
    const sent = await alertOwner(body);
    if (!sent) return "alert_failed";
    const noted = await db
      .from("crm_bank_credits")
      .update({ owner_alerted_for: statusName })
      .eq("mercury_transaction_id", event.resourceId)
      .select("id");
    if (noted.error) throw new Error("Owner alert could not be recorded.");
  }
  return "ok";
}

export async function applyMercuryDepositEvent(
  db: SupabaseClient,
  event: MercuryTransactionEvent,
): Promise<MercuryApplyResult> {
  let owned = false;
  try {
    const claim = await claimEvent(db, event);
    if (claim === "duplicate") return { ok: true, duplicate: true };
    if (claim === "busy") return { ok: false, status: 503, message: "Retry required." };
    owned = true;
    const outcome = await applyDeposit(db, event);
    if (outcome === "alert_failed") {
      await releaseLease(db, event.id);
      return { ok: false, status: 503, message: "Owner alert was not sent. Retry required." };
    }
    await markProcessed(db, event.id);
    return { ok: true };
  } catch {
    if (owned) await releaseLease(db, event.id).catch(() => undefined);
    console.error("Mercury deposit event needs retry.");
    return { ok: false, status: 503, message: "Retry required." };
  }
}
