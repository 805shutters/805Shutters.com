import { objectMeta } from "./measure-needed-state";
import type { JobTrackingViewItem } from "./job-tracking-view";

/** Operational reopening never changes customer payment evidence. */
export function jobClosureHeldOpen(meta: unknown): boolean {
  return objectMeta(objectMeta(meta).job_closure_override).closed === false;
}

export function trackingPaymentSettled(item: JobTrackingViewItem): boolean {
  return item.isSale && (item.total ?? 0) > 0 && item.balanceOutstanding !== null && item.balanceOutstanding <= 0.005;
}

export function trackingJobClosed(item: JobTrackingViewItem): boolean {
  return trackingPaymentSettled(item) && !jobClosureHeldOpen(item.job?.meta);
}
