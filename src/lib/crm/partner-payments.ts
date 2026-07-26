import {
  BUSINESS_PAYOFF_TARGET,
  effectiveBookkeepingStatus,
  isPaidInFullBookkeepingRow
} from "@/lib/crm/bookkeeping";
import {
  CrmBookkeepingRow,
  CrmBookkeepingStatus,
  CrmCommissionPayment,
  CrmCommissionPaymentAllocation,
  CrmKenPayment,
  CrmKenPaymentAllocation,
  CrmKenBuyoutLedger,
  CrmPartnerJobLedgerItem,
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

const SOLD_EARNING_STATUSES = new Set<CrmBookkeepingStatus>([
  "sold",
  "approved",
  "ordered",
  "received",
  "installed",
  "invoiced",
  "paid",
  "closed",
  "legacy",
  "manual"
]);

const INITIAL_KEN_BUYOUT_PAYMENT_AMOUNT = 3714.7;
const INITIAL_KEN_BUYOUT_ADJUSTMENTS = [
  {
    id: "initial-ken-buyout-elizabeth-mathieu",
    paidOn: "2026-07-04",
    amount: 63.3,
    note: "Elizabeth Mathieu paid job adjustment",
    createdByEmail: null
  }
];

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

export function partnerPaymentItemKeyForRow(person: CrmPaymentPerson, row: CrmBookkeepingRow) {
  return `${person}:${row.source}:${row.id}`;
}

export function partnerPaymentAmountForRow(person: CrmPaymentPerson, row: CrmBookkeepingRow) {
  if (person === "ken") return roundCents(row.kenCut);
  if (person === "jessica") return roundCents(row.jessicaCommission);
  return roundCents(row.mikeProfit);
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
  const itemKey = partnerPaymentItemKeyForRow(person, row);

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
    advertisingReserve: roundCents(row.advertisingReserve),
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

    // Ken's 10% comes off the sale total, so it's final immediately; Mike and
    // Jessica split what's left AFTER installation, so their payouts wait for
    // the MTS installer invoice.
    if (row.isMissingInstallerInvoice) continue;

    const mikeItem = createEarnedItem({ row, person: "mike", amount: row.mikeProfit, closedAt });
    if (mikeItem) items.push(mikeItem);

    const jessicaItem = createEarnedItem({ row, person: "jessica", amount: row.jessicaCommission, closedAt });
    if (jessicaItem) items.push(jessicaItem);
  }

  return items.sort(compareEarnedItems);
}

function isSoldEarningRow(row: CrmBookkeepingRow) {
  return row.total > 0 && !isPaidInFullBookkeepingRow(row) && SOLD_EARNING_STATUSES.has(effectiveBookkeepingStatus(row));
}

function buildSoldEarningsByPerson(rows: CrmBookkeepingRow[]) {
  const totals: Record<CrmPaymentPerson, { earned: number; jobCount: number }> = {
    ken: { earned: 0, jobCount: 0 },
    mike: { earned: 0, jobCount: 0 },
    jessica: { earned: 0, jobCount: 0 }
  };

  for (const row of rows) {
    if (!isSoldEarningRow(row)) continue;

    for (const person of ["mike", "jessica"] as const) {
      const amount = partnerPaymentAmountForRow(person, row);
      if (amount <= 0) continue;
      totals[person].earned = roundCents(totals[person].earned + amount);
      totals[person].jobCount += 1;
    }
  }

  return totals;
}

export function buildUnpaidPartnerPaymentItemForRow(
  person: CrmPaymentPerson,
  row: CrmBookkeepingRow
): CrmPartnerPaymentLedgerItem | null {
  if (person !== "ken" && row.isMissingInstallerInvoice) return null;
  const closedAt = paidInFullDate(row);
  const earnedItem = closedAt
    ? createEarnedItem({
        row,
        person,
        amount: partnerPaymentAmountForRow(person, row),
        closedAt
      })
    : null;
  if (!earnedItem) return null;

  return {
    ...earnedItem,
    paidAmount: 0,
    remainingAmount: earnedItem.owedAmount,
    paymentState: "unpaid",
    explicitAllocationIds: [],
    legacyPaidAmount: 0
  };
}

function compareEarnedItems(left: Pick<EarnedItem, "closedAt" | "customerName" | "itemKey">, right: Pick<EarnedItem, "closedAt" | "customerName" | "itemKey">) {
  const closed = (left.closedAt || "").localeCompare(right.closedAt || "");
  if (closed) return closed;
  const customer = left.customerName.localeCompare(right.customerName);
  if (customer) return customer;
  return left.itemKey.localeCompare(right.itemKey);
}

function metadataPaymentPerson(value: unknown): CrmPaymentPerson | null {
  return value === "ken" || value === "mike" || value === "jessica" ? value : null;
}

function paymentPersonFromKenPayment(payment: CrmKenPayment): CrmPaymentPerson {
  const meta = payment.meta || {};
  return (
    metadataPaymentPerson(meta.partnerPaymentPerson) ||
    metadataPaymentPerson(meta.commissionRecipient) ||
    metadataPaymentPerson(meta.recipient) ||
    "ken"
  );
}

function kenPaymentAppliesToBuyout(payment: CrmKenPayment, person: CrmPaymentPerson) {
  const meta = payment.meta || {};
  if (person !== "ken") return false;
  if (meta.kenBuyoutApplied === true) return true;
  if (meta.kenBuyoutApplied === false) return false;
  return meta.batchSource === "unified_payment_ledger" && roundCents(payment.amount) === INITIAL_KEN_BUYOUT_PAYMENT_AMOUNT;
}

function historyFromKenPayment(payment: CrmKenPayment): CrmPartnerPaymentHistoryBatch {
  const person = paymentPersonFromKenPayment(payment);

  return {
    id: payment.id,
    person,
    source: person === "ken" ? "ken_payment" : "commission_payment",
    paidOn: payment.paid_on,
    periodMonth: payment.period_month,
    amount: roundCents(payment.amount),
    note: payment.note,
    createdByEmail: payment.created_by_email,
    createdAt: payment.created_at,
    updatedAt: payment.updated_at,
    isLegacy: false,
    appliesToKenBuyout: kenPaymentAppliesToBuyout(payment, person),
    isAdvance: payment.meta?.advancePayment === true,
    unappliedAmount: 0,
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
    appliesToKenBuyout: false,
    isAdvance: payment.meta?.advancePayment === true,
    unappliedAmount: 0,
    allocations: []
  };
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function optionalNumber(value: unknown) {
  const amount = Number(value);
  return Number.isFinite(amount) ? roundCents(amount) : null;
}

function metadataAllocationSource(value: unknown): CrmBookkeepingRow["source"] {
  return value === "crm_quote" || value === "legacy_sheet" || value === "manual" ? value : "manual";
}

function paymentMetadataAllocations(
  paymentId: string,
  person: CrmPaymentPerson,
  meta: Record<string, unknown> | null | undefined
): CrmPartnerPaymentHistoryAllocation[] {
  const raw = meta?.selectedItemAllocations;
  if (!Array.isArray(raw)) return [];

  return raw
    .map((value, index): CrmPartnerPaymentHistoryAllocation | null => {
      if (!value || typeof value !== "object") return null;
      const record = value as Record<string, unknown>;
      const meta = record.meta && typeof record.meta === "object" ? (record.meta as Record<string, unknown>) : {};
      const allocationPerson = optionalString(record.person) || optionalString(record.recipient);
      if (allocationPerson && allocationPerson !== person) return null;

      const itemKey = optionalString(record.item_key) || optionalString(record.itemKey);
      const amount = roundCents(Number(record.amount) || 0);
      if (!itemKey || amount <= 0) return null;

      return {
        id: `meta-${paymentId}-${itemKey}-${index}`,
        itemKey,
        customerName: optionalString(record.customer_name) || optionalString(record.customerName) || itemKey,
        quoteNumber: optionalString(meta.quoteNumber),
        closedAt: optionalString(record.closed_at) || optionalString(record.closedAt),
        total: optionalNumber(meta.total),
        amount,
        source: metadataAllocationSource(record.source),
        quoteId: optionalString(record.quote_id) || optionalString(record.quoteId),
        bookkeepingEntryId: optionalString(record.bookkeeping_entry_id) || optionalString(record.bookkeepingEntryId),
        jobId: optionalString(record.job_id) || optionalString(record.jobId),
        virtual: false
      } satisfies CrmPartnerPaymentHistoryAllocation;
    })
    .filter((allocation): allocation is CrmPartnerPaymentHistoryAllocation => Boolean(allocation));
}

function explicitAllocationHistory(
  allocation: CrmKenPaymentAllocation | CrmCommissionPaymentAllocation
): CrmPartnerPaymentHistoryAllocation {
  const meta = allocation.meta && typeof allocation.meta === "object" ? allocation.meta : {};
  return {
    id: allocation.id,
    itemKey: allocation.item_key,
    customerName: allocation.customer_name,
    quoteNumber: optionalString(meta.quoteNumber),
    closedAt: allocation.closed_at,
    total: optionalNumber(meta.total),
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
    quoteNumber: item.quoteNumber,
    closedAt: item.closedAt,
    total: item.total,
    amount: roundCents(amount),
    source: item.source,
    quoteId: item.quoteId,
    bookkeepingEntryId: item.bookkeepingEntryId,
    jobId: item.jobId,
    virtual: true
  };
}

function buildKenBuyoutLedger(history: CrmPartnerPaymentHistoryBatch[]): CrmKenBuyoutLedger {
  let runningPaid = 0;
  const buyoutEvents = [
    ...history
      .filter((batch) => batch.appliesToKenBuyout && roundCents(batch.amount) > 0)
      .map((batch, sortOrder) => ({
        id: batch.id,
        paidOn: batch.paidOn,
        amount: roundCents(batch.amount),
        note: batch.note,
        createdByEmail: batch.createdByEmail,
        sortOrder
      })),
    ...INITIAL_KEN_BUYOUT_ADJUSTMENTS.map((adjustment, index) => ({
      ...adjustment,
      sortOrder: history.length + index
    }))
  ].sort((left, right) => {
    const paid = paymentSortValue(left.paidOn) - paymentSortValue(right.paidOn);
    if (paid) return paid;
    return left.sortOrder - right.sortOrder;
  });
  const payments = buyoutEvents.map((event) => {
    const amount = roundCents(event.amount);
    runningPaid = roundCents(runningPaid + amount);
    return {
      id: event.id,
      paidOn: event.paidOn,
      amount,
      note: event.note,
      createdByEmail: event.createdByEmail,
      runningPaid,
      remainingBalance: roundCents(Math.max(BUSINESS_PAYOFF_TARGET - runningPaid, 0))
    };
  });
  const totalPaid = roundCents(runningPaid);

  return {
    target: BUSINESS_PAYOFF_TARGET,
    totalPaid,
    remainingBalance: roundCents(Math.max(BUSINESS_PAYOFF_TARGET - totalPaid, 0)),
    paidPct: BUSINESS_PAYOFF_TARGET > 0 ? Math.min(100, Math.round((totalPaid / BUSINESS_PAYOFF_TARGET) * 1000) / 10) : 0,
    paymentCount: payments.length,
    payments
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
  const soldEarningsByPerson = buildSoldEarningsByPerson(rows);
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
  const paymentMetaById = new Map<string, Record<string, unknown>>();
  for (const payment of kenPayments) paymentMetaById.set(payment.id, payment.meta || {});
  for (const payment of commissionPayments) paymentMetaById.set(payment.id, payment.meta || {});

  const explicitTotalsByPayment = new Map<string, number>();

  for (const allocation of kenAllocations) {
    const batch = history.get(allocation.payment_id);
    if (batch?.isAdvance) continue;
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
    const batch = history.get(allocation.payment_id);
    if (batch?.isAdvance) continue;
    const amount = roundCents(allocation.amount);
    explicitTotalsByPayment.set(allocation.payment_id, roundCents((explicitTotalsByPayment.get(allocation.payment_id) || 0) + amount));
    const item = workingByKey.get(allocation.item_key);
    if (item && item.person === allocation.recipient) {
      item.explicitPaidAmount = roundCents(item.explicitPaidAmount + amount);
      item.explicitAllocationIds.push(allocation.id);
    }
    history.get(allocation.payment_id)?.allocations.push(explicitAllocationHistory(allocation));
  }

  for (const batch of history.values()) {
    if (batch.isAdvance) continue;
    if (batch.allocations.length) continue;
    for (const allocation of paymentMetadataAllocations(batch.id, batch.person, paymentMetaById.get(batch.id))) {
      explicitTotalsByPayment.set(
        batch.id,
        roundCents((explicitTotalsByPayment.get(batch.id) || 0) + allocation.amount)
      );
      const item = workingByKey.get(allocation.itemKey);
      if (item && item.person === batch.person) {
        item.explicitPaidAmount = roundCents(item.explicitPaidAmount + allocation.amount);
        item.explicitAllocationIds.push(allocation.id);
      }
      batch.allocations.push(allocation);
    }
  }

  const applyLegacyRemainder = (batch: CrmPartnerPaymentHistoryBatch) => {
    if (batch.isAdvance) {
      batch.allocations = [];
      batch.unappliedAmount = roundCents(batch.amount);
      return;
    }
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
    batch.unappliedAmount = roundCents(Math.max(remaining, 0));
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
  const kenBuyout = buildKenBuyoutLedger(sortedHistory);

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
  const ledgerItemsByKey = new Map(ledgerItems.map((item) => [item.itemKey, item]));

  const buildJobItems = (person: "mike" | "jessica"): CrmPartnerJobLedgerItem[] =>
    rows
      .filter((row) => row.salesOwner === person && row.total > 0)
      .filter((row) => SOLD_EARNING_STATUSES.has(effectiveBookkeepingStatus(row)))
      .map((row) => {
        const itemKey = partnerPaymentItemKeyForRow(person, row);
        const payableItem = ledgerItemsByKey.get(itemKey);
        const profitAmount = partnerPaymentAmountForRow(person, row);
        const paidAmount = roundCents(payableItem?.paidAmount || 0);
        const remainingAmount = roundCents(Math.max(profitAmount - paidAmount, 0));
        const paymentState =
          profitAmount > 0 && remainingAmount <= 0
            ? "paid"
            : paidAmount > 0
              ? "partial"
              : "unpaid";
        const closedAt = paidInFullDate(row);
        const holdReason =
          profitAmount <= 0
            ? "no_profit"
            : !closedAt
              ? "customer_payment"
              : row.isMissingInstallerInvoice
                ? "installer_invoice"
                : null;

        return {
          id: itemKey,
          itemKey,
          person,
          customerName: row.customerName,
          quoteNumber: row.quoteNumber,
          soldDate: row.soldDate,
          closedAt,
          sourceStatus: effectiveBookkeepingStatus(row),
          total: roundCents(row.total),
          advertisingReserve: roundCents(row.advertisingReserve),
          cogs: roundCents(row.cogs),
          kenCut: roundCents(row.kenCut),
          installationCost: roundCents(row.isInstallationComplete ? row.installationInvoiceAmount : 0),
          expensesTotal: roundCents(row.expensesTotal),
          remakeTotal: roundCents(row.remakeTotal),
          remainingProfitBeforeJessica: roundCents(row.remainingProfitBeforeJessica),
          profitAmount,
          paidAmount,
          remainingAmount,
          paymentState,
          payableReady: Boolean(payableItem),
          holdReason
        } satisfies CrmPartnerJobLedgerItem;
      })
      .sort((left, right) => {
        const sold = paymentSortValue(right.soldDate) - paymentSortValue(left.soldDate);
        if (sold) return sold;
        return left.customerName.localeCompare(right.customerName);
      });

  const jobItemsByPerson = {
    ken: [],
    mike: buildJobItems("mike"),
    jessica: buildJobItems("jessica")
  } satisfies Record<CrmPaymentPerson, CrmPartnerJobLedgerItem[]>;

  const people = (["ken", "mike", "jessica"] as const).reduce(
    (record, person) => {
      const personItems = ledgerItems.filter((item) => item.person === person);
      const personActive = activeItems.filter((item) => item.person === person);
      const earned = roundCents(personItems.reduce((sum, item) => sum + item.owedAmount, 0));
      const paid = roundCents(personItems.reduce((sum, item) => sum + item.paidAmount, 0));
      const owed = roundCents(personActive.reduce((sum, item) => sum + item.remainingAmount, 0));
      const advanceBalance = roundCents(
        sortedHistory
          .filter((batch) => batch.person === person && batch.isAdvance)
          .reduce((sum, batch) => sum + batch.unappliedAmount, 0)
      );
      record[person] = {
        person,
        label: partnerLabels[person],
        earned,
        paid,
        owed: roundCents(owed - advanceBalance),
        advanceBalance,
        soldEarned: soldEarningsByPerson[person].earned,
        soldJobCount: soldEarningsByPerson[person].jobCount,
        jobCount: personItems.length,
        activeJobCount: personActive.length,
        items: personItems.sort(compareEarnedItems),
        activeItems: personActive,
        jobItems: jobItemsByPerson[person]
      };
      return record;
    },
    {} as CrmPartnerPaymentLedger["people"]
  );

  return {
    people,
    activeItems,
    history: sortedHistory.sort((left, right) => paymentSortValue(right.paidOn || right.createdAt) - paymentSortValue(left.paidOn || left.createdAt)),
    kenBuyout
  };
}

export function paymentPersonLabel(person: CrmPaymentPerson) {
  return partnerLabels[person];
}
