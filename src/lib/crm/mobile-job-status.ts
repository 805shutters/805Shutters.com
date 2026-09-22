import { buildOperationsItems, stepComplete } from "./operations-overview";
import { jobStatusFilters, matchesJobStatusFilter, type JobStatusFilter } from "./job-status-filters";
import type { CrmDashboardData } from "./types";

/** The desktop remains the authority for milestone evidence and closure. */
export function buildMobileJobStatus(data: CrmDashboardData) {
  return buildOperationsItems(data).filter(item => !(item.source.quote?.job_id && !item.source.job)).map(item => ({
    id: item.source.id,
    name: item.source.customerName,
    project: item.source.project,
    balance: item.source.balanceOutstanding,
    contractUrl: item.source.contractUrl,
    closed: item.closed,
    archived: item.archived,
    filters: (["active", "closed", ...jobStatusFilters.map(filter => filter.id)] as JobStatusFilter[]).filter(filter => matchesJobStatusFilter(item, filter)),
    milestones: jobStatusFilters.map(filter => ({ label: filter.label, complete: filter.id === "deposit_paid" ? item.sold && item.source.depositOutstanding !== null && item.source.depositOutstanding <= 0.005 : stepComplete(item, filter.id === "order_complete" ? "ordered" : filter.id === "shipment_complete" ? "shipped" : filter.id) })),
    products: item.products.map(product => ({ id: product.id, name: product.name, ordered: product.ordered, shipped: product.shipped, installed: product.installed })),
    shippedAndDue: stepComplete(item, "shipped") && item.sold && (item.source.balanceOutstanding ?? 0) > 0.005,
  })).sort((a, b) => Number(b.shippedAndDue) - Number(a.shippedAndDue) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}
export type MobileJobStatus = ReturnType<typeof buildMobileJobStatus>[number];
