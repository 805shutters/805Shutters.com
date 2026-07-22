import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/20260722191000_add_quote_v2_authoritative_pricing_rpc.sql",
);
const sql = readFileSync(migrationPath, "utf8");

describe("Quote V2 authoritative pricing persistence RPC", () => {
  it("is service-only and does not expose a browser execution grant", () => {
    expect(sql).toContain(
      "if auth.role() is distinct from 'service_role' then",
    );
    expect(sql).toMatch(
      /revoke all on function public\.save_quote_v2_pricing_result\([\s\S]*\) from public, anon, authenticated;/i,
    );
    expect(sql).toMatch(
      /grant execute on function public\.save_quote_v2_pricing_result\([\s\S]*\) to service_role;/i,
    );
    expect(sql).not.toMatch(/grant execute[\s\S]*to authenticated/i);
  });

  it("locks the parent quote and rejects stale or non-draft mutations", () => {
    expect(sql).toMatch(
      /from public\.sales_quotes quotes[\s\S]*where quotes\.id = p_quote_id[\s\S]*for update;/i,
    );
    expect(sql).toContain(
      "if v_quote.quote_v2_revision <> p_expected_revision then",
    );
    expect(sql).toContain("using errcode = '40001'");
    expect(sql).toMatch(
      /v_quote\.quote_v2_status = 'sent' or v_quote\.status <> 'draft'/i,
    );
  });

  it("requires canonical engine identity and exact authoritative snapshot identity", () => {
    expect(sql).toMatch(
      /p_selection_fingerprint !~ '\^sha256:\[0-9a-f\]\{64\}\$'/i,
    );
    expect(sql).toContain(
      "p_authoritative_snapshot ->> 'selectionFingerprint'",
    );
    expect(sql).toContain("p_authoritative_snapshot ->> 'catalogVersion'");
    expect(sql).toContain(
      "p_authoritative_snapshot #>> '{retail,catalogVersion}'",
    );
    expect(sql).toContain(
      "p_authoritative_snapshot #>> '{retail,validationStatus}'",
    );
    expect(sql).toContain(
      "p_selection ->> 'catalogVersion' is distinct from p_catalog_version",
    );
    expect(sql).toContain(
      "At least one authoritative source provenance record is required.",
    );
    expect(sql).toMatch(
      /jsonb_typeof\(p_authoritative_snapshot #> '\{retail,unitPrice\}'\)[\s\S]*is distinct from 'number'/i,
    );
    expect(sql).toMatch(
      /jsonb_typeof\(p_internal_cost_snapshot -> 'landedCostTotal'\)[\s\S]*is distinct from 'number'/i,
    );
  });

  it("validates quantity and additive line-total arithmetic before saving", () => {
    expect(sql).toMatch(
      /\{retail,quantity\}[\s\S]*is distinct from v_line\.quantity::numeric/i,
    );
    expect(sql).toMatch(
      /round\(v_retail_total, 2\)[\s\S]*round\(v_unit_price \* v_line\.quantity \+ v_once_total, 2\)/i,
    );
    expect(sql).toContain(
      "The authoritative retail total does not equal unit price times quantity plus once-per-line charges.",
    );
  });

  it("stores protected cost only in the protected immutable snapshot table", () => {
    expect(sql).toContain("internal_cost_snapshot");
    expect(sql).toContain("internal_landed_cost_total");
    expect(sql).toMatch(
      /v_options :=[\s\S]*- 'authoritative_cost_breakdown'/i,
    );
    const optionsWrite = sql.match(
      /v_options := v_options \|\| jsonb_build_object\(\n      'authoritative_price_status'[\s\S]*?\n    \);/i,
    )?.[0];
    expect(optionsWrite).toBeTruthy();
    expect(optionsWrite).not.toContain("internal_cost_snapshot");
    expect(optionsWrite).not.toContain("productCostTotal");
  });

  it("clears stored prices and snapshot pointers for every failed status", () => {
    expect(sql).toContain(
      "p_price_status not in ('authoritative', 'stale', 'blocked', 'unpriceable')",
    );
    expect(sql).toMatch(
      /else[\s\S]*current_v2_snapshot_id = null,[\s\S]*unit_price = 0/i,
    );
    expect(sql).toContain(
      "Non-authoritative pricing results cannot persist retail or cost snapshots.",
    );
  });

  it("totals only selected designs backed by their current immutable snapshots", () => {
    expect(sql).toMatch(
      /left join public\.sales_quote_designs designs[\s\S]*designs\.id = lines\.selected_design_id[\s\S]*designs\.line_item_id = lines\.id/i,
    );
    expect(sql).toMatch(
      /left join public\.sales_quote_v2_price_snapshots snapshots[\s\S]*snapshots\.id = designs\.current_v2_snapshot_id[\s\S]*snapshots\.design_id = designs\.id/i,
    );
    expect(sql).toMatch(
      /when designs\.quote_v2_price_status = 'authoritative'[\s\S]*then snapshots\.retail_total/i,
    );
    expect(sql).toMatch(
      /total_amount = round\(v_quote_total, 2\)/i,
    );
  });

  it("keeps idempotent retries stable and rejects key reuse for different inputs", () => {
    expect(sql).toMatch(
      /where events\.quote_id = p_quote_id[\s\S]*events\.idempotency_key = btrim\(p_idempotency_key\)/i,
    );
    expect(sql).toContain(
      "The Quote V2 idempotency key was already used for a different request.",
    );
    expect(sql).toMatch(
      /return query[\s\S]*v_existing_event\.new_revision/i,
    );
  });

  it("appends one revisioned audit event with the selected design and price identity", () => {
    expect(sql).toContain("insert into public.sales_quote_v2_events");
    for (const key of [
      "lineItemId",
      "designId",
      "snapshotId",
      "selectionFingerprint",
      "catalogVersion",
      "priceStatus",
      "selectedDesign",
      "quoteStatus",
      "quoteTotal",
    ]) {
      expect(sql).toContain(`'${key}'`);
    }
    expect(sql).toMatch(
      /previous_revision,[\s\S]*new_revision,[\s\S]*idempotency_key/i,
    );
  });
});
