/**
 * Build the button catalog from the order-entry field guide.
 * Re-run when a newer guide arrives:
 *   node scripts/build-quote-button-catalog.mjs /path/to/805-order-entry-fields.json
 * The catalog fills choices the sequence seed left empty.
 * A later guide can replace this file without changing the button screen.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const sourcePath = process.argv[2];
if (!sourcePath) {
  console.error("Pass the order-entry field guide JSON path.");
  process.exit(1);
}
const raw = readFileSync(sourcePath, "utf8");
const guide = JSON.parse(raw);
const sha256 = createHash("sha256").update(raw).digest("hex");

function cleanToken(value) {
  return value.replace(/\s+/g, " ").trim();
}

function stripNotes(value) {
  return value.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim();
}

function slashParts(value) {
  return value.split(/\s+\/\s+/).map(cleanToken).filter(Boolean);
}

function closedList(value) {
  const parts = slashParts(value);
  if (parts.length < 2 || parts.length > 16) return null;
  if (parts.some((part) => part.length > 48 || part.includes("...") || /NO LIST|BLOCKED|e\.g\./i.test(part))) return null;
  return parts;
}

function databaseList(value) {
  const match = value.match(/^(\d+) DB choices:\s*(.*)$/);
  if (!match) return null;
  const declared = Number(match[1]);
  const body = match[2].trim();
  if (!body || body.includes("...")) return { choices: [], incomplete: true };
  const parts = slashParts(body);
  if (parts.length !== declared || parts.some((part) => part.length > 64)) return { choices: [], incomplete: true };
  return { choices: parts, incomplete: false };
}

function channelList(value) {
  const match = stripNotes(value).match(/^channel\s+(\d+)\s*-\s*(\d+)$/i);
  if (!match) return null;
  const start = Number(match[1]);
  const end = Number(match[2]);
  if (!Number.isInteger(start) || !Number.isInteger(end) || end < start || end - start > 30) return null;
  return Array.from({ length: end - start + 1 }, (_, index) => String(start + index));
}

function countRange(standIn, allowed) {
  const match = standIn.match(/(\d+)\s*-\s*(\d+)/);
  if (!match) return null;
  let min = Number(match[1]);
  const max = Number(match[2]);
  if (!Number.isInteger(min) || !Number.isInteger(max) || max < min || max > 24) return null;
  if (min < 1 && />=\s*1/.test(allowed)) min = 1;
  if (min < 0) min = 0;
  return { min, max };
}

function screenRule(rule) {
  const later = rule.match(/ask on a later screen than:\s*([^;]+)/i);
  const recheck = rule.match(/re-check on submit against:\s*([^;]+)/i);
  const split = (value) => (value ? value.split(",").map(cleanToken).filter(Boolean) : []);
  return { laterThan: split(later?.[1]), recheckAgainst: split(recheck?.[1]) };
}

function choiceObjects(values) {
  return values.map((value) => ({ value, label: value }));
}

function fieldRecord(field) {
  const allowed = typeof field.allowed === "string" ? field.allowed.trim() : "";
  const stand = typeof field.button_stand_in === "string" ? field.button_stand_in.trim() : "";
  const rule = screenRule(typeof field.screen_rule === "string" ? field.screen_rule : "");
  const duplicate = allowed.match(/DUPLICATE of ([a-z0-9_]+)/i);
  const base = {
    key: field.key,
    askOrder: field.ask_order,
    required: field.db_required === true,
    multi: false,
    choices: [],
    defaultValue: null,
    dependsOn: Array.isArray(field.depends_on) ? field.depends_on.filter((item) => typeof item === "string") : [],
    laterThan: rule.laterThan,
    recheckAgainst: rule.recheckAgainst,
    pending: false,
    step: null,
    databaseChoices: false,
    extras: [],
    skip: Boolean(duplicate),
    duplicateOf: duplicate ? duplicate[1] : null,
    valueKind: "string",
  };
  if (base.skip) return { ...base, control: "pending" };
  if (field.key === "ordered_width" || field.key === "ordered_height" || field.kind === "measure" || /fraction buttons|1\/16|1\/8/.test(stand)) {
    const step = field.key === "ordered_width" || field.key === "ordered_height" ? "1/8" : /1\/16/.test(stand) ? "1/16" : "1/8";
    return {
      ...base,
      control: "dimension",
      step,
      extras: /Center/.test(stand) ? ["Center"] : [],
      valueKind: "number",
    };
  }
  if (field.key === "room_location" || stand.startsWith("Room buttons")) {
    return { ...base, control: "room" };
  }
  if (field.kind === "count" || /Number buttons|Buttons 1-8/.test(stand)) {
    const range = countRange(stand, allowed) ?? { min: 1, max: 6 };
    const choices = Array.from({ length: range.max - range.min + 1 }, (_, index) => String(range.min + index));
    return {
      ...base,
      control: "quantity",
      choices: choiceObjects(choices),
      defaultValue: field.key === "quantity" ? "1" : null,
      valueKind: "number",
    };
  }
  if (field.kind === "yesno" || /^yes\s*\/\s*no/i.test(stripNotes(allowed)) || /^true\s*\/\s*false$/i.test(stripNotes(allowed))) {
    const boolean = /^true\s*\/\s*false$/i.test(stripNotes(allowed));
    return {
      ...base,
      control: "yesno",
      choices: boolean ? choiceObjects(["true", "false"]) : [{ value: "Yes", label: "Yes" }, { value: "No", label: "No" }],
      valueKind: boolean ? "boolean" : "string",
    };
  }
  if (/common-note chips/.test(stand) || field.kind === "free") {
    return {
      ...base,
      control: "notes",
      multi: true,
      choices: [{ value: "None", label: "None" }],
      defaultValue: ["None"],
    };
  }
  const channels = channelList(allowed);
  if (channels) {
    return { ...base, control: "buttons", choices: choiceObjects(channels), valueKind: "number" };
  }
  const fromDatabase = databaseList(allowed);
  if (fromDatabase) {
    return {
      ...base,
      control: fromDatabase.choices.length ? "buttons" : "pending",
      choices: choiceObjects(fromDatabase.choices),
      pending: fromDatabase.incomplete,
      databaseChoices: true,
    };
  }
  const listed = closedList(stripNotes(allowed)) ?? closedList(stand.replace(/^Buttons:\s*/i, ""));
  if (listed) return { ...base, control: "buttons", choices: choiceObjects(listed) };
  return { ...base, control: "pending", pending: true };
}

const products = guide.products.map((product) => ({
  manufacturer: product.manufacturer,
  category: product.category,
  productName: product.product_name,
  fields: product.fields.filter((field) => field.level === "line").map(fieldRecord),
}));

const catalog = {
  sourceSha256: sha256,
  products,
};
const out = new URL("../data/quote-button-catalog.json", import.meta.url);
mkdirSync(dirname(out.pathname), { recursive: true });
writeFileSync(out, `${JSON.stringify(catalog)}\n`);
const index = products.map((product) => ({
  manufacturer: product.manufacturer,
  category: product.category,
  productName: product.productName,
}));
const indexOut = new URL("../src/lib/crm/quote-button-product-index.ts", import.meta.url);
writeFileSync(indexOut, `export const quoteButtonProductIndex = ${JSON.stringify(index, null, 2)} as const;\n`);
const controls = {};
for (const product of products) {
  for (const field of product.fields) controls[field.control] = (controls[field.control] ?? 0) + 1;
}
console.log(JSON.stringify({ products: products.length, sha256, controls, bytes: JSON.stringify(catalog).length }));
