/** Follow-up eligibility uses persisted links and corroborated contact identity, never names alone. */
export type FollowUpRecord = {
  id: string;
  customer_name?: string | null;
  display_name?: string | null;
  customer_email?: string | null;
  email?: string | null;
  customer_phone?: string | null;
  phone?: string | null;
  customer_address?: string | null;
  address?: string | null;
  job_id?: string | null;
  created_job_id?: string | null;
  quote_id?: string | null;
  customer_id?: string | null;
  bookkeeping_entry_id?: string | null;
  quote_group_id?: string | null;
  status?: string | null;
  latest_status?: string | null;
  signed_at?: string | null;
  sold_at?: string | null;
  approved_at?: string | null;
  ordered_at?: string | null;
  received_at?: string | null;
  installed_at?: string | null;
  customer_signature?: string | null;
  first_sold_date?: string | null;
  latest_sold_date?: string | null;
  sold_date?: string | null;
  archived_at?: string | null;
  deleted_at?: string | null;
  external_id?: string | null;
  meta?: Record<string, unknown> | null;
};
export type FollowUpData = {
  quotes: FollowUpRecord[];
  salesQuotes: FollowUpRecord[];
  jobs: FollowUpRecord[];
  customers: FollowUpRecord[];
  contracts: FollowUpRecord[];
  products: FollowUpRecord[];
  entries: FollowUpRecord[];
};
const SOLD = new Set(["sold", "approved", "ordered", "received", "shipped", "installed", "invoiced", "paid", "closed", "complete", "completed", "manual", "legacy"]);
const active = (r: FollowUpRecord) => !r.deleted_at && !r.meta?.deleted_at && !r.meta?.bookkeeping_deleted_at;
export function hasFollowUpSale(r: FollowUpRecord): boolean {
  return SOLD.has(String(r.status || r.latest_status || "").toLowerCase()) || Boolean(
    r.signed_at || r.sold_at || r.approved_at || r.customer_signature || r.ordered_at || r.received_at || r.installed_at ||
    r.first_sold_date || r.latest_sold_date || r.sold_date || r.meta?.sold_at,
  );
}
export function followUpEligibleQuoteIds(data: FollowUpData): string[] {
  const parent = new Map<string, string>();
  const root = (key: string): string => {
    if (!parent.has(key)) parent.set(key, key);
    let current = key;
    while (parent.get(current) !== current) current = parent.get(current)!;
    while (key !== current) { const next = parent.get(key)!; parent.set(key, current); key = next; }
    return current;
  };
  const saleNodes: string[] = [];
  const add = (r: FollowUpRecord, kind: string) => {
    if (!active(r)) return;
    const anchors = [`${kind}:${r.id}`,
      r.job_id && `job:${r.job_id}`, r.customer_id && `customer:${r.customer_id}`,
      r.quote_id && `quote:${r.quote_id}`, r.bookkeeping_entry_id && `entry:${r.bookkeeping_entry_id}`,
      r.quote_group_id && `group:${r.quote_group_id}`,
    ].filter((key): key is string => Boolean(key));
    // Historical sends lack customer_id links. Require the full name plus an
    // exact email, or full name + address + phone, to suppress those options.
    const normalized = (value?: string | null) => (value || "").trim().toLowerCase().replace(/\s+/g, " ");
    const name = normalized(r.customer_name || r.display_name);
    const email = normalized(r.customer_email || r.email);
    const address = normalized(r.customer_address || r.address).replace(/[,]/g, "");
    const digits = (r.customer_phone || r.phone || "").replace(/\D/g, "");
    const phone = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
    if (name && email) anchors.push(`contact-email:${JSON.stringify([name, email])}`);
    if (name && address && phone.length === 10) anchors.push(`contact-home:${JSON.stringify([name, address, phone])}`);
    if (kind === "quote" || kind === "job") {
      for (const source of [r.meta?.source_sales_quote_id, r.meta?.target_sales_quote_id, r.meta?.mts_quote_id, r.meta?.sales_quote_id,
        r.external_id?.startsWith("quote:") ? r.external_id.slice(6) : null]) {
        if (typeof source === "string" && source) anchors.push(`quote:${source}`);
      }
      if (r.created_job_id && data.jobs.some(job => job.id === r.created_job_id)) anchors.push(`job:${r.created_job_id}`);
    }
    const first = anchors[0];
    for (const key of anchors) parent.set(root(key), root(first));
    if (hasFollowUpSale(r)) saleNodes.push(first);
  };
  for (const r of [...data.quotes, ...data.salesQuotes]) add(r, "quote");
  for (const [kind, rows] of [["job", data.jobs], ["customer", data.customers], ["contract", data.contracts], ["product", data.products], ["entry", data.entries]] as const)
    for (const r of rows) add(r, kind);
  const sold = new Set(saleNodes.map(root));
  return [...data.quotes, ...data.salesQuotes].filter(r => active(r) && r.status === "sent" &&
    !r.archived_at && !hasFollowUpSale(r) && !sold.has(root(`quote:${r.id}`))).map(r => r.id);
}
