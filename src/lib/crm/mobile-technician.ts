import type { CrmCustomerFile, CrmJob } from "@/lib/crm/types";

export type MobileJobBucket = {
  id: string;
  label: string;
  jobs: CrmJob[];
};

export type MobileContractItem = {
  id: string;
  customerName: string;
  title: string;
  url: string | null;
  status: string | null;
  signedAt: string | null;
  totalAmount: number;
};

const jobBucketOrder = [
  "new",
  "follow_up",
  "scheduled",
  "quoted",
  "sold",
  "ordered",
  "installed",
  "invoiced",
  "closed",
  "lost",
];

export function mobileJobBucketLabel(status: string) {
  const labels: Record<string, string> = {
    new: "New",
    follow_up: "Follow Up",
    scheduled: "Scheduled",
    quoted: "Quoted",
    sold: "Sold",
    ordered: "Ordered",
    installed: "Installed",
    invoiced: "Invoiced",
    closed: "Closed",
    lost: "Lost",
  };
  return labels[status] || status.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function buildMobileJobBuckets(jobs: CrmJob[]): MobileJobBucket[] {
  const grouped = new Map<string, CrmJob[]>();
  for (const job of jobs) {
    const bucket = grouped.get(job.status) || [];
    bucket.push(job);
    grouped.set(job.status, bucket);
  }
  return [...grouped.entries()]
    .sort(([left], [right]) => {
      const leftIndex = jobBucketOrder.indexOf(left);
      const rightIndex = jobBucketOrder.indexOf(right);
      return (leftIndex < 0 ? 999 : leftIndex) - (rightIndex < 0 ? 999 : rightIndex) || left.localeCompare(right);
    })
    .map(([id, bucketJobs]) => ({
      id,
      label: mobileJobBucketLabel(id),
      jobs: [...bucketJobs].sort((left, right) => left.customer_name.localeCompare(right.customer_name)),
    }));
}

export function buildMobileContractItems(files: CrmCustomerFile[]): MobileContractItem[] {
  const seen = new Set<string>();
  const items: MobileContractItem[] = [];
  for (const file of files) {
    for (const contract of file.contracts) {
      if (seen.has(contract.id)) continue;
      seen.add(contract.id);
      items.push({
        id: contract.id,
        customerName: file.customerName,
        title: contract.title || "Customer contract",
        url: contract.contract_url || (contract.share_token ? `/quote/${contract.share_token}` : null),
        status: contract.status,
        signedAt: contract.signed_at,
        totalAmount: Number(contract.total_amount) || 0,
      });
    }
  }
  return items.sort((left, right) =>
    left.customerName.localeCompare(right.customerName, undefined, { sensitivity: "base" }) ||
    left.title.localeCompare(right.title, undefined, { sensitivity: "base" })
  );
}

export function filterMobileContracts(items: MobileContractItem[], query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return items;
  return items.filter((item) => item.customerName.toLowerCase().includes(normalized));
}
