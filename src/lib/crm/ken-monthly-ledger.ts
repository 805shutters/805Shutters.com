import { BUSINESS_PAYOFF_TARGET } from "./bookkeeping";
import { explicitAllocationHistory, historyFromKenPayment, paymentMetadataAllocations, paymentPersonFromKenPayment, partnerPaymentItemKeyForRow } from "./partner-payments";
import type { CrmBookkeepingRow, CrmKenPayment, CrmKenPaymentAllocation, CrmPartnerPaymentHistoryAllocation, CrmPartnerPaymentLedger, CrmPartnerPaymentLedgerItem } from "./types";

const money = (value: number) => Math.round(value * 100) / 100;
const text = (value: unknown) => typeof value === "string" && value.trim() ? value : null;
const valid = (value: unknown): value is string => typeof value === "string" && Number.isFinite(Date.parse(value));
export function pacificDate(value: string | Date) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}
export function nextKenDueDate(value: string | Date) {
  const [year, month] = pacificDate(value).split("-").map(Number);
  return new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
}
// Date-only evidence cannot establish ordering within the day. It must be
// strictly before the payment day; timestamp evidence uses a strict cutoff.
export function eligibleBeforeCutoff(eligibleAt: string, cutoff: string) {
  return eligibleAt.length === 10 || cutoff.length === 10
    ? pacificDate(eligibleAt) < pacificDate(cutoff)
    : Date.parse(eligibleAt) < Date.parse(cutoff);
}
function latest(values: string[]) {
  return values.sort((a, b) => pacificDate(a).localeCompare(pacificDate(b)) || (a.length === 10 ? 1 : b.length === 10 ? -1 : Date.parse(a) - Date.parse(b))).at(-1) || null;
}
export function kenPayableReadiness(row: CrmBookkeepingRow) {
  const correction = (row.meta?.kenPayableReadiness || row.meta?.ownerPayableReadiness) as { ready?: unknown; reason?: string; updatedAt?: string } | undefined;
  if (typeof correction?.ready === "boolean") {
    const accepted = Boolean(correction.reason?.trim() && valid(correction.updatedAt));
    return { ready: correction.ready && accepted, automatic: false, reason: correction.reason || "", revision: correction.updatedAt || null,
      eligibleAt: correction.ready && accepted ? correction.updatedAt! : null, reviewReason: accepted ? null : "Manual readiness needs a reason and timestamp." };
  }
  const closed = row.jobStatus === "closed" || (!row.jobStatus && row.status === "closed");
  const complete = row.isInstallationComplete || valid(row.completedAt);
  const ready = row.total > 0 && row.isPaidInFull && complete && closed;
  let paid = money((row.creditIn || 0) - (row.creditOut || 0));
  let paidAt: string | null = null;
  for (const payment of [...row.payments].sort((a, b) => (a.paid_at || a.created_at).localeCompare(b.paid_at || b.created_at))) {
    paid = money(paid + Number(payment.amount));
    if (paid >= row.total) { paidAt = payment.paid_at || null; break; }
  }
  // Credits may have completed payment later than the final cash receipt.
  const creditDates = row.creditsIn.map(credit => credit.created_at).filter(valid);
  if (row.creditIn > 0 && creditDates.length) paidAt = latest([...(paidAt ? [paidAt] : []), ...creditDates]);
  const completedAt = row.completedAt || row.installationMatchedAt;
  const closedAt = row.jobClosedAt;
  const datesKnown = valid(paidAt) && valid(completedAt) && valid(closedAt);
  return { ready, automatic: true, reason: "", revision: correction?.updatedAt || null,
    eligibleAt: ready && datesKnown ? latest([paidAt!, completedAt!, closedAt!]) : null,
    reviewReason: ready && !datesKnown ? "Missing payment, completion, or closure date. Review readiness before assigning a monthly ledger." : null };
}

function sameIdentity(a: CrmPartnerPaymentHistoryAllocation, b: CrmPartnerPaymentHistoryAllocation) {
  // Conflicting stable identifiers cannot be rescued by a matching name or key.
  for (const field of ["quoteId", "bookkeepingEntryId", "jobId"] as const) if (a[field] && b[field] && a[field] !== b[field]) return false;
  return a.itemKey === b.itemKey || Boolean(a.quoteId && a.quoteId === b.quoteId) || Boolean(a.bookkeepingEntryId && a.bookkeepingEntryId === b.bookkeepingEntryId);
}
const checkboxEntry = (payment: CrmKenPayment) => /^Manual paid checkbox reconciliation for /i.test(payment.note || "") || payment.meta?.batchSource === "manual_paid_checkbox_reconciliation";

/** A read-only projection: source payments and allocations are never rewritten. */
export function reconcileKenMonthlyLedger(ledger: CrmPartnerPaymentLedger, input: { rows: CrmBookkeepingRow[]; kenPayments: CrmKenPayment[]; kenAllocations?: CrmKenPaymentAllocation[]; now?: Date | string }) {
  const now = new Date(input.now || new Date());
  const today = pacificDate(now);
  let dueDate = nextKenDueDate(now);
  const review: NonNullable<CrmPartnerPaymentLedger["kenMonthly"]>["review"] = [];
  const raw = input.kenPayments.filter(payment => paymentPersonFromKenPayment(payment) === "ken");
  const allocations = input.kenAllocations || [];
  const history = raw.map(payment => {
    const batch = historyFromKenPayment(payment);
    const explicit = allocations.filter(allocation => allocation.payment_id === payment.id).map(explicitAllocationHistory);
    batch.allocations = explicit.length ? explicit : paymentMetadataAllocations(payment.id, "ken", payment.meta);
    batch.recordedAmount = batch.amount;
    batch.paymentCutoffAt = text(payment.meta?.paymentCutoffAt);
    batch.dueDate = text(payment.meta?.dueDate);
    batch.dateReviewRequired = !valid(batch.paymentCutoffAt) || !batch.dueDate || batch.allocations.some(a => !valid(a.eligibleAt));
    const balanced = money(batch.allocations.reduce((sum, allocation) => sum + allocation.amount, 0)) === batch.amount;
    batch.reconciliation = { status: balanced ? "payment" : "review", matchedBatchIds: [], reason: balanced ? "Recorded payment; exact allocations retained." : "Allocation amounts do not equal the payment; review before applying to jobs." };
    if (!balanced) review.push({ id: `allocation-total:${batch.id}`, label: batch.paidOn || batch.id, reason: batch.reconciliation.reason });
    if (batch.dateReviewRequired) review.push({ id: batch.id, label: batch.paidOn || batch.id, reason: "Historical cutoff, due date, or eligibility time is missing; allocations remain frozen." });
    return batch;
  });
  const byId = new Map(history.map(batch => [batch.id, batch]));
  const actual = raw.filter(payment => !checkboxEntry(payment)).map(payment => byId.get(payment.id)!);
  if (today.endsWith("-01") && !actual.some(batch => batch.paidOn === today)) dueDate = today;
  const consumed = new Set<string>();
  for (const marker of raw.filter(checkboxEntry)) {
    const batch = byId.get(marker.id)!;
    const matches = batch.allocations.map(a => actual.filter(candidate => candidate.reconciliation?.status === "payment").flatMap(candidate => candidate.allocations.filter(b => !consumed.has(b.id) && money(a.amount) === money(b.amount) && sameIdentity(a, b)).map(b => ({ batch: candidate, allocation: b }))));
    const matchedIds = matches.map(m => m[0]?.allocation.id);
    const confirmed = matches.length > 0 && matches.every(m => m.length === 1) && new Set(matchedIds).size === matchedIds.length && money(batch.allocations.reduce((sum, a) => sum + a.amount, 0)) === batch.amount;
    if (confirmed) {
      matches.forEach(m => consumed.add(m[0].allocation.id));
      batch.recordedAmount = 0;
      batch.reconciliation = { status: "confirmed_duplicate", matchedBatchIds: [...new Set(matches.map(m => m[0].batch.id))], reason: "Historical checkbox entry is already included in the linked payment batch. Original record retained." };
    } else {
      batch.reconciliation = { status: "review", matchedBatchIds: [], reason: "Checkbox entry cannot be uniquely reconciled by exact job identity and amount." };
      review.push({ id: batch.id, label: batch.note || batch.id, reason: batch.reconciliation.reason });
    }
  }
  const items: CrmPartnerPaymentLedgerItem[] = [];
  const remainingAllocations = new Set(history.flatMap(batch => batch.recordedAmount ? batch.allocations.map(a => a.id) : []));
  for (const row of input.rows.filter(row => row.total > 0)) {
    const itemKey = partnerPaymentItemKeyForRow("ken", row);
    const readiness = kenPayableReadiness(row);
    const identity = { itemKey, quoteId: row.quoteId, bookkeepingEntryId: row.source === "crm_quote" ? null : row.id, jobId: row.jobId };
    const match = (a: CrmPartnerPaymentHistoryAllocation) => {
      if (a.itemKey === itemKey) return true;
      const candidates = input.rows.filter(candidate => a.quoteId ? candidate.quoteId === a.quoteId || candidate.quoteIdAliases?.includes(a.quoteId) : a.bookkeepingEntryId ? candidate.source !== "crm_quote" && candidate.id === a.bookkeepingEntryId : false);
      return candidates.length === 1 && candidates[0] === row;
    };
    const paidAllocations = history.filter(batch => batch.recordedAmount && batch.reconciliation?.status === "payment").flatMap(batch => batch.allocations).filter(match);
    const paidAmount = money(paidAllocations.reduce((sum, a) => sum + a.amount, 0));
    const datedReady = readiness.ready && Boolean(readiness.eligibleAt) && pacificDate(readiness.eligibleAt!) <= pacificDate(now);
    if (readiness.reviewReason) review.push({ id: itemKey, label: row.customerName, reason: readiness.reviewReason });
    if (!datedReady && !paidAmount) continue;
    const entitlement = money(row.total * .1);
    // Historical allocations remain paid even if the current job was reopened.
    // Only the currently eligible remainder can enter a new monthly ledger.
    const owedAmount = datedReady ? Math.max(entitlement, paidAmount) : paidAmount;
    const remainingAmount = money(Math.max(owedAmount - paidAmount, 0));
    if (paidAmount > entitlement) review.push({ id: itemKey, label: row.customerName, reason: "Recorded allocations exceed the current contract's 10% entitlement." });
    paidAllocations.forEach(a => { remainingAllocations.delete(a.id); a.resolvedItemKey = itemKey; a.resolution = "exact_key"; });
    items.push({ id: itemKey, person: "ken", source: row.source, ...identity, quoteIdAliases: row.quoteIdAliases || [], customerName: row.customerName, quoteNumber: row.quoteNumber,
      closedAt: readiness.eligibleAt, eligibleAt: readiness.eligibleAt, dueDate: readiness.eligibleAt ? nextKenDueDate(readiness.eligibleAt) : null,
      periodMonth: readiness.eligibleAt ? nextKenDueDate(readiness.eligibleAt) : null, sourceStatus: row.liveStatus || row.status, salesOwner: row.salesOwner, total: row.total, advertisingReserve: row.advertisingReserve,
      owedAmount, paidAmount, remainingAmount, paymentState: remainingAmount ? paidAmount ? "partial" : "unpaid" : "paid", explicitAllocationIds: paidAllocations.map(a => a.id), legacyPaidAmount: 0,
      rawExplicitPaidAmount: money(allocations.filter(a => a.item_key === itemKey).reduce((sum, a) => sum + a.amount, 0)), reviewReason: readiness.reviewReason });
  }
  for (const batch of history.filter(batch => batch.recordedAmount)) {
    batch.unappliedAmount = money(Math.max(0, batch.amount - batch.allocations.filter(a => !remainingAllocations.has(a.id)).reduce((sum, a) => sum + a.amount, 0)));
    if (batch.unappliedAmount > 0) review.push({ id: `unallocated:${batch.id}`, label: batch.paidOn || batch.id, reason: `${batch.unappliedAmount.toFixed(2)} has no confirmed current job allocation. It will not pay a different job.` });
  }
  // The old synthetic Elizabeth $63.30 adjustment was never a cash payment.
  // Exact checkbox-to-batch reconciliation above retains its source history;
  // only persisted payments contribute to the overall buyout balance.
  const recordedTotal = money(history.reduce((sum, b) => sum + (b.recordedAmount || 0), 0));
  let runningPaid = 0;
  const payments = history.filter(b => b.recordedAmount).sort((a, b) => (a.paidOn || a.createdAt).localeCompare(b.paidOn || b.createdAt)).map(b => {
    runningPaid = money(runningPaid + b.recordedAmount!);
    return { id: b.id, paidOn: b.paidOn, amount: b.recordedAmount!, note: b.note, createdByEmail: b.createdByEmail, runningPaid, remainingBalance: money(Math.max(BUSINESS_PAYOFF_TARGET - runningPaid, 0)) };
  });
  const activeItems = items.filter(item => item.remainingAmount > 0);
  const earned = money(items.reduce((sum, item) => sum + item.owedAmount, 0));
  const owed = money(activeItems.reduce((sum, item) => sum + item.remainingAmount, 0));
  ledger.people.ken = { ...ledger.people.ken, earned, paid: recordedTotal, owed, advanceBalance: 0, items, activeItems, jobCount: items.length, activeJobCount: activeItems.length };
  ledger.activeItems = [...ledger.activeItems.filter(item => item.person !== "ken"), ...activeItems];
  ledger.history = [...ledger.history.filter(batch => batch.person !== "ken"), ...history].sort((a, b) => (b.paidOn || b.createdAt).localeCompare(a.paidOn || a.createdAt));
  ledger.kenBuyout = { target: BUSINESS_PAYOFF_TARGET, totalPaid: recordedTotal, remainingBalance: money(Math.max(BUSINESS_PAYOFF_TARGET - recordedTotal, 0)), paidPct: Math.min(100, recordedTotal / BUSINESS_PAYOFF_TARGET * 100), paymentCount: payments.length, payments };
  const monthlyItems = activeItems.filter(item => item.dueDate && item.dueDate <= dueDate);
  ledger.kenMonthly = { dueDate, total: money(monthlyItems.reduce((sum, item) => sum + item.remainingAmount, 0)), recordedTotal, excludedDuplicates: money(history.reduce((sum, b) => sum + b.amount - (b.recordedAmount || 0), 0)), items: monthlyItems, review };
  return ledger;
}
