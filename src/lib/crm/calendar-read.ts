import type { SupabaseClient } from "@supabase/supabase-js";
import { enrichCalendarEventsWithJobDetails } from "./backend";
import { collectCrmPages, loadCompleteCrmTable } from "./pagination";
import { loadSentDeliveryQuoteIds } from "./sent-quote-deliveries";
import type { CrmCalendarEvent, CrmJob, CrmQuote, CrmCustomerContract } from "./types";

export async function loadCalendarSnapshot(db: SupabaseClient, startAt: string, endAt: string) {
  // Keep identity/signature evidence for related customer jobs, without loading
  // any quote designs, signed snapshots, payment ledgers or activity history.
  const [events, jobs, quotes, contracts, sentDeliveryQuoteIds] = await Promise.all([
    collectCrmPages<CrmCalendarEvent>(async (from, to) => db.from("crm_calendar_events").select("*")
      .lt("start_at", endAt).gt("end_at", startAt).order("start_at").order("id").range(from, to)),
    loadCompleteCrmTable(db, "crm_jobs", "created_at", "id,created_at,customer_name,phone,email,address,city,product_interest,status,notes,lead_source,meta", "id", []),
    loadCompleteCrmTable(db, "crm_quotes", "created_at", "id,created_at,job_id,status,sent_at,signed_at,deleted_at:meta->deleted_at,bookkeeping_deleted_at:meta->bookkeeping_deleted_at"),
    loadCompleteCrmTable(db, "crm_customer_contracts", "created_at", "id,created_at,job_id,quote_id,signed_at,meta->deleted_at"),
    loadSentDeliveryQuoteIds(db).then((ids) => ({ data: ids, error: null })).catch((error: unknown) => ({
      data: null,
      error: { message: error instanceof Error ? error.message : "Quote delivery evidence could not be loaded." }
    }))
  ]);
  if ([events, jobs, quotes, contracts, sentDeliveryQuoteIds].some(result => result.error)) throw new Error("Calendar could not be loaded. Please retry.");
  const visible = <T extends Record<string, unknown>>(rows: T[] | null) => (rows || []).filter(row => !row.deleted_at && !(row.meta as Record<string, unknown> | undefined)?.deleted_at);
  const calendarJobs = visible(jobs.data) as unknown as CrmJob[];
  const calendarQuotes = (quotes.data || []).map((row) => {
    const meta: Record<string, unknown> = {};
    if (row.deleted_at) meta.deleted_at = row.deleted_at;
    if (row.bookkeeping_deleted_at) meta.bookkeeping_deleted_at = row.bookkeeping_deleted_at;
    return { ...row, meta };
  });
  const enriched = enrichCalendarEventsWithJobDetails(events.data || [], calendarJobs,
    visible(calendarQuotes) as unknown as CrmQuote[], visible(contracts.data) as unknown as CrmCustomerContract[],
    sentDeliveryQuoteIds.data || new Set());
  const ids = new Set(enriched.map(event => event.job_id));
  return { events: enriched, jobs: calendarJobs.filter(job => ids.has(job.id)) };
}
