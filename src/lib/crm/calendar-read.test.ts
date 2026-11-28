import { expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
vi.mock("./backend", () => ({ enrichCalendarEventsWithJobDetails: (events: unknown[], jobs: unknown[], quotes: unknown[], contracts: unknown[], sent?: { size?: number } | null) => events.map(event => ({...(event as object), evidence:[jobs.length,quotes.length,contracts.length, sent && "size" in sent ? sent.size : -1]})) }));
import { loadCalendarSnapshot } from "./calendar-read";
it("uses only calendar and identity/signature sources and returns linked jobs", async () => {
  const tables: string[] = []; const filters: unknown[] = [];
  const records: Record<string, Record<string, unknown>[]> = {
    crm_calendar_events:[{id:"event",job_id:"linked"}],
    crm_jobs:[{id:"linked"},{id:"related"},{id:"deleted",meta:{deleted_at:"today"}}],
    crm_quotes:[{id:"quote"}],crm_customer_contracts:[{id:"contract"}],
    sales_quote_v2_delivery_attempts:[],sales_quote_v2_deliveries:[]
  };
  const db = { from(table:string) {
    tables.push(table);
    return {select(){return this;},eq(){return this;},order(){return this;},lt(...args:unknown[]){filters.push(args);return this;},gt(...args:unknown[]){filters.push(args);return this;},
      range(from:number,to:number){return Promise.resolve({data:(records[table]||[]).slice(from,to+1),error:null});}};
  } } as unknown as SupabaseClient;
  const result = await loadCalendarSnapshot(db,"start","end");
  expect(new Set(tables)).toEqual(new Set(Object.keys(records)));
  expect(filters).toContainEqual(["start_at","end"]); expect(filters).toContainEqual(["end_at","start"]);
  expect(result.jobs.map(job=>job.id)).toEqual(["linked"]);
  expect(result.events[0]).toMatchObject({evidence:[2,1,1,0]});
});
