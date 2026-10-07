import { buildOperationsItems, type OperationsItem } from "./operations-overview";
import type { CrmDashboardData } from "./types";
import { canDeleteCustomerFile } from "./customer-file-deletion";
import { buildJobStatusQueues, type JobStatusQueueSnapshot } from "./job-status-queues";

/** Initial view excludes only explicitly closed jobs, including unsold work. */
export function isOpenJob(item: Pick<OperationsItem, "closed">): boolean {
  return !item.closed;
}

export type ActiveJobsSnapshot = {
  scope: "active";
  items: OperationsItem[];
  loadWarnings: string[];
  deletableFiles: Record<string, string>;
  queues?: JobStatusQueueSnapshot;
};

/** Apply viewer restrictions before projecting this response. Keep the complete
 * evidence on the server for classification, but send only active job cards.
 * Customer files contain unrelated history and are loaded on demand instead.
 */
export function buildActiveJobsSnapshot(data: CrmDashboardData): ActiveJobsSnapshot {
  const allItems = buildOperationsItems(data);
  const items = allItems.filter(isOpenJob);
  return {
    scope: "active",
    queues: buildJobStatusQueues(data, allItems),
    items: items.map(item => ({
      ...item,
      source: { ...item.source, file: undefined }
    })),
    loadWarnings: data.loadWarnings || [],
    deletableFiles: Object.fromEntries(items.flatMap(item => !item.sold && item.source.file && canDeleteCustomerFile(item.source.file)
      ? [[item.source.id, item.source.file.id]] : []))
  };
}
