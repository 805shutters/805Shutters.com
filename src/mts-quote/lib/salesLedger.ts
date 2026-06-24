import type { SalesQuote, QuoteStatus } from "@mts/types/quote";
import { STATUS_LABELS } from "@mts/lib/quoteStatus";

/**
 * Owner commission rate on every sold quote (10%).
 * Pulled out so it can be overridden per-account later if needed.
 */
export const OWNER_COMMISSION_RATE = 0.1;

/**
 * Which lifecycle states belong on the Sales Ledger.
 * Draft/sent haven't closed yet; archived is hidden.
 */
const LEDGER_STATUSES: ReadonlySet<QuoteStatus> = new Set([
  "sold",
  "ordered",
  "received",
  "installed",
]);

/**
 * Display label for the ledger's "Job Status" column.
 * The user's mental model uses "Install" for "received, ready to install"
 * and "Complete" for "installed (done)".
 */
export const LEDGER_STATUS_LABELS: Record<QuoteStatus, string> = {
  draft: STATUS_LABELS.draft,
  sent: STATUS_LABELS.sent,
  sold: "Sold",
  ordered: "Ordered",
  received: "Install",
  installed: "Complete",
  archived: STATUS_LABELS.archived,
};

export interface LedgerRow {
  id: string;
  quoteNumber: string;
  customerName: string;
  dateSold: string | null; // ISO
  grossSale: number;
  costOfGoods: number;
  ownerCommission: number; // 10% of grossSale
  depositPaid: number;
  balance: number; // grossSale - depositPaid
  paymentMethod: string | null;
  netProfit: number; // grossSale - costOfGoods - ownerCommission
  status: QuoteStatus;
  statusLabel: string;
  manufacturerName: string | null;
  manufacturerOrderRef: string | null;
}

export interface LedgerTotals {
  rows: number;
  grossSale: number;
  costOfGoods: number;
  ownerCommission: number;
  depositPaid: number;
  balance: number;
  netProfit: number;
}

/**
 * Build a single ledger row from a quote.
 * Pure — no side effects, safe to memoize.
 */
export function buildLedgerRow(quote: SalesQuote): LedgerRow {
  const grossSale = Number(quote.total_amount) || 0;
  const costOfGoods = Number(quote.manufacturer_cost) || 0;
  const ownerCommission = roundCents(grossSale * OWNER_COMMISSION_RATE);
  const depositPaid = Number(quote.deposit_paid) || 0;
  const balance = roundCents(grossSale - depositPaid);
  const netProfit = roundCents(grossSale - costOfGoods - ownerCommission);

  return {
    id: quote.id,
    quoteNumber: quote.quote_number,
    customerName: quote.customer_name || "—",
    dateSold: quote.signed_at ?? null,
    grossSale,
    costOfGoods,
    ownerCommission,
    depositPaid,
    balance,
    paymentMethod: quote.payment_method ?? null,
    netProfit,
    status: quote.status,
    statusLabel: LEDGER_STATUS_LABELS[quote.status] ?? quote.status,
    manufacturerName: quote.manufacturer_name ?? null,
    manufacturerOrderRef: quote.manufacturer_order_ref ?? null,
  };
}

/**
 * Filter + sort + build rows in one go. Newest-sold first.
 */
export function buildLedger(quotes: SalesQuote[]): LedgerRow[] {
  return quotes
    .filter((q) => LEDGER_STATUSES.has(q.status))
    .map(buildLedgerRow)
    .sort((a, b) => {
      const at = a.dateSold ? Date.parse(a.dateSold) : 0;
      const bt = b.dateSold ? Date.parse(b.dateSold) : 0;
      return bt - at;
    });
}

export function sumLedger(rows: LedgerRow[]): LedgerTotals {
  const totals: LedgerTotals = {
    rows: rows.length,
    grossSale: 0,
    costOfGoods: 0,
    ownerCommission: 0,
    depositPaid: 0,
    balance: 0,
    netProfit: 0,
  };
  for (const r of rows) {
    totals.grossSale += r.grossSale;
    totals.costOfGoods += r.costOfGoods;
    totals.ownerCommission += r.ownerCommission;
    totals.depositPaid += r.depositPaid;
    totals.balance += r.balance;
    totals.netProfit += r.netProfit;
  }
  // Round the sums once, not per-row
  totals.grossSale = roundCents(totals.grossSale);
  totals.costOfGoods = roundCents(totals.costOfGoods);
  totals.ownerCommission = roundCents(totals.ownerCommission);
  totals.depositPaid = roundCents(totals.depositPaid);
  totals.balance = roundCents(totals.balance);
  totals.netProfit = roundCents(totals.netProfit);
  return totals;
}

/**
 * Round to nearest cent using integer arithmetic to dodge float drift.
 */
function roundCents(n: number): number {
  return Math.round(n * 100) / 100;
}

export function formatMoney(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}
