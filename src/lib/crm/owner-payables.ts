import { reconcileKenMonthlyLedger } from "./ken-monthly-ledger";
import { effectiveBookkeepingStatus } from "./bookkeeping";
import { buildPartnerPaymentLedger } from "./partner-payments";
import type { CrmBookkeepingRow } from "./types";

export const OWNER_PAYABLES_MODEL = "equal_owners_v1" as const;
export const payableMoney = (value: number) => Math.round(value * 100) / 100;

export function ownerPayableFinancials(row: CrmBookkeepingRow) {
  const buyout = payableMoney(row.total * 0.1);
  const installation = payableMoney(row.installationInvoiceAmount || 0);
  const profit = payableMoney(row.total - row.cogs - installation - buyout);
  // Split integer cents without creating an extra cent on odd-cent jobs.
  const mike = Math.floor(Math.round(Math.max(profit, 0) * 100) / 2) / 100;
  const jessica = payableMoney(Math.max(profit, 0) - mike);
  return { buyout, installation, profit, mike, jessica };
}

export function ownerPayableReadiness(row: CrmBookkeepingRow) {
  const correction = row.meta?.ownerPayableReadiness as { ready?: unknown; reason?: string; updatedAt?: string } | undefined;
  const automatic = row.total > 0 && row.isPaidInFull && effectiveBookkeepingStatus(row) === "closed";
  return {
    ready: typeof correction?.ready === "boolean" ? correction.ready : automatic,
    automatic: typeof correction?.ready !== "boolean",
    reason: correction?.reason || "",
    revision: correction?.updatedAt || null
  };
}

export function isOwnerPayableJob(row: CrmBookkeepingRow) {
  return row.total > 0 && (row.isPaidInFull || ["sold", "approved", "ordered", "received", "installed", "invoiced", "paid", "legacy", "manual", "closed"].includes(row.liveStatus || row.status));
}

export function projectOwnerPayableRows(rows: CrmBookkeepingRow[]) {
  return rows.filter(isOwnerPayableJob).map(row => {
    const amounts = ownerPayableFinancials(row);
    const readiness = ownerPayableReadiness(row);
    return {
      ...row,
      isPaidInFull: readiness.ready,
      // A manual correction has its own timestamp; it never adds a customer payment.
      soldDate: row.soldDate || readiness.revision,
      kenCut: amounts.buyout,
      mikeProfit: amounts.mike,
      jessicaCommission: amounts.jessica,
      remainingProfitBeforeJessica: amounts.profit,
      isInstallationComplete: true,
      installationInvoiceAmount: amounts.installation
    };
  });
}

export function buildOwnerPayablesLedger(input: Parameters<typeof buildPartnerPaymentLedger>[0] & { now?: Date | string }) {
  const ledger = buildPartnerPaymentLedger({ ...input, earningsModel: OWNER_PAYABLES_MODEL, rows: projectOwnerPayableRows(input.rows) });
  for (const person of ["mike", "jessica"] as const) {
    const account = ledger.people[person];
    // Preserve every historical payment, including payments larger than the new
    // 50% entitlement. Excess remains an account credit, never discarded.
    const recorded = payableMoney(ledger.history.filter(batch => batch.person === person).reduce((sum, batch) => sum + batch.amount, 0));
    account.owed = payableMoney(account.earned - recorded);
    account.advanceBalance = Math.max(0, -account.owed);
    // Apply existing advances/excess payments to open shares for this view.
    // Explicit historical allocations already counted by the ledger are never
    // applied twice. This changes only the projection, not payment records.
    let credit = payableMoney(Math.max(0, account.items.reduce((sum, item) => sum + item.remainingAmount, 0) - Math.max(0, account.owed)));
    for (const item of [...account.items].sort((a, b) => (a.closedAt || "").localeCompare(b.closedAt || "") || a.itemKey.localeCompare(b.itemKey))) {
      const applied = payableMoney(Math.min(credit, item.remainingAmount));
      if (applied <= 0) continue;
      item.accountCreditApplied = applied;
      item.paidAmount = payableMoney(item.paidAmount + applied);
      item.remainingAmount = payableMoney(item.remainingAmount - applied);
      item.paymentState = item.remainingAmount === 0 ? "paid" : "partial";
      credit = payableMoney(credit - applied);
    }
    account.activeItems = account.items.filter(item => item.remainingAmount > 0);
    account.activeJobCount = account.activeItems.length;
    account.paid = payableMoney(account.items.reduce((sum, item) => sum + item.paidAmount, 0));
  }
  ledger.activeItems = ledger.activeItems.filter(item => item.remainingAmount > 0);
  return reconcileKenMonthlyLedger(ledger, input);
}

export function resolveOwnerPaymentAmount(value: unknown, allocationRemaining: number, accountRemaining: number) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0 || Math.abs(amount - payableMoney(amount)) > 0.00001) {
    throw new Error("Enter a positive payment amount with at most two decimal places.");
  }
  if (amount > Math.min(allocationRemaining, Math.max(0, accountRemaining)) + 0.001) {
    throw new Error("Payment exceeds the remaining job or account balance. Reload Payables before recording it.");
  }
  return payableMoney(amount);
}
