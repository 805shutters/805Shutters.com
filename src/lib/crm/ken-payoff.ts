import type { CrmDashboardData } from "@/lib/crm/types";
import { kenPayoffView } from "./ken-payoff-view";
import { kenPayableReadiness } from "./ken-monthly-ledger";

/** Only fields displayed on Ken's read-only Payoff page leave the server. */
export function kenPayoffResponse(data: CrmDashboardData) {
  const ledger = data.ownerPayablesLedger;
  const view = kenPayoffView(data.bookkeepingRows, ledger);
  const payment = (batch: (typeof view.history)[number]) => ({
    id: batch.id, paidOn: batch.paidOn, amount: batch.amount, recordedAmount: batch.recordedAmount,
    note: batch.note, dueDate: batch.dueDate, paymentCutoffAt: batch.paymentCutoffAt,
    dateReviewRequired: batch.dateReviewRequired,
    reconciliation: batch.reconciliation ? { status: batch.reconciliation.status, reason: batch.reconciliation.reason } : undefined,
    allocations: batch.allocations.map(a => ({ id: a.id, customerName: a.customerName, quoteNumber: a.quoteNumber, amount: a.amount }))
  });
  return {
    target: ledger?.kenBuyout.target || 0,
    view: {
      total: view.total, paidTotal: view.paidTotal, remainingBuyout: view.remainingBuyout, dueDate: view.dueDate,
      ready: view.ready.map(({ row, item }) => ({
        row: { jobClosedAt: row.jobClosedAt }, automatic: kenPayableReadiness(row).automatic,
        item: { itemKey: item.itemKey, customerName: item.customerName, quoteNumber: item.quoteNumber,
          dueDate: item.dueDate, eligibleAt: item.eligibleAt, total: item.total,
          owedAmount: item.owedAmount, paidAmount: item.paidAmount, remainingAmount: item.remainingAmount }
      })),
      history: view.history.map(payment), review: view.review.map(payment), duplicates: view.duplicates.map(payment)
    }
  };
}
export type KenPayoffData = ReturnType<typeof kenPayoffResponse>;
