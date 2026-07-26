import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260726120000_add_quote_v2_structural_mutation_rpc.sql",
  ),
  "utf8",
);

describe("Quote V2 structural mutation migration", () => {
  it("keeps draft creation and structural mutation service-role only", () => {
    expect(migration).toMatch(
      /create or replace function public\.create_quote_v2_draft\(/i,
    );
    expect(migration).toMatch(
      /create or replace function public\.mutate_quote_v2_structure\(/i,
    );
    expect(migration).toMatch(
      /auth\.role\(\) is distinct from 'service_role'[\s\S]*draft creation requires the service role/i,
    );
    expect(migration).toMatch(
      /auth\.role\(\) is distinct from 'service_role'[\s\S]*structural mutation requires the service role/i,
    );
    expect(migration).toMatch(
      /revoke all on function public\.create_quote_v2_draft\(text, uuid, jsonb\)[\s\S]*from public, anon, authenticated/i,
    );
    expect(migration).toMatch(
      /revoke all on function public\.mutate_quote_v2_structure\([\s\S]*from public, anon, authenticated/i,
    );
  });

  it("authorizes an active writable 805 actor and excludes the read-only login", () => {
    expect(migration).toMatch(
      /from public\.crm_profiles profiles[\s\S]*profiles\.id = p_actor_id[\s\S]*profiles\.active = true/i,
    );
    expect(migration).toContain("'805shutters@gmail.com'");
    expect(migration).toContain("'jessica@805shutters.com'");
    expect(migration).not.toContain("'khill31@msn.com'");
  });

  it("allocates the quote number under a server transaction lock without next_quote_number", () => {
    expect(migration).toMatch(
      /pg_advisory_xact_lock\([\s\S]*quote-v2-number-allocation:805/i,
    );
    expect(migration).toMatch(
      /from public\.sales_quotes quotes[\s\S]*quotes\.quote_number like '805-%'/i,
    );
    expect(migration).not.toMatch(/\bnext_quote_number\s*\(/i);
    expect(migration).toMatch(
      /insert into public\.sales_quotes[\s\S]*quote_v2_backend[\s\S]*quote_v2_status[\s\S]*quote_v2_revision/i,
    );
  });

  it("uses globally idempotent creation and revisioned idempotent structural events", () => {
    expect(migration).toMatch(
      /create table if not exists public\.sales_quote_v2_draft_requests/i,
    );
    expect(migration).toMatch(
      /idempotency_key text primary key[\s\S]*request_hash text not null[\s\S]*quote_id uuid not null unique/i,
    );
    expect(migration).toMatch(
      /events\.quote_id = p_quote_id[\s\S]*events\.idempotency_key = btrim\(p_idempotency_key\)[\s\S]*event_type <> 'structure_mutation'/i,
    );
    expect(migration).toMatch(
      /event_type <> 'structure_mutation'[\s\S]*actor_id is distinct from p_actor_id[\s\S]*previous_revision is distinct from p_expected_revision[\s\S]*operationHash/i,
    );
    expect(migration).toMatch(
      /v_quote\.quote_v2_revision <> p_expected_revision[\s\S]*using errcode = '40001'/i,
    );
    expect(migration).toMatch(
      /'structure_mutation'[\s\S]*p_expected_revision[\s\S]*v_new_revision[\s\S]*v_operation_hash/i,
    );
  });

  it("supports the core single-quote operations in one transaction", () => {
    for (const operation of [
      "quote.update",
      "line.create",
      "line.update",
      "line.delete",
      "lines.clear",
      "line.copy",
      "design.upsert",
      "design.select",
      "design.delete",
      "design.copySet",
    ]) {
      expect(migration).toContain(`v_operation_type = '${operation}'`);
    }
  });

  it("enforces 40 lines, selected-design ownership, and unlocked drafts", () => {
    expect(migration).toMatch(
      /v_line_count > 40[\s\S]*no more than 40 line items/i,
    );
    expect(migration).toMatch(
      /v_quote\.status <> 'draft'[\s\S]*v_quote\.sent_at is not null[\s\S]*v_quote\.signed_at is not null/i,
    );
    expect(migration).toMatch(
      /left join public\.sales_quote_designs designs[\s\S]*lines\.selected_design_id is not null[\s\S]*designs\.id is null/i,
    );
    expect(migration).toMatch(
      /foreign|selected_design_id = v_design_id/i,
    );
    expect(migration).toMatch(
      /lines\.selected_design_id is null[\s\S]*Every Quote V2 line must have exactly one selected design/i,
    );
  });

  it("fails closed on protected fields and invalidates every mutable price pointer", () => {
    expect(migration).toMatch(
      /quote_v2_structure_json_has_protected_key\(p_operations\)[\s\S]*protected pricing or cost fields/i,
    );
    expect(migration).toMatch(
      /update public\.sales_quote_designs designs[\s\S]*unit_price = 0[\s\S]*quote_v2_selection = '\{\}'::jsonb[\s\S]*quote_v2_price_status = 'stale'[\s\S]*quote_v2_selection_fingerprint = null[\s\S]*current_v2_snapshot_id = null/i,
    );
    expect(migration).toMatch(
      /update public\.sales_quotes[\s\S]*quote_v2_catalog_version = null[\s\S]*total_amount = 0[\s\S]*product_cost = 0[\s\S]*manufacturer_cost = 0[\s\S]*profit_amount = 0/i,
    );
  });

  it("blocks every destructive mutation when immutable price history exists", () => {
    expect(migration).toMatch(
      /v_design_cleared :=[\s\S]*from public\.sales_quote_v2_price_snapshots snapshots[\s\S]*snapshots\.line_item_id = v_line_id[\s\S]*historically priced Quote V2 line cannot discard its design set until the archive\/read-filter contract is installed[\s\S]*delete from public\.sales_quote_designs where line_item_id = v_line_id/i,
    );
    expect(migration).toMatch(
      /v_operation_type = 'line\.delete'[\s\S]*from public\.sales_quote_v2_price_snapshots snapshots[\s\S]*snapshots\.line_item_id = v_line_id[\s\S]*historically priced Quote V2 line cannot be deleted until the archive\/read-filter contract is installed[\s\S]*delete from public\.sales_quote_line_items/i,
    );
    expect(migration).toMatch(
      /v_operation_type = 'lines\.clear'[\s\S]*from public\.sales_quote_v2_price_snapshots snapshots[\s\S]*snapshots\.quote_id = p_quote_id[\s\S]*immutable price history cannot be cleared until the archive\/read-filter contract is installed[\s\S]*delete from public\.sales_quote_line_items where quote_id = p_quote_id/i,
    );
    expect(migration).toMatch(
      /v_operation_type = 'design\.delete'[\s\S]*from public\.sales_quote_v2_price_snapshots snapshots[\s\S]*snapshots\.design_id = v_design_id[\s\S]*historically priced Quote V2 design cannot be deleted until the archive\/read-filter contract is installed[\s\S]*delete from public\.sales_quote_designs where id = v_design_id/i,
    );
    expect(migration).toMatch(
      /v_operation_type = 'design\.copySet'[\s\S]*from public\.sales_quote_v2_price_snapshots snapshots[\s\S]*snapshots\.line_item_id = v_target_line_id[\s\S]*historically priced Quote V2 target design set cannot be replaced until the archive\/read-filter contract is installed[\s\S]*delete from public\.sales_quote_designs[\s\S]*line_item_id = v_target_line_id/i,
    );
  });

  it("prevents copy identity collisions and bounds copied-line sort order", () => {
    expect(migration).toMatch(
      /v_operation_type = 'line\.copy'[\s\S]*v_target_line_id = v_source_line_id[\s\S]*requires a new target line identity/i,
    );
    expect(migration).toMatch(
      /v_operation \? 'sortOrder'[\s\S]*sortOrder'\)::integer < 0[\s\S]*sortOrder'\)::integer > 10000[\s\S]*line copy sortOrder is out of range/i,
    );
    expect(migration).toMatch(
      /v_operation_type = 'design\.copySet'[\s\S]*v_source_line_id = v_target_line_id[\s\S]*require different source and target lines/i,
    );
  });

  it("returns only lifecycle and identity data from the structural RPC", () => {
    const resultStart = migration.indexOf(
      "v_result := jsonb_build_object(\n    'backend', 'authoritative_v2'",
      migration.indexOf("create or replace function public.mutate_quote_v2_structure"),
    );
    const eventStart = migration.indexOf(
      "insert into public.sales_quote_v2_events",
      resultStart,
    );
    const resultProjection = migration.slice(resultStart, eventStart);

    expect(resultProjection).toContain("'selectedDesigns'");
    expect(resultProjection).toContain("'operations'");
    expect(resultProjection).not.toMatch(
      /productCost|manufacturerCost|landed|wholesale|margin|profit/i,
    );
  });
});
