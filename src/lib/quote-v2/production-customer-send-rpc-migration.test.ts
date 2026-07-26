import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/20260722193000_add_quote_v2_atomic_customer_send.sql",
);
const sql = readFileSync(migrationPath, "utf8");
const functionSql =
  sql.match(
    /create or replace function public\.prepare_quote_v2_customer_send\([\s\S]*?\n\$\$;/i,
  )?.[0] ?? "";
const tableSql =
  sql.match(
    /create table if not exists public\.sales_quote_v2_customer_send_preparations \([\s\S]*?\n\);/i,
  )?.[0] ?? "";

describe("Quote V2 atomic customer-send preparation migration", () => {
  it("is additive and never rewrites legacy quote tables at migration time", () => {
    expect(sql).toContain(
      "create table if not exists public.sales_quote_v2_customer_send_preparations",
    );
    expect(sql).not.toMatch(/\bdrop\s+table\b|\btruncate\b/i);
    expect(sql).not.toMatch(
      /alter table public\.(sales_quotes|sales_quote_line_items|sales_quote_designs|crm_jobs|crm_quotes|crm_quote_line_items|crm_quote_designs)\b/i,
    );
  });

  it("keeps the immutable preparation customer-safe and append-only", () => {
    expect(tableSql).toContain("customer_payload jsonb not null");
    expect(tableSql).toContain("retail_total numeric(12, 2) not null");
    expect(tableSql).not.toMatch(
      /internal_cost|landed_cost|dealer_cost|freight_cost|wholesale|margin|markup|multiplier/i,
    );
    expect(tableSql).toContain(
      "not public.quote_v2_customer_json_has_protected_key(customer_payload)",
    );
    expect(sql).toContain(
      "alter table public.sales_quote_v2_customer_send_preparations enable row level security",
    );
    expect(sql).toContain("execute function public.reject_v2_audit_mutation()");
    expect(tableSql).toMatch(/unique \(quote_id, idempotency_key\)/i);
    expect(tableSql).toMatch(/unique \(quote_id, quote_revision\)/i);
  });

  it("requires service role plus an active write-authorized CRM actor", () => {
    expect(functionSql).toContain("auth.role() is distinct from 'service_role'");
    expect(functionSql).toMatch(
      /from public\.crm_profiles profiles[\s\S]*profiles\.id = p_actor_id[\s\S]*profiles\.active = true/i,
    );
    expect(functionSql).toContain("'805shutters@gmail.com'");
    expect(functionSql).toContain("'jessica@805shutters.com'");
    expect(sql).toMatch(
      /revoke all on function public\.prepare_quote_v2_customer_send\([\s\S]*\) from public, anon, authenticated;/i,
    );
    expect(sql).toMatch(
      /grant execute on function public\.prepare_quote_v2_customer_send\([\s\S]*\) to service_role;/i,
    );
  });

  it("locks and reconciles one authoritative selected snapshot per line", () => {
    expect(functionSql).toMatch(
      /from public\.sales_quotes quotes[\s\S]*where quotes\.id = p_quote_id[\s\S]*for update;/i,
    );
    expect(functionSql).toContain("for update of lines, designs, snapshots");
    expect(functionSql).toMatch(/v_total_lines < 1 or v_total_lines > 40/i);
    expect(functionSql).toMatch(
      /v_line\.selected_design_id is null[\s\S]*v_line\.design_id is null[\s\S]*v_line\.snapshot_id is null/i,
    );
    expect(functionSql).toContain(
      "v_line.quote_v2_price_status is distinct from 'authoritative'",
    );
    expect(functionSql).toContain(
      "v_line.snapshot_quote_revision is distinct from p_expected_revision",
    );
    expect(functionSql).toContain("v_line.snapshot_selection_fingerprint");
    expect(functionSql).toContain("order by lines.sort_order, lines.id");
    expect(functionSql).toMatch(
      /round\(coalesce\(v_quote\.total_amount, 0\), 2\) is distinct from v_retail_total/i,
    );
  });

  it("reconstructs exact customer-safe configuration and retail allow-lists", () => {
    expect(sql).toContain(
      "create or replace function public.quote_v2_customer_safe_configuration",
    );
    for (const key of [
      "fabric_color_name",
      "fabric_color_code",
      "valance",
      "roller_top_treatment",
      "lift_system",
      "motor_type",
      "power_configuration",
      "motorization_selections",
    ]) {
      expect(sql).toContain("'" + key + "'");
    }
    expect(functionSql).toContain("'configuration', v_safe_configuration");
    expect(functionSql).toContain("v_safe_price := jsonb_build_object(");
    expect(functionSql).toContain(
      "p_customer_payload is distinct from v_safe_payload",
    );
    expect(functionSql).not.toMatch(
      /v_safe_payload\s*:=\s*v_line\.retail_snapshot/i,
    );
  });

  it("preserves protected COGS internally without placing it in customer payload", () => {
    expect(functionSql).toContain("snapshots.internal_landed_cost_total");
    expect(functionSql).toContain("snapshots.internal_cost_snapshot");
    expect(functionSql).toContain(
      "v_internal_landed_cost_total + v_line_internal_landed_cost",
    );
    expect(functionSql).toMatch(
      /materials_cost,[\s\S]*labor_cost,[\s\S]*\) values \([\s\S]*v_retail_total,[\s\S]*v_internal_landed_cost_total,[\s\S]*0,/i,
    );
    expect(functionSql).toContain(
      "wholesale_unit_price = excluded.wholesale_unit_price",
    );
    const payloadBuild = functionSql.slice(
      functionSql.indexOf("v_safe_payload := jsonb_build_object"),
      functionSql.indexOf("if public.quote_v2_customer_json_has_protected_key"),
    );
    expect(payloadBuild).not.toMatch(/internal|landed|cost|wholesale/i);
  });

  it("creates a selected-design-only draft mirror and never claims delivery", () => {
    expect(functionSql).toMatch(
      /insert into public\.crm_quotes[\s\S]*'draft',[\s\S]*v_retail_total/i,
    );
    expect(functionSql).toContain("sent_at = null");
    expect(functionSql).toMatch(
      /delete from public\.crm_quote_designs designs[\s\S]*designs\.id <> v_design_id/i,
    );
    expect(functionSql).toContain("set selected_design_id = v_design_id");
    expect(functionSql).toContain(
      "insert into public.sales_quote_v2_customer_send_preparations",
    );
    expect(functionSql).not.toMatch(
      /set status = 'sent'|quote_v2_status = 'sent'|insert into public\.sales_quote_v2_events/i,
    );
    expect(functionSql).not.toMatch(
      /send_sms|send_email|http_post|net\.http|pg_net|resend|twilio/i,
    );
    expect(sql).toContain("It performs no external delivery");
  });

  it("supports exact idempotent retries without key-reuse drift", () => {
    expect(functionSql).toMatch(
      /where preparations\.quote_id = p_quote_id[\s\S]*preparations\.idempotency_key = btrim\(p_idempotency_key\)/i,
    );
    expect(functionSql).toMatch(
      /v_existing\.quote_revision <> p_expected_revision[\s\S]*v_existing\.catalog_version[\s\S]*v_existing\.prepared_via[\s\S]*v_existing\.customer_payload/i,
    );
    expect(functionSql).toContain(
      "idempotency key was already used for a different send preparation",
    );
  });
});
