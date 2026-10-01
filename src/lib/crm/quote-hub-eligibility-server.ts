import type { SupabaseClient } from "@supabase/supabase-js";
import { CrmAuthError } from "./auth";
import { loadCompleteCrmTable } from "./pagination";
import { followUpEligibleQuoteIds, type FollowUpData, type FollowUpRecord } from "./quote-hub-eligibility";

/** Read complete histories so a sold record outside the current page still blocks its alternatives. */
export async function loadFollowUpEligibleQuoteIds(db: SupabaseClient): Promise<string[]> {
  const definitions = [
    ["quotes", "crm_quotes", "id,customer_name,customer_email,customer_phone,customer_address,job_id,status,quote_group_id,signed_at,sold_at,approved_at,customer_signature,ordered_at,received_at,installed_at,archived_at,external_id,meta"],
    ["salesQuotes", "sales_quotes", "id,customer_name,customer_email,customer_phone,customer_address,status,quote_group_id,created_job_id,signed_at,customer_signature,ordered_at,received_at,installed_at,archived_at,deleted_at"],
    ["jobs", "crm_jobs", "id,customer_name,email,phone,address,status,meta"],
    ["customers", "crm_customers", "id,display_name,email,phone,address,latest_status,first_sold_date,latest_sold_date,meta"],
    ["contracts", "crm_customer_contracts", "id,customer_id,job_id,quote_id,bookkeeping_entry_id,status,signed_at,meta"],
    ["products", "crm_customer_products", "id,customer_id,job_id,quote_id,bookkeeping_entry_id,status,meta"],
    ["entries", "crm_quote_bookkeeping_entries", "id,job_id,quote_id,sold_date,meta"],
  ] as const;
  const results = await Promise.all(definitions.map(async ([key, table, columns]) => {
    const result = await loadCompleteCrmTable(db, table, "id", columns, "id", table === "sales_quotes"
      ? [{ column: "account_id", value: "72ccf12a-11c0-4261-8ad0-31af8ad0bbfb" }] : []);
    if (result.error) throw new CrmAuthError(502, "Sold-customer checks could not be completed. Please retry before following up.");
    return [key, result.data as FollowUpRecord[]] as const;
  }));
  return followUpEligibleQuoteIds(Object.fromEntries(results) as FollowUpData);
}
