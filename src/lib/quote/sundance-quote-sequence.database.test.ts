import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, expect, it } from "vitest";

const db = new PGlite();
let otherManufacturersBefore: Counts;
const sourcePath = "data/order-entry/805-sundance-order-fields.json";
const sourceSha = "e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656";
const migrationPath = "supabase/migrations/20261122051000_sundance_quote_sequence_seed.sql";
const fieldFile = JSON.parse(readFileSync(sourcePath, "utf8")) as {
  order_level_fields: { sundance_order_header: Array<{ key: string; needs_live_form_check: boolean }> };
  products: Array<{
    category: string;
    status: string;
    portal_ordering_type: string;
    flags: string[];
    fields: Array<{ key: string; needs_live_form_check: boolean }>;
  }>;
};
const orderTypes = [
  "Portfolio Soft Roman",
  "Wovenwood",
  "Euro Panel",
  "Cellular Shade",
  "Clutch Roller",
  "Caress-Zebra",
  "SheerView Plus",
  "Motorized Roller",
  "Zipper Screen Exterior",
  "1-inch Aluminum",
  "2-inch Aluminum",
  "Vertical Essence",
  "2-inch Advantage",
  "2.5-inch Advantage",
  "2-inch Wood",
  "2.5-inch Wood",
  "Glydea Track",
];

type Counts = { sequences: number; choices: number; aliases: number; gaps: number };

async function otherManufacturerCounts(): Promise<Counts> {
  const query = await db.query<Counts>(`
    select
      (select count(*) from public.quote_category_field_sequence where manufacturer <> 'Sundance')::int as sequences,
      (select count(*) from public.quote_catalog_field_choice where manufacturer <> 'Sundance')::int as choices,
      (select count(*) from public.quote_sequence_field_alias where manufacturer <> 'Sundance')::int as aliases,
      (select count(*) from public.quote_sequence_catalog_gap where manufacturer <> 'Sundance')::int as gaps
  `);
  return query.rows[0];
}

beforeAll(async () => {
  await db.exec(readFileSync("supabase/migrations/20261121160000_quote_category_field_sequence.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/20261122020000_quote_sequence_field_file_corrections.sql", "utf8"));
  otherManufacturersBefore = await otherManufacturerCounts();
  await db.exec(readFileSync(migrationPath, "utf8"));
}, 180000);

afterAll(() => db.close());

it("keeps the copied field file hash and does not seed an account number", () => {
  const migration = readFileSync(migrationPath, "utf8");
  expect(createHash("sha256").update(readFileSync(sourcePath)).digest("hex")).toBe(sourceSha);
  expect(migration).toContain(sourceSha);
  expect(migration).not.toMatch(/\bdelete\s+from\b/i);
  expect(migration).not.toMatch(/\btruncate\b/i);
  expect(migration).not.toMatch(/\bdrop\s+(table|trigger|policy|constraint|function|index|schema)\b/i);
  expect(migration).not.toContain("ST0142");
  expect(migration).not.toContain("crm_vendor_accounts");
  expect(fieldFile.products).toHaveLength(30);
  expect(orderTypes).toHaveLength(17);
});

it("seeds 30 products and 17 order types without changing other manufacturers", async () => {
  const after = await otherManufacturerCounts();
  expect(after).toEqual(otherManufacturersBefore);

  const products = await db.query<{ count: number }>(`
    select count(distinct category)::int as count
    from public.quote_category_field_sequence
    where manufacturer = 'Sundance' and category not like 'order_type:%' and active
  `);
  expect(products.rows[0].count).toBe(30);
  const types = await db.query<{ category: string }>(`
    select distinct category
    from public.quote_category_field_sequence
    where manufacturer = 'Sundance' and category like 'order_type:%' and active
    order by category
  `);
  expect(types.rows.map((row) => row.category)).toEqual(
    orderTypes.map((name) => `order_type:${name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")}`).sort(),
  );

  const wildcard = await db.query<{ status: string }>(`
    select status from public.quote_sequence_catalog_gap
    where manufacturer = 'Sundance' and category = '*' and field_key is null
  `);
  expect(wildcard.rows[0].status).toBe("blocked");
  const sheerView = await db.query<{ result: { status: string; field_key: string | null; reason: string | null } }>(
    "select public.quote_next_required_field('{\"answers\":{}}'::jsonb, 'Sundance', 'sundance_sheerview') as result",
  );
  expect(sheerView.rows[0].result).toMatchObject({
    status: "blocked",
    field_key: "account_number",
    reason: "needs live form check",
  });

  const mounts = await db.query<{ choice_value: string }>(`
    select choice_value from public.quote_catalog_field_choice
    where manufacturer = 'Sundance' and category = 'sundance_sheerview' and field_key = 'mount_type' and active
    order by choice_value
  `);
  expect(mounts.rows.map((row) => row.choice_value)).toEqual(["Inside", "Outside"]);

  const flatRoman = await db.query<{ result: { status: string; reason: string } }>(
    "select public.quote_next_required_field('{}'::jsonb, 'Sundance', 'sundance_flat_roman') as result",
  );
  expect(flatRoman.rows[0].result.status).toBe("blocked");
  expect(flatRoman.rows[0].result.reason).toBe(fieldFile.products.find((product) => product.category === "sundance_flat_roman")?.flags[0]);

  const norman = await db.query<{ count: number }>(`
    select count(*)::int as count from public.quote_catalog_field_choice
    where manufacturer = 'Norman' and category = 'roller' and field_key = 'color_code' and choice_value = 'F1484' and active
  `);
  expect(norman.rows[0].count).toBeGreaterThan(0);
});

it("leaves every needs_live_form_check field incomplete and unsourced with choices", async () => {
  const liveFields = fieldFile.products.flatMap((product) => [...fieldFile.order_level_fields.sundance_order_header, ...product.fields]
    .filter((field) => field.needs_live_form_check)
    .map((field) => ({ category: product.category, field_key: field.key })));
  expect(liveFields.length).toBeGreaterThan(0);
  for (const field of liveFields) {
    const choices = await db.query<{ count: number }>(`
      select count(*)::int as count from public.quote_catalog_field_choice
      where manufacturer = 'Sundance' and category = $1 and field_key = $2 and active
    `, [field.category, field.field_key]);
    expect(choices.rows[0].count, `${field.category}.${field.field_key}`).toBe(0);
    const gap = await db.query<{ status: string; reason: string }>(`
      select status, reason from public.quote_sequence_catalog_gap
      where manufacturer = 'Sundance' and category = $1 and field_key = $2
    `, [field.category, field.field_key]);
    expect(gap.rows[0], `${field.category}.${field.field_key}`).toMatchObject({
      status: "incomplete",
      reason: "needs live form check",
    });
  }
  const accountChoices = await db.query<{ count: number }>(`
    select count(*)::int as count from public.quote_catalog_field_choice
    where manufacturer = 'Sundance' and choice_value ilike '%ST0142%'
  `);
  expect(accountChoices.rows[0].count).toBe(0);
});
