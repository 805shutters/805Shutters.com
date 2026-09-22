import { buildOperationsItems } from "./operations-overview";
import { matchesJobStatusFilter } from "./job-status-filters";
import { mobileCustomerMatchesLetter, type MobileCustomerResult } from "./mobile-customers";
import type { CrmDashboardData } from "./types";

export type MobilePaymentCustomer = MobileCustomerResult & {
  outstanding: number | null;
  paid: number | null;
  dueType: "deposit" | "balance" | null;
  amountDue: number;
  priority: boolean;
  shipped: boolean;
  archived: boolean;
  closed: boolean;
  soldDate: string | null;
  project: string;
  products: string[];
  contractUrl: string | null;
};

/** Share the desktop's exact sale identity, ledger and all-products shipment rules.
 * Only this compact, customer-facing projection crosses the mobile API boundary. */
export function buildMobilePaymentQueue(data: CrmDashboardData): MobilePaymentCustomer[] {
  return buildOperationsItems(data).flatMap(item => {
    const s = item.source;
    if (item.paid && item.closed) return [];
    const outstanding = s.balanceOutstanding;
    const deposit = s.depositOutstanding ?? 0;
    const balance = s.squareBalanceOutstanding ?? 0;
    const dueType = deposit > 0 ? "deposit" : balance > 0 ? "balance" : null;
    const amountDue = dueType === "deposit" ? deposit : dueType === "balance" ? balance : 0;
    const shipped = matchesJobStatusFilter(item, "shipment_complete");
    const quoteId = s.quote?.id || s.row?.quoteId || null;
    return [{
      id: s.id, jobId: s.job?.id || s.quote?.job_id || s.row?.jobId || "", quoteId,
      name: s.customerName, phone: s.phone, email: s.email,
      address: [s.address, s.job?.city].filter(Boolean).join(", ") || null,
      deposit, balance, outstanding, contractTotal: s.total ?? 0,
      paid: s.row ? s.row.depositPaid + s.row.balancePaid : null,
      dueType, amountDue, shipped, priority: shipped && outstanding !== null && outstanding > 0.005,
      archived: item.archived, closed: item.closed, soldDate: s.soldDate,
      project: s.project, products: item.products.map(p => p.name), contractUrl: s.contractUrl,
    } satisfies MobilePaymentCustomer];
  }).sort((a, b) => Number(b.priority) - Number(a.priority)
    || (a.priority && b.priority ? (Date.parse(a.soldDate || "") || Infinity) - (Date.parse(b.soldDate || "") || Infinity) : 0)
    || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

export function filterMobilePaymentCustomers(rows: MobilePaymentCustomer[], query = "", letter = "", scope?: string) {
  const term = query.trim().toLowerCase();
  return rows.filter(row => (!scope || row.archived === (scope === "archived"))
    && (!letter || mobileCustomerMatchesLetter(row.name, letter))
    && (!term || [row.name, row.phone, row.email, row.address, row.project].some(value => value?.toLowerCase().includes(term))));
}
