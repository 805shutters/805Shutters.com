import { CrmBookkeepingRow, CrmCommissionPayment, CrmCommissionSummary } from "@/lib/crm/types";

function roundCents(value: number) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function monthKey(value: string | null | undefined) {
  if (!value) return null;
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return null;
  return new Date(time).toISOString().slice(0, 7);
}

function monthStart(value: string | null | undefined) {
  const key = monthKey(value);
  return key ? `${key}-01` : null;
}

function paidInFullDate(row: CrmBookkeepingRow) {
  if (!row.isPaidInFull || row.total <= 0) return null;

  let applied = roundCents((row.creditIn || 0) - (row.creditOut || 0));
  const payments = [...row.payments].sort((left, right) => {
    const leftTime = Date.parse(left.paid_at || left.created_at || "");
    const rightTime = Date.parse(right.paid_at || right.created_at || "");
    return (Number.isFinite(leftTime) ? leftTime : 0) - (Number.isFinite(rightTime) ? rightTime : 0);
  });

  for (const payment of payments) {
    applied = roundCents(applied + (Number(payment.amount) || 0));
    if (applied >= row.total) {
      return payment.paid_at || payment.created_at || row.soldDate;
    }
  }

  return payments.at(-1)?.paid_at || payments.at(-1)?.created_at || row.soldDate;
}

function rowCommission(row: CrmBookkeepingRow) {
  const closedAt = paidInFullDate(row);
  if (!closedAt) return null;

  // No commission accrues until the MTS installer invoice is matched (or
  // waived) — without it the profit pool is missing the installation cost.
  if (row.isMissingInstallerInvoice) return null;

  const profit = roundCents(Math.max(row.remainingProfitBeforeJessica || 0, 0));
  if (profit <= 0) return null;

  if (row.salesOwner === "jessica") {
    const jessica = roundCents(profit * 0.5);
    return {
      periodMonth: monthStart(closedAt) || monthStart(row.soldDate) || "",
      mikeEarned: roundCents(profit - jessica),
      jessicaEarned: jessica
    };
  }

  if (row.salesOwner === "mike") {
    return {
      periodMonth: monthStart(closedAt) || monthStart(row.soldDate) || "",
      mikeEarned: profit,
      jessicaEarned: 0
    };
  }

  return null;
}

export function buildCommissionSummary(
  rows: CrmBookkeepingRow[],
  payments: CrmCommissionPayment[]
): CrmCommissionSummary {
  const monthMap = new Map<
    string,
    {
      periodMonth: string;
      mikeEarned: number;
      mikePaid: number;
      jessicaEarned: number;
      jessicaPaid: number;
    }
  >();

  const ensureMonth = (periodMonth: string) => {
    const month = monthStart(periodMonth) || `${periodMonth.slice(0, 7)}-01`;
    const existing = monthMap.get(month);
    if (existing) return existing;
    const created = {
      periodMonth: month,
      mikeEarned: 0,
      mikePaid: 0,
      jessicaEarned: 0,
      jessicaPaid: 0
    };
    monthMap.set(month, created);
    return created;
  };

  for (const row of rows) {
    const commission = rowCommission(row);
    if (!commission?.periodMonth) continue;
    const month = ensureMonth(commission.periodMonth);
    month.mikeEarned = roundCents(month.mikeEarned + commission.mikeEarned);
    month.jessicaEarned = roundCents(month.jessicaEarned + commission.jessicaEarned);
  }

  for (const payment of payments) {
    const month = ensureMonth(payment.period_month || payment.paid_on || payment.created_at);
    if (payment.recipient === "mike") {
      month.mikePaid = roundCents(month.mikePaid + payment.amount);
    } else {
      month.jessicaPaid = roundCents(month.jessicaPaid + payment.amount);
    }
  }

  let mikeBalance = 0;
  let jessicaBalance = 0;
  const monthly = [...monthMap.values()]
    .sort((left, right) => left.periodMonth.localeCompare(right.periodMonth))
    .map((month) => {
      mikeBalance = roundCents(mikeBalance + month.mikeEarned - month.mikePaid);
      jessicaBalance = roundCents(jessicaBalance + month.jessicaEarned - month.jessicaPaid);
      return {
        ...month,
        mikeBalance,
        jessicaBalance
      };
    });

  const totals = monthly.reduce(
    (sum, month) => ({
      mikeEarned: roundCents(sum.mikeEarned + month.mikeEarned),
      mikePaid: roundCents(sum.mikePaid + month.mikePaid),
      jessicaEarned: roundCents(sum.jessicaEarned + month.jessicaEarned),
      jessicaPaid: roundCents(sum.jessicaPaid + month.jessicaPaid)
    }),
    { mikeEarned: 0, mikePaid: 0, jessicaEarned: 0, jessicaPaid: 0 }
  );

  return {
    monthly,
    totals: {
      ...totals,
      mikeOwed: roundCents(totals.mikeEarned - totals.mikePaid),
      jessicaOwed: roundCents(totals.jessicaEarned - totals.jessicaPaid)
    }
  };
}
