import type { CrmJob, CrmQuote } from "./types";

export type MobileQuoteJob = Pick<
  CrmJob,
  "id" | "customer_name" | "address" | "city" | "meta"
>;
export type MobileQuoteRow = Pick<
  CrmQuote,
  | "id"
  | "job_id"
  | "quote_number"
  | "quote_label"
  | "status"
  | "created_at"
  | "signed_at"
  | "customer_printed_name"
  | "customer_email"
  | "customer_phone"
  | "customer_address"
  | "meta"
>;
export type MobileQuoteSummary = {
  id: string;
  number: string | null;
  label: string | null;
  status: string;
  createdAt: string;
  signedAt: string | null;
  signedBy: string | null;
};
export type MobileQuoteCustomer = {
  id: string;
  name: string;
  address: string | null;
  contracts: MobileQuoteSummary[];
};
export type MobileQuoteSearch = {
  results: MobileQuoteCustomer[];
  nextOffset: number | null;
};
export type MobileQuoteRelationship = {
  job_id: string | null;
  quote_id: string | null;
  customer_id: string | null;
  meta?: Record<string, unknown> | null;
};
const normalized = (value: string) =>
  value
    .trim()
    .toLocaleLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

export function mobileQuoteStatus(status: string, signedAt?: string | null) {
  const labels: Record<string, string> = {
    draft: "Draft",
    sent: "Sent",
    sold: "Sold",
    approved: "Approved",
    ordered: "Ordered",
    received: "Received",
    installed: "Installed",
    invoiced: "Invoiced",
    paid: "Paid",
    archived: "Archived",
    lost: "Lost",
  };
  const label = labels[status] || status || "Unsigned";
  return signedAt ? `${label} · Signed` : label;
}

/** Never merge by name or phone: same-name people must remain separate. */
export function searchMobileQuotes(
  jobs: MobileQuoteJob[],
  quotes: MobileQuoteRow[],
  relationships: MobileQuoteRelationship[],
  query: string,
  letter: string,
  offset = 0,
  pageSize = 30,
): MobileQuoteSearch {
  const byJob = new Map(jobs.map((job) => [job.id, job]));
  const customerIds = new Map<string, Set<string>>();
  for (const link of relationships) {
    if (!link.customer_id || link.meta?.deleted_at) continue;
    for (const key of [
      link.job_id && `job:${link.job_id}`,
      link.quote_id && `quote:${link.quote_id}`,
    ]) {
      if (!key) continue;
      const ids = customerIds.get(key) || new Set<string>();
      ids.add(link.customer_id);
      customerIds.set(key, ids);
    }
  }
  const groups = new Map<string, MobileQuoteCustomer>();
  for (const quote of quotes) {
    const job = byJob.get(quote.job_id);
    if (!job || job.meta?.deleted_at || quote.meta?.deleted_at) continue;
    const ids = new Set([
      ...(customerIds.get(`job:${job.id}`) || []),
      ...(customerIds.get(`quote:${quote.id}`) || []),
    ]);
    const id = ids.size === 1 ? `customer:${[...ids][0]}` : `job:${job.id}`;
    const address =
      [job.address, job.city].filter(Boolean).join(", ") ||
      quote.customer_address ||
      null;
    const group = groups.get(id) || {
      id,
      name: job.customer_name || "Customer",
      address,
      contracts: [],
    };
    group.contracts.push({
      id: quote.id,
      number: quote.quote_number,
      label: quote.quote_label,
      status: quote.status,
      createdAt: quote.created_at,
      signedAt: quote.signed_at,
      signedBy: quote.customer_printed_name,
    });
    groups.set(id, group);
  }
  const q = normalized(query),
    initial = normalized(letter);
  const results = [...groups.values()]
    .filter((group) => {
      const name = normalized(group.name),
        parts = name.split(/\s+/);
      return (
        (!q || name.includes(q)) &&
        (!initial ||
          parts[0]?.startsWith(initial) ||
          parts.at(-1)?.startsWith(initial))
      );
    })
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  for (const group of results)
    group.contracts.sort(
      (a, b) =>
        b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id),
    );
  return {
    results: results.slice(offset, offset + pageSize),
    nextOffset: offset + pageSize < results.length ? offset + pageSize : null,
  };
}

export type MobileSendResult = {
  email?: { sent?: boolean; skipped?: string; error?: string };
  sms?: { sent?: boolean; skipped?: string; error?: string };
};
export function mobileSendOutcome(
  result: MobileSendResult,
  channel: "email" | "sms" | "both",
) {
  return (["sms", "email"] as const)
    .filter((key) => channel === "both" || channel === key)
    .map((key) => {
      const item = result[key],
        label = key === "sms" ? "Text" : "Email";
      return item?.sent
        ? `${label}: accepted for sending. Delivery is not yet confirmed.`
        : `${label}: ${item?.error || item?.skipped || "sending was not confirmed. Review before retrying."}`;
    });
}
