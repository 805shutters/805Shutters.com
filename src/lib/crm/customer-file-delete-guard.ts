import type { SupabaseClient } from "@supabase/supabase-js";
import { CrmAuthError } from "./auth";
import { hasCustomerSaleEvidence } from "./customer-file-deletion";
import { objectMeta } from "./measure-needed-state";

type Scope = { customerIds: string[]; jobIds: string[]; quoteIds: string[]; bookkeepingEntryIds: string[]; productIds: string[]; contractIds: string[] };
const ids = (values: unknown[]) => [...new Set(values.filter((value): value is string => typeof value === "string" && Boolean(value)))];

/** Re-read the exact linked records before any tombstone. Never trust a client's sold flag. */
export async function assertCustomerFileDeletable(supabase: SupabaseClient, scope: Scope) {
  async function read(table: string, column: string, values: string[]) {
    if (!values.length) return [];
    const { data, error } = await supabase.from(table).select("*").in(column, values);
    if (error) throw new CrmAuthError(502, "Sale status could not be verified. Customer file was not deleted.");
    const rows = (data || []) as Record<string, unknown>[];
    // Even a previously hidden sale remains protected history.
    if (rows.some(hasCustomerSaleEvidence)) throw new CrmAuthError(409, "Sold customer files cannot be deleted.");
    return rows;
  }

  const linked = (await Promise.all([
    read("crm_customers", "id", scope.customerIds),
    read("crm_customer_contracts", "id", scope.contractIds),
    read("crm_customer_products", "id", scope.productIds),
    read("crm_quote_bookkeeping_entries", "id", scope.bookkeepingEntryIds)
  ])).flat();
  const customerIds = ids([...scope.customerIds, ...linked.map(row => row.customer_id)]);
  const customerLinks = (await Promise.all([
    read("crm_customers", "id", customerIds),
    read("crm_customer_contracts", "customer_id", customerIds),
    read("crm_customer_products", "customer_id", customerIds)
  ])).flat();
  const links = [...linked, ...customerLinks];
  const quotes = await read("crm_quotes", "id", ids([...scope.quoteIds, ...links.map(row => row.quote_id)]));
  const jobIds = ids([...scope.jobIds, ...links.map(row => row.job_id), ...quotes.map(row => row.job_id)]);
  const siblingQuotes = await read("crm_quotes", "job_id", jobIds);
  const allQuotes = [...quotes, ...siblingQuotes];
  const quoteIds = ids(allQuotes.map(row => row.id));
  await Promise.all([
    read("crm_jobs", "id", jobIds),
    read("crm_customer_contracts", "job_id", jobIds),
    read("crm_customer_contracts", "quote_id", quoteIds),
    read("crm_quote_bookkeeping_entries", "job_id", jobIds),
    read("crm_quote_bookkeeping_entries", "quote_id", quoteIds)
  ]);
  // V2 acceptance can precede its CRM projection. Check its exact source ID too.
  const salesQuoteIds = ids(allQuotes.flatMap(quote => {
    const meta = objectMeta(quote.meta);
    return [meta.target_sales_quote_id, meta.sales_quote_id, meta.mts_quote_id,
      typeof quote.external_id === "string" && quote.external_id.startsWith("quote:") ? quote.external_id.slice(6) : null];
  }));
  await read("sales_quotes", "id", salesQuoteIds);
}
