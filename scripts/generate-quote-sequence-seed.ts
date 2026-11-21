/**
 * Seeds quote_category_field_sequence from the measure-form manifest and the
 * order-form schemas it indexes. Sundance has no schema and is left unseeded.
 * Run: ./node_modules/.bin/vite-node --config vitest.config.ts scripts/generate-quote-sequence-seed.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { normanRollerFabricColors } from "../src/lib/quote/norman-roller-fabrics";
import { normanRollerFabricWidths } from "../src/lib/quote/norman-roller-fabric-widths.generated";
import {
  NORMAN_SHUTTER_PROGRAMS,
  normanShutterColors,
  normanShutterFrames,
  normanShutterHinges,
  normanShutterLouvers,
  normanShutterMounts,
  normanShutterTilts,
} from "../src/lib/quote/norman-shutter-assortment";
import {
  ROLLER_HEM_BARS,
  ROLLER_LIFT_SYSTEMS,
  ROLLER_MOUNT_TYPES,
  ROLLER_ROLL_TYPES,
  ROLLER_VALANCES,
} from "../src/mts-quote/lib/quoteConstants";

type SequenceRow = {
  manufacturer: string;
  category: string;
  field_key: string;
  ask_order: number;
  required: boolean;
  input_kind: "buttons" | "typed";
  depends_on: string[];
  catalog_version: string;
  inferred: boolean;
};
type ChoiceRow = {
  manufacturer: string;
  category: string;
  field_key: string;
  choice_value: string;
  choice_label: string;
  catalog_version: string;
  when_spec: Record<string, string>;
  min_width: number | null;
  max_width: number | null;
  min_height: number | null;
  max_height: number | null;
  size_rule: "none" | "max_width" | "fabric_valance" | "wrapped_fabric";
};
type AliasRow = {
  manufacturer: string;
  category: string;
  schema_field_key: string;
  saved_key: string;
  saved_location: "options_json" | "line_item";
  catalog_version: string;
};

const sequences: SequenceRow[] = [];
const choices: ChoiceRow[] = [];
const aliases: AliasRow[] = [];
const seenChoices = new Set<string>();
const shutterPrograms = new Set(NORMAN_SHUTTER_PROGRAMS.map((program) => program.id));
const ALIAS_PAIRS: Array<[string, string, "options_json" | "line_item"]> = [
  ["control_type", "lift_system", "options_json"],
  ["valance_fascia_type", "valance", "options_json"],
  ["valance_fascia_type", "roller_top_treatment", "options_json"],
  ["valance_fascia_type", "top_treatment_class", "options_json"],
  ["collection", "fabric_collection", "options_json"],
  ["collection", "fabric_color_collection", "options_json"],
  ["color_code", "fabric_color_code", "options_json"],
  ["color_name", "fabric_color_name", "options_json"],
  ["panel_configuration", "panel_config", "options_json"],
  ["room_location", "room_name", "line_item"],
];

function choice(row: ChoiceRow) {
  const key = JSON.stringify([row.manufacturer, row.category, row.field_key, row.choice_value, row.when_spec, row.catalog_version, row.size_rule, row.max_width]);
  if (seenChoices.has(key)) return;
  seenChoices.add(key);
  choices.push(row);
}

function buttons(row: {
  manufacturer: string;
  category: string;
  field_key: string;
  catalog_version: string;
  values: readonly string[];
  when_spec?: Record<string, string>;
  max_width?: number | null;
  min_width?: number | null;
  size_rule?: ChoiceRow["size_rule"];
}) {
  for (const value of row.values) {
    choice({
      manufacturer: row.manufacturer, category: row.category, field_key: row.field_key,
      choice_value: value, choice_label: value, catalog_version: row.catalog_version,
      when_spec: row.when_spec ?? {}, min_width: row.min_width ?? null, max_width: row.max_width ?? null,
      min_height: null, max_height: null, size_rule: row.size_rule ?? "none",
    });
  }
}

function catalogVersion(routingKey: string, schemaVersion: string | number) {
  return `order-form:${routingKey}:v${schemaVersion}`;
}

function earlier(fields: string[], field: string, depends: string[]) {
  const index = fields.indexOf(field);
  return depends.filter((name) => fields.indexOf(name) >= 0 && fields.indexOf(name) < index);
}

function seedAliases(manufacturer: string, category: string, version: string, fields: string[]) {
  for (const [schemaField, savedKey, location] of ALIAS_PAIRS) {
    if (fields.includes(schemaField) && schemaField !== savedKey) {
      aliases.push({ manufacturer, category, schema_field_key: schemaField, saved_key: savedKey, saved_location: location, catalog_version: version });
    }
  }
}

function seedRollerChoices(manufacturer: string, category: string, version: string, fields: string[]) {
  const buttonFields = new Set<string>();
  if (fields.includes("mount_type")) {
    buttons({ manufacturer, category, field_key: "mount_type", catalog_version: version, values: ROLLER_MOUNT_TYPES });
    buttonFields.add("mount_type");
  }
  const widths = new Map(normanRollerFabricWidths.map((row) => [row.colorCode.trim().toUpperCase(), row.fabricWidthInches]));
  const byCollection = new Map<string, { width: number; colors: Array<{ code: string; name: string; width: number }> }>();
  for (const row of normanRollerFabricColors) {
    if (!row.available) continue;
    const width = widths.get(row.colorCode.trim().toUpperCase());
    if (width == null) continue;
    const group = byCollection.get(row.collection) ?? { width: 0, colors: [] };
    group.width = Math.max(group.width, width);
    group.colors.push({ code: row.colorCode, name: row.colorName, width });
    byCollection.set(row.collection, group);
  }
  if (fields.includes("collection")) {
    for (const [name, group] of byCollection) {
      choice({
        manufacturer, category, field_key: "collection", choice_value: name, choice_label: name, catalog_version: version,
        when_spec: {}, min_width: null, max_width: group.width, min_height: null, max_height: null, size_rule: "max_width",
      });
    }
    buttonFields.add("collection");
  }
  if (fields.includes("color_name")) {
    for (const [name, group] of byCollection) {
      const names = new Map<string, number>();
      for (const color of group.colors) names.set(color.name, Math.max(names.get(color.name) ?? 0, color.width));
      for (const [colorName, width] of names) {
        choice({
          manufacturer, category, field_key: "color_name", choice_value: colorName, choice_label: colorName, catalog_version: version,
          when_spec: { collection: name }, min_width: null, max_width: width, min_height: null, max_height: null, size_rule: "max_width",
        });
      }
    }
    buttonFields.add("color_name");
  }
  if (fields.includes("color_code")) {
    for (const [name, group] of byCollection) {
      for (const color of group.colors) {
        choice({
          manufacturer, category, field_key: "color_code", choice_value: color.code, choice_label: `${color.code} - ${color.name}`,
          catalog_version: version, when_spec: { collection: name, color_name: color.name },
          min_width: null, max_width: color.width, min_height: null, max_height: null, size_rule: "max_width",
        });
      }
    }
    buttonFields.add("color_code");
  }
  if (fields.includes("control_type")) {
    buttons({ manufacturer, category, field_key: "control_type", catalog_version: version, values: ROLLER_LIFT_SYSTEMS });
    buttonFields.add("control_type");
  }
  if (fields.includes("control_side")) {
    buttons({ manufacturer, category, field_key: "control_side", catalog_version: version, values: ["Left", "Right"] });
    buttonFields.add("control_side");
  }
  if (fields.includes("roll_type")) {
    buttons({ manufacturer, category, field_key: "roll_type", catalog_version: version, values: ROLLER_ROLL_TYPES });
    buttonFields.add("roll_type");
  }
  if (fields.includes("hem_bar")) {
    buttons({ manufacturer, category, field_key: "hem_bar", catalog_version: version, values: ROLLER_HEM_BARS });
    buttonFields.add("hem_bar");
  }
  if (fields.includes("valance_fascia_type")) {
    for (const value of ROLLER_VALANCES) {
      const fabric = /fabric valance/i.test(value);
      const wrapped = /curved.*fabric/i.test(value);
      choice({
        manufacturer, category, field_key: "valance_fascia_type", choice_value: value, choice_label: value, catalog_version: version,
        when_spec: {}, min_width: null, max_width: fabric || wrapped ? null : 95, min_height: null, max_height: null,
        size_rule: fabric ? "fabric_valance" : wrapped ? "wrapped_fabric" : "max_width",
      });
    }
    buttonFields.add("valance_fascia_type");
  }
  return buttonFields;
}

function seedShutterChoices(manufacturer: string, category: string, version: string, fields: string[]) {
  const buttonFields = new Set<string>();
  const program = category as (typeof NORMAN_SHUTTER_PROGRAMS)[number]["id"];
  if (!shutterPrograms.has(program)) return buttonFields;
  if (fields.includes("mount_type")) {
    const mounts = new Set<string>();
    for (const frame of normanShutterFrames(program)) for (const mount of normanShutterMounts(program, frame.code)) mounts.add(mount);
    buttons({ manufacturer, category, field_key: "mount_type", catalog_version: version, values: [...mounts] });
    buttonFields.add("mount_type");
  }
  if (fields.includes("frame_type")) {
    for (const frame of normanShutterFrames(program)) {
      choice({
        manufacturer, category, field_key: "frame_type", choice_value: frame.code, choice_label: frame.label, catalog_version: version,
        when_spec: {}, min_width: null, max_width: null, min_height: null, max_height: null, size_rule: "none",
      });
    }
    buttonFields.add("frame_type");
  }
  if (fields.includes("louver_size")) {
    buttons({ manufacturer, category, field_key: "louver_size", catalog_version: version, values: normanShutterLouvers(program) });
    buttonFields.add("louver_size");
  }
  if (fields.includes("tilt_type")) {
    buttons({ manufacturer, category, field_key: "tilt_type", catalog_version: version, values: normanShutterTilts(program) });
    buttonFields.add("tilt_type");
  }
  if (fields.includes("hinge_color")) {
    for (const frame of normanShutterFrames(program)) {
      buttons({
        manufacturer, category, field_key: "hinge_color", catalog_version: version,
        values: normanShutterHinges(program, frame.label), when_spec: { frame_type: frame.code },
      });
    }
    buttonFields.add("hinge_color");
  }
  if (fields.includes("color_finish") || fields.includes("color_code")) {
    for (const color of normanShutterColors(program)) {
      if (fields.includes("color_finish")) {
        choice({
          manufacturer, category, field_key: "color_finish", choice_value: color.label, choice_label: color.label, catalog_version: version,
          when_spec: {}, min_width: null, max_width: null, min_height: null, max_height: null, size_rule: "none",
        });
        buttonFields.add("color_finish");
      }
      if (fields.includes("color_code")) {
        choice({
          manufacturer, category, field_key: "color_code", choice_value: color.code, choice_label: color.label, catalog_version: version,
          when_spec: fields.includes("color_finish") ? { color_finish: color.label } : {},
          min_width: null, max_width: null, min_height: null, max_height: null, size_rule: "none",
        });
        buttonFields.add("color_code");
      }
    }
  }
  return buttonFields;
}

function seedSimpleProduct(schema: {
  schema_version: number;
  routing_key: string;
  manufacturer: string;
  product_key: string;
  ordered_fields: string[];
}) {
  const version = catalogVersion(schema.routing_key, schema.schema_version);
  const fields = schema.ordered_fields;
  const buttonFields = new Set<string>([
    ...seedRollerChoices(schema.manufacturer, schema.product_key, version, fields),
    ...seedShutterChoices(schema.manufacturer, schema.product_key, version, fields),
  ]);
  const depends: Record<string, string[]> = {
    collection: ["ordered_width"],
    color_name: ["collection", "ordered_width"],
    color_code: ["collection", "color_name", "ordered_width"],
    control_type: ["collection"],
    control_side: ["control_type"],
    valance_fascia_type: ["color_code", "ordered_width"],
    hinge_color: ["frame_type"],
  };
  fields.forEach((field, index) => {
    sequences.push({
      manufacturer: schema.manufacturer,
      category: schema.product_key,
      field_key: field,
      ask_order: index + 1,
      required: true,
      input_kind: buttonFields.has(field) ? "buttons" : "typed",
      depends_on: earlier(fields, field, depends[field] ?? []),
      catalog_version: version,
      inferred: false,
    });
  });
  seedAliases(schema.manufacturer, schema.product_key, version, fields);
}

type JsonSchema = {
  enum?: string[];
  const?: string | number | boolean;
  type?: string | string[];
  $ref?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
};

function seedOnyx(schema: { $defs?: { line?: JsonSchema; fraction?: JsonSchema }; properties?: { schema_version?: { const?: string } } }, routingKey: string, productKey: string) {
  const line = schema.$defs?.line;
  if (!line?.required || !line.properties) throw new Error("Onyx schema has no line definition");
  const version = catalogVersion(routingKey, schema.properties?.schema_version?.const ?? "onyx-agent-order-packet.v1");
  const fractions = schema.$defs?.fraction?.enum ?? [];
  const buttonFields = new Set<string>();
  for (const field of line.required) {
    const property = line.properties[field];
    if (!property) continue;
    if (property.enum) {
      buttons({ manufacturer: "Onyx", category: productKey, field_key: field, catalog_version: version, values: property.enum });
      buttonFields.add(field);
    } else if (property.const !== undefined) {
      buttons({ manufacturer: "Onyx", category: productKey, field_key: field, catalog_version: version, values: [String(property.const)] });
      buttonFields.add(field);
    } else if (property.$ref?.endsWith("/dimension")) {
      buttons({ manufacturer: "Onyx", category: productKey, field_key: field, catalog_version: version, values: fractions });
    }
  }
  line.required.forEach((field, index) => {
    sequences.push({
      manufacturer: "Onyx",
      category: productKey,
      field_key: field,
      ask_order: index + 1,
      required: true,
      input_kind: buttonFields.has(field) ? "buttons" : "typed",
      depends_on: [],
      catalog_version: version,
      inferred: false,
    });
  });
  seedAliases("Onyx", productKey, version, line.required);
}

function sqlText(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}
function sqlNumber(value: number | null) {
  return value == null ? "null" : String(value);
}
function sqlJson(value: Record<string, string>) {
  const sorted = Object.keys(value).sort().reduce<Record<string, string>>((acc, key) => {
    acc[key] = value[key];
    return acc;
  }, {});
  return `${sqlText(JSON.stringify(sorted))}::jsonb`;
}
function sqlArray(values: string[]) {
  return values.length ? `array[${values.map(sqlText).join(",")}]::text[]` : `'{}'::text[]`;
}
function chunk<T>(rows: T[], size: number) {
  const groups: T[][] = [];
  for (let index = 0; index < rows.length; index += size) groups.push(rows.slice(index, index + size));
  return groups;
}

const manifest = JSON.parse(readFileSync(new URL("../public/technical-measure-templates/technical-measure-template-manifest.json", import.meta.url), "utf8")) as {
  templates: Array<{ routing_key: string; manufacturer: string; product_key: string; order_schema: string }>;
};
const onyxSchema = JSON.parse(readFileSync(new URL("../public/order-form-templates/onyx/onyx-agent-order-packet.schema.json", import.meta.url), "utf8"));
for (const entry of manifest.templates) {
  if (entry.manufacturer === "Onyx") {
    seedOnyx(onyxSchema, entry.routing_key, entry.product_key);
    continue;
  }
  const schema = JSON.parse(readFileSync(new URL(`../public/${entry.order_schema}`, import.meta.url), "utf8"));
  if (schema.routing_key !== entry.routing_key || schema.product_key !== entry.product_key) {
    throw new Error(`Manifest and schema disagree for ${entry.routing_key}`);
  }
  seedSimpleProduct(schema);
}

const schemaSql = readFileSync(new URL("./quote-sequence-schema.sql", import.meta.url), "utf8");
const setAt = "timestamptz '2026-11-21 15:37:00+00'";
const sequenceSql = chunk(sequences, 80).map((group) => `insert into public.quote_category_field_sequence (manufacturer, category, field_key, ask_order, required, input_kind, depends_on, catalog_version, inferred, set_by, set_at) values\n${group.map((row) => `(${[
  sqlText(row.manufacturer), sqlText(row.category), sqlText(row.field_key), String(row.ask_order), row.required ? "true" : "false",
  sqlText(row.input_kind), sqlArray(row.depends_on), sqlText(row.catalog_version), row.inferred ? "true" : "false", "'seed'", setAt,
].join(", ")})`).join(",\n")};\n`).join("\n");
const choiceSql = chunk(choices, 150).map((group) => `insert into public.quote_catalog_field_choice (manufacturer, category, field_key, choice_value, choice_label, catalog_version, when_spec, min_width, max_width, min_height, max_height, size_rule) values\n${group.map((row) => `(${[
  sqlText(row.manufacturer), sqlText(row.category), sqlText(row.field_key), sqlText(row.choice_value), sqlText(row.choice_label),
  sqlText(row.catalog_version), sqlJson(row.when_spec), sqlNumber(row.min_width), sqlNumber(row.max_width), sqlNumber(row.min_height), sqlNumber(row.max_height), sqlText(row.size_rule),
].join(", ")})`).join(",\n")};\n`).join("\n");
const aliasSql = aliases.length ? `insert into public.quote_sequence_field_alias (manufacturer, category, schema_field_key, saved_key, saved_location, catalog_version) values\n${aliases.map((row) => `(${[
  sqlText(row.manufacturer), sqlText(row.category), sqlText(row.schema_field_key), sqlText(row.saved_key), sqlText(row.saved_location), sqlText(row.catalog_version),
].join(", ")})`).join(",\n")};\n` : "";
const closing = `
drop trigger if exists quote_category_field_sequence_no_direct_write on public.quote_category_field_sequence;
create trigger quote_category_field_sequence_no_direct_write
  before insert or update or delete on public.quote_category_field_sequence
  for each row execute function public.quote_sequence_reject_direct_write();
drop trigger if exists quote_catalog_field_choice_no_direct_write on public.quote_catalog_field_choice;
create trigger quote_catalog_field_choice_no_direct_write
  before insert or update or delete on public.quote_catalog_field_choice
  for each row execute function public.quote_sequence_reject_direct_write();
drop trigger if exists quote_sequence_field_alias_no_direct_write on public.quote_sequence_field_alias;
create trigger quote_sequence_field_alias_no_direct_write
  before insert or update or delete on public.quote_sequence_field_alias
  for each row execute function public.quote_sequence_reject_direct_write();

alter table public.quote_category_field_sequence enable row level security;
alter table public.quote_catalog_field_choice enable row level security;
alter table public.quote_sequence_field_alias enable row level security;
alter table public.quote_category_field_sequence force row level security;
alter table public.quote_catalog_field_choice force row level security;
alter table public.quote_sequence_field_alias force row level security;

drop policy if exists quote_category_field_sequence_read on public.quote_category_field_sequence;
create policy quote_category_field_sequence_read on public.quote_category_field_sequence for select to anon, authenticated, service_role using (true);
drop policy if exists quote_catalog_field_choice_read on public.quote_catalog_field_choice;
create policy quote_catalog_field_choice_read on public.quote_catalog_field_choice for select to anon, authenticated, service_role using (true);
drop policy if exists quote_sequence_field_alias_read on public.quote_sequence_field_alias;
create policy quote_sequence_field_alias_read on public.quote_sequence_field_alias for select to anon, authenticated, service_role using (true);

grant usage on schema public to anon, authenticated, service_role;
revoke all on public.quote_category_field_sequence, public.quote_catalog_field_choice, public.quote_sequence_field_alias from public, anon, authenticated, service_role;
grant select on public.quote_category_field_sequence, public.quote_catalog_field_choice, public.quote_sequence_field_alias to anon, authenticated, service_role;

revoke all on function public.quote_sequence_when_matches(jsonb, jsonb) from public;
revoke all on function public.quote_sequence_matching_choices(text, text, text, text, jsonb) from public;
revoke all on function public.quote_sequence_resolve_version(text, text, text) from public;
revoke all on function public.quote_sequence_value_blank(jsonb) from public;
revoke all on function public.quote_sequence_field_answer(jsonb, text, text, text, text) from public;
revoke all on function public.quote_sequence_answer_conflict(jsonb, text, text, text, text) from public;
revoke all on function public.quote_sequence_typed_valid(text, jsonb, integer) from public;
revoke all on function public.quote_next_required_field(jsonb, text, text) from public;
revoke all on function public.quote_validate_tapped_value(jsonb, text, text, text, jsonb) from public;
grant execute on function public.quote_sequence_when_matches(jsonb, jsonb) to anon, authenticated, service_role;
grant execute on function public.quote_sequence_matching_choices(text, text, text, text, jsonb) to anon, authenticated, service_role;
grant execute on function public.quote_sequence_resolve_version(text, text, text) to anon, authenticated, service_role;
grant execute on function public.quote_sequence_value_blank(jsonb) to anon, authenticated, service_role;
grant execute on function public.quote_sequence_field_answer(jsonb, text, text, text, text) to anon, authenticated, service_role;
grant execute on function public.quote_sequence_answer_conflict(jsonb, text, text, text, text) to anon, authenticated, service_role;
grant execute on function public.quote_sequence_typed_valid(text, jsonb, integer) to anon, authenticated, service_role;
grant execute on function public.quote_next_required_field(jsonb, text, text) to anon, authenticated, service_role;
grant execute on function public.quote_validate_tapped_value(jsonb, text, text, text, jsonb) to anon, authenticated, service_role;
grant execute on function public.quote_sequence_reject_direct_write() to anon, authenticated, service_role;
`;

writeFileSync(new URL("../supabase/migrations/20261121160000_quote_category_field_sequence.sql", import.meta.url), `${schemaSql}\n${sequenceSql}\n${choiceSql}\n${aliasSql}\n${closing}`);
const summary = sequences.reduce<Record<string, string[]>>((acc, row) => {
  const key = `${row.manufacturer} / ${row.category}`;
  acc[key] ??= [];
  acc[key].push(`${row.ask_order}. ${row.field_key}${row.input_kind === "buttons" ? "" : " typed"}${row.inferred ? " inferred" : ""}`);
  return acc;
}, {});
writeFileSync(new URL("../src/lib/quote/quote-sequence-summary.json", import.meta.url), JSON.stringify({
  sundance: "unseeded: the measure-form manifest has no Sundance order schema",
  catalog_version: "order-form:<routing_key>:v<schema_version> from the schema file, not sales_quote_v2_catalog_versions",
  spelling: "norman:roller product_name is Soluna Roller Shades; the category key is roller",
  aliases: ALIAS_PAIRS,
  products: summary,
}, null, 2));
console.log(`products ${Object.keys(summary).length}, sequences ${sequences.length}, choices ${choices.length}, aliases ${aliases.length}`);
console.log(Object.keys(summary).join("\n"));
