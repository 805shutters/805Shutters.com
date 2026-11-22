import { describe, expect, it } from "vitest";
import { mergeActivityEvents, parseActivityOptions, readActivityRows } from "./activity-pages";
import type { SupabaseClient } from "@supabase/supabase-js";

describe("activity pagination", () => {
  it("rejects injected cursors and invalid refresh dates", () => {
    for (const after of ["invalid", "2026-99-99T00:00:00Z", "now(),id.gt.0"]) expect(() => parseActivityOptions(new URLSearchParams({ after }))).toThrow();
    expect(() => parseActivityOptions(new URLSearchParams({ page: JSON.stringify({events:{at:"2026-11-22T00:00:00Z",id:"x),id.gt.0"},businessEvents:null}) }))).toThrow();
  });
  it("preserves tie-breaking IDs and retains prior history during refresh", () => {
    const page = { events: { at: "2026-11-22T00:00:00Z", id: "00000000-0000-0000-0000-000000000001" }, businessEvents: null };
    expect(parseActivityOptions(new URLSearchParams({page:JSON.stringify(page)})).page).toEqual(page);
    expect(mergeActivityEvents([{id:"old",value:1},{id:"same",value:1}], [{id:"same",value:2},{id:"new",value:3}])).toEqual([{id:"old",value:1},{id:"same",value:2},{id:"new",value:3}]);
  });
  it("bounds the initial page and exposes a cursor without dropping the next record", async () => {
    const rows = Array.from({ length: 201 }, (_, i) => ({ id: String(i), created_at: "2026-11-22T00:00:00Z" }));
    const calls: unknown[] = [];
    const query = { select(){return this;},order(){return this;},neq(){return this;},limit(value:number){calls.push(value);return Promise.resolve({data:rows,error:null});} };
    const result = await readActivityRows({from:()=>query} as unknown as SupabaseClient,"crm_activity_events","created_at","*",{},undefined);
    expect(calls).toEqual([201]); expect(result.data).toHaveLength(200); expect(result.next).toEqual({id:"199",at:"2026-11-22T00:00:00Z"});
  });
});
