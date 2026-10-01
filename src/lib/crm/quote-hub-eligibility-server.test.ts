import { describe, expect, it, vi } from "vitest";
import { loadFollowUpEligibleQuoteIds } from "./quote-hub-eligibility-server";
import type { SupabaseClient } from "@supabase/supabase-js";
function database(failingTable?: string) {
  const reads: {table: string; from:number}[] = [];
  const rows: Record<string, unknown[]> = {
    crm_quotes: [{id:"sent",job_id:"job",status:"sent"},{id:"safe",status:"sent"}],
    // The sale is on page 2, past a deliberately capped server page.
    crm_jobs: [{id:"other",status:"new"},{id:"job",status:"sold"}],
  };
  const db = { from: vi.fn((table: string) => {
    const query = {
      select: vi.fn(() => query), eq: vi.fn(() => query), order: vi.fn(() => query),
      range: vi.fn(async (from: number) => {
        reads.push({table,from});
        return table === failingTable ? {data:null,error:{message:"unavailable"}} : {data:(rows[table]||[]).slice(from,from+1),error:null};
      }),
    };
    return query;
  }) };
  return { db: db as unknown as SupabaseClient, reads, from: db.from };
}
describe("server follow-up sale checks", () => {
  it("reads every page and scopes sales quotes to 805 before allowing follow-ups", async () => {
    const {db,reads,from} = database();
    expect(await loadFollowUpEligibleQuoteIds(db)).toEqual(["safe"]);
    expect(reads).toContainEqual({table:"crm_jobs",from:1});
    const sales = from.mock.results.find((_,i) => from.mock.calls[i][0] === "sales_quotes")!.value;
    expect(sales.eq).toHaveBeenCalledWith("account_id","72ccf12a-11c0-4261-8ad0-31af8ad0bbfb");
  });
  it("loads quote names through jobs rather than selecting a nonexistent quote column", async () => {
    const {db,from} = database();
    await loadFollowUpEligibleQuoteIds(db);
    const quotes = from.mock.results.find((_,i) => from.mock.calls[i][0] === "crm_quotes")!.value;
    expect(quotes.select.mock.calls[0][0].split(",")).not.toContain("customer_name");
  });
  it.each(["crm_jobs","crm_quotes","sales_quotes","crm_customer_contracts","crm_customer_products","crm_customers","crm_quote_bookkeeping_entries"])(
    "fails closed when %s cannot be checked", async table => {
      await expect(loadFollowUpEligibleQuoteIds(database(table).db)).rejects.toMatchObject({status:502});
    },
  );
});
