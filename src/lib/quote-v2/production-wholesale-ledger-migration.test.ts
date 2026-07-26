import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260726130000_add_quote_v2_wholesale_ledger.sql",
  ),
  "utf8",
);
const singlePriceSaveMigration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260722191000_add_quote_v2_authoritative_pricing_rpc.sql",
  ),
  "utf8",
);
const batchPriceSaveMigration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260722192000_add_quote_v2_authoritative_pricing_batch_rpc.sql",
  ),
  "utf8",
);

describe("Quote V2 wholesale ledger migration contract", () => {
  it("creates versioned sources, programs, grids, components, and order costs", () => {
    for (const table of [
      "sales_quote_v2_wholesale_sources",
      "sales_quote_v2_wholesale_versions",
      "sales_quote_v2_wholesale_version_sources",
      "sales_quote_v2_wholesale_programs",
      "sales_quote_v2_wholesale_price_cells",
      "sales_quote_v2_wholesale_option_components",
      "sales_quote_v2_wholesale_order_cost_rules",
    ]) {
      expect(migration).toMatch(
        new RegExp(`create table if not exists public\\.${table}`, "i"),
      );
    }
    expect(migration).toMatch(
      /lifecycle text not null default 'draft'[\s\S]*'review'[\s\S]*'published'[\s\S]*'quarantined'[\s\S]*'retired'/i,
    );
    expect(migration).toMatch(
      /version_key text not null[\s\S]*scope_key text not null[\s\S]*effective_from date[\s\S]*account_key text not null[\s\S]*account_scope text not null[\s\S]*content_sha256 text not null/i,
    );
  });

  it("has direct indexes for published effective-version and dimension-grid lookup", () => {
    expect(migration).toMatch(
      /sales_quote_v2_wholesale_versions_lookup_idx[\s\S]*manufacturer_id[\s\S]*account_key[\s\S]*scope_key[\s\S]*lifecycle[\s\S]*effective_from desc[\s\S]*effective_until/i,
    );
    expect(migration).toMatch(
      /sales_quote_v2_wholesale_programs_lookup_idx[\s\S]*manufacturer_code[\s\S]*product_key[\s\S]*program_key[\s\S]*style_key[\s\S]*color_key[\s\S]*cost_status/i,
    );
    expect(migration).toMatch(
      /sales_quote_v2_wholesale_price_cells_grid_idx[\s\S]*program_id[\s\S]*width_ceiling[\s\S]*height_ceiling[\s\S]*include \(availability, cost_cents, currency, source_id\)/i,
    );
    expect(migration).toMatch(
      /sales_quote_v2_wholesale_price_cells_height_idx[\s\S]*program_id[\s\S]*height_ceiling[\s\S]*width_ceiling/i,
    );
    expect(migration).toMatch(
      /sales_quote_v2_wholesale_option_components_lookup_idx[\s\S]*manufacturer_code[\s\S]*product_key[\s\S]*program_key[\s\S]*component_key/i,
    );
  });

  it("publishes only reviewed evidence-backed populated versions", () => {
    expect(migration).toMatch(
      /create or replace function public\.enforce_wholesale_version_publication\(\)/i,
    );
    expect(migration).toMatch(
      /create or replace function public\.is_quote_v2_wholesale_source_authoritative[\s\S]*sources\.runtime_authority[\s\S]*sources\.quarantine_reason is null[\s\S]*sources\.account_key is null[\s\S]*sources\.product_keys[\s\S]*sources\.program_keys[\s\S]*sources\.authorities @> p_required_authorities[\s\S]*links\.authority_scope @> p_required_authorities/i,
    );
    expect(migration).toMatch(
      /tg_op = 'INSERT'[\s\S]*must enter review before publication[\s\S]*old\.lifecycle <> 'review'[\s\S]*explicit review-to-published transition[\s\S]*content hash must be finalized before publication/i,
    );
    expect(migration).toMatch(
      /programs\.cost_status = 'quote_ready'[\s\S]*cells\.availability = 'priced'[\s\S]*at least one fully populated quote-ready program/i,
    );
    expect(migration).toMatch(
      /pg_advisory_xact_lock[\s\S]*existing\.manufacturer_id = new\.manufacturer_id[\s\S]*existing\.account_key = new\.account_key[\s\S]*existing\.scope_key = new\.scope_key[\s\S]*existing\.lifecycle in \('published', 'retired'\)[\s\S]*published wholesale effective periods cannot overlap/i,
    );
    expect(migration).toMatch(
      /publish_insert_guard[\s\S]*before insert[\s\S]*enforce_wholesale_version_publication/i,
    );
    expect(migration).toMatch(
      /compute_quote_v2_wholesale_version_content_sha256[\s\S]*canonical ledger manifest/i,
    );
  });

  it("selects the effective published or retired version for one explicit internal account", () => {
    expect(migration).toMatch(
      /lookup_quote_v2_wholesale_cost\(\s*p_manufacturer_code text,\s*p_account_key text,/i,
    );
    expect(migration).toMatch(
      /join public\.sales_quote_v2_wholesale_programs programs[\s\S]*versions\.manufacturer_id = v_manufacturer_id[\s\S]*versions\.account_key = lower\(btrim\(p_account_key\)\)[\s\S]*versions\.lifecycle in \('published', 'retired'\)[\s\S]*versions\.effective_from <= p_as_of[\s\S]*versions\.effective_until >= p_as_of[\s\S]*programs\.product_key = lower\(btrim\(p_product_key\)\)/i,
    );
    expect(migration).toMatch(
      /'accountKey', v_version\.account_key[\s\S]*'accountScope', v_version\.account_scope/i,
    );
  });

  it("keeps tables and lookup RPC service-role only", () => {
    expect(migration).toMatch(
      /create or replace function public\.lookup_quote_v2_wholesale_cost\(/i,
    );
    expect(migration).toMatch(
      /auth\.role\(\) is distinct from 'service_role'[\s\S]*Wholesale cost lookup requires the trusted Quote V2 service/i,
    );
    expect(migration).toMatch(
      /revoke all on function public\.lookup_quote_v2_wholesale_cost\([\s\S]*from public, anon, authenticated/i,
    );
    expect(migration).toMatch(
      /grant execute on function public\.lookup_quote_v2_wholesale_cost\([\s\S]*to service_role/i,
    );
    for (const table of [
      "sales_quote_v2_wholesale_sources",
      "sales_quote_v2_wholesale_versions",
      "sales_quote_v2_wholesale_version_sources",
      "sales_quote_v2_wholesale_programs",
      "sales_quote_v2_wholesale_price_cells",
      "sales_quote_v2_wholesale_option_components",
      "sales_quote_v2_wholesale_order_cost_rules",
    ]) {
      expect(migration).toMatch(
        new RegExp(`alter table public\\.${table} enable row level security`, "i"),
      );
    }
    expect(migration).toMatch(
      /revoke all on[\s\S]*sales_quote_v2_wholesale_sources[\s\S]*sales_quote_v2_wholesale_order_cost_rules[\s\S]*from public, anon, authenticated/i,
    );
  });

  it("retains wholesale version and lookup fingerprint on immutable quote snapshots", () => {
    expect(migration).toMatch(
      /alter table public\.sales_quote_v2_price_snapshots[\s\S]*wholesale_version_id uuid[\s\S]*wholesale_lookup_fingerprint text/i,
    );
    expect(migration).toMatch(
      /wholesale_version_id is not null[\s\S]*wholesale_lookup_fingerprint ~ '\^\[0-9a-f\]\{64\}\$'/i,
    );
    expect(migration).toMatch(
      /sales_quote_v2_snapshots_wholesale_version_idx[\s\S]*wholesale_version_id[\s\S]*wholesale_lookup_fingerprint/i,
    );
    expect(migration).toMatch(
      /create or replace function public\.enforce_published_wholesale_snapshot\(\)[\s\S]*v_lifecycle not in \('published', 'retired'\)[\s\S]*Only an effective published or retired wholesale version may be attached/i,
    );
    expect(migration).toMatch(
      /internal_cost_snapshot ->> 'authority'[\s\S]*wholesaleVersionId[\s\S]*lookupFingerprint[\s\S]*ledger-priced quote snapshot does not match its immutable wholesale reference/i,
    );
    expect(migration).toMatch(
      /new\.wholesale_version_id is null[\s\S]*internal_cost_snapshot ->> 'authority' = 'wholesale_ledger'[\s\S]*new\.wholesale_version_id := v_snapshot_version_text::uuid[\s\S]*new\.wholesale_lookup_fingerprint := v_snapshot_fingerprint/i,
    );
    expect(migration).toMatch(
      /before insert or update of[\s\S]*wholesale_version_id[\s\S]*wholesale_lookup_fingerprint[\s\S]*internal_cost_snapshot/i,
    );
    expect(migration).toMatch(
      /v_lookup_input := new\.internal_cost_snapshot -> 'wholesaleLookupInput'[\s\S]*public\.lookup_quote_v2_wholesale_cost\([\s\S]*v_verified_lookup ->> 'lookupFingerprint'[\s\S]*wholesaleUnitCostCents[\s\S]*productCostUnit[\s\S]*productCostTotal[\s\S]*line quantity/i,
    );
    for (const pricingSaveMigration of [
      singlePriceSaveMigration,
      batchPriceSaveMigration,
    ]) {
      expect(pricingSaveMigration).toMatch(
        /insert into public\.sales_quote_v2_price_snapshots[\s\S]*internal_cost_snapshot/i,
      );
    }
  });

  it("makes published versions, their sources, and all price content immutable", () => {
    expect(migration).toMatch(
      /tg_table_name = 'sales_quote_v2_wholesale_sources'[\s\S]*versions\.lifecycle in \('published', 'retired'\)[\s\S]*Sources used by published wholesale versions are immutable/i,
    );
    expect(migration).toMatch(
      /sales_quote_v2_wholesale_sources_immutable[\s\S]*before update or delete[\s\S]*reject_published_wholesale_ledger_mutation/i,
    );
    for (const table of [
      "sales_quote_v2_wholesale_version_sources",
      "sales_quote_v2_wholesale_programs",
      "sales_quote_v2_wholesale_price_cells",
      "sales_quote_v2_wholesale_option_components",
      "sales_quote_v2_wholesale_order_cost_rules",
    ]) {
      expect(migration).toContain(`'${table}'`);
    }
    expect(migration).toMatch(
      /old\.lifecycle = 'retired'[\s\S]*Retired wholesale versions are immutable[\s\S]*v_lifecycle in \('published', 'retired'\)[\s\S]*Published wholesale ledger content is immutable/i,
    );
    expect(migration).toMatch(
      /new\.lifecycle = 'retired'[\s\S]*new\.effective_until is not null[\s\S]*new\.effective_until >= old\.effective_from[\s\S]*'effective_until'/i,
    );
    expect(migration).toMatch(
      /Only a published wholesale version may be retired/i,
    );
    expect(migration).toMatch(
      /wholesale-source:[\s\S]*source_ids\.source_id[\s\S]*affected_versions\.manufacturer_id/i,
    );
  });

  it("fails closed on unknown or unpriced options and keeps billing scopes separate", () => {
    expect(migration).toMatch(
      /option_schema jsonb not null default '\{\}'::jsonb/i,
    );
    for (const code of [
      "WHOLESALE_OPTION_UNKNOWN",
      "WHOLESALE_OPTION_REQUIRED",
      "WHOLESALE_OPTION_VALUE_UNSUPPORTED",
      "WHOLESALE_OPTION_PRICE_MISSING",
      "WHOLESALE_OPTION_COMPONENT_AMBIGUOUS",
      "WHOLESALE_ORDER_COST_AMBIGUOUS",
      "WHOLESALE_ORDER_COST_POLICY_UNRESOLVED",
      "WHOLESALE_ORDER_COST_MISSING",
      "WHOLESALE_ORDER_COST_UNRESOLVED",
    ]) {
      expect(migration).toContain(code);
    }
    expect(migration).toMatch(
      /filter \(where components\.billing_scope = 'per_unit'\)[\s\S]*filter \(where components\.billing_scope = 'per_line_once'\)[\s\S]*filter \(where components\.billing_scope = 'per_order_once'\)/i,
    );
    expect(migration).toMatch(
      /v_total := v_cell\.cost_cents \+ v_per_unit_option_total/i,
    );
  });

  it("requires exact evidence authority for base, option, and order-cost categories", () => {
    expect(migration).toMatch(
      /sources\.authorities @> p_required_authorities[\s\S]*links\.authority_scope @> p_required_authorities/i,
    );
    expect(migration).toMatch(
      /v_untrusted_component_count[\s\S]*array\['option_cost'\]::text\[\]/i,
    );
    expect(migration).toMatch(
      /v_untrusted_order_rule_count[\s\S]*when rules\.rule_kind = 'other' then 'other_cost'[\s\S]*else rules\.rule_kind/i,
    );
    expect(migration).toMatch(
      /into v_untrusted_cell_count[\s\S]*programs\.cost_status = 'quote_ready'\s+and not public\.is_quote_v2_wholesale_source_authoritative/i,
    );
  });

  it("validates order-cost calculation shapes and blocks unsupported axes", () => {
    expect(migration).toMatch(
      /calculation = 'first_plus_additional'[\s\S]*first_unit_cost_cents is not null[\s\S]*additional_unit_cost_cents is not null/i,
    );
    expect(migration).toMatch(
      /calculation = 'unresolved'[\s\S]*rule_status in \('unresolved', 'quarantined'\)/i,
    );
    expect(migration).toContain("WHOLESALE_PRICE_AXIS_UNSUPPORTED");
  });

  it("does not seed or publish undocumented dollar values", () => {
    expect(migration).not.toMatch(
      /insert\s+into\s+public\.sales_quote_v2_wholesale_/i,
    );
    expect(migration).not.toMatch(
      /update\s+public\.sales_quote_v2_wholesale_versions[\s\S]*lifecycle\s*=\s*'published'/i,
    );
  });

  it("has no import path from public customer routes to the wholesale adapter", () => {
    const customerFiles = [
      resolve(process.cwd(), "src/lib/crm/public-quote.ts"),
      resolve(process.cwd(), "src/lib/crm/sales-quote-v2-send.ts"),
      ...readdirSync(resolve(process.cwd(), "src/app/api/quote"), {
        recursive: true,
      })
        .filter((entry) => String(entry).endsWith(".ts"))
        .map((entry) =>
          resolve(process.cwd(), "src/app/api/quote", String(entry)),
        ),
    ];
    for (const file of customerFiles) {
      const source = readFileSync(file, "utf8");
      expect(source).not.toContain("sales-quote-v2-wholesale-ledger");
      expect(source).not.toContain("/api/crm/quote-v2/wholesale/lookup");
    }
  });
});
