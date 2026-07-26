import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260726132000_add_quote_v2_crm_structure_import.sql",
  ),
  "utf8",
);

describe("production CRM to Quote V2 import migration", () => {
  it("is service-role-only, idempotent, and append-only", () => {
    expect(sql).toContain("create table if not exists public.sales_quote_v2_import_requests");
    expect(sql).toContain("sales_quote_v2_import_requests_append_only");
    expect(sql).toMatch(
      /if auth\.role\(\) is distinct from 'service_role'[\s\S]*CRM Quote V2 import requires the service role/i,
    );
    expect(sql).toMatch(
      /revoke all on function public\.import_crm_quote_to_v2[\s\S]*from public, anon, authenticated/i,
    );
    expect(sql).toMatch(
      /select requests\.\*[\s\S]*where requests\.crm_quote_id = p_crm_quote_id[\s\S]*return v_existing\.result/i,
    );
  });

  it("locks the source revision and copies exact source identities", () => {
    expect(sql).toMatch(
      /where quotes\.id = p_crm_quote_id[\s\S]*for update/i,
    );
    expect(sql).toMatch(
      /v_crm_quote\.updated_at is distinct from p_source_updated_at/i,
    );
    expect(sql).toMatch(
      /v_source_line_count <> v_line_count[\s\S]*v_source_design_count <> v_design_count/i,
    );
    expect(sql).toMatch(
      /v_line_id := \(v_line ->> 'sourceLineItemId'\)::uuid/i,
    );
    expect(sql).toMatch(
      /v_design_id := \(v_design ->> 'sourceDesignId'\)::uuid/i,
    );
  });

  it("creates only a stale internal draft and links the source after the full structure succeeds", () => {
    expect(sql).toMatch(
      /insert into public\.sales_quotes[\s\S]*true,[\s\S]*'stale',[\s\S]*null,[\s\S]*1/i,
    );
    expect(sql).toMatch(
      /insert into public\.sales_quote_designs[\s\S]*0,[\s\S]*nullif\(v_design -> 'patch' ->> 'notes'[\s\S]*'\{\}'::jsonb,[\s\S]*'stale'/i,
    );
    expect(sql).not.toMatch(/insert into public\.sales_quote_v2_price_snapshots/i);
    expect(sql).toMatch(
      /insert into public\.sales_quote_v2_events[\s\S]*'crm_quote_imported'/i,
    );
    expect(sql).toMatch(
      /update public\.crm_quotes[\s\S]*'target_sales_quote_id', v_quote_id/i,
    );
  });

  it("repairs only the exact linked empty target without changing its financial or lifecycle fields", () => {
    expect(sql).toMatch(
      /if p_target_sales_quote_id is not null[\s\S]*where quotes\.id = p_target_sales_quote_id[\s\S]*for update/i,
    );
    expect(sql).toMatch(
      /sales_quote_line_items[\s\S]*sales_quote_v2_events[\s\S]*sales_quote_v2_price_snapshots[\s\S]*authoritative V2 history/i,
    );
    expect(sql).toMatch(
      /v_quote_status := v_target_quote\.status[\s\S]*update public\.sales_quotes/i,
    );
    const reuseUpdate = sql.match(
      /update public\.sales_quotes[\s\S]*?where id = v_quote_id;/i,
    )?.[0];
    expect(reuseUpdate).toBeTruthy();
    expect(reuseUpdate).not.toMatch(
      /\b(status|total_amount|product_cost|profit_amount|manufacturer_cost|deposit_paid|balance_paid)\s*=/i,
    );
    expect(reuseUpdate).toMatch(/quote_v2_status = 'stale'/i);
  });

  it("allows no inferred selection unless every option explicitly requires re-selection", () => {
    expect(sql).toMatch(
      /if v_selected_design_id is null[\s\S]*v2_import_reselection_required[\s\S]*An unselected imported line must explicitly require catalog re-selection/i,
    );
    expect(sql).toMatch(
      /selected_design_id = v_selected_design_id/i,
    );
  });
});
