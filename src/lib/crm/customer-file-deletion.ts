import type { CrmCustomerFile } from "./types";
import { objectMeta } from "./measure-needed-state";

const soldStatuses = new Set(["sold", "approved", "accepted", "signed", "ordered", "received", "shipped", "installed", "invoiced", "paid", "closed", "complete", "completed", "manual", "legacy"]);

/** Use sale evidence, not the latest display status: archiving must not unlock a sale. */
export function hasCustomerSaleEvidence(record: Record<string, unknown>): boolean {
  const meta = objectMeta(record.meta);
  return [record.status, record.live_status, record.latest_status, record.source].some(value => soldStatuses.has(String(value || "").toLowerCase())) ||
    Boolean(record.sold_at || record.sold_date || record.soldDate || record.signed_at || record.approved_at || record.accepted_at || record.customer_signature || record.first_sold_date || record.latest_sold_date ||
      meta.sold_at || meta.signed_at || objectMeta(meta.job_tracking_contract).signed_at || objectMeta(meta.contract_snapshot).signedAt);
}

export function canDeleteCustomerFile(file: CrmCustomerFile): boolean {
  return ![...(file.customer ? [file.customer] : []), ...file.jobs, ...file.quotes, ...file.contracts, ...file.bookkeepingRows].some(record => hasCustomerSaleEvidence(record as unknown as Record<string, unknown>));
}
