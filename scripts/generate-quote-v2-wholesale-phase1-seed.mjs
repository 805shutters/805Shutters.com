#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const catalogPath = `${repoRoot}/src/lib/quote/catalog/lotus-west-a26.catalog.json`;
const outputPath =
  `${repoRoot}/supabase/migrations/20260726131000_seed_quote_v2_wholesale_phase1_review.sql`;

const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
const lotusProduct = catalog.products.find(
  (product) => product.id === "lotus_faux_wood_blinds",
);
const lotusProgram = lotusProduct?.programs.find(
  (program) => program.id === "lotus_flx_2in_bright_white_custom",
);

if (!lotusProduct || !lotusProgram?.grid) {
  throw new Error("The pinned Lotus 2-inch Smooth Bright White grid is missing.");
}

const expectedLotusHash =
  "4e9aba91a601e1212a3e8a1531c361caf033c28ef6ca1fdac3ad6247502a982f";
const source = catalog.sources?.find((entry) => entry.file === "Lotus.pdf");
if (source?.sha256 !== expectedLotusHash) {
  throw new Error(`Unexpected Lotus source hash: ${source?.sha256 ?? "missing"}`);
}

const sha256 = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const quoted = (value) =>
  value == null ? "null" : `'${String(value).replaceAll("'", "''")}'`;
const jsonb = (value) => `${quoted(JSON.stringify(value))}::jsonb`;
const textArray = (values) =>
  values.length
    ? `array[${values.map(quoted).join(",")}]::text[]`
    : "'{}'::text[]";

const sources = [
  {
    key: "lotus-west-a26-v1",
    manufacturer: "lotus",
    type: "price_book",
    file: "Lotus.pdf",
    title: "Cost Book & Supplier Manual",
    revision: "West A26.v1",
    effectiveFrom: null,
    receivedOn: "2026-07-20",
    sha256: expectedLotusHash,
    authorities: [
      "dealer_cost",
      "restrictions",
      "options",
      "freight",
      "other_cost",
    ],
    runtimeAuthority: false,
    accountKey: null,
    accountScope: "Manufacturer West-region dealer cost book",
    productKeys: ["lotus_faux_wood_blinds"],
    programKeys: ["lotus_flx_2in_bright_white_custom"],
    productScope: { products: ["lotus_faux_wood_blinds"] },
    provenance: {
      modifiedDate: "2026-04-01",
      pageCount: 113,
      effectiveDateEvidence: "No effective date stated in the supplied document",
    },
    quarantineReason:
      "The supplied dealer cost book states no effective date; normalized cells remain review evidence until current applicability is established.",
  },
  {
    key: "lotus-three-product-cart-2026-07-22",
    manufacturer: "lotus",
    type: "dealer_portal_snapshot",
    file: "lotus-three-product-cart-2026-07-22.md",
    title: "Current 805 Lotus three-product cart evidence receipt",
    revision: "Read-only dealer cart observed 2026-07-22",
    effectiveFrom: null,
    receivedOn: "2026-07-22",
    sha256: "01c9f02fd4c40ff93daa10c7021207f16081c2ef4de90f9c04f2eb4771c9be28",
    authorities: ["dealer_cost_observation"],
    runtimeAuthority: false,
    accountKey: "805",
    accountScope: "Current authenticated 805 Lotus dealer account",
    productKeys: ["lotus_faux_wood_blinds"],
    programKeys: ["lotus_fcx_2in_soft_white_custom"],
    productScope: {
      observedPrograms: [
        "lotus_amx_1in_aluminum_custom",
        "lotus_fcx_2in_soft_white_custom",
        "lotus_vs_steel_complete_stock",
      ],
    },
    provenance: {
      captureMode: "read_only_unsubmitted_cart",
      customerDataRetained: false,
    },
    quarantineReason:
      "The observed Soft White faux-wood cart price conflicts with the cost book and does not verify the requested Smooth Bright White program.",
  },
  {
    key: "norman-retail-guide-2026-07",
    manufacturer: "norman",
    type: "price_book",
    file: "2026Jul Retail Price Guide (1).pdf",
    title: "2026 Retail Guide",
    revision: "2026-07",
    effectiveFrom: "2026-07-01",
    receivedOn: "2026-07-20",
    sha256: "ae102c19b833e5c20070c11ecaad61d68a79bf6b52b5402fad55415e2602d2f3",
    authorities: ["retail_pricing", "options", "freight"],
    runtimeAuthority: false,
    accountKey: null,
    accountScope: "Manufacturer retail guide",
    productKeys: ["smartprivacy_faux", "faux_wood"],
    programKeys: [
      "smartprivacy_faux_2in_and_2_1_2in_slats_cordless",
      "faux_wood_2in_and_2_1_2in_slats_cordless",
    ],
    productScope: {
      products: ["smartprivacy_faux", "faux_wood"],
      pages: [30, 31],
    },
    provenance: {
      effectiveDateEvidence: "Cover: Effective July 1st, 2026",
      pageCount: 40,
    },
    quarantineReason:
      "This source is authoritative for list pricing and options, not the current 805 dealer wholesale factor.",
  },
  {
    key: "norman-dealer-pricing-snapshot-2026-07-20",
    manufacturer: "norman",
    type: "dealer_portal_snapshot",
    file: "NORMAN PRICING.pdf",
    title: "Product Pricing (other dealer account)",
    revision: "Other-dealer portal print dated 2026-07-20",
    effectiveFrom: null,
    receivedOn: "2026-07-20",
    sha256: "fdf0af921d137d778d6890b7afa97342045bd50d05a4838afc116b6c400f3044",
    authorities: ["dealer_factor_observation", "freight_observation"],
    runtimeAuthority: false,
    accountKey: "other_dealer",
    accountScope: "Other Norman dealer account, not the current 805 account",
    productKeys: ["smartprivacy_faux", "faux_wood"],
    programKeys: [
      "smartprivacy_faux_2in_and_2_1_2in_slats_cordless",
      "faux_wood_2in_and_2_1_2in_slats_cordless",
    ],
    productScope: {
      products: ["smartprivacy_faux", "faux_wood"],
      observedStandardFactor: 0.3,
    },
    provenance: {
      captureDate: "2026-07-20",
      customerIdRedacted: true,
    },
    quarantineReason:
      "The source belongs to a different dealer account and cannot authorize current 805 wholesale cost.",
  },
  {
    key: "norman-805-live-roller-portal-2026-07-21",
    manufacturer: "norman",
    type: "dealer_portal_snapshot",
    file: "Norman Roller Current Portal 2026-07-22.redacted.png",
    title: "Current 805 Norman Roller dealer-cost fixture",
    revision: "Read-only unsubmitted Roller draft observed 2026-07-21",
    effectiveFrom: "2026-07-21",
    receivedOn: "2026-07-22",
    sha256: "34f7e0bb5703d8248549ec795e198208237d316a344b884199881d73c8a26869",
    authorities: ["dealer_cost", "freight", "processing"],
    runtimeAuthority: true,
    accountKey: "805",
    accountScope: "Current authenticated 805 Norman dealer account",
    productKeys: ["roller"],
    programKeys: ["roller_cordless_fabric_price_group_1_pg1"],
    productScope: {
      products: ["roller"],
      standardFactor: 0.33,
      slowerScheduleFactor: 0.297,
    },
    provenance: {
      captureMode: "read_only_unsubmitted_draft",
      accountIdRedacted: true,
    },
    quarantineReason: null,
  },
];

const cells = [];
lotusProgram.grid.heights.forEach((height, heightIndex) => {
  lotusProgram.grid.widths.forEach((width, widthIndex) => {
    const cost = lotusProgram.grid.costs[heightIndex]?.[widthIndex] ?? null;
    const skuCodes =
      lotusProgram.grid.skuCodes?.[heightIndex]?.[widthIndex] ?? [];
    const sourceNote =
      lotusProgram.grid.cellNotes?.[heightIndex]?.[widthIndex] ?? null;
    const normalized = {
      programKey: lotusProgram.id,
      width,
      height,
      cost,
      skuCodes,
      sourcePage: 99,
      sourceNote,
    };
    cells.push({
      ...normalized,
      availability: cost == null ? "unavailable" : "priced",
      fingerprint: sha256(normalized),
    });
  });
});

if (cells.length !== 119 || cells.filter((cell) => cell.cost != null).length !== 111) {
  throw new Error(
    `Unexpected Lotus grid shape: ${cells.length} cells / ` +
      `${cells.filter((cell) => cell.cost != null).length} priced`,
  );
}

const lotusVersionPayload = {
  manufacturer: "lotus",
  versionKey: "lotus-west-a26-v1-phase1-faux-wood",
  sourceKeys: [
    "lotus-west-a26-v1",
    "lotus-three-product-cart-2026-07-22",
  ],
  program: {
    productKey: lotusProduct.id,
    programKey: lotusProgram.id,
    styleKey: "smooth",
    colorKey: "bright_white",
    status: "documented_not_published",
  },
  cells,
};
const normanVersionPayload = {
  manufacturer: "norman",
  versionKey: "norman-805-faux-wood-phase1",
  sourceKeys: [
    "norman-retail-guide-2026-07",
    "norman-dealer-pricing-snapshot-2026-07-20",
    "norman-805-live-roller-portal-2026-07-21",
  ],
  programs: [
    {
      productKey: "smartprivacy_faux",
      programKey: "smartprivacy_faux_2in_and_2_1_2in_slats_cordless",
      colorKey: "pure_white",
      status: "account_scope_unverified",
    },
    {
      productKey: "faux_wood",
      programKey: "faux_wood_2in_and_2_1_2in_slats_cordless",
      styleKey: "premium_ultimate",
      colorKey: "pure_white",
      status: "account_scope_unverified",
    },
  ],
};

const sourceRows = sources
  .map(
    (item) => `(
  ${quoted(item.key)},
  ${quoted(item.manufacturer)},
  ${quoted(item.type)},
  ${quoted(item.file)},
  ${quoted(item.title)},
  ${quoted(item.revision)},
  ${quoted(item.effectiveFrom)}::date,
  ${quoted(item.receivedOn)}::date,
  ${quoted(item.sha256)},
  ${textArray(item.authorities)},
  ${item.runtimeAuthority ? "true" : "false"},
  ${quoted(item.accountKey)},
  ${quoted(item.accountScope)},
  ${textArray(item.productKeys)},
  ${textArray(item.programKeys)},
  ${jsonb(item.productScope)},
  ${jsonb(item.provenance)},
  ${quoted(item.quarantineReason)}
)`,
  )
  .join(",\n");

const cellRows = cells
  .map(
    (cell) => `(
  ${cell.width},
  ${cell.height},
  ${quoted(cell.availability)},
  ${cell.cost == null ? "null" : Math.round(cell.cost * 100)},
  'USD',
  ${textArray(cell.skuCodes)},
  ${jsonb({ page: 99, note: cell.sourceNote })},
  ${quoted(cell.fingerprint)}
)`,
  )
  .join(",\n");

const sql = `-- Generated by scripts/generate-quote-v2-wholesale-phase1-seed.mjs.
-- Phase 1 evidence inventory only. No wholesale version is published here.
-- Quote-time lookup remains fail-closed until exact current-account evidence
-- is reviewed and a separate explicit publication changes lifecycle.

insert into public.sales_quote_v2_manufacturers (name, code)
values ('Lotus', 'lotus'), ('Norman', 'norman')
on conflict (code) do update set name = excluded.name;

insert into public.sales_quote_v2_wholesale_sources (
  source_key,
  manufacturer_code,
  source_type,
  file_name,
  title,
  revision,
  effective_from,
  received_on,
  sha256,
  authorities,
  runtime_authority,
  account_key,
  account_scope,
  product_keys,
  program_keys,
  product_scope,
  provenance,
  quarantine_reason
)
values
${sourceRows}
on conflict (source_key) do update set
  manufacturer_code = excluded.manufacturer_code,
  source_type = excluded.source_type,
  file_name = excluded.file_name,
  title = excluded.title,
  revision = excluded.revision,
  effective_from = excluded.effective_from,
  received_on = excluded.received_on,
  sha256 = excluded.sha256,
  authorities = excluded.authorities,
  runtime_authority = excluded.runtime_authority,
  account_key = excluded.account_key,
  account_scope = excluded.account_scope,
  product_keys = excluded.product_keys,
  program_keys = excluded.program_keys,
  product_scope = excluded.product_scope,
  provenance = excluded.provenance,
  quarantine_reason = excluded.quarantine_reason;

insert into public.sales_quote_v2_wholesale_versions (
  manufacturer_id,
  version_key,
  scope_key,
  lifecycle,
  effective_from,
  account_key,
  account_scope,
  coverage,
  content_sha256,
  review_notes
)
select
  manufacturers.id,
  'lotus-west-a26-v1-phase1-faux-wood',
  'lotus_faux_wood_blinds',
  'review',
  null,
  '805',
  'Current 805 quoting account',
  ${jsonb({
    phase: 1,
    product: "Lotus standard 2-inch faux wood",
    programKey: lotusProgram.id,
    styleKey: "smooth",
    colorKey: "bright_white",
    pricedCells: 111,
    blockedCells: 8,
  })},
  ${quoted(sha256(lotusVersionPayload))},
  'Dealer-net matrix is documented. Publication is blocked by the absent source effective date, unresolved portal/book conflict on another faux-wood program, and the need to bind the requested generic white label to an exact program/color.'
from public.sales_quote_v2_manufacturers manufacturers
where manufacturers.code = 'lotus'
on conflict (manufacturer_id, account_key, scope_key, version_key) do update set
  lifecycle = excluded.lifecycle,
  effective_from = excluded.effective_from,
  account_key = excluded.account_key,
  account_scope = excluded.account_scope,
  coverage = excluded.coverage,
  content_sha256 = excluded.content_sha256,
  review_notes = excluded.review_notes,
  updated_at = now();

insert into public.sales_quote_v2_wholesale_versions (
  manufacturer_id,
  version_key,
  scope_key,
  lifecycle,
  effective_from,
  account_key,
  account_scope,
  coverage,
  content_sha256,
  review_notes
)
select
  manufacturers.id,
  'norman-805-faux-wood-phase1',
  'faux_wood_blinds',
  'draft',
  null,
  '805',
  'Current 805 Norman dealer account',
  ${jsonb({
    phase: 1,
    products: [
      "Norman SmartPrivacy 2-inch Pure White",
      "Norman Premium/Ultimate 2-inch Pure White",
    ],
  })},
  ${quoted(sha256(normanVersionPayload))},
  'Current list grids and color identity exist. No exact current-805 dealer-cost fixture covers SmartPrivacy or Ultimate faux wood; the other-account .3000 factor is quarantined and the current .330/.297 fixture is Roller-only.'
from public.sales_quote_v2_manufacturers manufacturers
where manufacturers.code = 'norman'
on conflict (manufacturer_id, account_key, scope_key, version_key) do update set
  lifecycle = excluded.lifecycle,
  effective_from = excluded.effective_from,
  account_key = excluded.account_key,
  account_scope = excluded.account_scope,
  coverage = excluded.coverage,
  content_sha256 = excluded.content_sha256,
  review_notes = excluded.review_notes,
  updated_at = now();

insert into public.sales_quote_v2_wholesale_version_sources (
  wholesale_version_id,
  source_id,
  authority_scope,
  source_priority
)
select versions.id, sources.id, mapping.authority_scope, mapping.source_priority
from (
  values
    ('lotus-west-a26-v1-phase1-faux-wood', 'lotus-west-a26-v1',
      array['dealer_cost','options','freight','other_cost']::text[], 10),
    ('lotus-west-a26-v1-phase1-faux-wood',
      'lotus-three-product-cart-2026-07-22',
      array['conflict_observation']::text[], 20),
    ('norman-805-faux-wood-phase1', 'norman-retail-guide-2026-07',
      array['retail_grid','options']::text[], 10),
    ('norman-805-faux-wood-phase1',
      'norman-dealer-pricing-snapshot-2026-07-20',
      array['quarantined_other_account_factor']::text[], 20),
    ('norman-805-faux-wood-phase1',
      'norman-805-live-roller-portal-2026-07-21',
      array['roller_only_current_account_factor','freight']::text[], 30)
) as mapping(version_key, source_key, authority_scope, source_priority)
join public.sales_quote_v2_wholesale_versions versions
  on versions.version_key = mapping.version_key
join public.sales_quote_v2_wholesale_sources sources
  on sources.source_key = mapping.source_key
on conflict (wholesale_version_id, source_id) do update set
  authority_scope = excluded.authority_scope,
  source_priority = excluded.source_priority;

with version as (
  select versions.id
    from public.sales_quote_v2_wholesale_versions versions
    join public.sales_quote_v2_manufacturers manufacturers
      on manufacturers.id = versions.manufacturer_id
   where manufacturers.code = 'lotus'
     and versions.version_key = 'lotus-west-a26-v1-phase1-faux-wood'
), source as (
  select id
    from public.sales_quote_v2_wholesale_sources
   where source_key = 'lotus-west-a26-v1'
)
insert into public.sales_quote_v2_wholesale_programs (
  wholesale_version_id,
  manufacturer_code,
  product_key,
  program_key,
  style_key,
  color_key,
  display_name,
  cost_status,
  price_axis,
  max_width,
  max_height,
  configuration,
  option_schema,
  source_id,
  source_locator
)
select
  version.id,
  'lotus',
  'lotus_faux_wood_blinds',
  'lotus_flx_2in_bright_white_custom',
  'smooth',
  'bright_white',
  '2-inch Faux Wood, Smooth Bright White - Custom Cut',
  'documented_not_published',
  'width_height',
  95,
  96,
  ${jsonb({
    slatSize: "2",
    material: "faux_wood",
    finish: "smooth",
    color: "Bright White",
    dimensionRounding: "next_grid_cell",
  })},
  '{}'::jsonb,
  source.id,
  ${jsonb({ page: 99 })}
from version cross join source
on conflict (
  wholesale_version_id,
  product_key,
  program_key,
  style_key,
  color_key
) do update set
  display_name = excluded.display_name,
  cost_status = excluded.cost_status,
  price_axis = excluded.price_axis,
  max_width = excluded.max_width,
  max_height = excluded.max_height,
  configuration = excluded.configuration,
  option_schema = excluded.option_schema,
  source_id = excluded.source_id,
  source_locator = excluded.source_locator;

with program as (
  select programs.id
    from public.sales_quote_v2_wholesale_programs programs
    join public.sales_quote_v2_wholesale_versions versions
      on versions.id = programs.wholesale_version_id
   where versions.version_key = 'lotus-west-a26-v1-phase1-faux-wood'
     and programs.program_key = 'lotus_flx_2in_bright_white_custom'
), source as (
  select id
    from public.sales_quote_v2_wholesale_sources
   where source_key = 'lotus-west-a26-v1'
)
insert into public.sales_quote_v2_wholesale_price_cells (
  program_id,
  width_ceiling,
  height_ceiling,
  availability,
  cost_cents,
  currency,
  sku_codes,
  source_id,
  source_locator,
  cell_fingerprint
)
select
  program.id,
  generated.width_ceiling,
  generated.height_ceiling,
  generated.availability,
  generated.cost_cents,
  generated.currency,
  generated.sku_codes,
  source.id,
  generated.source_locator,
  generated.cell_fingerprint
from program
cross join source
cross join (
  values
${cellRows}
) as generated(
  width_ceiling,
  height_ceiling,
  availability,
  cost_cents,
  currency,
  sku_codes,
  source_locator,
  cell_fingerprint
)
on conflict (program_id, width_ceiling, height_ceiling) do update set
  availability = excluded.availability,
  cost_cents = excluded.cost_cents,
  currency = excluded.currency,
  sku_codes = excluded.sku_codes,
  source_id = excluded.source_id,
  source_locator = excluded.source_locator,
  cell_fingerprint = excluded.cell_fingerprint;

with version as (
  select versions.id
    from public.sales_quote_v2_wholesale_versions versions
   where versions.version_key = 'norman-805-faux-wood-phase1'
), source as (
  select id
    from public.sales_quote_v2_wholesale_sources
   where source_key = 'norman-retail-guide-2026-07'
)
insert into public.sales_quote_v2_wholesale_programs (
  wholesale_version_id,
  manufacturer_code,
  product_key,
  program_key,
  style_key,
  color_key,
  display_name,
  cost_status,
  price_axis,
  configuration,
  option_schema,
  source_id,
  source_locator
)
select version.id, 'norman', rows.product_key, rows.program_key,
       rows.style_key, 'pure_white', rows.display_name,
       'account_scope_unverified', 'width_height',
       rows.configuration, '{}'::jsonb, source.id, rows.source_locator
from version cross join source cross join (
  values
    (
      'smartprivacy_faux',
      'smartprivacy_faux_2in_and_2_1_2in_slats_cordless',
      '',
      'Norman SmartPrivacy 2-inch Pure White',
      ${jsonb({
        slatSize: "2",
        colorName: "Pure White",
        wholesaleGap: "current_805_product_factor_unverified",
      })},
      ${jsonb({ page: 31 })}
    ),
    (
      'faux_wood',
      'faux_wood_2in_and_2_1_2in_slats_cordless',
      'premium_ultimate',
      'Norman Premium / Ultimate 2-inch Pure White',
      ${jsonb({
        slatSize: "2",
        colorName: "Pure White",
        productAlias: "Premium",
        catalogProductName: "Ultimate",
        wholesaleGap: "current_805_product_factor_unverified",
      })},
      ${jsonb({ page: 30 })}
    )
) as rows(
  product_key,
  program_key,
  style_key,
  display_name,
  configuration,
  source_locator
)
on conflict (
  wholesale_version_id,
  product_key,
  program_key,
  style_key,
  color_key
) do update set
  display_name = excluded.display_name,
  cost_status = excluded.cost_status,
  configuration = excluded.configuration,
  source_id = excluded.source_id,
  source_locator = excluded.source_locator;

with versions as (
  select versions.id, manufacturers.code
    from public.sales_quote_v2_wholesale_versions versions
    join public.sales_quote_v2_manufacturers manufacturers
      on manufacturers.id = versions.manufacturer_id
   where versions.version_key in (
     'lotus-west-a26-v1-phase1-faux-wood',
     'norman-805-faux-wood-phase1'
   )
), sources as (
  select id, source_key
    from public.sales_quote_v2_wholesale_sources
   where source_key = 'lotus-west-a26-v1'
)
insert into public.sales_quote_v2_wholesale_order_cost_rules (
  wholesale_version_id,
  manufacturer_code,
  product_key,
  program_key,
  rule_key,
  label,
  rule_kind,
  calculation,
  first_unit_cost_cents,
  additional_unit_cost_cents,
  flat_cost_cents,
  rate_basis_points,
  threshold_cents,
  threshold_operator,
  required_options,
  rule_status,
  source_id,
  source_locator
)
select versions.id, rows.manufacturer_code, rows.product_key, rows.program_key,
       rows.rule_key, rows.label, rows.rule_kind, rows.calculation,
       rows.first_unit_cost_cents, rows.additional_unit_cost_cents,
       rows.flat_cost_cents, rows.rate_basis_points, rows.threshold_cents,
       rows.threshold_operator, rows.required_options, rows.rule_status,
       sources.id, rows.source_locator
from (
  values
    (
      'lotus', 'lotus_faux_wood_blinds',
      'lotus_flx_2in_bright_white_custom',
      'lotus_small_order_under_50',
      'Small order under $50',
      'other', 'flat', null::bigint, null::bigint, 500::bigint,
      null::integer, 5000::bigint, 'subtotal_lt', '{}'::jsonb, 'authoritative',
      'lotus-west-a26-v1', ${jsonb({ page: 2 })}
    ),
    (
      'lotus', 'lotus_faux_wood_blinds',
      'lotus_flx_2in_bright_white_custom',
      'lotus_freight_free_above_2500',
      'Complimentary prepaid freight above $2,500',
      'freight', 'free_above_threshold', null::bigint, null::bigint,
      0::bigint, null::integer, 250000::bigint, 'subtotal_gte', '{}'::jsonb,
      'authoritative', 'lotus-west-a26-v1', ${jsonb({ page: 2 })}
    ),
    (
      'lotus', 'lotus_faux_wood_blinds',
      'lotus_flx_2in_bright_white_custom',
      'lotus_freight_below_2500_unresolved',
      'Freight below $2,500 is not priced by the source',
      'freight', 'unresolved', null::bigint, null::bigint, null::bigint,
      null::integer, 250000::bigint, 'subtotal_lt', '{}'::jsonb, 'unresolved',
      'lotus-west-a26-v1', ${jsonb({ page: 2 })}
    )
) as rows(
  manufacturer_code,
  product_key,
  program_key,
  rule_key,
  label,
  rule_kind,
  calculation,
  first_unit_cost_cents,
  additional_unit_cost_cents,
  flat_cost_cents,
  rate_basis_points,
  threshold_cents,
  threshold_operator,
  required_options,
  rule_status,
  source_key,
  source_locator
)
join versions on versions.code = rows.manufacturer_code
join sources on sources.source_key = rows.source_key
on conflict (wholesale_version_id, product_key, program_key, rule_key)
do update set
  label = excluded.label,
  rule_kind = excluded.rule_kind,
  calculation = excluded.calculation,
  first_unit_cost_cents = excluded.first_unit_cost_cents,
  additional_unit_cost_cents = excluded.additional_unit_cost_cents,
  flat_cost_cents = excluded.flat_cost_cents,
  rate_basis_points = excluded.rate_basis_points,
  threshold_cents = excluded.threshold_cents,
  threshold_operator = excluded.threshold_operator,
  required_options = excluded.required_options,
  rule_status = excluded.rule_status,
  source_id = excluded.source_id,
  source_locator = excluded.source_locator;

update public.sales_quote_v2_wholesale_versions versions
   set content_sha256 =
       public.compute_quote_v2_wholesale_version_content_sha256(versions.id),
       updated_at = now()
 where versions.version_key in (
   'lotus-west-a26-v1-phase1-faux-wood',
   'norman-805-faux-wood-phase1'
 );
`;

writeFileSync(outputPath, sql);
console.log(
  `Wrote ${outputPath} with ${cells.length} Lotus grid cells ` +
    `(${cells.filter((cell) => cell.cost != null).length} priced).`,
);
