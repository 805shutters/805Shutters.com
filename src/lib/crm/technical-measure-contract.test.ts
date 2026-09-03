import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadTechnicalMeasureForm } from "./technical-measures";

function database(shareToken: string | null, contractUrl: string | null = null) {
  const filters: Array<[string, string, unknown]> = [];
  const records: Record<string, unknown> = {
    crm_technical_measure_forms: { id: "measure-1", quote_id: "quote-1", contract_id: "contract-1" },
    crm_technical_measure_lines: [],
    crm_technical_measure_addendums: null,
    crm_quotes: { share_token: shareToken },
    crm_customer_contracts: { contract_url: contractUrl },
  };
  const client = { from(table: string) {
    const result = { data: records[table], error: null };
    const query = {
      select() { return query; },
      eq(key: string, value: unknown) { filters.push([table, key, value]); return query; },
      neq() { return query; }, order() { return query; }, limit() { return query; },
      maybeSingle() { return Promise.resolve(result); },
      then(resolve: (value: typeof result) => unknown) { return Promise.resolve(result).then(resolve); },
    };
    return query;
  } } as unknown as SupabaseClient;
  return { client, filters };
}

describe("technical measure original contract reference", () => {
  it("loads the real customer contract from the measure's own quote", async () => {
    const db = database("signed-contract-token");
    const form = await loadTechnicalMeasureForm(db.client, "measure-1");
    expect(form.contractUrl).toBe("/quote/signed-contract-token/");
    expect(db.filters).toContainEqual(["crm_quotes", "id", "quote-1"]);
  });

  it("uses a stored document only when it belongs to this contract and quote", async () => {
    const db = database(null, "https://www.805shutters.com/contracts/original.pdf");
    const form = await loadTechnicalMeasureForm(db.client, "measure-1");
    expect(form.contractUrl).toBe("https://www.805shutters.com/contracts/original.pdf");
    expect(db.filters).toContainEqual(["crm_customer_contracts", "id", "contract-1"]);
    expect(db.filters).toContainEqual(["crm_customer_contracts", "quote_id", "quote-1"]);
  });

  it.each([null, "javascript:alert(1)", "/crm/technical-measures/measure-1"])(
    "leaves unavailable or invalid document links unavailable: %s", async (url) => {
      const { client } = database(null, url);
      expect((await loadTechnicalMeasureForm(client, "measure-1")).contractUrl).toBeNull();
    },
  );
});
