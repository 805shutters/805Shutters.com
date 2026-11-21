import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, expect, it } from "vitest";
import { validateQuoteSequenceTap } from "./quote-sequence-tap";

const db = new PGlite();
const mike = "11111111-1111-4111-8111-111111111111";
const jessica = "22222222-2222-4222-8222-222222222222";

type Result = {
  status: string;
  reason: string | null;
  field_key: string | null;
  input_kind: string | null;
  choices: Array<{ value: string; label: string }>;
  invalidated: string[];
  kept: Record<string, unknown>;
  catalog_version: string | null;
};

async function next(spec: unknown, manufacturer = "Norman", category = "roller"): Promise<Result> {
  const query = await db.query<{ result: Result }>("select public.quote_next_required_field($1::jsonb, $2, $3) as result", [JSON.stringify(spec), manufacturer, category]);
  return query.rows[0].result;
}

function values(result: Result) {
  return result.choices.map((choice) => choice.value);
}

beforeAll(async () => {
  await db.exec(readFileSync("supabase/migrations/20261121160000_quote_category_field_sequence.sql", "utf8"));
  await db.exec(`
    create schema if not exists auth;
    create or replace function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    create table public.crm_profiles (id uuid primary key, email text, role text, active boolean);
    insert into public.crm_profiles (id, email, role, active) values
      ('${mike}', '805shutters@gmail.com', 'owner', true),
      ('${jessica}', 'jessica@805shutters.com', 'owner', true);
  `);
}, 180000);

afterAll(() => db.close());

it("walks the norman:roller schema and offers only catalog valances", async () => {
  const answers: Record<string, unknown> = {};
  let result = await next({ answers });
  expect(result).toMatchObject({ status: "ask", field_key: "customer_name", catalog_version: "order-form:norman:roller:v1" });
  expect(result.catalog_version).not.toMatch(/sales_quote_v2/);

  const fill = (current: Result) => {
    if (current.field_key === "ordered_width") return answers.ordered_width ?? 36.125;
    if (current.field_key === "ordered_height") return 60;
    if (current.field_key === "quantity") return 1;
    if (current.field_key === "collection") return "Amelia";
    if (current.field_key === "color_name") return "Mist Gray";
    if (current.field_key === "color_code") return "F1484";
    if (current.field_key === "control_type") return undefined;
    if (current.input_kind === "buttons") return current.choices[0]?.value;
    return "Office";
  };
  for (let step = 0; step < 30 && result.field_key && result.field_key !== "ordered_width"; step += 1) {
    answers[result.field_key] = fill(result);
    result = await next({ answers });
  }
  answers.ordered_width = 36.1;
  result = await next({ answers });
  expect(result).toMatchObject({ status: "needs_input", field_key: "ordered_width", reason: "ordered_width must be inches to the nearest 1/8 inch" });
  answers.ordered_width = 36.125;

  for (let step = 0; step < 30 && result.field_key && result.field_key !== "valance_fascia_type"; step += 1) {
    if (result.field_key === "collection") {
      expect(values(result)).toContain("Amelia");
      expect(values(result)).not.toContain("Not A Fabric");
    }
    if (result.field_key === "color_code") expect(values(result)).toContain("F1484");
    if (result.field_key === "control_type") {
      expect(values(result).sort()).toEqual(["Continuous Cord Loop", "Cordless", "Motorized", "Smart Release"]);
      answers.lift_system = "Cordless";
    } else {
      answers[result.field_key] = fill(result);
    }
    result = await next({ answers });
  }

  expect(result.field_key).toBe("valance_fascia_type");
  expect(values(result)).toEqual(expect.arrayContaining(["No Valance", '4 1/2" Fabric Valance*', "Square Fascia*", '4 1/2" Modern Wood Valance*', '6" Fabric Valance*']));
  expect(values(result)).not.toContain("6 in fabric valance");
  expect(values(result)).not.toContain("Open Roll");
  expect(result.kept).toMatchObject({ control_type: "Cordless", collection: "Amelia", color_code: "F1484" });

  const rejected = await db.query<{ result: { ok: boolean; reason: string | null } }>(
    "select public.quote_validate_tapped_value($1::jsonb, 'Norman', 'roller', 'valance_fascia_type', $2::jsonb) as result",
    [JSON.stringify({ answers }), JSON.stringify("6 in fabric valance")],
  );
  expect(rejected.rows[0].result).toMatchObject({ ok: false, reason: "value is not a catalog choice" });
  const accepted = await db.query<{ result: { ok: boolean } }>(
    "select public.quote_validate_tapped_value($1::jsonb, 'Norman', 'roller', 'valance_fascia_type', $2::jsonb) as result",
    [JSON.stringify({ answers }), JSON.stringify('6" Fabric Valance*')],
  );
  expect(accepted.rows[0].result.ok).toBe(true);
  const wrapped = await validateQuoteSequenceTap(db, {
    manufacturer: "Norman", category: "roller", fieldKey: "valance_fascia_type",
    value: "6 in fabric valance", answers,
  });
  expect(wrapped).toMatchObject({ ok: false, reason: "value is not a catalog choice" });
});

it("drops a 6 inch fabric valance when that fabric width cannot cover the ordered width", async () => {
  const narrow = await db.query<{ choice_value: string; max_width: string; collection: string; color_name: string }>(`
    select choice_value, max_width::text, when_spec->>'collection' as collection, when_spec->>'color_name' as color_name
    from public.quote_catalog_field_choice
    where category = 'roller' and field_key = 'color_code' and size_rule = 'max_width' and max_width <= 95
    order by max_width desc
    limit 1
  `);
  expect(narrow.rows[0]?.choice_value).toBeTruthy();
  const width = Math.floor(Number(narrow.rows[0].max_width) * 8) / 8;
  const answers: Record<string, unknown> = {
    ordered_width: width,
    ordered_height: 60,
    collection: narrow.rows[0].collection,
    color_name: narrow.rows[0].color_name,
    color_code: narrow.rows[0].choice_value,
  };
  let result = await next({ answers });
  for (let step = 0; step < 40 && result.field_key && result.field_key !== "valance_fascia_type"; step += 1) {
    if (!(result.field_key in answers)) answers[result.field_key] = result.input_kind === "buttons" ? result.choices[0].value : result.field_key === "quantity" ? 1 : "Office";
    result = await next({ answers });
  }
  expect(result.field_key).toBe("valance_fascia_type");
  expect(values(result)).toContain("Square Fascia*");
  expect(values(result)).not.toContain('6" Fabric Valance*');
  expect(values(result)).not.toContain('4 1/2" Fabric Valance*');
});

it("keeps the shared opening fields when the product changes and re-asks only the invalidated fields", async () => {
  const switched = await next({
    previous: { manufacturer: "Norman", category: "wood_blinds" },
    answers: {
      room_location: "Office",
      ordered_width: 36.125,
      ordered_height: 60,
      mount_type: "Inside Mount",
      slat_size: "2",
      lift_system: "Cordless",
      valance: "No Valance",
      color_name: "Mist Gray",
    },
  });
  expect(switched.kept).toMatchObject({ room_location: "Office", ordered_width: 36.125, ordered_height: 60, mount_type: "Inside Mount" });
  expect(switched.invalidated).toEqual(expect.arrayContaining(["slat_size", "lift_system", "valance", "color_name"]));
  expect(switched.field_key).not.toBe("mount_type");
  expect(switched.field_key).not.toBe("ordered_width");

  const other = await db.query<{ collection: string }>(`
    select distinct when_spec->>'collection' as collection
    from public.quote_catalog_field_choice
    where category = 'roller' and field_key = 'color_code' and when_spec->>'collection' <> 'Amelia'
    limit 1
  `);
  const narrowed = await next({
    answers: {
      customer_name: "Office", crm_customer_id: "Office", contract_number: "Office", order_packet_id: "Office",
      project_address: "Office", customer_phone: "Office", customer_email: "Office", salesperson: "Office",
      measure_status: "Office", final_order_source: "Office", line_item_number: "Office", room_location: "Office",
      quantity: 1, side_mark_po: "Office", mount_type: "Inside Mount", ordered_width: 36.125, ordered_height: 60,
      collection: other.rows[0].collection, pattern_style: "Office", color_name: "Mist Gray", color_code: "F1484",
      openness_opacity: "Office", railroad_seam_placement: "Office", roll_type: "Standard Roll",
      control_type: "Cordless", control_side: "Left", valance_fascia_type: "No Valance",
    },
  });
  expect(narrowed.field_key).toBe("color_code");
  expect(narrowed.status).toBe("needs_input");
  expect(narrowed.invalidated).toEqual(expect.arrayContaining(["color_code", "valance_fascia_type"]));
  expect(narrowed.kept).toMatchObject({
    room_location: "Office", mount_type: "Inside Mount", collection: other.rows[0].collection,
    control_type: "Cordless", roll_type: "Standard Roll", control_side: "Left",
  });
});

it("blocks an unknown category, including unseeded Sundance", async () => {
  expect(await next({}, "Acme", "widgets")).toMatchObject({ status: "blocked", reason: "unknown manufacturer or category" });
  expect(await next({}, "Sundance", "sundance_roller")).toMatchObject({ status: "blocked", reason: "unknown manufacturer or category" });
  expect(await next({}, "Sundance", "sundance_wood_shutters")).toMatchObject({ status: "blocked", reason: "unknown manufacturer or category" });
  const seeded = await db.query<{ makers: string }>("select string_agg(distinct manufacturer, ',') as makers from public.quote_category_field_sequence");
  expect(seeded.rows[0].makers).not.toContain("Sundance");
  expect(Number((await db.query<{ count: string | number }>("select count(distinct category) as count from public.quote_category_field_sequence")).rows[0].count)).toBe(43);
});

it("rejects a bot write and accepts Mike and Jessica through the admin path", async () => {
  await expect(db.query(`
    insert into public.quote_category_field_sequence
      (manufacturer, category, field_key, ask_order, required, input_kind, depends_on, catalog_version, inferred, set_by, set_at)
    values ('Norman', 'admin_probe', 'room_location', 1, true, 'typed', '{}', 'admin-probe-v1', true, 'seed', now())
  `)).rejects.toMatchObject({ code: "42501" });

  await db.exec("set role service_role");
  await expect(db.query(`
    insert into public.quote_sequence_field_alias
      (manufacturer, category, schema_field_key, saved_key, saved_location, catalog_version)
    values ('Norman', 'roller', 'control_type', 'lift_system', 'options_json', 'order-form:norman:roller:v1')
  `)).rejects.toMatchObject({ code: "42501" });
  expect((await next({})).field_key).toBe("customer_name");
  await expect(db.query("select public.quote_category_field_sequence_write('sequence', '{}'::jsonb)")).rejects.toThrow(/permission denied|Mike or Jessica/i);
  await db.exec("reset role");

  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [mike]);
  await db.exec("set role authenticated");
  const written = await db.query<{ result: { set_by: string } }>(
    "select public.quote_category_field_sequence_write('sequence', $1::jsonb) as result",
    [JSON.stringify({
      manufacturer: "Norman", category: "admin_probe", field_key: "room_location", ask_order: 1, required: true,
      input_kind: "typed", depends_on: [], catalog_version: "admin-probe-v1", inferred: true,
    })],
  );
  expect(written.rows[0].result.set_by).toBe("mike");
  await db.exec("reset role");

  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [jessica]);
  await db.exec("set role authenticated");
  const revised = await db.query<{ result: { set_by: string; required: boolean } }>(
    "select public.quote_category_field_sequence_write('sequence', $1::jsonb) as result",
    [JSON.stringify({
      manufacturer: "Norman", category: "admin_probe", field_key: "room_location", ask_order: 1, required: false,
      input_kind: "typed", depends_on: [], catalog_version: "admin-probe-v1", inferred: false,
    })],
  );
  expect(revised.rows[0].result).toMatchObject({ set_by: "jessica", required: false });
  await db.exec("reset role");

  await db.query("select set_config('request.jwt.claim.sub', '', false)");
  await db.exec("set role authenticated");
  await expect(db.query(
    "select public.quote_category_field_sequence_write('sequence', $1::jsonb)",
    [JSON.stringify({
      manufacturer: "Norman", category: "admin_probe", field_key: "ordered_width", ask_order: 2, required: true,
      input_kind: "typed", depends_on: [], catalog_version: "admin-probe-v1", inferred: true,
    })],
  )).rejects.toThrow(/Mike or Jessica/);
  await db.exec("reset role");
  await expect(db.query("delete from public.quote_category_field_sequence where category = 'admin_probe'")).rejects.toMatchObject({ code: "42501" });
});
