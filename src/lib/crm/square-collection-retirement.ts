import type { SupabaseClient } from "@supabase/supabase-js";
import { CrmAuthError } from "./auth";
import { squareAccessToken, squareEnvironment, squareLocationId } from "@/lib/finance/square";
import { record, text } from "@/lib/finance/square-reporting";

type LegacyRequest = { id: string; order_id: string | null; quote_id: string | null; bookkeeping_entry_id: string | null; amount_cents: number; created_at: string };
const hold = (reason: string) => new CrmAuthError(409, `Payment link was not sent. ${reason} The historical payment needs review before Stripe can collect.`);

async function provider(path: string, method: "GET" | "POST" | "DELETE" = "GET", body?: unknown, allowMissing = false) {
  let response: Response;
  let data: Record<string, unknown>;
  try {
    response = await fetch(`https://connect.squareup.com/v2${path}`, {
      method, cache: "no-store", signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${squareAccessToken()}`, "Square-Version": "2026-11-18", "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    data = record(await response.json());
  } catch {
    throw hold("The old payment provider could not verify retirement.");
  }
  if (allowMissing && response.status === 404 && Array.isArray(data.errors) && data.errors.some(e => ["NOT_FOUND", "OBJECT_NOT_FOUND"].includes(text(record(e).code)))) return null;
  if (!response.ok || data.errors) throw hold("The old payment provider could not verify retirement.");
  return data;
}

/** Retire only exact CRM-owned links. No charge, refund, customer message, or ledger credit.
 * Evidence is saved only after provider readback and paid-tender/ledger agreement.
 * This runs only when Stripe's reservation identifies a historical collection conflict.
 */
export async function retireLegacySquareRequests(db: SupabaseClient, target: { quoteId?: string; bookkeepingEntryId?: string; jobId: string }) {
  if (process.env.VERCEL_ENV !== "production" || squareEnvironment() !== "production" || !squareAccessToken() || !squareLocationId()) throw hold("The historical payment connection is unavailable.");
  const targetId = target.quoteId || target.bookkeepingEntryId;
  if (!targetId || !target.jobId || (target.quoteId && target.bookkeepingEntryId)) throw hold("The exact historical ledger is unavailable.");
  const column = target.quoteId ? "quote_id" : "bookkeeping_entry_id";
  async function requests() {
    const r = await db.from("crm_square_requests").select("id,order_id,quote_id,bookkeeping_entry_id,amount_cents,created_at").eq("environment", "production").eq(column, targetId).order("id").limit(101);
    if (r.error || !r.data?.length || r.data.length > 100) throw hold("The complete historical request list could not be verified.");
    return r.data as LegacyRequest[];
  }
  const rows = await requests();
  const job = await db.from("crm_jobs").select("id,meta").eq("id", target.jobId).maybeSingle();
  if (job.error || !job.data || record(job.data.meta).deleted_at) throw hold("The active job could not be verified.");
  const plan = record(record(job.data.meta).payment_plan);
  if (plan.method === "square_autopay" && ["active", "pending_install"].includes(text(plan.status))) throw hold("An old saved-card agreement is still open.");
  const location = record((await provider(`/locations/${encodeURIComponent(squareLocationId())}`))?.location);
  if (location.id !== squareLocationId() || location.status !== "ACTIVE") throw hold("The old payment account location could not be verified.");

  // Conservatively require no open invoice/subscription in this location. Do not guess
  // customer matches or silently cancel independently managed provider obligations.
  for (const kind of ["invoices", "subscriptions"] as const) {
    let cursor = "";
    const seen = new Set<string>();
    do {
      const data = await (kind === "invoices"
        ? provider(`/invoices?${new URLSearchParams({ location_id: squareLocationId(), limit: "200", ...(cursor ? { cursor } : {}) })}`)
        : provider("/subscriptions/search", "POST", { query: { filter: { location_ids: [squareLocationId()] } }, ...(cursor ? { cursor } : {}) }));
      const items = data?.[kind];
      if (items !== undefined && !Array.isArray(items)) throw hold("Historical obligations could not be read completely.");
      const closed = kind === "invoices" ? ["PAID", "CANCELED", "REFUNDED"] : ["CANCELED", "COMPLETED", "DEACTIVATED"];
      if ((items as unknown[] || []).some(item => !closed.includes(text(record(item).status)))) throw hold(`An old ${kind === "invoices" ? "invoice" : "subscription"} still needs review.`);
      cursor = text(data?.cursor);
      if (cursor && (seen.has(cursor) || seen.size >= 20)) throw hold("Historical obligations could not be read completely.");
      if (cursor) seen.add(cursor);
    } while (cursor);
  }

  const evidence: Record<string, unknown>[] = [];
  async function verifyOrder(row: LegacyRequest, afterRetirement = false) {
    if (!row.order_id || !Number.isSafeInteger(Number(row.amount_cents)) || Number(row.amount_cents) <= 0) throw hold("An old link is missing its exact order identity.");
    const order = record((await provider(`/orders/${encodeURIComponent(row.order_id)}`))?.order);
    const metadata = record(order.metadata), total = record(order.total_money);
    if (order.id !== row.order_id || order.location_id !== squareLocationId() || metadata[column] !== targetId || metadata.job_id !== target.jobId || total.currency !== "USD" || total.amount !== Number(row.amount_cents) || !["DRAFT", "OPEN", "COMPLETED", "CANCELED"].includes(text(order.state))) throw hold("An old order does not match this exact ledger.");
    const paymentIds: string[] = [];
    let paid = 0;
    for (const raw of Array.isArray(order.tenders) ? order.tenders : []) {
      const tender = record(raw), id = text(tender.payment_id);
      if (!id) throw hold("An old order has a payment without a verified receipt.");
      const payment = record((await provider(`/payments/${encodeURIComponent(id)}`))?.payment);
      const amount = record(payment.total_money || payment.amount_money);
      if (payment.id !== id || payment.order_id !== row.order_id || payment.location_id !== squareLocationId() || payment.status !== "COMPLETED" || amount.currency !== "USD" || !Number.isSafeInteger(amount.amount) || Number(record(payment.refunded_money).amount || 0) !== 0) throw hold("An old payment is pending, refunded, or could not be verified.");
      let ledgerQuery = db.from("crm_quote_bookkeeping_payments").select("id,amount").eq(column, targetId).eq("external_source", "square").eq("external_id", id);
      if (target.bookkeepingEntryId) ledgerQuery = ledgerQuery.is("quote_id", null);
      const ledger = await ledgerQuery.limit(2);
      if (ledger.error || ledger.data?.length !== 1 || Math.round(Number(ledger.data[0].amount) * 100) !== amount.amount) throw hold("An old receipt does not agree with the recorded CRM payment.");
      paymentIds.push(id); paid += Number(amount.amount);
    }
    // Fulfilled payment links can retain an OPEN order after a completed payment.
    // Payment status and the matched ledger, rather than order state alone, prove payment.
    if ((paid !== 0 && paid !== total.amount) || (order.state === "COMPLETED" && paid !== total.amount)) throw hold("An old order has an unresolved payment balance.");
    if (afterRetirement && paid === 0 && order.state !== "CANCELED") throw hold("The old unpaid order has not been canceled.");
    return { orderState: order.state, paymentIds };
  }
  for (const row of rows) {
    const verified = await verifyOrder(row);
    const link = record((await provider(`/online-checkout/payment-links/${encodeURIComponent(row.id)}`, "GET", undefined, true))?.payment_link);
    if (Object.keys(link).length && (link.id !== row.id || link.order_id !== row.order_id)) throw hold("An old payment link belongs to a different order.");
    evidence.push({ linkId: row.id, orderId: row.order_id, ...verified, existed: Boolean(link.id) });
  }
  // All preflight checks succeed before changing any provider link.
  for (const item of evidence) {
    const path = `/online-checkout/payment-links/${encodeURIComponent(String(item.linkId))}`;
    if (item.existed) {
      const deleted = await provider(path, "DELETE", undefined, true);
      if (deleted && deleted.id !== item.linkId) throw hold("The provider did not confirm the exact link retirement.");
    }
    if (await provider(path, "GET", undefined, true)) throw hold("The old payment link is still available.");
    // Re-read order and every tender after retirement to catch a payment or refund
    // that changed during preflight. An unpaid order must now be canceled.
    Object.assign(item, await verifyOrder(rows.find(row => row.id === item.linkId)!, true));
  }
  if (JSON.stringify(await requests()) !== JSON.stringify(rows)) throw hold("Historical requests changed during verification.");
  const result = await db.rpc("clear_stripe_migration_target", {
    p_target: targetId,
    p_actor: "stripe-cutover-verifier",
    p_evidence: JSON.stringify({ checkedAt: new Date().toISOString(), location: squareLocationId(), invoices: "no open obligations", subscriptions: "no open obligations", crmSavedCardPlan: "none active", links: evidence }),
  });
  if (result.error) throw hold("Verified retirement evidence could not be saved.");
  return { retired: evidence.length };
}
