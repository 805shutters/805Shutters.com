import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ORDER_ENTRY_FIELD_FILE, ORDER_ENTRY_MANUFACTURER_ROLES } from "@/lib/crm/order-entry-preflight";

const db = new PGlite();
const id = (n: number) => `41000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const fieldFile = JSON.parse(readFileSync(ORDER_ENTRY_FIELD_FILE, "utf8")) as {
  products: Array<{
    manufacturer: string;
    category: string;
    status: string;
    fields: Array<{ key: string; level: string; conditional: string }>;
  }>;
};

const UNPARSED = new Set([
  "if width > fabric width",
  "if frame depth needs build-out",
  "if obstruction",
  "for arches/angles",
  "only specialty shapes",
  "wide valance splice",
]);

const order = {
  po_number: "PO-100",
  po_date: "2026-11-21",
  sidemark: "Smith kitchen",
  ship_to: {
    name: "805 Shutters",
    address: "123 State St",
    city: "Santa Barbara",
    state: "CA",
    zip: "93101",
  },
};

type NeedsInput = { field_key: string; result: string; reason: string };

type PreflightEvent = {
  fired?: boolean;
  duplicate?: boolean;
  preflight?: string;
  state?: string;
  block_reason?: string | null;
  needs_input?: NeedsInput[];
  event_id?: string | null;
  wake?: { woken: boolean; reason: string; manufacturer: string } | null;
  payload?: {
    order_entry?: {
      values?: Record<string, string>;
      order?: { po_number?: string; sidemark?: string };
    };
  };
  schema?: string;
  to_state?: string;
};

function asEvent(value: PreflightEvent | string): PreflightEvent {
  return typeof value === "string" ? JSON.parse(value) as PreflightEvent : value;
}

function probe(answers: Record<string, unknown>, orderFields: Record<string, unknown> = order, quoteId?: string) {
  return {
    category: "preflight_probe",
    catalog_version: "order-form:norman:preflight_probe:v1",
    answers,
    order: orderFields,
    ...(quoteId ? { quote_id: quoteId } : {}),
  };
}

async function call<T>(sql: string, params: unknown[] = []) {
  const result = await db.query<{ result: T }>(sql, params);
  return result.rows[0].result;
}

function enqueue(line: number, version: number, payload: Record<string, unknown>, manufacturer = "norman") {
  return call<PreflightEvent | string>(
    "select public.enqueue_line_event($1::uuid, $2::bigint, $3, $4::jsonb) as result",
    [id(line), version, manufacturer, JSON.stringify(payload)],
  ).then(asEvent);
}

function claim(manufacturer: string) {
  return call<PreflightEvent | string | null>(
    "select public.claim_next_line_event($1, null) as result",
    [manufacturer],
  ).then((value) => value == null ? null : asEvent(value));
}

function complete(eventId: string, toState: string) {
  return call<PreflightEvent | string>(
    "select public.complete_line_event($1::uuid, 'norman', $2, null) as result",
    [eventId, toState],
  ).then(asEvent);
}

async function claimUntil(manufacturer: string, eventId: string) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const claimed = await claim(manufacturer);
    if (!claimed) break;
    if (claimed.event_id === eventId) return claimed;
  }
  throw new Error(`did not claim ${eventId}`);
}

beforeAll(async () => {
  await db.exec(readFileSync("supabase/migrations/20261121160000_quote_category_field_sequence.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/20261121223000_line_event_queue.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/20261121235500_norman_line_event_consumer.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/20261122020000_quote_sequence_field_file_corrections.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/20261122030000_order_entry_preflight.sql", "utf8"));
  await db.exec(`
    select set_config('quote_sequence.admin_write', 'on', false);
    insert into public.quote_category_field_sequence (
      manufacturer, category, field_key, ask_order, required, input_kind, depends_on,
      catalog_version, inferred, set_by, applies_when, active,
      required_for_order, vendor_field_name, value_translation, conditional_rules
    ) values
      ('Norman', 'preflight_probe', 'color', 1, false, 'buttons', '{}',
        'order-form:norman:preflight_probe:v1', true, 'seed', '{}'::jsonb, true,
        true, 'Color', '{"White":"WH"}'::jsonb, '{"raw":"","clauses":[]}'::jsonb),
      ('Norman', 'preflight_probe', 'panel_configuration', 2, false, 'typed', '{}',
        'order-form:norman:preflight_probe:v1', true, 'seed', '{}'::jsonb, true,
        true, 'panel_configuration', '{}'::jsonb, '{"raw":"","clauses":[]}'::jsonb),
      ('Norman', 'preflight_probe', 't_post_location', 3, false, 'typed', '{panel_configuration}',
        'order-form:norman:preflight_probe:v1', true, 'seed',
        '{"op":"contains","field":"panel_configuration","value":"T"}'::jsonb, true,
        true, 't_post_location', '{}'::jsonb, '{"raw":"","clauses":[]}'::jsonb),
      ('Norman', 'preflight_probe', 'motor_note', 4, false, 'typed', '{}',
        'order-form:norman:preflight_probe:v1', true, 'seed',
        '{"op":"eq","field":"control_type","value":"Motorized"}'::jsonb, true,
        true, 'motor_note', '{}'::jsonb, '{"raw":"","clauses":[]}'::jsonb),
      ('Norman', 'preflight_probe', 'retired_color', 5, false, 'typed', '{}',
        'order-form:norman:preflight_probe:v1', true, 'seed', '{}'::jsonb, false,
        true, 'retired_color', '{}'::jsonb, '{"raw":"","clauses":[]}'::jsonb);
    select set_config('quote_sequence.admin_write', 'off', false);
  `);
}, 180000);

afterAll(() => db.close());

describe("order-entry population", () => {
  it("fills the field file, flags everything else, and keeps seed values", async () => {
    let line = 0;
    let orderLevel = 0;
    let unparsed = 0;
    const coverage = new Map<string, { complete: number; flagged: number; missing: number }>();
    for (const product of fieldFile.products) {
      const bucket = coverage.get(product.manufacturer) ?? { complete: 0, flagged: 0, missing: 0 };
      if (product.status === "complete") bucket.complete += 1;
      else bucket.flagged += 1;
      coverage.set(product.manufacturer, bucket);
      for (const field of product.fields) {
        if (field.level === "line") line += 1;
        else orderLevel += 1;
        if (UNPARSED.has((field.conditional || "").trim())) unparsed += 1;
      }
    }
    coverage.set("Sundance", { complete: 0, flagged: 0, missing: 1 });

    const counts = await db.query<{
      required_line: number;
      not_required: number;
      empty_maps: number;
      same_name: number;
      unparsed: number;
      uncovered: number;
      gaps: number;
      seed_required: boolean;
      set_by: string;
    }>(`
      select
        count(*) filter (where category <> 'preflight_probe' and required_for_order)::int as required_line,
        count(*) filter (where category <> 'preflight_probe' and required_for_order = false)::int as not_required,
        count(*) filter (where category <> 'preflight_probe' and value_translation = '{}'::jsonb)::int as empty_maps,
        count(*) filter (where category <> 'preflight_probe' and vendor_field_name = field_key)::int as same_name,
        count(*) filter (where conditional_rules->>'unparsed' = 'true')::int as unparsed,
        count(*) filter (where order_entry_flag = 'not_in_order_entry_field_file')::int as uncovered,
        count(*) filter (where order_entry_flag = 'gaps')::int as gaps,
        bool_and(required) filter (where manufacturer = 'Norman' and category = 'brightwood' and field_key = 'customer_name') as seed_required,
        min(set_by) filter (where manufacturer = 'Norman' and category = 'brightwood' and field_key = 'customer_name') as set_by
      from public.quote_category_field_sequence
    `);
    expect(counts.rows[0]).toMatchObject({
      required_line: line,
      not_required: orderLevel,
      empty_maps: line + orderLevel,
      same_name: line + orderLevel,
      unparsed,
      uncovered: 16,
      seed_required: true,
      set_by: "seed",
    });
    expect(counts.rows[0].gaps).toBeGreaterThan(0);

    const tPost = await db.query<{
      required_for_order: boolean;
      vendor_field_name: string;
      order_entry_flag: string;
      active: boolean;
      applies_when: { op: string; field: string; value: string };
    }>(`
      select required_for_order, vendor_field_name, order_entry_flag, active, applies_when
      from public.quote_category_field_sequence
      where manufacturer = 'Norman' and category = 'brightwood' and field_key = 't_post_location'
    `);
    expect(tPost.rows[0]).toMatchObject({
      required_for_order: true,
      vendor_field_name: "t_post_location",
      order_entry_flag: "gaps",
      active: true,
      applies_when: { op: "contains", field: "panel_configuration", value: "T" },
    });

    const ash = await db.query<{ order_entry_flag: string | null; status: string }>(`
      select sequence_row.order_entry_flag, coverage.status
      from public.quote_category_field_sequence sequence_row
      join public.quote_order_entry_product_coverage coverage
        on coverage.manufacturer = sequence_row.manufacturer
       and coverage.category = sequence_row.category
      where sequence_row.manufacturer = 'Onyx'
        and sequence_row.category = 'ash'
        and sequence_row.field_key = 'divider_position'
    `);
    expect(ash.rows[0]).toEqual({ order_entry_flag: null, status: "complete" });

    const rollup = await db.query<{
      manufacturer: string;
      status: string;
      complete: number;
      flagged: number;
      missing: number;
    }>(`
      select manufacturer,
        case
          when bool_and(status = 'complete') then 'complete'
          when bool_and(status = 'missing') then 'missing'
          else 'flagged'
        end as status,
        count(*) filter (where status = 'complete')::int as complete,
        count(*) filter (where status = 'flagged')::int as flagged,
        count(*) filter (where status = 'missing')::int as missing
      from public.quote_order_entry_product_coverage
      group by manufacturer
      order by manufacturer
    `);
    expect(rollup.rows.map((row) => row.manufacturer).sort()).toEqual(
      ["Lotus", "Norman", "Onyx", "Polar", "Sundance"].sort(),
    );
    for (const row of rollup.rows) {
      const expected = coverage.get(row.manufacturer);
      expect(expected, row.manufacturer).toBeTruthy();
      expect(row.complete).toBe(expected?.complete);
      expect(row.flagged).toBe(expected?.flagged);
      expect(row.missing).toBe(expected?.missing);
      const status = expected?.missing && !expected.complete && !expected.flagged
        ? "missing"
        : expected?.complete && !expected.flagged && !expected.missing
          ? "complete"
          : "flagged";
      expect(row.status).toBe(status);
    }

    const headerFields = await db.query<{ manufacturer: string; field_key: string; required_for_order: boolean }>(`
      select manufacturer, field_key, required_for_order
      from public.quote_order_level_field
      where field_key in ('po_number', 'sidemark', 'ship_to')
    `);
    expect(headerFields.rows).toHaveLength(15);
    expect(headerFields.rows.find((row) => row.manufacturer === "Onyx" && row.field_key === "po_number")?.required_for_order).toBe(false);
    expect(headerFields.rows.find((row) => row.manufacturer === "Onyx" && row.field_key === "sidemark")?.required_for_order).toBe(true);
    expect(headerFields.rows.find((row) => row.manufacturer === "Norman" && row.field_key === "ship_to")?.required_for_order).toBe(true);

    const roles = await db.query<{ rolname: string; rolcanlogin: boolean }>(`
      select rolname, rolcanlogin
      from pg_roles
      where rolname in ('manufacturer_bot_norman', 'manufacturer_bot_onyx', 'manufacturer_bot_sundance', 'manufacturer_bot_lotus')
      order by rolname
    `);
    expect(roles.rows).toEqual(
      Object.values(ORDER_ENTRY_MANUFACTURER_ROLES).sort().map((rolname) => ({ rolname, rolcanlogin: false })),
    );
    const grants = await db.query<{ ok: boolean }>(`
      select has_function_privilege('manufacturer_bot_onyx', 'public.enqueue_line_event(uuid, bigint, text, jsonb)', 'execute') as ok
    `);
    expect(grants.rows[0].ok).toBe(false);
    const wakeBody = await db.query<{ prosrc: string; comment: string }>(`
      select p.prosrc, obj_description(p.oid) as comment
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'wake_line_event_worker'
    `);
    expect(wakeBody.rows[0].prosrc).toContain("wake_http");
    expect(wakeBody.rows[0].prosrc).toContain("wake_disabled");
    expect(wakeBody.rows[0].comment).toContain("line_event.worker_url");
    const priceReaders = readFileSync("supabase/migrations/20261122004500_current_live_price_readers.sql", "utf8");
    expect(priceReaders).not.toMatch(/line_event|quote_category_field_sequence/);
  });
});

describe("order-entry preflight", () => {
  it("blocks the event when a required field is missing and names that field", async () => {
    const blocked = await enqueue(1, 1, probe({ panel_configuration: "LR" }));
    expect(blocked.fired).toBe(false);
    expect(blocked.preflight).toBe("needs_input");
    expect(blocked.event_id).toBeNull();
    expect(blocked.wake).toBeNull();
    expect(blocked.state).toBe("draft");
    expect(blocked.block_reason).toBeNull();
    expect(blocked.needs_input?.map((item) => item.field_key)).toEqual(["color"]);
    expect(blocked.needs_input?.[0].reason).toContain("color");
    expect(blocked.needs_input?.[0].result).toBe("needs_input");
    const stored = await db.query<{ state: string; version: string; block_reason: string | null; events: number; results: number }>(`
      select q.state, q.version::text, q.block_reason,
        (select count(*) from line_event.events e where e.line_id = q.line_id)::int as events,
        (select count(*) from line_event.needs_input r where r.line_id = q.line_id and r.field_key = 'color' and r.event_id is null)::int as results
      from line_event.quote_lines q
      where q.line_id = $1
    `, [id(1)]);
    expect(stored.rows[0]).toMatchObject({ state: "draft", version: "0", block_reason: null, events: 0, results: 1 });
  });

  it("passes a complete line, applies the vendor translation, and stores the order header", async () => {
    const quoteId = "42000000-0000-4000-8000-000000000001";
    const passed = await enqueue(2, 1, probe({ color: "White", panel_configuration: "LR" }, order, quoteId));
    expect(passed.fired).toBe(true);
    expect(passed.duplicate).toBe(false);
    expect(passed.preflight).toBe("ok");
    expect(passed.state).toBe("queued");
    expect(passed.schema).toBe("805-line-event/v1");
    expect(passed.payload?.order_entry?.values).toMatchObject({
      Color: "WH",
      panel_configuration: "LR",
    });
    expect(passed.payload?.order_entry?.values).not.toHaveProperty("t_post_location");
    expect(passed.payload?.order_entry?.order).toMatchObject({
      po_number: "PO-100",
      sidemark: "Smith kitchen",
    });
    expect(passed.wake).toMatchObject({ woken: false, reason: "wake_disabled", manufacturer: "norman" });
    const header = await db.query<{ po_number: string; sidemark: string; po_date: string; ship_to: { name: string } }>(`
      select po_number, sidemark, po_date::text, ship_to
      from public.quote_order_entry_header
      where quote_id = $1
    `, [quoteId]);
    expect(header.rows[0]).toMatchObject({
      po_number: "PO-100",
      sidemark: "Smith kitchen",
      po_date: "2026-11-21",
      ship_to: { name: "805 Shutters" },
    });
  });

  it("names an untranslatable value and does not fire", async () => {
    const blocked = await enqueue(3, 1, probe({ color: "Blue", panel_configuration: "LR" }));
    expect(blocked.fired).toBe(false);
    expect(blocked.needs_input?.map((item) => item.field_key)).toEqual(["color"]);
    expect(blocked.needs_input?.[0].reason).toContain("Blue");
    expect(blocked.needs_input?.[0].reason).toContain("no vendor translation");
    const events = await db.query<{ n: number }>(
      "select count(*)::int as n from line_event.events where line_id = $1",
      [id(3)],
    );
    expect(events.rows[0].n).toBe(0);
  });

  it("honors applies_when and skips inactive rows", async () => {
    const quiet = await enqueue(14, 1, probe({ color: "White", panel_configuration: "LR" }));
    expect(quiet.fired).toBe(true);
    expect(quiet.needs_input ?? []).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ field_key: "motor_note" }),
      expect.objectContaining({ field_key: "retired_color" }),
      expect.objectContaining({ field_key: "t_post_location" }),
    ]));

    const motor = await enqueue(15, 1, probe({
      color: "White",
      panel_configuration: "LR",
      control_type: "Motorized",
    }));
    expect(motor.fired).toBe(false);
    expect(motor.needs_input?.map((item) => item.field_key)).toEqual(["motor_note"]);
  });

  it("respects conditional rules", async () => {
    const skipped = await enqueue(4, 1, probe({ color: "White", panel_configuration: "LR" }));
    expect(skipped.fired).toBe(true);
    expect(skipped.payload?.order_entry?.values).not.toHaveProperty("t_post_location");

    const required = await enqueue(5, 1, probe({ color: "White", panel_configuration: "LT" }));
    expect(required.fired).toBe(false);
    expect(required.needs_input?.map((item) => item.field_key)).toEqual(["t_post_location"]);
    expect(required.needs_input?.[0].reason).toContain("t_post_location");

    const filled = await enqueue(5, 1, probe({
      color: "White",
      panel_configuration: "LT",
      t_post_location: "12 1/8",
    }));
    expect(filled.fired).toBe(true);
    expect(filled.duplicate).toBe(false);
    expect(filled.payload?.order_entry?.values?.t_post_location).toBe("12 1/8");
    expect(filled.payload?.order_entry?.values?.Color).toBe("WH");
  });

  it("names a missing order-level sidemark", async () => {
    const blocked = await enqueue(6, 1, probe(
      { color: "White", panel_configuration: "LR" },
      { po_number: "PO-100", ship_to: order.ship_to },
    ));
    expect(blocked.fired).toBe(false);
    expect(blocked.needs_input?.map((item) => item.field_key)).toContain("sidemark");
    expect(blocked.state).not.toBe("blocked");
  });

  it("never flips a priced line to blocked", async () => {
    const queued = await enqueue(7, 1, probe({ color: "White", panel_configuration: "LR" }));
    expect(queued.fired).toBe(true);
    await claimUntil("norman", queued.event_id ?? "");
    await complete(queued.event_id ?? "", "entered");
    const priced = await complete(queued.event_id ?? "", "priced");
    expect(priced.state).toBe("priced");

    const refused = await enqueue(7, 2, probe({ panel_configuration: "LR" }));
    expect(refused.fired).toBe(false);
    expect(refused.preflight).toBe("needs_input");
    expect(refused.state).toBe("priced");
    expect(refused.block_reason).toBeNull();
    expect(refused.needs_input?.map((item) => item.field_key)).toEqual(["color"]);
    const row = await db.query<{ state: string; version: string; block_reason: string | null; events: number }>(`
      select q.state, q.version::text, q.block_reason,
        (select count(*) from line_event.events e where e.line_id = q.line_id)::int as events
      from line_event.quote_lines q
      where q.line_id = $1
    `, [id(7)]);
    expect(row.rows[0]).toEqual({ state: "priced", version: "1", block_reason: null, events: 1 });
    const failure = await db.query<{ field_key: string; kind: string; assignee: string; idempotency_key: string; event_id: string | null }>(`
      select field_key, kind, assignee, idempotency_key, event_id::text
      from line_event.needs_input
      where line_id = $1
      order by created_at desc
      limit 1
    `, [id(7)]);
    expect(failure.rows[0]).toEqual({
      field_key: "color",
      kind: "order_entry",
      assignee: "quoter",
      idempotency_key: `${id(7)}:2`,
      event_id: null,
    });
  });

  it("fires once after the missing field is corrected", async () => {
    const missing = await enqueue(8, 1, probe({ panel_configuration: "LR" }));
    expect(missing.fired).toBe(false);
    expect(missing.needs_input?.map((item) => item.field_key)).toEqual(["color"]);
    const corrected = await enqueue(8, 1, probe({ color: "White", panel_configuration: "LR" }));
    expect(corrected.fired).toBe(true);
    expect(corrected.duplicate).toBe(false);
    expect(corrected.state).toBe("queued");
    expect(corrected.payload?.order_entry?.values?.Color).toBe("WH");
    const replay = await enqueue(8, 1, probe({ color: "White", panel_configuration: "LR" }));
    expect(replay.duplicate).toBe(true);
    expect(replay.fired).toBe(true);
    expect(replay.event_id).toBe(corrected.event_id);
    const events = await db.query<{ n: number }>(
      "select count(*)::int as n from line_event.events where line_id = $1",
      [id(8)],
    );
    expect(events.rows[0].n).toBe(1);
  });

  it("still queues a line that is not an order-entry check", async () => {
    const queued = await enqueue(9, 1, { room: "Living" }, "lotus");
    expect(queued.fired).toBe(true);
    expect(queued.state).toBe("queued");
    expect(queued.wake).toMatchObject({ woken: false, reason: "wake_disabled", manufacturer: "lotus" });
  });

  it("does not delete order-entry rows", async () => {
    await expect(db.query("delete from line_event.needs_input")).rejects.toThrow(/cannot be deleted/);
    await expect(db.query("delete from public.quote_order_entry_header")).rejects.toThrow(/not deleted/);
    await db.exec("select set_config('quote_sequence.admin_write', 'on', false)");
    await expect(db.query(
      "delete from public.quote_category_field_sequence where category = 'preflight_probe'",
    )).rejects.toThrow(/not deleted/);
    await db.exec("select set_config('quote_sequence.admin_write', 'off', false)");
    const remaining = await db.query<{ n: number }>(
      "select count(*)::int as n from line_event.needs_input where line_id = $1",
      [id(1)],
    );
    expect(remaining.rows[0].n).toBeGreaterThan(0);
  });
});
