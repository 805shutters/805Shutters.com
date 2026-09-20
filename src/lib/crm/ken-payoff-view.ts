import { isPayablesLedgerJob, payableMoney } from "./owner-payables";
import { partnerPaymentItemKeyForRow } from "./partner-payments";
import type { CrmBookkeepingRow, CrmPartnerPaymentLedger, CrmPartnerPaymentLedgerItem } from "./types";
export type PayoffReadyJob = { row: CrmBookkeepingRow; item: CrmPartnerPaymentLedgerItem };
/** Intersect monthly obligations with current paid/closed records. History is immutable. */
export function kenPayoffView(rows: CrmBookkeepingRow[], ledger?: CrmPartnerPaymentLedger) {
  const eligible = new Map(rows.filter(isPayablesLedgerJob).map(row => [partnerPaymentItemKeyForRow("ken", row), row]));
  const ready: PayoffReadyJob[] = [];
  const seen = new Set<string>();
  for (const item of ledger?.kenMonthly?.items || []) {
    const row = eligible.get(item.itemKey);
    if (!row || seen.has(item.itemKey) || item.person !== "ken" || item.remainingAmount <= 0 || !item.eligibleAt || !item.dueDate || item.dueDate > ledger!.kenMonthly!.dueDate) continue;
    seen.add(item.itemKey); ready.push({ row, item });
  }
  const batches = (ledger?.history || []).filter(batch => batch.person === "ken");
  const history = batches.filter(batch => batch.reconciliation?.status === "payment");
  const paidTotal = payableMoney(history.reduce((sum, batch) => sum + (batch.recordedAmount ?? batch.amount), 0));
  return { paidTotal, remainingBuyout: payableMoney(Math.max(0, (ledger?.kenBuyout.target || 0) - paidTotal)), ready, total: payableMoney(ready.reduce((sum, { item }) => sum + item.remainingAmount, 0)), dueDate: ledger?.kenMonthly?.dueDate,
    history,
    review: batches.filter(batch => !batch.reconciliation || batch.reconciliation.status === "review"),
    duplicates: batches.filter(batch => batch.reconciliation?.status === "confirmed_duplicate") };
}
export function payoffSelection(ready: PayoffReadyJob[], keys: string[]) {
  const unique = [...new Set(keys)];
  const items = unique.map(key => ready.find(({ item }) => item.itemKey === key));
  if (!unique.length || items.some(item => !item)) return null;
  const selected = items as PayoffReadyJob[];
  return { items: selected, total: payableMoney(selected.reduce((sum, { item }) => sum + item.remainingAmount, 0)), snapshot: JSON.stringify(selected.map(({ item }) => [item.itemKey, item.remainingAmount, item.eligibleAt, item.dueDate])) };
}
