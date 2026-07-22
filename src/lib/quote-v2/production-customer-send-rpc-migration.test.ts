import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/20260722193000_add_quote_v2_atomic_customer_send.sql",
);
const sql = readFileSync(migrationPath, "utf8");
const functionSql = sql.match(
  /create or replace function public\.persist_quote_v2_customer_send\([\s\S]*?\n\$\$;/i,
)?.[0] ?? "";
const tableSql = sql.match(
  /create table if not exists public\.sales_quote_v2_customer_send_snapshots \([\s\S]*?\n\);/i,
)?.[0] ?? "";

describe("Quote V2 atomic customer-send migration", () => {
  it("is additive and performs no migration-time rewrite of legacy quote tables", () => {
    expect(sql).toContain(
      "create table if not exists public.sales_quote_v2_customer_send_snapshots",
    );
    expect(sql).not.toMatch(/\bdrop\s+table\b/i);
    expect(sql).not.toMatch(/\btruncate\b/i);
    expect(sql).not.toMatch(
      /alter table public\.(sales_quotes|sales_quote_line_items|sales_quote_designs|crm_jobs|crm_quotes|crm_quote_line_items|crm_quote_designs)\b/i,
    );
  });

  it("stores only customer payload and audit identity, never a protected-cost column", () => {
    expect(tableSql).toContain("customer_payload jsonb not null");
    expect(tableSql).toContain("retail_total numeric(12, 2) not null");
    expect(tableSql).not.toMatch(
      /internal_cost|landed_cost|dealer_cost|freight_cost|wholesale|margin|markup|multiplier/i,
    );
    expect(tableSql).toContain(
      "not public.quote_v2_customer_json_has_protected_key(customer_payload)",
    );
    expect(sql).toMatch(
      /v_normalized_key ~ '\(dealer\|wholesale\|internal\|landed\|margin\|markup\|multiplier\)'/i,
    );
    expect(sql).toMatch(/v_normalized_key ~ 'cost'/i);
  });

  it("protects the append-only mirror with RLS and service-only writes", () => {
    expect(sql).toContain(
      "alter table public.sales_quote_v2_customer_send_snapshots enable row level security",
    );
    expect(sql).toMatch(
      /revoke all on public\.sales_quote_v2_customer_send_snapshots[\s\S]*from public, anon, authenticated;/i,
    );
    expect(sql).toMatch(
      /grant select on public\.sales_quote_v2_customer_send_snapshots to authenticated;/i,
    );
    expect(sql).toMatch(
      /using \([\s\S]*public\.is_805_crm_user\(\)[\s\S]*public\.is_805_sales_quote\(quote_id\)[\s\S]*\);/i,
    );
    expect(sql).toContain(
      "execute function public.reject_v2_audit_mutation()",
    );
  });

  it("requires service role plus an active write-authorized CRM actor", () => {
    expect(functionSql).toContain(
      "auth.role() is distinct from 'service_role'",
    );
    expect(functionSql).toMatch(
      /from public\.crm_profiles profiles[\s\S]*profiles\.id = p_actor_id[\s\S]*profiles\.active = true/i,
    );
    expect(functionSql).toContain("'805shutters@gmail.com'");
    expect(functionSql).toContain("'jessica@805shutters.com'");
    expect(functionSql).not.toContain("'khill31@msn.com'");
    expect(sql).toMatch(
      /revoke all on function public\.persist_quote_v2_customer_send\([\s\S]*\) from public, anon, authenticated;/i,
    );
    expect(sql).toMatch(
      /grant execute on function public\.persist_quote_v2_customer_send\([\s\S]*\) to service_role;/i,
    );
  });

  it("serializes lifecycle and child validation under database locks", () => {
    expect(functionSql).toMatch(
      /from public\.sales_quotes quotes[\s\S]*where quotes\.id = p_quote_id[\s\S]*for update;/i,
    );
    expect(functionSql).toMatch(
      /for update of lines, designs, snapshots;/i,
    );
    expect(functionSql).toMatch(
      /v_quote\.status <> 'draft' or v_quote\.quote_v2_status <> 'priced'/i,
    );
    expect(functionSql).toMatch(
      /v_quote\.quote_v2_revision <> p_expected_revision/i,
    );
    expect(functionSql).toMatch(
      /v_quote\.quote_v2_catalog_version is distinct from btrim\(p_expected_catalog_version\)/i,
    );
  });

  it("requires one authoritative selected snapshot per line with exact ownership", () => {
    expect(functionSql).toMatch(
      /v_total_lines < 1 or v_total_lines > 40/i,
    );
    expect(functionSql).toMatch(
      /v_line\.selected_design_id is null[\s\S]*v_line\.design_id is null[\s\S]*v_line\.snapshot_id is null/i,
    );
    for (const marker of [
      "v_line.snapshot_quote_id is distinct from p_quote_id",
      "v_line.snapshot_line_item_id is distinct from v_line.line_item_id",
      "v_line.snapshot_design_id is distinct from v_line.design_id",
      "v_line.snapshot_quote_revision is distinct from p_expected_revision",
      "v_line.snapshot_selection_fingerprint",
      "v_line.snapshot_catalog_version",
    ]) {
      expect(functionSql).toContain(marker);
    }
    expect(functionSql).toContain(
      "v_line.quote_v2_price_status is distinct from 'authoritative'",
    );
  });

  it("reconciles selected catalog identity and retail totals before any mirror write", () => {
    expect(functionSql).toMatch(
      /string_agg\([\s\S]*distinct snapshots\.catalog_version[\s\S]*order by snapshots\.catalog_version/i,
    );
    expect(functionSql).toMatch(
      /v_selected_catalog_versions is distinct from v_quote\.quote_v2_catalog_version/i,
    );
    expect(functionSql).toMatch(
      /round\(coalesce\(v_quote\.total_amount, 0\), 2\) is distinct from v_retail_total/i,
    );
    expect(functionSql.indexOf("if p_customer_payload is distinct from v_safe_payload"))
      .toBeLessThan(functionSql.indexOf("insert into public.crm_jobs"));
  });

  it("constructs and compares an exact customer allow-list rather than copying retail JSON", () => {
    expect(functionSql).toContain("v_safe_price := jsonb_build_object(");
    for (const key of [
      "productId",
      "programId",
      "programName",
      "matchedWidth",
      "matchedHeight",
      "base",
      "surchargeLines",
      "unitPrice",
      "discountPercent",
      "discountAmount",
      "quantity",
      "onceTotal",
      "total",
    ]) {
      expect(functionSql).toContain(`'${key}'`);
    }
    expect(functionSql).toContain(
      "if p_customer_payload is distinct from v_safe_payload then",
    );
    expect(functionSql).not.toMatch(
      /v_safe_payload\s*:=\s*v_line\.retail_snapshot/i,
    );
    expect(functionSql).not.toMatch(
      /snapshots\.(internal_landed_cost_total|internal_cost_snapshot|validation_snapshot|provenance_snapshot)/i,
    );
  });

  it("writes a selected-design-only CRM mirror with cost fields forcibly blank", () => {
    for (const table of [
      "public.crm_jobs",
      "public.crm_quotes",
      "public.crm_quote_line_items",
      "public.crm_quote_designs",
    ]) {
      expect(functionSql).toContain(`insert into ${table}`);
    }
    expect(functionSql).toMatch(
      /materials_cost,[\s\S]*labor_cost,[\s\S]*\) values \([\s\S]*v_retail_total,[\s\S]*0,[\s\S]*0,/i,
    );
    expect(functionSql).toMatch(/materials_cost = 0,[\s\S]*labor_cost = 0,/i);
    expect(functionSql).toMatch(/wholesale_unit_price[\s\S]*null[\s\S]*on conflict/i);
    expect(functionSql).toContain("wholesale_unit_price = null");
    expect(functionSql).toMatch(
      /delete from public\.crm_quote_designs designs[\s\S]*designs\.id <> v_design_id/i,
    );
    expect(functionSql).toMatch(
      /set selected_design_id = v_design_id/i,
    );
    expect(functionSql).not.toMatch(
      /v_quote\.(product_cost|manufacturer_cost|profit_amount|installer_notes)/i,
    );
    expect(functionSql).not.toContain("'mts_quote_id'");
    expect(functionSql).toContain("'source_sales_quote_id'");
    expect(functionSql).toMatch(
      /from public\.crm_quotes quotes[\s\S]*quotes\.status <> 'draft'[\s\S]*existing non-draft customer mirror cannot be replaced/i,
    );
  });

  it("persists mirror, lifecycle, and audit event in the same function transaction", () => {
    const snapshotInsert = functionSql.indexOf(
      "insert into public.sales_quote_v2_customer_send_snapshots",
    );
    const lifecycleUpdate = functionSql.indexOf("update public.sales_quotes quotes");
    const eventInsert = functionSql.indexOf(
      "insert into public.sales_quote_v2_events",
    );
    expect(snapshotInsert).toBeGreaterThan(-1);
    expect(lifecycleUpdate).toBeGreaterThan(snapshotInsert);
    expect(eventInsert).toBeGreaterThan(lifecycleUpdate);
    expect(functionSql).toMatch(
      /set status = 'sent',[\s\S]*quote_v2_status = 'sent',[\s\S]*quote_v2_revision = v_new_revision/i,
    );
    expect(functionSql).toContain("'customer_send_persisted'");
    expect(functionSql).not.toMatch(/\bcommit\b|\brollback\b/i);
  });

  it("supports exact idempotent retries without allowing key reuse drift", () => {
    expect(tableSql).toMatch(/unique \(quote_id, idempotency_key\)/i);
    expect(functionSql).toMatch(
      /where snapshots\.quote_id = p_quote_id[\s\S]*snapshots\.idempotency_key = btrim\(p_idempotency_key\)/i,
    );
    expect(functionSql).toMatch(
      /v_existing\.priced_quote_revision <> p_expected_revision[\s\S]*v_existing\.catalog_version[\s\S]*v_existing\.sent_via[\s\S]*v_existing\.customer_payload/i,
    );
    expect(functionSql).toContain(
      "The Quote V2 idempotency key was already used for a different customer-send request.",
    );
  });

  it("performs no external communication from the database transaction", () => {
    expect(functionSql).not.toMatch(
      /send_sms|send_email|http_post|net\.http|pg_net|resend|twilio/i,
    );
    expect(sql).toContain("It performs no external delivery.");
  });
});
