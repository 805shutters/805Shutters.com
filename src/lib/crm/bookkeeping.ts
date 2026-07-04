import {
  CrmAccountabilityItem,
  CrmBookkeepingCredit,
  CrmBookkeepingEntry,
  CrmBookkeepingPayment,
  CrmBookkeepingPaymentType,
  CrmBookkeepingRow,
  CrmBookkeepingStatus,
  CrmBookkeepingSalesOwner,
  CrmBookkeepingTotals,
  CrmJobExpense,
  CrmKenPayment,
  CrmKenPayoffSummary,
  CrmQuote,
  CrmQuoteStatus
} from "@/lib/crm/types";

export const OWNER_COMMISSION_RATE = 0.1;

// Fixed price the business is being purchased from Ken for. Every dollar paid to
// Ken (opening balance + recorded checks) counts toward this payoff.
export const BUSINESS_PAYOFF_TARGET = 500000;

export function isPaidInFullBookkeepingRow(row: Pick<CrmBookkeepingRow, "total" | "balance" | "isPaidInFull">) {
  return Boolean(row.isPaidInFull);
}

export function effectiveBookkeepingStatus(
  row: Pick<CrmBookkeepingRow, "source" | "status" | "isPaidInFull" | "liveStatus">
): CrmBookkeepingStatus {
  if (row.isPaidInFull) return "closed";
  if (row.liveStatus === "closed" || row.status === "closed") return "invoiced";
  if (row.liveStatus) return row.liveStatus;
  if (row.status === "manual" || row.status === "legacy") return "sold";
  return row.status;
}

const ACTIVE_QUOTE_STATUSES = new Set<CrmQuoteStatus>([
  "sold",
  "approved",
  "ordered",
  "received",
  "installed",
  "invoiced",
  "paid"
]);

const UNSOLD_QUOTE_STATUSES = new Set<CrmQuoteStatus>(["draft", "sent"]);

function quoteHasSignedContract(quote: CrmQuote) {
  return Boolean(quote.signed_at || quote.customer_signature);
}

function quoteStatusForBookkeeping(quote: CrmQuote): CrmQuoteStatus {
  if (UNSOLD_QUOTE_STATUSES.has(quote.status) && quoteHasSignedContract(quote)) return "sold";
  return quote.status;
}

function hasLedgerDeleteTombstone(meta: Record<string, unknown> | null | undefined) {
  return Boolean(meta && typeof meta === "object" && !Array.isArray(meta) && (meta.bookkeeping_deleted_at || meta.deleted_at));
}

export function buildBookkeepingRows({
  quotes,
  entries,
  payments,
  credits = [],
  expenses = []
}: {
  quotes: CrmQuote[];
  entries: CrmBookkeepingEntry[];
  payments: CrmBookkeepingPayment[];
  credits?: CrmBookkeepingCredit[];
  expenses?: CrmJobExpense[];
}): CrmBookkeepingRow[] {
  const paymentsByEntryId = groupPayments(payments, "bookkeeping_entry_id");
  const paymentsByQuoteId = groupPayments(payments, "quote_id");
  const creditsToEntryId = groupCredits(credits, "to_bookkeeping_entry_id");
  const creditsFromEntryId = groupCredits(credits, "from_bookkeeping_entry_id");
  const creditsToQuoteId = groupCredits(credits, "to_quote_id");
  const creditsFromQuoteId = groupCredits(credits, "from_quote_id");
  const expensesByEntryId = groupExpenses(expenses, "bookkeeping_entry_id");
  const expensesByQuoteId = groupExpenses(expenses, "quote_id");
  const expensesByJobId = groupExpenses(expenses, "job_id");
  const quoteById = new Map(quotes.map((quote) => [quote.id, quote]));
  const activeEntries = entries.filter((entry) => !hasLedgerDeleteTombstone(entry.meta));
  const quoteMetadataEntries = activeEntries.filter((entry) => entry.source === "crm_quote" && entry.quote_id);
  const quoteMetadataByQuoteId = new Map(
    quoteMetadataEntries.map((entry) => [entry.quote_id as string, entry])
  );
  const standaloneEntries = activeEntries.filter((entry) => !(entry.source === "crm_quote" && entry.quote_id));
  const linkedQuoteIds = new Set(
    entries
      .filter((entry) => !(entry.source === "crm_quote" && entry.quote_id))
      .map((entry) => entry.quote_id)
      .filter(Boolean)
  );

  // Each expense is applied to exactly one row. Entry rows resolve first (most
  // specific), so a job-linked expense can't also land on a quote row that
  // happens to share the same job.
  const claimedExpenseIds = new Set<string>();
  const resolveExpenses = (keys: {
    entryId?: string | null;
    quoteId?: string | null;
    jobId?: string | null;
  }) => {
    const matched: CrmJobExpense[] = [];
    const consider = (list?: CrmJobExpense[]) => {
      for (const expense of list || []) {
        if (claimedExpenseIds.has(expense.id)) continue;
        claimedExpenseIds.add(expense.id);
        matched.push(expense);
      }
    };
    if (keys.entryId) consider(expensesByEntryId.get(keys.entryId));
    if (keys.quoteId) consider(expensesByQuoteId.get(keys.quoteId));
    if (keys.jobId) consider(expensesByJobId.get(keys.jobId));
    return matched;
  };

  const entryRows = standaloneEntries.map((entry) =>
    buildEntryRow(
      entry,
      paymentsByEntryId.get(entry.id) || [],
      creditsToEntryId.get(entry.id) || [],
      creditsFromEntryId.get(entry.id) || [],
      resolveExpenses({ entryId: entry.id, quoteId: entry.quote_id, jobId: entry.job_id }),
      entry.quote_id ? quoteById.get(entry.quote_id) || null : null
    )
  );

  const quoteRows = quotes
    .filter((quote) => ACTIVE_QUOTE_STATUSES.has(quoteStatusForBookkeeping(quote)))
    .filter((quote) => !hasLedgerDeleteTombstone(quote.meta))
    .filter((quote) => !linkedQuoteIds.has(quote.id))
    .map((quote) => {
      const metadataEntry = quoteMetadataByQuoteId.get(quote.id) || null;
      return buildQuoteRow(
        quote,
        paymentsByQuoteId.get(quote.id) || [],
        creditsToQuoteId.get(quote.id) || [],
        creditsFromQuoteId.get(quote.id) || [],
        metadataEntry,
        resolveExpenses({ entryId: metadataEntry?.id, quoteId: quote.id, jobId: quote.job_id })
      );
    });

  return [...entryRows, ...quoteRows].sort((a, b) => {
    const at = a.soldDate ? Date.parse(a.soldDate) : 0;
    const bt = b.soldDate ? Date.parse(b.soldDate) : 0;
    return bt - at;
  });
}

export function sumBookkeepingRows(
  rows: CrmBookkeepingRow[],
  options: { month?: string | Date } = {}
): CrmBookkeepingTotals {
  const currentMonth = monthKey(options.month ?? new Date());

  return rows.reduce<CrmBookkeepingTotals>(
    (totals, row) => {
      totals.rows += 1;
      totals.total = roundCents(totals.total + row.total);
      totals.paidTotal = roundCents(totals.paidTotal + row.paidTotal);
      totals.creditIn = roundCents(totals.creditIn + row.creditIn);
      totals.creditOut = roundCents(totals.creditOut + row.creditOut);
      totals.cogs = roundCents(totals.cogs + row.cogs);
      totals.expensesTotal = roundCents(totals.expensesTotal + row.expensesTotal);
      totals.remakeTotal = roundCents(totals.remakeTotal + row.remakeTotal);
      totals.balance = roundCents(totals.balance + Math.max(row.balance, 0));
      totals.kenCut = roundCents(totals.kenCut + row.kenCut);
      totals.mikeProfit = roundCents(totals.mikeProfit + row.mikeProfit);
      totals.installationAmount = roundCents(
        totals.installationAmount + (row.isInstallationComplete ? row.installationInvoiceAmount : 0)
      );
      totals.jessicaCommission = roundCents(totals.jessicaCommission + row.jessicaCommission);
      totals.jessicaCommissionPaid = roundCents(
        totals.jessicaCommissionPaid + (row.jessicaCommissionPaidAt ? row.jessicaCommission : 0)
      );
      totals.jessicaCommissionOwed = roundCents(
        totals.jessicaCommissionOwed + row.jessicaCommissionOwed
      );
      if (row.isPaidInFull) {
        totals.closedRows += 1;
        totals.closedTotal = roundCents(totals.closedTotal + row.total);
        totals.kenTotalClosed = roundCents(totals.kenTotalClosed + row.kenCut);
        if (currentMonth && monthKey(closedDateForBookkeepingRow(row)) === currentMonth) {
          totals.kenMonthlyDue = roundCents(totals.kenMonthlyDue + row.kenCut);
        }
      }
      if (row.cogs <= 0) totals.missingCogs += 1;
      return totals;
    },
    {
      rows: 0,
      total: 0,
      paidTotal: 0,
      creditIn: 0,
      creditOut: 0,
      cogs: 0,
      expensesTotal: 0,
      remakeTotal: 0,
      balance: 0,
      kenCut: 0,
      mikeProfit: 0,
      installationAmount: 0,
      jessicaCommission: 0,
      jessicaCommissionPaid: 0,
      jessicaCommissionOwed: 0,
      closedRows: 0,
      closedTotal: 0,
      kenMonthlyDue: 0,
      kenTotalClosed: 0,
      missingCogs: 0
    }
  );
}

function monthKey(value: string | Date | null | undefined) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 7);

  const raw = String(value).trim();
  if (!raw) return null;
  const direct = raw.match(/^(\d{4}-\d{2})/);
  if (direct) return direct[1];

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 7);
}

function ledgerDateValue(value: string | null | undefined) {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  return raw.slice(0, 10);
}

function closedDateForBookkeepingRow(row: CrmBookkeepingRow) {
  if (!row.isPaidInFull) return null;
  const total = roundCents(row.total);
  if (total <= 0) return ledgerDateValue(row.soldDate);

  const events = [
    ...row.payments.map((payment) => ({
      date: ledgerDateValue(payment.paid_at) || ledgerDateValue(payment.created_at),
      amount: Number(payment.amount) || 0
    })),
    ...row.creditsIn.map((credit) => ({
      date: ledgerDateValue(credit.credit_date) || ledgerDateValue(credit.created_at),
      amount: Number(credit.amount) || 0
    })),
    ...row.creditsOut.map((credit) => ({
      date: ledgerDateValue(credit.credit_date) || ledgerDateValue(credit.created_at),
      amount: -(Number(credit.amount) || 0)
    }))
  ]
    .filter((event): event is { date: string; amount: number } => Boolean(event.date))
    .sort((left, right) => left.date.localeCompare(right.date));

  let appliedRevenue = 0;
  for (const event of events) {
    appliedRevenue = roundCents(appliedRevenue + event.amount);
    if (appliedRevenue >= total) return event.date;
  }

  return events.at(-1)?.date || ledgerDateValue(row.soldDate);
}

export function buildKenPayoffSummary({
  rows,
  payments,
  openingBalance = 0
}: {
  rows: CrmBookkeepingRow[];
  payments: CrmKenPayment[];
  openingBalance?: number;
  payoffTarget?: number;
}): CrmKenPayoffSummary {
  // "Completed" for Ken = the customer has paid in full (zero/negative balance).
  // Each row's kenCut already reflects Jessica's exemption and any override, so
  // exempt jobs correctly contribute $0 to Ken's check.
  const completedRows = rows.filter(isPaidInFullBookkeepingRow);
  const kenAccruedCompleted = roundCents(
    completedRows.reduce((sum, row) => sum + (Number(row.kenCut) || 0), 0)
  );
  const kenAccruedAll = roundCents(rows.reduce((sum, row) => sum + (Number(row.kenCut) || 0), 0));
  const recordedPayments = roundCents(
    payments.reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0)
  );
  const opening = roundCents(Math.max(Number(openingBalance) || 0, 0));
  const target = BUSINESS_PAYOFF_TARGET;
  const kenPaid = roundCents(opening + recordedPayments);
  const payoffRemaining = roundCents(Math.max(target - kenPaid, 0));
  const kenOwed = roundCents(Math.max(kenAccruedCompleted - kenPaid, 0));
  const payoffPct = target > 0 ? Math.min(100, Math.round((kenPaid / target) * 1000) / 10) : 0;

  return {
    payoffTarget: target,
    openingBalance: opening,
    recordedPayments,
    kenPaid,
    payoffRemaining,
    payoffPct,
    isPaidOff: kenPaid >= target,
    kenAccruedCompleted,
    kenAccruedAll,
    kenOwed,
    completedJobs: completedRows.filter((row) => (Number(row.kenCut) || 0) > 0).length
  };
}

export function buildAccountabilityQueue(rows: CrmBookkeepingRow[]): CrmAccountabilityItem[] {
  const items: CrmAccountabilityItem[] = [];

  for (const row of rows) {
    const owner = row.salesOwner === "jessica" ? "Jessica" : row.salesOwner === "mike" ? "Mike" : "Sales";
    const status = effectiveBookkeepingStatus(row);

    if ((status === "sold" || status === "approved") && !row.manufacturerOrderRef) {
      items.push({
        id: `${row.id}-needs-order`,
        type: "needs_order",
        label: "Needs product order",
        detail: `${row.customerName} is sold and needs the manufacturer order created.`,
        owner,
        urgency: "urgent",
        rowId: row.id,
        quoteId: row.quoteId,
        jobId: row.jobId
      });
    }

    if (row.cogs <= 0) {
      items.push({
        id: `${row.id}-missing-cogs`,
        type: "missing_cogs",
        label: "Missing COGS",
        detail: `${row.customerName} needs cost of goods entered before profit is trusted.`,
        owner: "Bookkeeping",
        urgency: "warning",
        rowId: row.id,
        quoteId: row.quoteId,
        jobId: row.jobId
      });
    }

    if (row.balance > 0) {
      items.push({
        id: `${row.id}-payment-due`,
        type: "payment_due",
        label: "Payment follow-up",
        detail: `${row.customerName} has an open balance of ${formatMoney(row.balance)}.`,
        owner,
        urgency: row.balance >= row.depositDue ? "urgent" : "warning",
        amount: row.balance,
        rowId: row.id,
        quoteId: row.quoteId,
        jobId: row.jobId
      });
    }

    if (status === "ordered") {
      items.push({
        id: `${row.id}-awaiting-product`,
        type: "awaiting_product",
        label: "Awaiting product",
        detail: `${row.customerName} is ordered and waiting to be received.`,
        owner: "Operations",
        urgency: "normal",
        rowId: row.id,
        quoteId: row.quoteId,
        jobId: row.jobId
      });
    }

    if (status === "received") {
      items.push({
        id: `${row.id}-ready-install`,
        type: "ready_to_install",
        label: "Ready to install",
        detail: `${row.customerName} is received and should be scheduled for installation.`,
        owner: "Install",
        urgency: "urgent",
        rowId: row.id,
        quoteId: row.quoteId,
        jobId: row.jobId
      });
    }

    if (row.isMissingInstallerInvoice) {
      items.push({
        id: `${row.id}-missing-installer-invoice`,
        type: "missing_installer_invoice",
        label: "Missing installer invoice",
        detail: `${row.customerName} is complete but the MTS installer invoice hasn't arrived, so profit and payouts are on hold.`,
        owner: "Bookkeeping",
        urgency: "urgent",
        rowId: row.id,
        quoteId: row.quoteId,
        jobId: row.jobId
      });
    }

    if (row.jessicaCommissionOwed > 0) {
      items.push({
        id: `${row.id}-jessica-owed`,
        type: "commission_due",
        label: "Jessica commission owed",
        detail: `${row.customerName} has ${formatMoney(row.jessicaCommissionOwed)} owed to Jessica.`,
        owner: "Bookkeeping",
        urgency: "warning",
        amount: row.jessicaCommissionOwed,
        rowId: row.id,
        quoteId: row.quoteId,
        jobId: row.jobId
      });
    }
  }

  return items.sort((a, b) => urgencyRank(b.urgency) - urgencyRank(a.urgency));
}

export function normalizePaymentType(value: string | null | undefined): CrmBookkeepingPaymentType | null {
  const lower = (value || "").toLowerCase();
  if (lower.includes("zelle")) return "zelle";
  if (lower.includes("cash")) return "cash";
  if (lower.includes("check") || lower === "ck") return "check";
  if (lower.includes("card") || lower.includes("credit") || lower === "cc") return "credit_card";
  if (lower.includes("venmo")) return "venmo";
  return value ? "other" : null;
}

export function formatPaymentType(value: CrmBookkeepingPaymentType | null): string {
  if (!value) return "None";
  return {
    zelle: "Zelle",
    cash: "Cash",
    check: "Check",
    credit_card: "Credit Card",
    venmo: "Venmo",
    other: "Other"
  }[value];
}

function cleanBookkeepingNote(note: string | null | undefined, copiedFromQuoteNote?: string | null) {
  const trimmed = typeof note === "string" ? note.trim() : "";
  if (!trimmed) return null;
  if (copiedFromQuoteNote && trimmed === copiedFromQuoteNote.trim()) return null;
  if (!trimmed.includes("__customerEmailNote")) return trimmed;

  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    if (parsed && typeof parsed === "object" && "__customerEmailNote" in parsed) return null;
  } catch {
    return trimmed;
  }

  return trimmed;
}

function buildEntryRow(
  entry: CrmBookkeepingEntry,
  payments: CrmBookkeepingPayment[],
  creditsIn: CrmBookkeepingCredit[],
  creditsOut: CrmBookkeepingCredit[],
  expenses: CrmJobExpense[],
  linkedQuote: CrmQuote | null = null
): CrmBookkeepingRow {
  const total = Number(entry.total_amount) || 0;
  const depositPayments = payments.filter(isDepositPayment);
  const balancePayments = payments.filter((payment) => !isDepositPayment(payment));
  const depositPaid = sumPayments(depositPayments);
  const balancePaid = sumPayments(balancePayments);
  const paidTotal = roundCents(depositPaid + balancePaid);
  const creditIn = sumCredits(creditsIn);
  const creditOut = sumCredits(creditsOut);
  const cogs = Number(entry.cogs_amount) || 0;
  const { otherExpenses, expensesTotal, remakeTotal } = splitRemakeExpenses(expenses);
  const balance = roundCents(total - calculateAppliedRevenue(paidTotal, creditIn, creditOut));
  const isPaidInFull = isPaidInFullBalance(total, balance);
  const kenCut = computeKenCut({ total, override: entry.ken_cut_override });
  const installation = getInstallationFields(entry);
  const missingInstallerInvoice = isMissingInstallerInvoice({
    source: entry.source,
    matchStatus: entry.installation_match_status,
    quoteStatus: linkedQuote?.status || null,
    isPaidInFull
  });
  const profit = calculateBookkeepingProfit({
    total,
    cogs,
    kenCut,
    salesOwner: entry.sales_owner,
    installationAmount: installation.invoiceAmount,
    isInstallationComplete: installation.isComplete,
    expenses: expensesTotal + remakeTotal
  });
  const installationPayment = getInstallationPaymentFields(entry, installation.invoiceAmount);

  return {
    id: entry.id,
    source: entry.source,
    quoteId: entry.quote_id,
    jobId: entry.job_id,
    customerName: entry.customer_name,
    customerPhone: entryCustomerPhone(entry) || cleanOptionalText(linkedQuote?.customer_phone),
    quoteNumber: entry.imported_sheet_row ? `Sheet row ${entry.imported_sheet_row}` : null,
    soldDate: entry.sold_date,
    total,
    depositDue: entryDepositDue(entry, total),
    depositPaid,
    depositPaymentType: latestPaymentType(depositPayments),
    balancePaid,
    balancePaymentType: latestPaymentType(balancePayments),
    paidTotal,
    creditIn,
    creditOut,
    paymentType: entry.payment_type,
    cogs,
    balance,
    kenCut,
    kenCutOverride: entry.ken_cut_override ?? null,
    mikeProfit: profit.mikeProfit,
    salesOwner: entry.sales_owner,
    installationInvoiceDocumentId: entry.installation_invoice_document_id,
    installationInvoiceAmount: installation.invoiceAmount,
    installationInvoiceNumber: entry.installation_invoice_number,
    installationInvoiceUrl: entry.installation_invoice_url,
    installationInvoicePaidAt: installationPayment.paidAt,
    installationInvoicePaidAmount: installationPayment.paidAmount,
    installationInvoicePaymentMethod: entry.installation_invoice_payment_method || null,
    installationInvoicePaymentNotes: entry.installation_invoice_payment_notes || null,
    installationInvoiceOpenAmount: installationPayment.openAmount,
    isInstallationInvoicePaid: installationPayment.isPaid,
    installationMatchStatus: entry.installation_match_status,
    installationMatchedAt: entry.installation_matched_at,
    isInstallationComplete: installation.isComplete,
    isMissingInstallerInvoice: missingInstallerInvoice && !entry.jessica_commission_paid_at,
    remainingProfitBeforeJessica: profit.remainingProfitBeforeJessica,
    jessicaCommission: profit.jessicaCommission,
    jessicaCommissionPaidAt: entry.jessica_commission_paid_at,
    // Owed only once the installer invoice is in (or waived) — until then the
    // profit pool is overstated and the payout must not be processed.
    jessicaCommissionOwed:
      entry.jessica_commission_paid_at || missingInstallerInvoice ? 0 : profit.jessicaCommission,
    isPaidInFull,
    manufacturerName: entry.manufacturer_name,
    manufacturerOrderRef: entry.manufacturer_order_ref,
    manufacturerOrderUrl: entry.manufacturer_order_url,
    manufacturerDocumentUrl: entry.manufacturer_document_url,
    notes: cleanBookkeepingNote(entry.notes),
    status: bookkeepingStatusForBalance(entry.source === "legacy_sheet" ? "legacy" : "manual", total, balance),
    payments,
    creditsIn,
    creditsOut,
    expenses: otherExpenses,
    expensesTotal,
    remakeTotal
  };
}

function entryDepositDue(entry: CrmBookkeepingEntry, total: number) {
  const meta = entry.meta && typeof entry.meta === "object" && !Array.isArray(entry.meta) ? entry.meta : {};
  const target = (meta as Record<string, unknown>).deposit_required;
  if (target !== null && target !== undefined && target !== "") {
    const amount = Number(target);
    if (Number.isFinite(amount)) return roundCents(Math.max(amount, 0));
  }
  return roundCents(total * 0.5);
}

function buildQuoteRow(
  quote: CrmQuote,
  payments: CrmBookkeepingPayment[],
  creditsIn: CrmBookkeepingCredit[],
  creditsOut: CrmBookkeepingCredit[],
  entry: CrmBookkeepingEntry | null,
  expenses: CrmJobExpense[]
): CrmBookkeepingRow {
  const total = Number(quote.quote_total) || 0;
  const cogs = Number(entry?.cogs_amount ?? quote.materials_cost) || 0;
  // Only money actually recorded as a payment counts as collected. Previously an
  // unpaid-but-sold quote assumed its REQUIRED deposit was paid (deposit_required
  // is what's owed, not collected) — overstating revenue and mis-flagging jobs as
  // paid-in-full. Now collected = recorded payments only.
  const depositPayments = payments.filter(isDepositPayment);
  const balancePayments = payments.filter((payment) => !isDepositPayment(payment));
  const explicitDepositPaid = sumPayments(depositPayments);
  const explicitBalancePaid = sumPayments(balancePayments);
  const depositPaid = explicitDepositPaid;
  const balancePaid = explicitBalancePaid;
  const paidTotal = roundCents(depositPaid + balancePaid);
  const creditIn = sumCredits(creditsIn);
  const creditOut = sumCredits(creditsOut);
  const { otherExpenses, expensesTotal, remakeTotal } = splitRemakeExpenses(expenses);
  const balance = roundCents(total - calculateAppliedRevenue(paidTotal, creditIn, creditOut));
  const isPaidInFull = isPaidInFullBalance(total, balance);
  const soldDate = quote.signed_at || quote.sold_at || quote.approved_at || quote.ordered_at || quote.created_at;
  const status = quoteStatusForBookkeeping(quote);
  const salesOwner = normalizeSalesOwner(entry?.sales_owner || quote.sold_by);
  const kenCut = computeKenCut({ total, override: entry?.ken_cut_override });
  const installation = getInstallationFields(entry);
  const missingInstallerInvoice = isMissingInstallerInvoice({
    source: "crm_quote",
    matchStatus: entry?.installation_match_status || null,
    quoteStatus: status,
    isPaidInFull
  });
  const profit = calculateBookkeepingProfit({
    total,
    cogs,
    kenCut,
    salesOwner,
    installationAmount: installation.invoiceAmount,
    isInstallationComplete: installation.isComplete,
    expenses: expensesTotal + remakeTotal
  });
  const installationPayment = getInstallationPaymentFields(entry, installation.invoiceAmount);

  return {
    id: quote.id,
    source: "crm_quote",
    quoteId: quote.id,
    jobId: quote.job_id,
    customerName: quote.customer_name || entry?.customer_name || "Linked job",
    customerPhone: cleanOptionalText(quote.customer_phone) || (entry ? entryCustomerPhone(entry) : null),
    quoteNumber: quote.quote_number,
    soldDate,
    total,
    // The deposit actually configured on the quote (deposit_required), not a
    // hardcoded 50%. 0 when no deposit was set.
    depositDue: roundCents(Number(quote.deposit_required) || 0),
    depositPaid,
    depositPaymentType: latestPaymentType(depositPayments),
    balancePaid,
    balancePaymentType: latestPaymentType(balancePayments),
    paidTotal,
    creditIn,
    creditOut,
    paymentType: entry?.payment_type || null,
    cogs,
    balance,
    kenCut,
    kenCutOverride: entry?.ken_cut_override ?? null,
    mikeProfit: profit.mikeProfit,
    salesOwner,
    installationInvoiceDocumentId: entry?.installation_invoice_document_id || null,
    installationInvoiceAmount: installation.invoiceAmount,
    installationInvoiceNumber: entry?.installation_invoice_number || null,
    installationInvoiceUrl: entry?.installation_invoice_url || null,
    installationInvoicePaidAt: installationPayment.paidAt,
    installationInvoicePaidAmount: installationPayment.paidAmount,
    installationInvoicePaymentMethod: entry?.installation_invoice_payment_method || null,
    installationInvoicePaymentNotes: entry?.installation_invoice_payment_notes || null,
    installationInvoiceOpenAmount: installationPayment.openAmount,
    isInstallationInvoicePaid: installationPayment.isPaid,
    installationMatchStatus: entry?.installation_match_status || "unmatched",
    installationMatchedAt: entry?.installation_matched_at || null,
    isInstallationComplete: installation.isComplete,
    isMissingInstallerInvoice: missingInstallerInvoice && !entry?.jessica_commission_paid_at,
    remainingProfitBeforeJessica: profit.remainingProfitBeforeJessica,
    jessicaCommission: profit.jessicaCommission,
    jessicaCommissionPaidAt: entry?.jessica_commission_paid_at || null,
    jessicaCommissionOwed:
      entry?.jessica_commission_paid_at || missingInstallerInvoice ? 0 : profit.jessicaCommission,
    isPaidInFull,
    manufacturerName: entry?.manufacturer_name || quote.manufacturer_name,
    manufacturerOrderRef: entry?.manufacturer_order_ref || quote.manufacturer_order_ref,
    manufacturerOrderUrl: entry?.manufacturer_order_url || quote.manufacturer_order_url,
    manufacturerDocumentUrl: entry?.manufacturer_document_url || quote.manufacturer_document_url,
    notes: cleanBookkeepingNote(entry?.notes, quote.notes),
    status: bookkeepingStatusForBalance(status, total, balance),
    payments,
    creditsIn,
    creditsOut,
    expenses: otherExpenses,
    expensesTotal,
    remakeTotal
  };
}

function cleanOptionalText(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function metadataPhone(meta: Record<string, unknown> | null | undefined) {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return null;
  return cleanOptionalText(meta.customer_phone) || cleanOptionalText(meta.customerPhone) || cleanOptionalText(meta.phone);
}

function entryCustomerPhone(entry: CrmBookkeepingEntry) {
  return metadataPhone(entry.meta);
}

function groupPayments(payments: CrmBookkeepingPayment[], key: "bookkeeping_entry_id" | "quote_id") {
  return payments.reduce<Map<string, CrmBookkeepingPayment[]>>((map, payment) => {
    const value = payment[key];
    if (!value) return map;
    const current = map.get(value) || [];
    current.push(payment);
    map.set(value, current);
    return map;
  }, new Map());
}

function groupCredits(
  credits: CrmBookkeepingCredit[],
  key: "from_bookkeeping_entry_id" | "from_quote_id" | "to_bookkeeping_entry_id" | "to_quote_id"
) {
  return credits.reduce<Map<string, CrmBookkeepingCredit[]>>((map, credit) => {
    const value = credit[key];
    if (!value) return map;
    const current = map.get(value) || [];
    current.push(credit);
    map.set(value, current);
    return map;
  }, new Map());
}

function sumPayments(payments: CrmBookkeepingPayment[]) {
  return roundCents(payments.reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0));
}

function latestPaymentType(payments: CrmBookkeepingPayment[]) {
  return payments.find((payment) => Number(payment.amount) > 0)?.payment_type || null;
}

function sumCredits(credits: CrmBookkeepingCredit[]) {
  return roundCents(credits.reduce((sum, credit) => sum + (Number(credit.amount) || 0), 0));
}

function sumExpenses(expenses: CrmJobExpense[]) {
  return roundCents(expenses.reduce((sum, expense) => sum + (Number(expense.amount) || 0), 0));
}

function splitRemakeExpenses(expenses: CrmJobExpense[]) {
  const otherExpenses = expenses.filter((expense) => expense.category !== "remake");
  const remakeExpenses = expenses.filter((expense) => expense.category === "remake");
  return {
    otherExpenses,
    expensesTotal: sumExpenses(otherExpenses),
    remakeTotal: sumExpenses(remakeExpenses)
  };
}

function groupExpenses(
  expenses: CrmJobExpense[],
  key: "bookkeeping_entry_id" | "quote_id" | "job_id"
) {
  return expenses.reduce<Map<string, CrmJobExpense[]>>((map, expense) => {
    const value = expense[key];
    if (!value) return map;
    const current = map.get(value) || [];
    current.push(expense);
    map.set(value, current);
    return map;
  }, new Map());
}

function computeKenCut({
  total,
  override
}: {
  total: number;
  override: number | null | undefined;
}) {
  // An explicit override pins the dollar amount (0 waives Ken's cut entirely).
  if (override !== null && override !== undefined) {
    return roundCents(Math.max(Number(override) || 0, 0));
  }
  // Ken gets 10% of every sale, regardless of who sold it (owner decision
  // 2026-07-02, replacing the short-lived Jessica exemption from migration
  // 20260610000000_profit_split_50_50.sql).
  return roundCents(total * OWNER_COMMISSION_RATE);
}

function isDepositPayment(payment: CrmBookkeepingPayment) {
  return payment.payment_label.toLowerCase().includes("deposit");
}

function calculateAppliedRevenue(paidTotal: number, creditIn: number, creditOut: number) {
  return roundCents(paidTotal + creditIn - creditOut);
}

function isPaidInFullBalance(total: number, balance: number) {
  return roundCents(total) > 0 && roundCents(balance) <= 0;
}

function bookkeepingStatusForBalance(status: CrmBookkeepingStatus, total: number, balance: number): CrmBookkeepingStatus {
  return isPaidInFullBalance(total, balance) ? "closed" : status;
}

const INSTALL_DONE_QUOTE_STATUSES = new Set<CrmQuoteStatus>(["installed", "invoiced", "paid"]);

// The work is finished (job installed or fully paid) but no MTS installer
// invoice has been matched, so the installation cost is unknown. Legacy sheet
// rows predate the invoice pipeline and are never flagged. Manually checking
// "installation complete" sets the match status to "matched", which waives the
// hold for jobs with no installer invoice expected.
function isMissingInstallerInvoice({
  source,
  matchStatus,
  quoteStatus,
  isPaidInFull
}: {
  source: CrmBookkeepingRow["source"];
  matchStatus: string | null | undefined;
  quoteStatus: CrmQuoteStatus | null;
  isPaidInFull: boolean;
}) {
  if (source === "legacy_sheet") return false;
  if (matchStatus === "matched") return false;
  return (quoteStatus !== null && INSTALL_DONE_QUOTE_STATUSES.has(quoteStatus)) || isPaidInFull;
}

function getInstallationFields(entry: CrmBookkeepingEntry | null) {
  const invoiceAmount = roundCents(Number(entry?.installation_invoice_amount) || 0);
  const isComplete =
    Boolean(entry?.installation_invoice_document_id || invoiceAmount > 0) &&
    entry?.installation_match_status === "matched";

  return { invoiceAmount, isComplete };
}

function getInstallationPaymentFields(entry: CrmBookkeepingEntry | null, invoiceAmount: number) {
  const paidAt = entry?.installation_invoice_paid_at || null;
  const rawPaidAmount = Number(entry?.installation_invoice_paid_amount);
  const paidAmount = roundCents(
    Number.isFinite(rawPaidAmount) && rawPaidAmount > 0 ? rawPaidAmount : paidAt ? invoiceAmount : 0
  );
  const openAmount = roundCents(Math.max(invoiceAmount - paidAmount, 0));
  const isPaid = invoiceAmount > 0 && openAmount <= 0.009 && Boolean(paidAt || paidAmount > 0);

  return { paidAt, paidAmount, openAmount, isPaid };
}

function calculateBookkeepingProfit({
  total,
  cogs,
  kenCut,
  salesOwner,
  installationAmount,
  isInstallationComplete,
  expenses
}: {
  total: number;
  cogs: number;
  kenCut: number;
  salesOwner: CrmBookkeepingSalesOwner | null;
  installationAmount: number;
  isInstallationComplete: boolean;
  expenses: number;
}) {
  const installationCost = isInstallationComplete ? installationAmount : 0;
  const remainingProfitBeforeJessica = roundCents(total - cogs - kenCut - installationCost - expenses);
  // The 50/50 split applies ONLY to Jessica's own sales (owner-confirmed rule,
  // June 2026); Mike keeps 100% of jobs he sold. This intentionally differs from
  // the "regardless of who sold it" wording in migration 20260610. Installation
  // cost is netted first only when a matched install invoice exists.
  const jessicaCommission =
    salesOwner === "jessica"
      ? roundCents(Math.max(remainingProfitBeforeJessica, 0) * 0.5)
      : 0;

  return {
    remainingProfitBeforeJessica,
    jessicaCommission,
    mikeProfit: roundCents(remainingProfitBeforeJessica - jessicaCommission)
  };
}

function normalizeSalesOwner(value: string | null | undefined): CrmBookkeepingSalesOwner | null {
  const lower = (value || "").toLowerCase();
  if (lower.includes("jessica")) return "jessica";
  if (lower.includes("mike")) return "mike";
  return null;
}

function urgencyRank(value: CrmAccountabilityItem["urgency"]) {
  return { complete: 0, normal: 1, warning: 2, urgent: 3 }[value];
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(value || 0);
}

function roundCents(n: number): number {
  return Math.round(n * 100) / 100;
}
