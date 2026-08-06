/**
 * Minimal interface for job fields needed for customer grouping
 * This is compatible with both src/types/job.ts and JobCard.tsx Job types
 */
interface GroupableJob {
  id: string;
  customer_name: string;
  customer_phone?: string | null;
  status: string;
  created_at?: string | null;
  service_report_submitted_at?: string | null;
}

/**
 * Normalize a phone number by removing all non-digit characters
 */
export function normalizePhone(phone: string | null | undefined): string {
  if (!phone) return "";
  return phone.replace(/\D/g, "");
}

/**
 * Generate a unique customer key from a job
 * Uses normalized phone as primary identifier, falls back to customer name
 */
export function getCustomerKey(job: GroupableJob): string {
  const normalizedPhone = normalizePhone(job.customer_phone);
  if (normalizedPhone && normalizedPhone.length >= 7) {
    return `phone:${normalizedPhone}`;
  }
  // Fallback to normalized customer name (uppercase, trimmed)
  const normalizedName = job.customer_name?.trim().toUpperCase() || "";
  return `name:${normalizedName}`;
}

/**
 * Status priority for determining which status group a customer stack appears in
 * Lower number = higher priority (appears first)
 */
const STATUS_PRIORITY: Record<string, number> = {
  urgent: 1,
  action_needed: 2,
  incomplete: 3,
  scheduled: 4,
  ready_to_schedule: 5,
  all_product_received: 6,
  waiting_for_product: 7,
  partial_product_received: 8,
  message_left: 9,
  job_on_hold: 10,
  needs_paperwork: 11,
  complete: 12,
  billing: 13,
  closed_archived: 14,
};

/**
 * Get the priority status for a group of jobs
 * Returns the status that should determine where the customer stack appears
 */
export function getPriorityStatus<T extends GroupableJob>(jobs: T[]): string {
  if (jobs.length === 0) return "ready_to_schedule";

  // Only consider unreported jobs for priority status (column placement)
  const unreportedJobs = jobs.filter(j => !j.service_report_submitted_at);
  const jobsToConsider = unreportedJobs.length > 0 ? unreportedJobs : jobs;

  return jobsToConsider.reduce((priorityStatus, job) => {
    const currentPriority = STATUS_PRIORITY[priorityStatus] ?? 999;
    const jobPriority = STATUS_PRIORITY[job.status] ?? 999;
    return jobPriority < currentPriority ? job.status : priorityStatus;
  }, jobsToConsider[0].status);
}

/**
 * Get the primary job from a group (most recent or highest priority)
 */
export function getPrimaryJob<T extends GroupableJob>(jobs: T[]): T {
  if (jobs.length === 0) throw new Error("Cannot get primary job from empty array");
  if (jobs.length === 1) return jobs[0];

  // Sort by: unreported first, then NEWEST created, then status priority as tiebreaker
  const sorted = [...jobs].sort((a, b) => {
    // First: Unreported jobs come before reported jobs
    const aReported = !!a.service_report_submitted_at;
    const bReported = !!b.service_report_submitted_at;
    if (aReported !== bReported) {
      return aReported ? 1 : -1;  // Unreported first
    }

    // Second: Sort by created_at descending (NEWEST first)
    const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
    const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
    if (dateA !== dateB) {
      return dateB - dateA;  // Newest first
    }

    // Finally: Sort by status priority (as tiebreaker)
    const priorityA = STATUS_PRIORITY[a.status] ?? 999;
    const priorityB = STATUS_PRIORITY[b.status] ?? 999;
    return priorityA - priorityB;
  });

  return sorted[0];
}

export interface CustomerGroup<T extends GroupableJob = GroupableJob> {
  customerKey: string;
  customerName: string;
  customerPhone: string | null;
  jobs: T[];
  primaryJob: T;
  priorityStatus: string;
}

/**
 * Group jobs by customer
 * Returns a map of customer key -> array of jobs
 */
export function groupJobsByCustomer<T extends GroupableJob>(jobs: T[]): Map<string, CustomerGroup<T>> {
  const groups = new Map<string, T[]>();

  // Group jobs by customer key
  for (const job of jobs) {
    const key = getCustomerKey(job);
    const existing = groups.get(key) || [];
    existing.push(job);
    groups.set(key, existing);
  }

  // Convert to CustomerGroup format
  const customerGroups = new Map<string, CustomerGroup<T>>();

  for (const [key, customerJobs] of groups) {
    const primaryJob = getPrimaryJob(customerJobs);
    customerGroups.set(key, {
      customerKey: key,
      customerName: primaryJob.customer_name,
      customerPhone: primaryJob.customer_phone || null,
      jobs: customerJobs,
      primaryJob,
      priorityStatus: getPriorityStatus(customerJobs),
    });
  }

  return customerGroups;
}

/**
 * Check if a customer has multiple jobs
 */
export function hasMultipleJobs<T extends GroupableJob>(jobs: T[], customerKey: string): boolean {
  return jobs.filter(job => getCustomerKey(job) === customerKey).length > 1;
}
