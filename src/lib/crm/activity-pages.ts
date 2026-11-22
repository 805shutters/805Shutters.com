import type { SupabaseClient } from "@supabase/supabase-js";
import { collectCrmPages } from "./pagination";

export type ActivityCursor = { at: string; id: string };
export type ActivityPage = { events: ActivityCursor | null; businessEvents: ActivityCursor | null };
export type ActivityReadOptions = { page?: ActivityPage; after?: string; report?: boolean; raw?: boolean };
const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|\+00:00)$/;
export function parseActivityOptions(params: URLSearchParams): ActivityReadOptions {
  const after = params.get("after") || undefined;
  if (after && (!iso.test(after) || !Number.isFinite(Date.parse(after)))) throw new Error("Invalid activity timestamp.");
  const encoded = params.get("page");
  let page: ActivityPage | undefined;
  if (encoded) {
    if (encoded.length > 600) throw new Error("Invalid activity page.");
    page = JSON.parse(encoded);
    if (!page || typeof page !== "object") throw new Error("Invalid activity page.");
    for (const key of ["events", "businessEvents"] as const) {
      const cursor = page[key];
      if (cursor !== null && (!cursor || !iso.test(cursor.at) || !Number.isFinite(Date.parse(cursor.at)) || !/^[0-9a-f-]{36}$/i.test(cursor.id))) throw new Error("Invalid activity cursor.");
    }
  }
  if (after && page) throw new Error("Choose a refresh or a history page.");
  return { after, page, report: params.get("scope") === "report", raw: params.get("raw") === "1" };
}

export async function readActivityRows(db: SupabaseClient, table: string, timestamp: string, columns: string,
  options: ActivityReadOptions, cursor: ActivityCursor | null | undefined) {
  if (options.page && cursor === null) return { data: [], error: null, next: null };
  const query = () => {
    let q = db.from(table).select(columns).order(timestamp, { ascending: false }).order("id", { ascending: false });
    if (options.report) q = q.eq("action", "fulfillment_line");
    else if (!options.raw && table === "crm_activity_events") q = q.neq("entity_type", "system");
    // Business events can describe an earlier occurrence; refresh by insertion
    // time so newly recorded, backdated events are not missed.
    if (options.after) q = q.gte(table === "crm_business_events" ? "created_at" : timestamp, options.after);
    if (cursor) q = q.or(`${timestamp}.lt.${cursor.at},and(${timestamp}.eq.${cursor.at},id.lt.${cursor.id})`);
    return q;
  };
  if (options.after || options.report) {
    const result = await collectCrmPages<Record<string, unknown>>(async (from, to) => { const result = await query().range(from, to); return { data: result.data as unknown as Record<string, unknown>[] | null, error: result.error }; });
    return { ...result, next: null };
  }
  const result = await query().limit(201);
  const data = (result.data || []).slice(0, 200) as unknown as Record<string, unknown>[];
  const last = data.at(-1);
  return { data, error: result.error, next: (result.data?.length || 0) > 200 && last ? { at: String(last[timestamp]), id: String(last.id) } : null };
}

export function mergeActivityEvents<T extends { id: string }>(previous: T[], incoming: T[]): T[] {
  return [...new Map([...previous, ...incoming].map(event => [event.id, event])).values()];
}
