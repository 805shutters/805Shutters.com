import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/20260722200000_add_quote_v2_legacy_reprice_workflow.sql",
);
const sql = readFileSync(migrationPath, "utf8");

describe("Quote V2 explicit legacy-draft repricing migration", () => {
  it("is additive and performs no migration-time quote conversion or repricing", () => {
    const beforeFunctions = sql.split(
      "create or replace function public.quote_v2_legacy_state_hash",
    )[0];
    expect(beforeFunctions).not.toMatch(/\bdrop\s+table\b/i);
    expect(beforeFunctions).not.toMatch(/\btruncate\b/i);
    expect(beforeFunctions).not.toMatch(/\bdelete\s+from\b/i);
    expect(beforeFunctions).not.toMatch(/\bupdate\s+public\.sales_quotes\b/i);
    expect(sql).toContain(
      "This migration is additive and does not convert or reprice any existing row.",
    );
  });

  it("records append-only previews and conversion audits without protected costs", () => {
    expect(sql).toContain(
      "create table if not exists public.sales_quote_v2_legacy_reprice_previews",
    );
    expect(sql).toContain(
      "create table if not exists public.sales_quote_v2_legacy_reprice_audits",
    );
    expect(sql.match(/execute function public\.reject_v2_audit_mutation\(\)/g)).toHaveLength(2);
    const tableDefinitions = sql.split(
      "create or replace function public.quote_v2_legacy_state_hash",
    )[0];
    expect(tableDefinitions).not.toMatch(
      /internal_cost_snapshot|landed_cost|dealer_cost|wholesale|margin/i,
    );
    expect(sql).toMatch(/pricing_event_id uuid not null references public\.sales_quote_v2_events/i);
    expect(sql).toMatch(/preview_id uuid not null references public\.sales_quote_v2_legacy_reprice_previews/i);
  });

  it("allows only the service role to record or apply repricing", () => {
    expect(sql.match(/if auth\.role\(\) is distinct from 'service_role' then/g)).toHaveLength(2);
    expect(sql).toMatch(
      /revoke all on function public\.record_quote_v2_legacy_reprice_preview\([\s\S]*?from public, anon, authenticated;/i,
    );
    expect(sql).toMatch(
      /revoke all on function public\.apply_quote_v2_legacy_reprice\([\s\S]*?from public, anon, authenticated;/i,
    );
    expect(sql).not.toMatch(
      /grant execute on function public\.(record_quote_v2_legacy_reprice_preview|apply_quote_v2_legacy_reprice)\([\s\S]*?to authenticated/i,
    );
  });

  it("locks the legacy draft and requires an explicit one-to-one selection for every 1-40 lines", () => {
    expect(sql).toMatch(
      /from public\.sales_quotes quotes[\s\S]*where quotes\.id = p_quote_id[\s\S]*for update;/i,
    );
    expect(sql).toMatch(
      /v_quote\.quote_v2_backend or v_quote\.quote_v2_status <> 'legacy'[\s\S]*v_quote\.status <> 'draft'/i,
    );
    expect(sql).toMatch(/v_line_count < 1 or v_line_count > 40/i);
    expect(sql).toMatch(/v_selection_count <> v_line_count/i);
    expect(sql).toMatch(/jsonb_array_length\(p_results\) <> v_line_count/i);
    expect(sql).toMatch(/count\(distinct item ->> 'lineItemId'\)/i);
    expect(sql).toMatch(/designs\.line_item_id = lines\.id/i);
    expect(sql).toMatch(/v_authoritative_count <> v_line_count/i);
  });

  it("makes preview idempotent and binds it to revision, actor, catalog date, totals, selections, and exact batch", () => {
    expect(sql).toMatch(/unique \(quote_id, idempotency_key\)/i);
    expect(sql).toMatch(
      /v_existing\.quote_revision <> p_expected_revision[\s\S]*v_existing\.created_by <> p_actor_id[\s\S]*v_existing\.server_catalog_date <> p_server_catalog_date[\s\S]*v_existing\.selection_map <> v_normalized_selection[\s\S]*v_existing\.pricing_batch_hash <> v_batch_hash/i,
    );
    expect(sql).toMatch(/legacyTotal'[\s\S]*proposedTotal'/i);
    expect(sql).toMatch(/expires_at timestamptz not null default \(now\(\) \+ interval '30 minutes'\)/i);
  });

  it("detects legacy edits even when the legacy revision remains zero", () => {
    expect(sql).toContain(
      "create or replace function public.quote_v2_legacy_state_hash",
    );
    expect(sql).toMatch(/'quote', to_jsonb\(quotes\)/i);
    expect(sql).toMatch(/'lines',[\s\S]*jsonb_agg\(to_jsonb\(lines\)/i);
    expect(sql).toMatch(/'designs',[\s\S]*jsonb_agg\(to_jsonb\(designs\)/i);
    expect(sql).toMatch(
      /v_state_hash is distinct from v_preview\.legacy_state_hash[\s\S]*legacy quote changed after preview/i,
    );
  });

  it("fails closed on expired, changed, or substituted previews and pricing batches", () => {
    expect(sql).toMatch(/v_preview\.expires_at <= now\(\)/i);
    expect(sql).toMatch(/v_preview\.preview_digest <> p_preview_digest/i);
    expect(sql).toMatch(/v_preview\.quote_revision <> p_expected_revision/i);
    expect(sql).toMatch(/v_preview\.created_by <> p_actor_id/i);
    expect(sql).toMatch(/v_batch_hash is distinct from v_preview\.pricing_batch_hash/i);
    expect(sql).toMatch(/v_result_selection <> v_preview\.selection_map/i);
  });

  it("converts and persists the quote-wide snapshots in one transaction", () => {
    expect(sql).toMatch(
      /update public\.sales_quotes[\s\S]*quote_v2_backend = true[\s\S]*quote_v2_status = 'draft'[\s\S]*from public\.save_quote_v2_pricing_batch/i,
    );
    expect(sql).toMatch(/v_saved_status <> 'priced'/i);
    expect(sql).toMatch(/v_saved_priced <> v_preview\.line_count/i);
    expect(sql).toMatch(/v_saved_blocked <> 0/i);
    expect(sql).toMatch(
      /from public\.sales_quote_v2_events events[\s\S]*events\.event_type = 'pricing_batch'/i,
    );
    expect(sql).toMatch(
      /insert into public\.sales_quote_v2_legacy_reprice_audits/i,
    );
  });

  it("returns an existing immutable application for a matching idempotent retry", () => {
    const existingAuditIndex = sql.indexOf(
      "select audits.*\n    into v_existing",
    );
    const previewLookupIndex = sql.indexOf(
      "select previews.*\n    into v_preview",
      existingAuditIndex,
    );
    const stateCheckIndex = sql.indexOf(
      "v_state_hash := public.quote_v2_legacy_state_hash",
      previewLookupIndex,
    );
    expect(existingAuditIndex).toBeGreaterThan(0);
    expect(previewLookupIndex).toBeGreaterThan(existingAuditIndex);
    expect(stateCheckIndex).toBeGreaterThan(previewLookupIndex);
    expect(sql).toMatch(
      /v_existing\.preview_id <> p_preview_id[\s\S]*v_existing\.preview_digest <> p_preview_digest[\s\S]*v_existing\.actor_id <> p_actor_id/i,
    );
  });
});
