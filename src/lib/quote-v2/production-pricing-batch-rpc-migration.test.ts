import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/20260722192000_add_quote_v2_authoritative_pricing_batch_rpc.sql",
);
const sql = readFileSync(migrationPath, "utf8");

describe("Quote V2 quote-wide authoritative pricing RPC", () => {
  it("is service-role only and requires an audited actor", () => {
    expect(sql).toContain(
      "if auth.role() is distinct from 'service_role' then",
    );
    expect(sql).toMatch(/p_quote_id is null or p_actor_id is null/i);
    expect(sql).toMatch(
      /revoke all on function public\.save_quote_v2_pricing_batch\([\s\S]*\) from public, anon, authenticated;/i,
    );
    expect(sql).toMatch(
      /grant execute on function public\.save_quote_v2_pricing_batch\([\s\S]*\) to service_role;/i,
    );
    expect(sql).not.toMatch(/grant execute[\s\S]*to authenticated/i);
  });

  it("locks one authoritative draft and enforces optimistic concurrency", () => {
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

  it("requires exactly one unique server result for every one to forty quote lines", () => {
    expect(sql).toMatch(/jsonb_typeof\(p_results\) is distinct from 'array'/i);
    expect(sql).toMatch(
      /jsonb_array_length\(p_results\) < 1[\s\S]*jsonb_array_length\(p_results\) > 40/i,
    );
    expect(sql).toMatch(/v_total_lines < 1 or v_total_lines > 40/i);
    expect(sql).toMatch(
      /jsonb_array_length\(p_results\) <> v_total_lines/i,
    );
    expect(sql).toMatch(/v_line_id = any\(v_seen_line_ids\)/i);
    expect(sql).toMatch(/cardinality\(v_seen_line_ids\) <> v_total_lines/i);
  });

  it("requires explicit server selection intent and never auto-selects fallback A", () => {
    expect(sql).toMatch(
      /jsonb_typeof\(v_result -> 'selectDesign'\) is distinct from 'boolean'/i,
    );
    expect(sql).toMatch(
      /if not v_select_design then[\s\S]*v_line\.selected_design_id is not null[\s\S]*v_price_status = 'authoritative'/i,
    );
    expect(sql).toMatch(
      /if v_select_design then[\s\S]*update public\.sales_quote_line_items[\s\S]*set selected_design_id = v_design_id/i,
    );
  });

  it("invalidates a formerly selected alternative without deleting its history", () => {
    expect(sql).toMatch(
      /v_line\.selected_design_id <> v_design_id[\s\S]*quote_v2_price_status = 'stale'[\s\S]*current_v2_snapshot_id = null[\s\S]*unit_price = 0/i,
    );
    expect(sql).not.toMatch(/delete\s+from\s+public\.sales_quote_v2_price_snapshots/i);
  });

  it("requires exact engine identity and nonempty source provenance", () => {
    expect(sql).toMatch(
      /v_selection_fingerprint !~ '\^sha256:\[0-9a-f\]\{64\}\$'/i,
    );
    expect(sql).toContain(
      "v_authoritative_snapshot ->> 'selectionFingerprint'",
    );
    expect(sql).toContain("v_authoritative_snapshot ->> 'catalogVersion'");
    expect(sql).toContain(
      "v_authoritative_snapshot #>> '{retail,catalogVersion}'",
    );
    expect(sql).toMatch(
      /v_provenance_snapshot is null[\s\S]*v_provenance_snapshot in \('\[\]'::jsonb, '\{\}'::jsonb\)/i,
    );
  });

  it("validates customer line arithmetic from authoritative snapshots", () => {
    expect(sql).toMatch(
      /\{retail,quantity\}[\s\S]*is distinct from v_line\.quantity::numeric/i,
    );
    expect(sql).toMatch(
      /round\(v_retail_total, 2\)[\s\S]*round\(v_unit_price \* v_line\.quantity \+ v_once_total, 2\)/i,
    );
  });

  it("validates protected landed-cost arithmetic for every line", () => {
    for (const field of [
      "productCostTotal",
      "freightAllocated",
      "oversizeAllocated",
      "processingFeeAllocated",
      "landedCostTotal",
    ]) {
      expect(sql).toContain(`v_internal_cost_snapshot -> '${field}'`);
    }
    expect(sql).toMatch(
      /round\(v_internal_total, 2\) is distinct from round\([\s\S]*productCostTotal[\s\S]*freightAllocated[\s\S]*oversizeAllocated[\s\S]*processingFeeAllocated/i,
    );
    expect(sql).toContain(
      "Landed cost must equal product cost plus allocated freight, oversize, and processing charges.",
    );
  });

  it("stores protected costs only in immutable staff-side snapshots", () => {
    expect(sql).toContain("internal_cost_snapshot");
    expect(sql).toContain("internal_landed_cost_total");
    expect(sql).toMatch(
      /v_options :=[\s\S]*- 'authoritative_cost_breakdown'/i,
    );
    const optionsWrite = sql.match(
      /v_options := v_options \|\| jsonb_build_object\(\n        'authoritative_price_status', 'authoritative'[\s\S]*?\n      \);/i,
    )?.[0];
    expect(optionsWrite).toBeTruthy();
    expect(optionsWrite).not.toContain("internalCostSnapshot");
    expect(optionsWrite).not.toContain("landedCostTotal");
  });

  it("uses one revision for the complete quote batch and totals selected snapshots only", () => {
    expect(sql).toMatch(
      /insert into public\.sales_quote_v2_price_snapshots[\s\S]*v_new_revision/i,
    );
    expect(sql).toMatch(
      /left join public\.sales_quote_designs designs[\s\S]*designs\.id = lines\.selected_design_id[\s\S]*designs\.line_item_id = lines\.id/i,
    );
    expect(sql).toMatch(
      /left join public\.sales_quote_v2_price_snapshots snapshots[\s\S]*snapshots\.id = designs\.current_v2_snapshot_id[\s\S]*snapshots\.design_id = designs\.id/i,
    );
    expect(sql).toMatch(
      /then snapshots\.retail_total[\s\S]*then snapshots\.internal_landed_cost_total/i,
    );
    expect(sql).toMatch(/total_amount = round\(v_quote_total, 2\)/i);
  });

  it("keeps retries idempotent and appends one quote-wide audit event", () => {
    expect(sql).toMatch(
      /v_batch_hash := encode\([\s\S]*digest\([\s\S]*'sha256'/i,
    );
    expect(sql).toMatch(
      /where events\.quote_id = p_quote_id[\s\S]*events\.idempotency_key = btrim\(p_idempotency_key\)/i,
    );
    expect(sql).toMatch(
      /event_type <> 'pricing_batch'[\s\S]*'batchHash'[\s\S]*is distinct from v_batch_hash/i,
    );
    expect(sql).toMatch(
      /insert into public\.sales_quote_v2_events[\s\S]*'pricing_batch'/i,
    );
    expect(sql.match(/insert into public\.sales_quote_v2_events/gi)).toHaveLength(1);
  });

  it("distinguishes stale lifecycle state from hard-blocked results", () => {
    expect(sql).toMatch(
      /if v_price_status = 'stale' then[\s\S]*v_stale_design_count := v_stale_design_count \+ 1[\s\S]*v_blocked_design_count := v_blocked_design_count \+ 1/i,
    );
    expect(sql).toMatch(
      /when v_blocked_design_count > 0[\s\S]*then 'blocked'[\s\S]*when v_stale_design_count > 0[\s\S]*then 'stale'/i,
    );
  });
});
