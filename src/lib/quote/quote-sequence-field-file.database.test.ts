import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, expect, it } from "vitest";

const db = new PGlite();
const sourcePath = "supabase/seed-sources/805-order-entry-fields.json";
const sourceSha = "2b54653e7e95ea8adbba325853653fb22f83c327edefd55dff6363ff54bed8fd";
const fieldFile = JSON.parse(readFileSync(sourcePath, "utf8")) as {
  global_issues: string[];
  sundance: { flag: string; status: string };
  products: Array<{
    manufacturer: string;
    category: string;
    status: string;
    flags: string[];
    fields: Array<{ key: string; conditional: string; ask_order: number }>;
  }>;
};

type Result = {
  status: string;
  reason: string | null;
  field_key: string | null;
  input_kind: string | null;
  choices: Array<{ value: string; label: string }>;
  catalog_version: string | null;
};

async function nextField(spec: unknown, manufacturer: string, category: string): Promise<Result> {
  const query = await db.query<{ result: Result }>(
    "select public.quote_next_required_field($1::jsonb, $2, $3) as result",
    [JSON.stringify(spec), manufacturer, category],
  );
  return query.rows[0].result;
}

async function fill(result: Result, overrides: Record<string, unknown>) {
  const key = result.field_key ?? "";
  if (key in overrides) return overrides[key];
  if (result.input_kind === "buttons") return result.choices[0]?.value;
  if (key === "ordered_width") return 36.125;
  if (key === "ordered_height" || key === "quantity" || key === "portal_line_quantity") return key === "ordered_height" ? 60 : 1;
  const choices = await db.query<{ choice_value: string }>(
    `select choice_value from public.quote_catalog_field_choice
     where field_key = $1 and active and choice_value <> ''
     order by id limit 1`,
    [key],
  );
  if (choices.rows[0] && /width|height|position/.test(key)) {
    return { whole: "24", fraction: choices.rows[0].choice_value };
  }
  return "Office";
}

async function walk(manufacturer: string, category: string, overrides: Record<string, unknown>) {
  const answers: Record<string, unknown> = {};
  const asked: string[] = [];
  let result = await nextField({ answers }, manufacturer, category);
  for (let step = 0; step < 50 && result.field_key && result.status !== "blocked" && result.status !== "complete"; step += 1) {
    asked.push(result.field_key);
    const value = await fill(result, overrides);
    if (value === undefined) break;
    answers[result.field_key] = value;
    result = await nextField({ answers }, manufacturer, category);
  }
  return { result, asked, answers };
}

beforeAll(async () => {
  await db.exec(readFileSync("supabase/migrations/20261121160000_quote_category_field_sequence.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/20261122020000_quote_sequence_field_file_corrections.sql", "utf8"));
  await db.exec(`
    create schema if not exists auth;
    create or replace function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
  `);
}, 180000);

afterAll(() => db.close());

it("reads the copied field file at the recorded sha256", () => {
  expect(createHash("sha256").update(readFileSync(sourcePath)).digest("hex")).toBe(sourceSha);
  expect(fieldFile.products).toHaveLength(43);
});

it("requires a conditional field only when its condition holds", async () => {
  const cordless = await walk("Norman", "roller", { control_type: "Cordless", collection: "Amelia", color_name: "Mist Gray", color_code: "F1484" });
  expect(cordless.result.status).not.toBe("blocked");
  expect(cordless.asked).toContain("valance_fascia_type");
  expect(cordless.asked).not.toContain("motor_brand_series");
  expect(cordless.asked).not.toContain("remote_channel");
  expect(cordless.asked).not.toContain("chain_cord_type");
  expect(cordless.asked).not.toContain("charging_wiring_option");

  const motorized = await walk("Norman", "roller", { control_type: "Motorized", collection: "Amelia", color_name: "Mist Gray", color_code: "F1484" });
  expect(motorized.asked).toContain("motor_brand_series");
  expect(motorized.asked).toContain("remote_channel");
  expect(motorized.asked).not.toContain("chain_cord_type");

  const skipped = await db.query<{ result: { ok: boolean; reason: string } }>(
    "select public.quote_validate_tapped_value($1::jsonb, 'Norman', 'roller', 'remote_channel', '\"1\"'::jsonb) as result",
    [JSON.stringify({ answers: { control_type: "Cordless" } })],
  );
  expect(skipped.rows[0].result).toMatchObject({ ok: false, reason: "field does not apply" });
  const required = await db.query<{ result: { ok: boolean; reason: string | null } }>(
    "select public.quote_validate_tapped_value($1::jsonb, 'Norman', 'roller', 'remote_channel', '\"1\"'::jsonb) as result",
    [JSON.stringify({ answers: { control_type: "Motorized" } })],
  );
  expect(required.rows[0].result.ok).toBe(true);

  const plainDoor = await db.query<{ result: { ok: boolean; reason: string } }>(
    "select public.quote_validate_tapped_value($1::jsonb, 'Onyx', 'vinyl', 'french_door', '\"Office\"'::jsonb) as result",
    [JSON.stringify({ answers: { shutter_type: "Regular" } })],
  );
  expect(plainDoor.rows[0].result).toMatchObject({ ok: false, reason: "field does not apply" });
  const frenchDoor = await db.query<{ result: { ok: boolean; reason: string | null } }>(
    "select public.quote_validate_tapped_value($1::jsonb, 'Onyx', 'vinyl', 'french_door', '\"Office\"'::jsonb) as result",
    [JSON.stringify({ answers: { shutter_type: "French Door" } })],
  );
  expect(frenchDoor.rows[0].result.ok).toBe(true);
  const standardRail = await db.query<{ result: { reason: string } }>(
    "select public.quote_validate_tapped_value($1::jsonb, 'Onyx', 'vinyl', 'divider_position', '\"12\"'::jsonb) as result",
    [JSON.stringify({ answers: { divider_rail: "Standard" } })],
  );
  expect(standardRail.rows[0].result.reason).toBe("field does not apply");
  const customRail = await db.query<{ result: { ok: boolean } }>(
    "select public.quote_validate_tapped_value($1::jsonb, 'Onyx', 'vinyl', 'divider_position', '\"12\"'::jsonb) as result",
    [JSON.stringify({ answers: { divider_rail: "Custom" } })],
  );
  expect(customRail.rows[0].result.ok).toBe(true);
});

it("replaces roller colors on blinds and honeycombs and Norman roller fields on Polar", async () => {
  const stale = await db.query<{ count: number }>(`
    select count(*)::int as count from public.quote_catalog_field_choice
    where manufacturer = 'Norman'
      and category in ('wood_blinds', 'faux_wood', 'smartprivacy_faux', 'citylights_aluminum', 'honeycomb', 'vertical_honeycomb', 'palladian_shelf')
      and field_key in ('color_name', 'color_code')
      and active
  `);
  expect(stale.rows[0].count).toBe(0);
  const retired = await db.query<{ count: number }>(`
    select count(*)::int as count from public.quote_catalog_field_choice
    where manufacturer = 'Norman' and category = 'wood_blinds' and field_key = 'color_code' and choice_value = 'F1484' and active = false
  `);
  expect(retired.rows[0].count).toBeGreaterThan(0);
  const rollerStillHasFabric = await db.query<{ count: number }>(`
    select count(*)::int as count from public.quote_catalog_field_choice
    where manufacturer = 'Norman' and category = 'roller' and field_key = 'color_code' and choice_value = 'F1484' and active
  `);
  expect(rollerStillHasFabric.rows[0].count).toBeGreaterThan(0);

  const blind = await walk("Norman", "wood_blinds", {});
  expect(blind.result).toMatchObject({ status: "blocked", field_key: "color_name" });
  expect(blind.result.reason).toMatch(/Real color list needed/);
  const honeycomb = await walk("Norman", "honeycomb", {});
  expect(honeycomb.result).toMatchObject({ status: "blocked", field_key: "color_name" });

  const polar = await walk("Polar", "elite_patio", {});
  expect(polar.asked).toContain("guide");
  expect(polar.asked).not.toContain("collection");
  expect(polar.asked).not.toContain("color_code");
  const beforeGuide = Object.fromEntries(Object.entries(polar.answers).filter(([key]) => !["guide", "motor", "valance", "hardware_color"].includes(key)));
  const guideStep = await nextField({ answers: beforeGuide }, "Polar", "elite_patio");
  expect(guideStep.field_key).toBe("guide");
  expect(guideStep.choices.map((choice) => choice.value)).toEqual(["Cable", "Side Channel", "ZipRite track"]);
  const afterGuide = { ...beforeGuide, guide: "Cable" };
  const motor = await nextField({ answers: afterGuide }, "Polar", "elite_patio");
  expect(motor.choices.map((choice) => choice.value)).toEqual(["Somfy Standard", "Somfy RTS", "Somfy RS485"]);
  const valance = await nextField({ answers: { ...afterGuide, motor: "Somfy RTS" } }, "Polar", "elite_patio");
  expect(valance.choices.map((choice) => choice.value)).toEqual(["Cassette", "Hood", "Head pocket"]);
  const hardware = await nextField({ answers: { ...afterGuide, motor: "Somfy RTS", valance: "Hood" } }, "Polar", "elite_patio");
  expect(hardware.choices.map((choice) => choice.value)).toEqual(["White", "Tan", "Bronze", "Sand", "Camel", "Black", "Custom RAL"]);
  const polarRollerFabrics = await db.query<{ count: number }>(`
    select count(*)::int as count from public.quote_catalog_field_choice
    where manufacturer = 'Polar' and category = 'elite_patio' and field_key in ('collection', 'color_code', 'valance_fascia_type') and active
  `);
  expect(polarRollerFabrics.rows[0].count).toBe(0);
});

it("maps the seven CRM saved keys and resolves each one", async () => {
  const sentence = fieldFile.global_issues.find((issue) => issue.includes("quote_sequence_field_alias"));
  expect(sentence).toBeTruthy();
  const pairs = [
    ["color_code", "fabric_color_code"],
    ["color_name", "fabric_color_name"],
    ["collection", "fabric_collection"],
    ["collection", "fabric_color_collection"],
    ["control_type", "lift_system"],
    ["valance_fascia_type", "valance"],
    ["valance_fascia_type", "roller_top_treatment"],
    ["valance_fascia_type", "top_treatment_class"],
    ["panel_configuration", "panel_config"],
    ["room_location", "room_name"],
  ];
  expect(new Set(pairs.map(([schema]) => schema)).size).toBe(7);
  for (const [schema, saved] of pairs) {
    expect(sentence).toContain(`${schema}->`);
    expect(sentence).toContain(saved);
    const row = await db.query<{ catalog_version: string; manufacturer: string; category: string }>(`
      select manufacturer, category, catalog_version from public.quote_sequence_field_alias
      where schema_field_key = $1 and saved_key = $2 and active
      limit 1
    `, [schema, saved]);
    expect(row.rows[0]).toBeTruthy();
    const resolved = await db.query<{ value: string }>(
      "select public.quote_sequence_field_answer($1::jsonb, $2, $3, $4, $5)#>>'{}' as value",
      [JSON.stringify({ [saved]: "saved-value" }), row.rows[0].manufacturer, row.rows[0].category, row.rows[0].catalog_version, schema],
    );
    expect(resolved.rows[0].value).toBe("saved-value");
  }
  const conflict = await db.query<{ conflict: boolean }>(`
    select public.quote_sequence_answer_conflict(
      '{"valance_fascia_type":"F014","valance":"F001","roller_top_treatment":"F014"}'::jsonb,
      'Norman', 'roller', 'order-form:norman:roller:v1', 'valance_fascia_type'
    ) as conflict
  `);
  expect(conflict.rows[0].conflict).toBe(true);
});

it("stores Norman's Soluna valance label and code without the surcharge asterisk", async () => {
  const valances = await db.query<{ choice_value: string; choice_label: string }>(`
    select choice_value, choice_label from public.quote_catalog_field_choice
    where manufacturer = 'Norman' and category = 'roller' and field_key = 'valance_fascia_type' and active
    order by id
  `);
  expect(valances.rows.some((row) => row.choice_value.endsWith("*") || row.choice_label.endsWith("*"))).toBe(false);
  expect(valances.rows).toContainEqual({ choice_value: "F014", choice_label: "6 inch Fabric Valance" });
  expect(valances.rows.map((row) => row.choice_value)).toContain("No Valance");
  const accepted = await db.query<{ result: { ok: boolean } }>(
    "select public.quote_validate_tapped_value($1::jsonb, 'Norman', 'roller', 'valance_fascia_type', '\"F014\"'::jsonb) as result",
    [JSON.stringify({ answers: { color_code: "F1484", ordered_width: 36.125, collection: "Amelia", color_name: "Mist Gray" } })],
  );
  expect(accepted.rows[0].result.ok).toBe(true);
  const starred = await db.query<{ result: { ok: boolean; reason: string } }>(
    `select public.quote_validate_tapped_value($1::jsonb, 'Norman', 'roller', 'valance_fascia_type', '"6\\" Fabric Valance*"'::jsonb) as result`,
    [JSON.stringify({ answers: { color_code: "F1484", ordered_width: 36.125, collection: "Amelia", color_name: "Mist Gray" } })],
  );
  expect(starred.rows[0].result).toMatchObject({ ok: false, reason: "value is not a catalog choice" });
});

it("flags incomplete Onyx products and unlisted Sundance without inventing rows", async () => {
  const vinyl = await nextField({}, "Onyx", "onyx_us_made_vinyl");
  expect(vinyl.status).toBe("blocked");
  expect(vinyl.reason).toMatch(/no portal material mapped/);
  const poly = await nextField({}, "Onyx", "poly_composite");
  expect(poly.status).toBe("blocked");
  expect(poly.reason).toMatch(/Poly Composite/);
  const complete = await nextField({}, "Onyx", "vinyl");
  expect(complete.status).not.toBe("blocked");
  expect(complete.field_key).toBeTruthy();
  const sundance = await nextField({}, "Sundance", "sundance_roller");
  expect(sundance.status).toBe("blocked");
  expect(sundance.reason).toBe(fieldFile.sundance.flag);
  const gaps = await db.query<{ manufacturer: string; category: string; status: string }>(`
    select manufacturer, category, status from public.quote_sequence_catalog_gap
    where field_key is null
    order by manufacturer, category
  `);
  expect(gaps.rows).toEqual([
    { manufacturer: "Onyx", category: "onyx_us_made_vinyl", status: "blocked" },
    { manufacturer: "Onyx", category: "poly_composite", status: "incomplete" },
    { manufacturer: "Sundance", category: "*", status: "blocked" },
  ]);
  const seeded = await db.query<{ count: number }>("select count(*)::int as count from public.quote_category_field_sequence where manufacturer = 'Sundance'");
  expect(seeded.rows[0].count).toBe(0);
  expect(fieldFile.products.filter((product) => product.manufacturer === "Onyx" && product.status === "complete")).toHaveLength(6);
});

it("writes migration audit rows and does not delete seed rows", async () => {
  const audit = await db.query<{ actor: string; sha: string; actions: number }>(`
    select actor, source_sha256 as sha, count(*)::int as actions
    from public.quote_sequence_seed_audit
    group by actor, source_sha256
  `);
  expect(audit.rows).toEqual([{ actor: "migration", sha: sourceSha, actions: expect.any(Number) }]);
  expect(audit.rows[0].actions).toBeGreaterThan(100);
  const replaced = await db.query<{ action: string; table_name: string; count: number }>(`
    select action, table_name, count(*)::int as count
    from public.quote_sequence_seed_audit
    where action in ('replace', 'supersede', 'insert')
    group by action, table_name
  `);
  expect(replaced.rows.some((row) => row.action === "replace" && row.table_name === "quote_catalog_field_choice" && row.count === 9)).toBe(true);
  expect(replaced.rows.some((row) => row.action === "supersede" && row.count > 0)).toBe(true);

  const before = await db.query<{ sequences: number; choices: number; aliases: number }>(`
    select
      (select count(*) from public.quote_category_field_sequence)::int as sequences,
      (select count(*) from public.quote_catalog_field_choice)::int as choices,
      (select count(*) from public.quote_sequence_field_alias)::int as aliases
  `);
  await expect(db.query("delete from public.quote_category_field_sequence where category = 'roller'")).rejects.toMatchObject({ code: "42501" });
  await expect(db.query("delete from public.quote_catalog_field_choice where category = 'roller'")).rejects.toMatchObject({ code: "42501" });
  await expect(db.query("delete from public.quote_sequence_field_alias where category = 'roller'")).rejects.toMatchObject({ code: "42501" });
  await expect(db.query("delete from public.quote_sequence_seed_audit")).rejects.toMatchObject({ code: "42501" });
  await db.exec("set role authenticated");
  await expect(db.query("select public.quote_sequence_begin_migration($1)", [sourceSha])).rejects.toThrow(/permission denied|table owner/i);
  await db.exec("reset role");
  await db.query("select public.quote_sequence_begin_migration($1)", [sourceSha]);
  await expect(db.query("delete from public.quote_category_field_sequence where manufacturer = 'Norman' and category = 'roller' and field_key = 'customer_name'")).rejects.toMatchObject({ code: "42501" });
  await db.query("select public.quote_sequence_end_migration()");
  await expect(db.query(`
    update public.quote_category_field_sequence
    set inferred = inferred
    where manufacturer = 'Norman' and category = 'roller' and field_key = 'customer_name'
  `)).rejects.toMatchObject({ code: "42501" });
  const after = await db.query<{ sequences: number; choices: number; aliases: number }>(`
    select
      (select count(*) from public.quote_category_field_sequence)::int as sequences,
      (select count(*) from public.quote_catalog_field_choice)::int as choices,
      (select count(*) from public.quote_sequence_field_alias)::int as aliases
  `);
  expect(after.rows[0]).toEqual(before.rows[0]);
  expect(before.rows[0].sequences).toBeGreaterThan(1497);
});
