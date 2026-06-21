import {
  CrmBookkeepingRow,
  CrmCommissionPayment,
  CrmCommissionPaymentAllocation,
  CrmKenPayment,
  CrmKenPaymentAllocation,
  CrmPartnerPaymentHistoryAllocation,
  CrmPartnerPaymentHistoryBatch,
  CrmPartnerPaymentLedger,
  CrmPartnerPaymentLedgerItem,
  CrmPaymentPerson
} from "@/lib/crm/types";

type EarnedItem = Omit<
  CrmPartnerPaymentLedgerItem,
  "paidAmount" | "remainingAmount" | "paymentState" | "explicitAllocationIds" | "legacyPaidAmount"
>;

type WorkingItem = EarnedItem & {
  explicitPaidAmount: number;
  explicitAllocationIds: string[];
  legacyPaidAmount: number;
};

const partnerLabels: Record<CrmPaymentPerson, string> = {
  ken: "Ken",
  mike: "Mike",
  jessica: "Jessica"
};

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

function paymentSortValue(value: string | null | undefined) {
  const time = Date.parse(value || "");
  return Number.isFinite(time) ? time : 0;
}

function paidInFullDate(row: CrmBookkeepingRow) {
  if (!row.isPaidInFull || row.total <= 0) return null;

  let applied = roundCents((row.creditIn || 0) - (row.creditOut || 0));
  const payments = [...row.payments].sort((left, right) => {
    const leftTime = paymentSortValue(left.paid_at || left.created_at);
    const rightTime = paymentSortValue(right.paid_at || right.created_at);
    return leftTime - rightTime;
  });

  for (const payment of payments) {
    applied = roundCents(applied + (Number(payment.amount) || 0));
    if (applied >= row.total) {
      return payment.paid_at || payment.created_at || row.soldDate;
    }
  }

  return payments.at(-1)?.paid_at || payments.at(-1)?.created_at || row.soldDate;
}

function rowIdentity(row: CrmBookkeepingRow) {
  return {
    source: row.source,
    quoteId: row.quoteId,
    bookkeepingEntryId: row.source === "crm_quote" ? null : row.id,
    jobId: row.jobId
  };
}

function createEarnedItem({
  row,
  person,
  amount,
  closedAt
}: {
  row: CrmBookkeepingRow;
  person: CrmPaymentPerson;
  amount: number;
  closedAt: string | null;
}): EarnedItem | null {
  const owedAmount = roundCents(amount);
  if (owedAmount <= 0) return null;
  const identity = rowIdentity(row);
  const itemKey = `${person}:${row.source}:${row.id}`;

  return {
    id: itemKey,
    itemKey,
    person,
    ...identity,
    customerName: row.customerName,
    quoteNumber: row.quoteNumber,
    closedAt,
    periodMonth: monthStart(closedAt) || monthStart(row.soldDate),
    sourceStatus: row.liveStatus || row.status,
    salesOwner: row.salesOwner,
    total: roundCents(row.total),
    owedAmount
  };
}

export function buildPartnerPaymentEarnedItems(rows: CrmBookkeepingRow[]) {
  const items: EarnedItem[] = [];

  for (const row of rows) {
    const closedAt = paidInFullDate(row);
    if (!closedAt) continue;

    const kenItem = createEarnedItem({
      row,
      person: "ken",
      amount: row.kenCut,
      closedAt
    });
    if (kenItem) items.push(kenItem);

    const profit = roundCents(Math.max(row.remainingProfitBeforeJessica || 0, 0));
    if (profit <= 0) continue;

    if (row.salesOwner === "mike") {
      const mikeItem = createEarnedItem({ row, person: "mike", amount: profit, closedAt });
      if (mikeItem) items.push(mikeItem);
    }

    if (row.salesOwner === "jessica") {
      const jessicaShare = roundCents(profit * 0.5);
      const jessicaItem = createEarnedItem({ row, person: "jessica", amount: jessicaShare, closedAt });
      const mikeItem = createEarnedItem({ row, person: "mike", amount: roundCents(profit - jessicaShare), closedAt });
      if (jessicaItem) items.push(jessicaItem);
      if (mikeItem) items.push(mikeItem);
    }
  }

  return items.sort(compareEarnedItems);
}

function compareEarnedItems(left: Pick<EarnedItem, "closedAt" | "customerName" | "itemKey">, right: Pick<EarnedItem, "closedAt" | "customerName" | "itemKey">) {
  const closed = (left.closedAt || "").localeCompare(right.closedAt || "");
  if (closed) return closed;
  const customer = left.customerName.localeCompare(right.customerName);
  if (customer) return customer;
  return left.itemKey.localeCompare(right.itemKey);
}

function historyFromKenPayment(payment: CrmKenPayment): CrmPartnerPaymentHistoryBatch {
  return {
    id: payment.id,
    person: "ken",
    source: "ken_payment",
    paidOn: payment.paid_on,
    periodMonth: payment.period_month,
    amount: roundCents(payment.amount),
    note: payment.note,
    createdByEmail: payment.created_by_email,
    createdAt: payment.created_at,
    updatedAt: payment.updated_at,
    isLegacy: false,
    allocations: []
  };
}

function historyFromCommissionPayment(payment: CrmCommissionPayment): CrmPartnerPaymentHistoryBatch {
  return {
    id: payment.id,
    person: payment.recipient,
    source: "commission_payment",
    paidOn: payment.paid_on,
    periodMonth: payment.period_month,
    amount: roundCents(payment.amount),
    note: payment.note,
    createdByEmail: payment.created_by_email,
    createdAt: payment.created_at,
    updatedAt: payment.updated_at,
    isLegacy: false,
    allocations: []
  };
}

function explicitAllocationHistory(
  allocation: CrmKenPaymentAllocation | CrmCommissionPaymentAllocation
): CrmPartnerPaymentHistoryAllocation {
  return {
    id: allocation.id,
    itemKey: allocation.item_key,
    customerName: allocation.customer_name,
    closedAt: allocation.closed_at,
    amount: roundCents(allocation.amount),
    source: allocation.source,
    quoteId: allocation.quote_id,
    bookkeepingEntryId: allocation.bookkeeping_entry_id,
    jobId: allocation.job_id,
    virtual: false
  };
}

function itemVirtualHistory(paymentId: string, item: WorkingItem, amount: number): CrmPartnerPaymentHistoryAllocation {
  return {
    id: `legacy-${paymentId}-${item.itemKey}`,
    itemKey: item.itemKey,
    customerName: item.customerName,
    closedAt: item.closedAt,
    amount: roundCents(amount),
    source: item.source,
    quoteId: item.quoteId,
    bookkeepingEntryId: item.bookkeepingEntryId,
    jobId: item.jobId,
    virtual: true
  };
}

export function buildPartnerPaymentLedger({
  rows,
  kenPayments,
  commissionPayments,
  kenAllocations = [],
  commissionAllocations = []
}: {
  rows: CrmBookkeepingRow[];
  kenPayments: CrmKenPayment[];
  commissionPayments: CrmCommissionPayment[];
  kenAllocations?: CrmKenPaymentAllocation[];
  commissionAllocations?: CrmCommissionPaymentAllocation[];
}): CrmPartnerPaymentLedger {
  const earnedItems = buildPartnerPaymentEarnedItems(rows);
  const workingByPerson: Record<CrmPaymentPerson, WorkingItem[]> = {
    ken: [],
    mike: [],
    jessica: []
  };
  const workingByKey = new Map<string, WorkingItem>();

  for (const item of earnedItems) {
    const working: WorkingItem = {
      ...item,
      explicitPaidAmount: 0,
      explicitAllocationIds: [],
      legacyPaidAmount: 0
    };
    workingByPerson[item.person].push(working);
    workingByKey.set(item.itemKey, working);
  }

  const history = new Map<string, CrmPartnerPaymentHistoryBatch>();
  for (const payment of kenPayments) history.set(payment.id, historyFromKenPayment(payment));
  for (const payment of commissionPayments) history.set(payment.id, historyFromCommissionPayment(payment));

  const explicitTotalsByPayment = new Map<string, number>();

  for (const allocation of kenAllocations) {
    const amount = roundCents(allocation.amount);
    explicitTotalsByPayment.set(allocation.payment_id, roundCents((explicitTotalsByPayment.get(allocation.payment_id) || 0) + amount));
    const item = workingByKey.get(allocation.item_key);
    if (item && item.person === "ken") {
      item.explicitPaidAmount = roundCents(item.explicitPaidAmount + amount);
      item.explicitAllocationIds.push(allocation.id);
    }
    history.get(allocation.payment_id)?.allocations.push(explicitAllocationHistory(allocation));
  }

  for (const allocation of commissionAllocations) {
    const amount = roundCents(allocation.amount);
    explicitTotalsByPayment.set(allocation.payment_id, roundCents((explicitTotalsByPayment.get(allocation.payment_id) || 0) + amount));
    const item = workingByKey.get(allocation.item_key);
    if (item && item.person === allocation.recipient) {
      item.explicitPaidAmount = roundCents(item.explicitPaidAmount + amount);
      item.explicitAllocationIds.push(allocation.id);
    }
    history.get(allocation.payment_id)?.allocations.push(explicitAllocationHistory(allocation));
  }

  const applyLegacyRemainder = (batch: CrmPartnerPaymentHistoryBatch) => {
    let remaining = roundCents(batch.amount - (explicitTotalsByPayment.get(batch.id) || 0));
    if (remaining <= 0) return;

    const items = [...workingByPerson[batch.person]].sort(compareEarnedItems);
    for (const item of items) {
      const alreadyPaid = roundCents(item.explicitPaidAmount + item.legacyPaidAmount);
      const itemRemaining = roundCents(item.owedAmount - alreadyPaid);
      if (itemRemaining <= 0) continue;

      const applied = roundCents(Math.min(itemRemaining, remaining));
      item.legacyPaidAmount = roundCents(item.legacyPaidAmount + applied);
      batch.allocations.push(itemVirtualHistory(batch.id, item, applied));
      batch.isLegacy = true;
      remaining = roundCents(remaining - applied);
      if (remaining <= 0) break;
    }
  };

  const sortedHistory = [...history.values()].sort((left, right) => {
    const paid = paymentSortValue(left.paidOn || left.createdAt) - paymentSortValue(right.paidOn || right.createdAt);
    if (paid) return paid;
    return left.id.localeCompare(right.id);
  });

  for (const batch of sortedHistory) {
    applyLegacyRemainder(batch);
    batch.allocations.sort((left, right) => {
      const closed = (left.closedAt || "").localeCompare(right.closedAt || "");
      if (closed) return closed;
      return left.customerName.localeCompare(right.customerName);
    });
  }

  const ledgerItems = earnedItems.map((item) => {
    const working = workingByKey.get(item.itemKey);
    const paidAmount = roundCents(Math.min(item.owedAmount, (working?.explicitPaidAmount || 0) + (working?.legacyPaidAmount || 0)));
    const remainingAmount = roundCents(Math.max(item.owedAmount - paidAmount, 0));
    const paymentState = remainingAmount <= 0 ? "paid" : paidAmount > 0 ? "partial" : "unpaid";

    return {
      ...item,
      paidAmount,
      remainingAmount,
      paymentState,
      explicitAllocationIds: working?.explicitAllocationIds || [],
      legacyPaidAmount: roundCents(working?.legacyPaidAmount || 0)
    } satisfies CrmPartnerPaymentLedgerItem;
  });

  const activeItems = ledgerItems.filter((item) => item.remainingAmount > 0).sort(compareEarnedItems);

  const people = (["ken", "mike", "jessica"] as const).reduce(
    (record, person) => {
      const personItems = ledgerItems.filter((item) => item.person === person);
      const personActive = activeItems.filter((item) => item.person === person);
      const earned = roundCents(personItems.reduce((sum, item) => sum + item.owedAmount, 0));
      const paid = roundCents(personItems.reduce((sum, item) => sum + item.paidAmount, 0));
      const owed = roundCents(personActive.reduce((sum, item) => sum + item.remainingAmount, 0));
      record[person] = {
        person,
        label: partnerLabels[person],
        earned,
        paid,
        owed,
        jobCount: personItems.length,
        activeJobCount: personActive.length,
        activeItems: personActive
      };
      return record;
    },
    {} as CrmPartnerPaymentLedger["people"]
  );

  return {
    people,
    activeItems,
    history: sortedHistory.sort((left, right) => paymentSortValue(right.paidOn || right.createdAt) - paymentSortValue(left.paidOn || left.createdAt))
  };
}

export function paymentPersonLabel(person: CrmPaymentPerson) {
  return partnerLabels[person];
}

