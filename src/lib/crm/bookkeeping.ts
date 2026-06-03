import {
  CrmAccountabilityItem,
  CrmBookkeepingCredit,
  CrmBookkeepingEntry,
  CrmBookkeepingPayment,
  CrmBookkeepingPaymentType,
  CrmBookkeepingRow,
  CrmBookkeepingSalesOwner,
  CrmBookkeepingTotals,
  CrmQuote,
  CrmQuoteStatus
} from "@/lib/crm/types";

export const OWNER_COMMISSION_RATE = 0.1;

const ACTIVE_QUOTE_STATUSES = new Set<CrmQuoteStatus>([
  "sold",
  "approved",
  "ordered",
  "received",
  "installed",
  "invoiced",
  "paid"
]);

export function buildBookkeepingRows({
  quotes,
  entries,
  payments,
  credits = []
}: {
  quotes: CrmQuote[];
  entries: CrmBookkeepingEntry[];
  payments: CrmBookkeepingPayment[];
  credits?: CrmBookkeepingCredit[];
}): CrmBookkeepingRow[] {
  const paymentsByEntryId = groupPayments(payments, "bookkeeping_entry_id");
  const paymentsByQuoteId = groupPayments(payments, "quote_id");
  const creditsToEntryId = groupCredits(credits, "to_bookkeeping_entry_id");
  const creditsFromEntryId = groupCredits(credits, "from_bookkeeping_entry_id");
  const creditsToQuoteId = groupCredits(credits, "to_quote_id");
  const creditsFromQuoteId = groupCredits(credits, "from_quote_id");
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
      creditsFromEntryId.get(entry.id) || []
    )
  );

  const quoteRows = quotes
    .filter((quote) => ACTIVE_QUOTE_STATUSES.has(quote.status))
    .filter((quote) => !linkedQuoteIds.has(quote.id))
    .map((quote) =>
      buildQuoteRow(
        quote,
        paymentsByQuoteId.get(quote.id) || [],
        creditsToQuoteId.get(quote.id) || [],
        creditsFromQuoteId.get(quote.id) || [],
        quoteMetadataByQuoteId.get(quote.id) || null
      )
    );

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
      balance: 0,
      kenCut: 0,
      mikeProfit: 0,
      installationAmount: 0,
      jessicaCommission: 0,
      jessicaCommissionPaid: 0,
      jessicaCommissionOwed: 0,
      missingCogs: 0
    }
  );
}

export function buildAccountabilityQueue(rows: CrmBookkeepingRow[]): CrmAccountabilityItem[] {
  const items: CrmAccountabilityItem[] = [];

  for (const row of rows) {
    const owner = row.salesOwner === "jessica" ? "Jessica" : row.salesOwner === "mike" ? "Mike" : "Sales";
    const status = String(row.status);

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
  creditsOut: CrmBookkeepingCredit[]
): CrmBookkeepingRow {
  const total = Number(entry.total_amount) || 0;
  const depositPaid = sumPayments(payments.filter(isDepositPayment));
  const balancePaid = sumPayments(payments.filter((payment) => !isDepositPayment(payment)));
  const paidTotal = roundCents(depositPaid + balancePaid);
  const creditIn = sumCredits(creditsIn);
  const creditOut = sumCredits(creditsOut);
  const cogs = Number(entry.cogs_amount) || 0;
  const kenCut = roundCents(total * OWNER_COMMISSION_RATE);
  const installation = getInstallationFields(entry);
  const profit = calculateBookkeepingProfit({
    total,
    cogs,
    kenCut,
    salesOwner: entry.sales_owner,
    installationAmount: installation.invoiceAmount,
    isInstallationComplete: installation.isComplete
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
    mikeProfit: profit.mikeProfit,
    salesOwner: entry.sales_owner,
    installationInvoiceDocumentId: entry.installation_invoice_document_id,
    installationInvoiceAmount: installation.invoiceAmount,
    installationInvoiceNumber: entry.installation_invoice_number,
    installationInvoiceUrl: entry.installation_invoice_url,
    installationMatchStatus: entry.installation_match_status,
    installationMatchedAt: entry.installation_matched_at,
    isInstallationComplete: installation.isComplete,
    remainingProfitBeforeJessica: profit.remainingProfitBeforeJessica,
    jessicaCommission: profit.jessicaCommission,
    jessicaCommissionPaidAt: entry.jessica_commission_paid_at,
    jessicaCommissionOwed: entry.jessica_commission_paid_at ? 0 : profit.jessicaCommission,
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
  entry: CrmBookkeepingEntry | null
): CrmBookkeepingRow {
  const total = Number(quote.quote_total) || 0;
  const cogs = Number(entry?.cogs_amount ?? quote.materials_cost) || 0;
  const explicitPaid = sumPayments(payments);
  const explicitDepositPaid = sumPayments(payments.filter(isDepositPayment));
  const explicitBalancePaid = sumPayments(payments.filter((payment) => !isDepositPayment(payment)));
  const depositPaid = explicitPaid > 0 && explicitDepositPaid > 0 ? explicitDepositPaid : Number(quote.deposit_required) || 0;
  const balancePaid = explicitPaid > 0 ? explicitBalancePaid : 0;
  const paidTotal = roundCents(depositPaid + balancePaid);
  const creditIn = sumCredits(creditsIn);
  const creditOut = sumCredits(creditsOut);
  const kenCut = roundCents(total * OWNER_COMMISSION_RATE);
  const salesOwner = normalizeSalesOwner(entry?.sales_owner || quote.sold_by);
  const installation = getInstallationFields(entry);
  const profit = calculateBookkeepingProfit({
    total,
    cogs,
    kenCut,
    salesOwner,
    installationAmount: installation.invoiceAmount,
    isInstallationComplete: installation.isComplete
  });

  return {
    id: quote.id,
    source: "crm_quote",
    quoteId: quote.id,
    jobId: quote.job_id,
    customerName: quote.customer_name || entry?.customer_name || "Linked job",
    quoteNumber: quote.quote_number,
    soldDate: quote.sold_at || quote.approved_at || quote.ordered_at || quote.created_at,
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
    mikeProfit: profit.mikeProfit,
    salesOwner,
    installationInvoiceDocumentId: entry?.installation_invoice_document_id || null,
    installationInvoiceAmount: installation.invoiceAmount,
    installationInvoiceNumber: entry?.installation_invoice_number || null,
    installationInvoiceUrl: entry?.installation_invoice_url || null,
    installationMatchStatus: entry?.installation_match_status || "unmatched",
    installationMatchedAt: entry?.installation_matched_at || null,
    isInstallationComplete: installation.isComplete,
    remainingProfitBeforeJessica: profit.remainingProfitBeforeJessica,
    jessicaCommission: profit.jessicaCommission,
    jessicaCommissionPaidAt: entry?.jessica_commission_paid_at || null,
    jessicaCommissionOwed: entry?.jessica_commission_paid_at ? 0 : profit.jessicaCommission,
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

function sumCredits(credits: CrmBookkeepingCredit[]) {
  return roundCents(credits.reduce((sum, credit) => sum + (Number(credit.amount) || 0), 0));
}

function isDepositPayment(payment: CrmBookkeepingPayment) {
  return payment.payment_label.toLowerCase().includes("deposit");
}

function calculateAppliedRevenue(paidTotal: number, creditIn: number, creditOut: number) {
  return roundCents(paidTotal + creditIn - creditOut);
}

function getInstallationFields(entry: CrmBookkeepingEntry | null) {
  const invoiceAmount = roundCents(Number(entry?.installation_invoice_amount) || 0);
  const isComplete =
    Boolean(entry?.installation_invoice_document_id || invoiceAmount > 0) &&
    entry?.installation_match_status === "matched";

  return { invoiceAmount, isComplete };
}

function calculateBookkeepingProfit({
  total,
  cogs,
  kenCut,
  salesOwner,
  installationAmount,
  isInstallationComplete
}: {
  total: number;
  cogs: number;
  kenCut: number;
  salesOwner: CrmBookkeepingSalesOwner | null;
  installationAmount: number;
  isInstallationComplete: boolean;
}) {
  const installationCost = isInstallationComplete ? installationAmount : 0;
  const remainingProfitBeforeJessica = roundCents(total - cogs - kenCut - installationCost);
  const jessicaCommission =
    salesOwner === "jessica" && isInstallationComplete
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
