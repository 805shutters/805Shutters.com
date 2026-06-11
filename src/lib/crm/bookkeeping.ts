import {
  CrmAccountabilityItem,
  CrmBookkeepingCredit,
  CrmBookkeepingEntry,
  CrmBookkeepingPayment,
  CrmBookkeepingPaymentType,
  CrmBookkeepingRow,
  CrmBookkeepingSalesOwner,
  CrmBookkeepingTotals,
  CrmInstallationMatchStatus,
  CrmJobExpense,
  CrmQuote,
  CrmQuoteStatus
} from "@/lib/crm/types";

// Profit rules (confirmed 2026-06-10):
// * Net profit = sale total - COGS - Ken cut - installation invoice - job expenses.
// * Every job's net profit splits 50/50 between Mike and Jessica regardless of
//   who sold it. The assigned salesperson earns no extra commission; the
//   assignment drives accountability and the Ken-cut exemption.
// * Ken cut is 10% of the sale total, except jobs sold on/after the exemption
//   date that are assigned to Jessica. Rows can pin an explicit override.
// * Profit is "final" (and Jessica's share owed) only after the installation
//   invoice is settled and COGS is entered - expenses must be complete before
//   the split pays out.
export const KEN_CUT_RATE = 0.1;
export const KEN_CUT_JESSICA_EXEMPTION_DATE = "2026-06-10";

const ACTIVE_QUOTE_STATUSES = new Set<CrmQuoteStatus>([
  "sold",
  "approved",
  "ordered",
  "received",
  "installed",
  "invoiced",
  "paid"
]);

export function resolveKenCut({
  total,
  salesOwner,
  soldDate,
  kenCutOverride
}: {
  total: number;
  salesOwner: CrmBookkeepingSalesOwner | null;
  soldDate: string | null;
  kenCutOverride: number | null;
}): number {
  if (kenCutOverride !== null && Number.isFinite(kenCutOverride)) {
    return roundCents(Math.max(kenCutOverride, 0));
  }

  // Undated rows are treated as new sales; historical rows keep the legacy
  // 10% so imported sheet math never changes retroactively.
  const soldUnderNewPolicy = soldDate
    ? Date.parse(soldDate) >= Date.parse(KEN_CUT_JESSICA_EXEMPTION_DATE)
    : true;

  if (soldUnderNewPolicy && salesOwner === "jessica") return 0;
  return roundCents(total * KEN_CUT_RATE);
}

export function calculateJobProfit({
  total,
  cogs,
  kenCut,
  installationAmount,
  expensesTotal,
  installationMatchStatus
}: {
  total: number;
  cogs: number;
  kenCut: number;
  installationAmount: number;
  expensesTotal: number;
  installationMatchStatus: CrmInstallationMatchStatus;
}) {
  const netProfit = roundCents(total - cogs - kenCut - installationAmount - expensesTotal);

  // Integer-cent split so Mike + Jessica always equals net profit exactly.
  const netCents = Math.round(netProfit * 100);
  const mikeCents = Math.trunc(netCents / 2);
  const mikeShare = mikeCents / 100;
  const jessicaShare = (netCents - mikeCents) / 100;

  const isInstallationSettled = installationMatchStatus === "matched";
  const isProfitFinal = isInstallationSettled && cogs > 0;

  return { netProfit, mikeShare, jessicaShare, isProfitFinal, isInstallationSettled };
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
  const paymentsByEntryId = groupBy(payments, "bookkeeping_entry_id");
  const paymentsByQuoteId = groupBy(payments, "quote_id");
  const creditsToEntryId = groupBy(credits, "to_bookkeeping_entry_id");
  const creditsFromEntryId = groupBy(credits, "from_bookkeeping_entry_id");
  const creditsToQuoteId = groupBy(credits, "to_quote_id");
  const creditsFromQuoteId = groupBy(credits, "from_quote_id");
  const expensesByEntryId = groupBy(expenses, "bookkeeping_entry_id");
  const expensesByQuoteId = groupBy(expenses, "quote_id");
  const quoteMetadataEntries = entries.filter((entry) => entry.source === "crm_quote" && entry.quote_id);
  const quoteMetadataByQuoteId = new Map(
    quoteMetadataEntries.map((entry) => [entry.quote_id as string, entry])
  );
  const standaloneEntries = entries.filter((entry) => !(entry.source === "crm_quote" && entry.quote_id));
  const linkedQuoteIds = new Set(standaloneEntries.map((entry) => entry.quote_id).filter(Boolean));

  const entryRows = standaloneEntries.map((entry) =>
    buildEntryRow(
      entry,
      paymentsByEntryId.get(entry.id) || [],
      creditsToEntryId.get(entry.id) || [],
      creditsFromEntryId.get(entry.id) || [],
      expensesByEntryId.get(entry.id) || []
    )
  );

  const quoteRows = quotes
    .filter((quote) => ACTIVE_QUOTE_STATUSES.has(quote.status))
    .filter((quote) => !linkedQuoteIds.has(quote.id))
    .map((quote) => {
      const entry = quoteMetadataByQuoteId.get(quote.id) || null;
      const quoteExpenses = dedupeById([
        ...(expensesByQuoteId.get(quote.id) || []),
        ...(entry ? expensesByEntryId.get(entry.id) || [] : [])
      ]);

      return buildQuoteRow(
        quote,
        paymentsByQuoteId.get(quote.id) || [],
        creditsToQuoteId.get(quote.id) || [],
        creditsFromQuoteId.get(quote.id) || [],
        entry,
        quoteExpenses
      );
    });

  return [...entryRows, ...quoteRows].sort((a, b) => {
    const at = a.soldDate ? Date.parse(a.soldDate) : 0;
    const bt = b.soldDate ? Date.parse(b.soldDate) : 0;
    return bt - at;
  });
}

export function sumBookkeepingRows(rows: CrmBookkeepingRow[]): CrmBookkeepingTotals {
  return rows.reduce<CrmBookkeepingTotals>(
    (totals, row) => {
      totals.rows += 1;
      totals.total = roundCents(totals.total + row.total);
      totals.paidTotal = roundCents(totals.paidTotal + row.paidTotal);
      totals.creditIn = roundCents(totals.creditIn + row.creditIn);
      totals.creditOut = roundCents(totals.creditOut + row.creditOut);
      totals.cogs = roundCents(totals.cogs + row.cogs);
      totals.balance = roundCents(totals.balance + row.balance);
      totals.kenCut = roundCents(totals.kenCut + row.kenCut);
      totals.expenses = roundCents(totals.expenses + row.expensesTotal);
      totals.installationAmount = roundCents(totals.installationAmount + row.installationInvoiceAmount);
      totals.netProfit = roundCents(totals.netProfit + row.netProfit);
      totals.mikeShare = roundCents(totals.mikeShare + row.mikeShare);
      totals.jessicaShare = roundCents(totals.jessicaShare + row.jessicaShare);
      totals.jessicaSharePaid = roundCents(
        totals.jessicaSharePaid + (row.jessicaSharePaidAt ? Math.max(row.jessicaShare, 0) : 0)
      );
      totals.jessicaShareOwed = roundCents(totals.jessicaShareOwed + row.jessicaShareOwed);
      if (row.cogs <= 0) totals.missingCogs += 1;
      if (!row.salesOwner) totals.missingSalesOwner += 1;
      if (!row.isProfitFinal) totals.projectedRows += 1;
      return totals;
    },
    {
      rows: 0,
      total: 0,
      paidTotal: 0,
      creditIn: 0,
      creditOut: 0,
      cogs: 0,
      balance: 0,
      kenCut: 0,
      expenses: 0,
      installationAmount: 0,
      netProfit: 0,
      mikeShare: 0,
      jessicaShare: 0,
      jessicaSharePaid: 0,
      jessicaShareOwed: 0,
      missingCogs: 0,
      missingSalesOwner: 0,
      projectedRows: 0
    }
  );
}

export function buildAccountabilityQueue(rows: CrmBookkeepingRow[]): CrmAccountabilityItem[] {
  const items: CrmAccountabilityItem[] = [];

  for (const row of rows) {
    const owner = row.salesOwner === "jessica" ? "Jessica" : row.salesOwner === "mike" ? "Mike" : "Sales";
    const status = String(row.status);

    if (!row.salesOwner && status !== "legacy") {
      items.push({
        id: `${row.id}-assign-owner`,
        type: "assign_sales_owner",
        label: "Assign salesperson",
        detail: `${row.customerName} has no salesperson assigned. Assign Mike or Jessica so the Ken cut and split are correct.`,
        owner: "Sales",
        urgency: "warning",
        rowId: row.id,
        quoteId: row.quoteId,
        jobId: row.jobId
      });
    }

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

    if (row.jessicaShareOwed > 0) {
      items.push({
        id: `${row.id}-jessica-owed`,
        type: "commission_due",
        label: "Jessica 50% share owed",
        detail: `${row.customerName} has ${formatMoney(row.jessicaShareOwed)} owed to Jessica.`,
        owner: "Bookkeeping",
        urgency: "warning",
        amount: row.jessicaShareOwed,
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
  return value ? "other" : null;
}

export function formatPaymentType(value: CrmBookkeepingPaymentType | null): string {
  if (!value) return "None";
  return {
    zelle: "Zelle",
    cash: "Cash",
    check: "Check",
    credit_card: "Credit Card",
    other: "Other"
  }[value];
}

function buildEntryRow(
  entry: CrmBookkeepingEntry,
  payments: CrmBookkeepingPayment[],
  creditsIn: CrmBookkeepingCredit[],
  creditsOut: CrmBookkeepingCredit[],
  expenses: CrmJobExpense[]
): CrmBookkeepingRow {
  const total = Number(entry.total_amount) || 0;
  const depositPaid = sumAmounts(payments.filter(isDepositPayment));
  const balancePaid = sumAmounts(payments.filter((payment) => !isDepositPayment(payment)));
  const paidTotal = roundCents(depositPaid + balancePaid);
  const creditIn = sumAmounts(creditsIn);
  const creditOut = sumAmounts(creditsOut);
  const cogs = Number(entry.cogs_amount) || 0;
  const expensesTotal = sumAmounts(expenses);
  const installationInvoiceAmount = roundCents(Number(entry.installation_invoice_amount) || 0);
  const kenCutOverride = entry.ken_cut_override === null ? null : Number(entry.ken_cut_override);
  const salesOwner = entry.sales_owner;
  const kenCut = resolveKenCut({
    total,
    salesOwner,
    soldDate: entry.sold_date,
    kenCutOverride
  });
  const profit = calculateJobProfit({
    total,
    cogs,
    kenCut,
    installationAmount: installationInvoiceAmount,
    expensesTotal,
    installationMatchStatus: entry.installation_match_status
  });

  return {
    id: entry.id,
    source: entry.source,
    quoteId: entry.quote_id,
    jobId: entry.job_id,
    customerName: entry.customer_name,
    quoteNumber: entry.imported_sheet_row ? `Sheet row ${entry.imported_sheet_row}` : null,
    soldDate: entry.sold_date,
    total,
    depositDue: roundCents(total * 0.5),
    depositPaid,
    balancePaid,
    paidTotal,
    creditIn,
    creditOut,
    paymentType: entry.payment_type,
    cogs,
    balance: roundCents(total - calculateAppliedRevenue(paidTotal, creditIn, creditOut)),
    kenCut,
    kenCutOverride,
    expensesTotal,
    expenses,
    netProfit: profit.netProfit,
    mikeShare: profit.mikeShare,
    jessicaShare: profit.jessicaShare,
    isProfitFinal: profit.isProfitFinal,
    salesOwner,
    installationInvoiceDocumentId: entry.installation_invoice_document_id,
    installationInvoiceAmount,
    installationInvoiceNumber: entry.installation_invoice_number,
    installationInvoiceUrl: entry.installation_invoice_url,
    installationMatchStatus: entry.installation_match_status,
    installationMatchedAt: entry.installation_matched_at,
    isInstallationComplete: profit.isInstallationSettled,
    jessicaSharePaidAt: entry.jessica_commission_paid_at,
    jessicaShareOwed: jessicaShareOwed(profit, entry.jessica_commission_paid_at),
    manufacturerName: entry.manufacturer_name,
    manufacturerOrderRef: entry.manufacturer_order_ref,
    manufacturerOrderUrl: entry.manufacturer_order_url,
    manufacturerDocumentUrl: entry.manufacturer_document_url,
    notes: entry.notes,
    status: entry.source === "legacy_sheet" ? "legacy" : "manual",
    payments,
    creditsIn,
    creditsOut
  };
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
  const explicitDepositPaid = sumAmounts(payments.filter(isDepositPayment));
  const explicitBalancePaid = sumAmounts(payments.filter((payment) => !isDepositPayment(payment)));
  // Only assume the required deposit was collected when no payments are
  // recorded at all; otherwise the recorded payments are the truth.
  const depositPaid = payments.length ? explicitDepositPaid : Number(quote.deposit_required) || 0;
  const balancePaid = explicitBalancePaid;
  const paidTotal = roundCents(depositPaid + balancePaid);
  const creditIn = sumAmounts(creditsIn);
  const creditOut = sumAmounts(creditsOut);
  const expensesTotal = sumAmounts(expenses);
  const soldDate = quote.sold_at || quote.approved_at || quote.ordered_at || quote.created_at;
  const salesOwner = normalizeSalesOwner(entry?.sales_owner || quote.sold_by);
  const installationInvoiceAmount = roundCents(Number(entry?.installation_invoice_amount) || 0);
  const installationMatchStatus = entry?.installation_match_status || "unmatched";
  const kenCutOverride =
    entry && entry.ken_cut_override !== null ? Number(entry.ken_cut_override) : null;
  const kenCut = resolveKenCut({ total, salesOwner, soldDate, kenCutOverride });
  const profit = calculateJobProfit({
    total,
    cogs,
    kenCut,
    installationAmount: installationInvoiceAmount,
    expensesTotal,
    installationMatchStatus
  });

  return {
    id: quote.id,
    source: "crm_quote",
    quoteId: quote.id,
    jobId: quote.job_id,
    customerName: quote.customer_name || entry?.customer_name || "Linked job",
    quoteNumber: quote.quote_number,
    soldDate,
    total,
    depositDue: roundCents(total * 0.5),
    depositPaid,
    balancePaid,
    paidTotal,
    creditIn,
    creditOut,
    paymentType: entry?.payment_type || null,
    cogs,
    balance: roundCents(total - calculateAppliedRevenue(paidTotal, creditIn, creditOut)),
    kenCut,
    kenCutOverride,
    expensesTotal,
    expenses,
    netProfit: profit.netProfit,
    mikeShare: profit.mikeShare,
    jessicaShare: profit.jessicaShare,
    isProfitFinal: profit.isProfitFinal,
    salesOwner,
    installationInvoiceDocumentId: entry?.installation_invoice_document_id || null,
    installationInvoiceAmount,
    installationInvoiceNumber: entry?.installation_invoice_number || null,
    installationInvoiceUrl: entry?.installation_invoice_url || null,
    installationMatchStatus,
    installationMatchedAt: entry?.installation_matched_at || null,
    isInstallationComplete: profit.isInstallationSettled,
    jessicaSharePaidAt: entry?.jessica_commission_paid_at || null,
    jessicaShareOwed: jessicaShareOwed(profit, entry?.jessica_commission_paid_at || null),
    manufacturerName: entry?.manufacturer_name || quote.manufacturer_name,
    manufacturerOrderRef: entry?.manufacturer_order_ref || quote.manufacturer_order_ref,
    manufacturerOrderUrl: entry?.manufacturer_order_url || quote.manufacturer_order_url,
    manufacturerDocumentUrl: entry?.manufacturer_document_url || quote.manufacturer_document_url,
    notes: entry?.notes || quote.notes,
    status: quote.status,
    payments,
    creditsIn,
    creditsOut
  };
}

function jessicaShareOwed(
  profit: ReturnType<typeof calculateJobProfit>,
  paidAt: string | null
): number {
  if (!profit.isProfitFinal || paidAt) return 0;
  return Math.max(profit.jessicaShare, 0);
}

function groupBy<T extends Record<string, unknown>>(items: T[], key: keyof T) {
  return items.reduce<Map<string, T[]>>((map, item) => {
    const value = item[key];
    if (typeof value !== "string" || !value) return map;
    const current = map.get(value) || [];
    current.push(item);
    map.set(value, current);
    return map;
  }, new Map());
}

function dedupeById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function sumAmounts(items: Array<{ amount: number }>) {
  return roundCents(items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0));
}

function isDepositPayment(payment: CrmBookkeepingPayment) {
  return payment.payment_label.toLowerCase().includes("deposit");
}

function calculateAppliedRevenue(paidTotal: number, creditIn: number, creditOut: number) {
  return roundCents(paidTotal + creditIn - creditOut);
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
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
