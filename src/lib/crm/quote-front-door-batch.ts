import type { SupabaseClient } from "@supabase/supabase-js";
import { quoteFrontDoorFieldLabel } from "@/lib/crm/quote-front-door";
import {
  canonicalMultiplier,
  multiplierChoices,
  nextQuoteFrontDoorField,
  sequenceSpec,
  validateQuoteFrontDoorTap,
  type FrontDoorActor,
  type QuoteFrontDoorSpec,
  type QuoteFrontDoorStore,
  type SequenceChoice,
  type SequenceDetailRow,
} from "@/lib/crm/quote-front-door";
import { mutateSalesQuoteV2Structure, parseSalesQuoteV2StructureBody } from "@/lib/crm/sales-quote-v2-structure";
import {
  quoteButtonProduct,
  type QuoteButtonChoice,
  type QuoteButtonControl,
  type QuoteButtonFieldPack,
  type QuoteButtonGuideField,
  type QuoteButtonScreenField,
  type QuoteButtonValueKind,
} from "@/lib/crm/quote-button-catalog";
import { isDimensionStep, splitInches } from "@/lib/crm/quote-line-buttons";

/**
 * One screen of the remaining required line fields.
 * Valid picks are written onto the real Quote V2 draft through mutate_quote_v2_structure.
 * That keeps the quote in draft, marks prices stale, and does not mark a line blocked or send it.
 */

const ORDER_FIELDS = new Set([
  "customer_name",
  "crm_customer_id",
  "contract_number",
  "order_packet_id",
  "project_address",
  "customer_phone",
  "customer_email",
  "salesperson",
  "measure_status",
  "final_order_source",
  "side_mark_po",
  "line_item_number",
]);

export type QuoteButtonLine = {
  id: string;
  label: string;
  answers: Record<string, unknown>;
  designId?: string | null;
  variant?: string;
  options?: Record<string, unknown>;
};

export type QuoteButtonStructureOperation =
  | { type: "line.update"; lineItemId: string; patch: Record<string, unknown> }
  | {
      type: "design.upsert";
      lineItemId: string;
      designId?: string;
      variant: string;
      selectDesign: true;
      patch: Record<string, unknown>;
    };

export type QuoteStructureWriter = {
  save(input: {
    quoteId: string;
    actorId: string;
    expectedRevision: number;
    idempotencyKey: string;
    operations: QuoteButtonStructureOperation[];
  }): Promise<{ quoteId: string; revision: number; status: "draft"; quoteV2Status: "draft" | "stale" }>;
};

export type QuoteButtonReask = {
  fieldKey: string;
  reason: string | null;
  choices: QuoteButtonChoice[];
};

export type QuoteButtonBatchNext = {
  status: "ask" | "blocked" | "complete";
  phase: "line" | "multiplier" | "ready" | "blocked";
  reason: string | null;
  catalogVersion: string | null;
  fields: QuoteButtonScreenField[];
  kept: Record<string, unknown>;
  sent: false;
};

export type QuoteButtonBatchResult = {
  accepted: Record<string, unknown>;
  reask: QuoteButtonReask[];
  lines: QuoteButtonLine[];
  next: QuoteButtonBatchNext;
  saved: boolean;
  reason: string | null;
  message: string;
  sent: false;
  operations: QuoteButtonStructureOperation[];
  quote: { id: string; status: "draft"; sent: false; revision: number; quoteV2Status: "draft" | "stale" } | null;
};

type ScreenModel = {
  fields: QuoteButtonScreenField[];
  byKey: Map<string, QuoteButtonScreenField>;
  duplicates: Array<{ key: string; source: string }>;
};

export async function nextQuoteButtonBatch(
  store: QuoteFrontDoorStore,
  input: { manufacturer: string; category: string; spec?: QuoteFrontDoorSpec | null; packs?: QuoteButtonFieldPack[] },
): Promise<QuoteButtonBatchNext> {
  const sequence = await nextQuoteFrontDoorField(store, input);
  if (sequence.phase === "blocked" || (sequence.status === "blocked" && !sequence.catalog_version)) {
    return {
      status: "blocked",
      phase: "blocked",
      reason: sequence.reason,
      catalogVersion: null,
      fields: [],
      kept: {},
      sent: false,
    };
  }
  const model = await screenModel(store, input.manufacturer, input.category, sequence.catalog_version, input.packs ?? []);
  const kept = { ...(sequence.kept ?? {}) };
  const visible = model.fields
    .filter((field) => !hasValue(kept[field.fieldKey]))
    .filter((field) => field.dependsOn.every((dependency) => hasValue(kept[dependency])))
    .sort((left, right) => left.askOrder - right.askOrder || left.fieldKey.localeCompare(right.fieldKey));
  const waiting = model.fields.some((field) => !hasValue(kept[field.fieldKey]) && !visible.some((item) => item.fieldKey === field.fieldKey));
  if (visible.length === 0 && !waiting && sequence.phase === "ready") {
    return { status: "complete", phase: "ready", reason: null, catalogVersion: sequence.catalog_version, fields: [], kept, sent: false };
  }
  if (visible.length === 0 && !waiting && (sequence.phase === "multiplier" || sequence.status === "complete")) {
    return {
      status: "ask",
      phase: "multiplier",
      reason: sequence.phase === "multiplier" ? sequence.reason : null,
      catalogVersion: sequence.catalog_version,
      fields: [multiplierField()],
      kept,
      sent: false,
    };
  }
  return {
    status: "ask",
    phase: "line",
    reason: visible.length === 0 && sequence.field_key ? `Still needed: ${quoteFrontDoorFieldLabel(sequence.field_key)}` : null,
    catalogVersion: sequence.catalog_version,
    fields: visible,
    kept,
    sent: false,
  };
}

export async function validateQuoteButtonBatch(
  store: QuoteFrontDoorStore,
  input: {
    manufacturer: string;
    category: string;
    spec?: QuoteFrontDoorSpec | null;
    picks: Record<string, unknown>;
    lines?: QuoteButtonLine[];
    applyToLineIds?: string[];
    quote?: { id: string; expectedRevision: number; idempotencyKey: string } | null;
    packs?: QuoteButtonFieldPack[];
  },
  actor: FrontDoorActor,
  writer?: QuoteStructureWriter,
): Promise<QuoteButtonBatchResult> {
  const sequence = await nextQuoteFrontDoorField(store, input);
  const prepared = sequenceSpec(input.spec);
  const model = sequence.catalog_version || sequence.status !== "blocked"
    ? await screenModel(store, input.manufacturer, input.category, sequence.catalog_version, input.packs ?? [])
    : emptyModel();
  const working: Record<string, unknown> = { ...(prepared.spec.answers ?? {}) };
  const accepted: Record<string, unknown> = {};
  const reask: QuoteButtonReask[] = [];
  const ordered = Object.keys(input.picks).sort((left, right) => (model.byKey.get(left)?.askOrder ?? 100000) - (model.byKey.get(right)?.askOrder ?? 100000));
  for (const fieldKey of ordered) {
    const field = fieldKey === "multiplier" ? multiplierField() : model.byKey.get(fieldKey) ?? unknownField(fieldKey);
    const canonical = canonicalButtonValue(field, input.picks[fieldKey]);
    if (!canonical.ok) {
      reask.push({ fieldKey, reason: canonical.reason, choices: field.choices });
      continue;
    }
    const checked = fieldKey === "multiplier"
      ? await validateQuoteFrontDoorTap(store, {
          manufacturer: input.manufacturer,
          category: input.category,
          fieldKey,
          value: canonical.value,
          spec: { ...prepared.spec, answers: working, multiplier: null },
        })
      : await store.validateTappedValue(
          { ...prepared.spec, answers: withoutMultiplier(working) },
          input.manufacturer.trim(),
          input.category.trim(),
          fieldKey,
          canonical.value,
        );
    if (!checked.ok) {
      reask.push({ fieldKey, reason: checked.reason, choices: checked.choices.length ? checked.choices : field.choices });
      continue;
    }
    accepted[fieldKey] = canonical.value;
    if (fieldKey !== "multiplier") working[fieldKey] = canonical.value;
  }
  for (const duplicate of model.duplicates) {
    if (hasValue(accepted[duplicate.source]) && !hasValue(input.picks[duplicate.key])) {
      working[duplicate.key] = accepted[duplicate.source];
      accepted[duplicate.key] = accepted[duplicate.source];
    }
  }
  for (const field of model.fields) {
    if (!field.recheckAgainst.some((dependency) => Object.prototype.hasOwnProperty.call(accepted, dependency))) continue;
    if (!hasValue(working[field.fieldKey]) || reask.some((item) => item.fieldKey === field.fieldKey)) continue;
    if (Object.prototype.hasOwnProperty.call(accepted, field.fieldKey)) continue;
    const checked = await store.validateTappedValue(
      { ...prepared.spec, answers: withoutMultiplier(working) },
      input.manufacturer.trim(),
      input.category.trim(),
      field.fieldKey,
      working[field.fieldKey],
    );
    if (!checked.ok) {
      reask.push({ fieldKey: field.fieldKey, reason: checked.reason, choices: checked.choices.length ? checked.choices : field.choices });
      delete working[field.fieldKey];
    }
  }
  const reaskKeys = new Set(reask.map((item) => item.fieldKey));
  for (const key of reaskKeys) delete accepted[key];
  const applied = applyPicks(input.lines ?? [], input.applyToLineIds ?? [], accepted, reaskKeys);
  const multiplier = canonicalMultiplier(accepted.multiplier ?? prepared.multiplier);
  const next = await nextQuoteButtonBatch(store, {
    manufacturer: input.manufacturer,
    category: input.category,
    spec: {
      ...prepared.spec,
      answers: withoutMultiplier(working),
      multiplier,
      catalog_version: sequence.catalog_version,
    },
    packs: input.packs,
  });
  const chosenLines = applied.lines.filter((line) => applied.chosen.includes(line.id));
  const operations = quoteButtonLineOperations(chosenLines, accepted);
  const empty = (reason: string, message: string) => ({
    accepted,
    reask,
    lines: applied.lines,
    next,
    saved: false as const,
    reason,
    message,
    sent: false as const,
    operations,
    quote: null,
  });
  if (sequence.phase === "blocked" && !sequence.catalog_version) return empty("blocked", sequence.reason ?? "This manufacturer is not in the quote sequence.");
  if (Object.keys(accepted).length === 0) return empty(reask.length ? "needs_input" : "no_picks", reask.length ? "One field needs another choice." : "Nothing to save.");
  if (applied.chosen.length === 0 || operations.length === 0) return empty("no_lines", "Choose at least one line.");
  if (!input.quote?.id || !input.quote.idempotencyKey || !Number.isInteger(input.quote.expectedRevision)) {
    return empty("quote_required", "Choose the CRM quote draft before saving.");
  }
  if (!actor.userId) return empty("actor_required", "A signed-in staff member is required.");
  if (!writer) return empty("quote_required", "Choose the CRM quote draft before saving.");
  const savedQuote = await writer.save({
    quoteId: input.quote.id,
    actorId: actor.userId,
    expectedRevision: input.quote.expectedRevision,
    idempotencyKey: input.quote.idempotencyKey,
    operations,
  });
  if (savedQuote.status !== "draft") return empty("not_draft", "The quote did not stay a draft.");
  return {
    accepted,
    reask,
    lines: applied.lines,
    next,
    saved: true,
    reason: reask.length ? "needs_input" : null,
    message: reask.length ? "Draft saved. One field needs another choice." : "Draft quote saved.",
    sent: false,
    operations,
    quote: { id: savedQuote.quoteId, status: "draft", sent: false, revision: savedQuote.revision, quoteV2Status: savedQuote.quoteV2Status },
  };
}

const LINE_MEASURE_KEYS = new Set(["room_location", "quantity", "ordered_width", "ordered_height", "multiplier"]);

const DESIGN_COLUMNS: Record<string, string> = {
  mount_type: "mountType",
  product_type: "productType",
  supplier: "supplier",
  material: "material",
  louver_size: "louverSize",
  tilt_type: "tiltType",
  hinge_color: "hingeColor",
  panel_config: "panelConfig",
  shade_type: "shadeType",
  lift_system: "liftSystem",
  valance: "valance",
  fabric: "fabric",
  motor_type: "motorType",
  remote_type: "remoteType",
};

export function quoteButtonLineOperations(lines: QuoteButtonLine[], accepted: Record<string, unknown>): QuoteButtonStructureOperation[] {
  const operations: QuoteButtonStructureOperation[] = [];
  for (const line of lines) {
    const linePatch: Record<string, unknown> = {};
    const designPatch: Record<string, unknown> = {};
    const options: Record<string, unknown> = { ...(line.options ?? {}) };
    if (typeof accepted.room_location === "string") linePatch.roomName = accepted.room_location;
    if (typeof accepted.quantity === "number") linePatch.quantity = accepted.quantity;
    if (typeof accepted.ordered_width === "number") {
      const width = splitInches(accepted.ordered_width, "1/8");
      linePatch.widthWhole = width.whole;
      linePatch.widthFraction = width.fraction;
    }
    if (typeof accepted.ordered_height === "number") {
      const height = splitInches(accepted.ordered_height, "1/8");
      linePatch.heightWhole = height.whole;
      linePatch.heightFraction = height.fraction;
    }
    for (const [key, value] of Object.entries(accepted)) {
      if (LINE_MEASURE_KEYS.has(key)) continue;
      if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") continue;
      const column = DESIGN_COLUMNS[key];
      if (column && typeof value === "string") designPatch[column] = value;
      options[key] = value;
    }
    if (Object.keys(linePatch).length) {
      operations.push({ type: "line.update", lineItemId: line.id, patch: linePatch });
    }
    if (Object.keys(designPatch).length || Object.keys(options).length) {
      if (Object.keys(options).length) designPatch.optionsJson = options;
      operations.push({
        type: "design.upsert",
        lineItemId: line.id,
        ...(line.designId ? { designId: line.designId } : {}),
        variant: line.variant || "A",
        selectDesign: true,
        patch: designPatch,
      });
    }
  }
  return operations;
}

export function salesQuoteStructureWriter(supabase: SupabaseClient): QuoteStructureWriter {
  return {
    async save(input) {
      const parsed = parseSalesQuoteV2StructureBody({
        expectedRevision: input.expectedRevision,
        idempotencyKey: input.idempotencyKey,
        operations: input.operations,
      });
      const result = await mutateSalesQuoteV2Structure(supabase, input.quoteId, input.actorId, parsed);
      return {
        quoteId: result.quoteId,
        revision: result.revision,
        status: "draft",
        quoteV2Status: result.quoteV2Status,
      };
    },
  };
}

export function canonicalButtonValue(field: QuoteButtonScreenField, value: unknown): { ok: true; value: unknown } | { ok: false; reason: string } {
  if (field.control === "pending" || (field.pending && field.choices.length === 0 && field.extras.length === 0)) {
    return { ok: false, reason: "Choices are not loaded for this field." };
  }
  if (field.control === "dimension") {
    if (typeof value === "string" && field.extras.includes(value)) return { ok: true, value };
    if (!isDimensionStep(value, field.step)) return { ok: false, reason: `${field.label} must be inches to the nearest ${field.step ?? "1/8"} inch` };
    return { ok: true, value };
  }
  if (field.control === "notes" || field.multi) {
    const picked = Array.isArray(value) ? value : typeof value === "string" ? value.split(",").map((item) => item.trim()).filter(Boolean) : [];
    const texts = picked.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim());
    if (!texts.length) return { ok: false, reason: "value is empty" };
    if (texts.some((item) => !field.choices.some((choice) => choice.value === item))) return { ok: false, reason: "value is not a catalog choice" };
    return { ok: true, value: texts.join(", ") };
  }
  if (field.control === "quantity" || field.valueKind === "number") {
    const numeric = typeof value === "number" ? value : typeof value === "string" && /^\d+$/.test(value.trim()) ? Number(value.trim()) : Number.NaN;
    const allowed = new Set(field.choices.map((choice) => choice.value));
    if (!Number.isInteger(numeric) || numeric < 0 || (allowed.size > 0 && !allowed.has(String(numeric)))) {
      return { ok: false, reason: "value is not a catalog choice" };
    }
    return { ok: true, value: numeric };
  }
  if (field.valueKind === "boolean") {
    if (value !== true && value !== false && value !== "true" && value !== "false") return { ok: false, reason: "value is not a catalog choice" };
    return { ok: true, value: value === true || value === "true" };
  }
  const text = typeof value === "string" ? value.trim() : typeof value === "number" || typeof value === "boolean" ? String(value) : "";
  if (!text) return { ok: false, reason: "value is empty" };
  if (field.fieldKey === "multiplier" && !canonicalMultiplier(text)) return { ok: false, reason: "Multiplier must be one of the 805 margin choices." };
  if (field.choices.length > 0 && !field.choices.some((choice) => choice.value === text) && !field.extras.includes(text)) {
    return { ok: false, reason: "value is not a catalog choice" };
  }
  return { ok: true, value: text };
}

async function screenModel(
  store: QuoteFrontDoorStore,
  manufacturer: string,
  category: string,
  catalogVersion: string | null,
  packs: QuoteButtonFieldPack[],
): Promise<ScreenModel> {
  const product = quoteButtonProduct(manufacturer.trim(), category.trim(), packs);
  const guide = new Map((product?.fields ?? []).map((field) => [field.key, field]));
  const rows = catalogVersion ? await store.sequenceRows(catalogVersion) : [];
  const choiceRows = catalogVersion ? await store.choiceRows(catalogVersion) : [];
  const dbChoices = new Map<string, SequenceChoice[]>();
  for (const row of choiceRows) {
    const list = dbChoices.get(row.field_key) ?? [];
    if (!list.some((choice) => choice.value === row.value)) list.push({ value: row.value, label: row.label });
    dbChoices.set(row.field_key, list);
  }
  const source = rows.length ? rowsFromSequence(rows, guide) : rowsFromGuide(guide);
  const fields = source.map((row) => toScreenField(row, guide.get(row.fieldKey), dbChoices.get(row.fieldKey) ?? []));
  return {
    fields,
    byKey: new Map(fields.map((field) => [field.fieldKey, field])),
    duplicates: [...guide.values()].filter((field) => field.skip && field.duplicateOf).map((field) => ({ key: field.key, source: field.duplicateOf as string })),
  };
}

function rowsFromSequence(rows: SequenceDetailRow[], guide: Map<string, QuoteButtonGuideField>) {
  return rows
    .filter((row) => row.required && !ORDER_FIELDS.has(row.field_key) && !guide.get(row.field_key)?.skip)
    .map((row) => {
      const guideField = guide.get(row.field_key);
      return {
        fieldKey: row.field_key,
        askOrder: row.ask_order,
        inputKind: row.input_kind,
        dependsOn: unique([...(row.depends_on ?? []), ...(guideField?.dependsOn ?? []), ...(guideField?.laterThan ?? [])]),
      };
    });
}

function rowsFromGuide(guide: Map<string, QuoteButtonGuideField>) {
  return [...guide.values()]
    .filter((field) => field.required && !field.skip && !ORDER_FIELDS.has(field.key))
    .map((field) => ({
      fieldKey: field.key,
      askOrder: field.askOrder,
      inputKind: field.control === "buttons" || field.control === "yesno" ? "buttons" : "typed",
      dependsOn: unique([...field.dependsOn, ...field.laterThan]),
    }));
}

function toScreenField(
  row: { fieldKey: string; askOrder: number; inputKind: string; dependsOn: string[] },
  guide: QuoteButtonGuideField | undefined,
  dbChoices: SequenceChoice[],
): QuoteButtonScreenField {
  let control: QuoteButtonControl = guide?.control ?? inferControl(row.fieldKey, row.inputKind, dbChoices.length);
  let choices = guide?.choices ?? [];
  let pending = guide?.pending ?? control === "pending";
  const extras = guide?.extras ?? [];
  if (row.fieldKey === "ordered_width" || row.fieldKey === "ordered_height") control = "dimension";
  if (row.fieldKey === "room_location") control = "room";
  if (row.fieldKey === "quantity") control = "quantity";
  if (dbChoices.length && control !== "dimension" && control !== "room" && control !== "quantity" && control !== "notes") {
    choices = dbChoices;
    pending = false;
    if (control === "pending") control = "buttons";
  }
  if (control === "room" && choices.length === 0) {
    const room = guide?.choices ?? [];
    choices = room;
    pending = false;
  }
  if ((control === "pending" || pending) && choices.length === 0 && control !== "dimension" && control !== "quantity" && control !== "notes") {
    control = "pending";
    pending = true;
  }
  const step = control === "dimension" ? guide?.step ?? (row.fieldKey === "ordered_width" || row.fieldKey === "ordered_height" ? "1/8" : "1/8") : null;
  const defaultValue = keepDefault(guide?.defaultValue ?? null, choices, control);
  return {
    fieldKey: row.fieldKey,
    label: quoteFrontDoorFieldLabel(row.fieldKey),
    control,
    required: true,
    multi: control === "notes" || guide?.multi === true,
    choices,
    defaultValue,
    step,
    pending,
    askOrder: row.askOrder,
    recheckAgainst: guide?.recheckAgainst ?? [],
    valueKind: valueKindFor(control, guide?.valueKind),
    extras,
    dependsOn: row.dependsOn,
  };
}

function inferControl(fieldKey: string, inputKind: string, choiceCount: number): QuoteButtonControl {
  if (fieldKey === "ordered_width" || fieldKey === "ordered_height") return "dimension";
  if (fieldKey === "room_location") return "room";
  if (fieldKey === "quantity") return "quantity";
  if (inputKind === "buttons" && choiceCount > 0) return "buttons";
  if (choiceCount > 0) return "buttons";
  return "pending";
}

function valueKindFor(control: QuoteButtonControl, guide: QuoteButtonValueKind | undefined): QuoteButtonValueKind {
  if (control === "dimension" || control === "quantity") return "number";
  return guide ?? "string";
}

function keepDefault(value: string | string[] | null, choices: QuoteButtonChoice[], control: QuoteButtonControl) {
  if (value == null) return control === "quantity" ? null : null;
  if (typeof value === "string") {
    if (choices.length === 0 || choices.some((choice) => choice.value === value) || control === "quantity") return value;
    return null;
  }
  const kept = value.filter((item) => choices.some((choice) => choice.value === item));
  return kept.length ? kept : null;
}

function multiplierField(): QuoteButtonScreenField {
  return {
    fieldKey: "multiplier",
    label: "Multiplier",
    control: "buttons",
    required: true,
    multi: false,
    choices: multiplierChoices(),
    defaultValue: null,
    step: null,
    pending: false,
    askOrder: 100000,
    recheckAgainst: [],
    valueKind: "string",
    extras: [],
    dependsOn: [],
  };
}

function unknownField(fieldKey: string): QuoteButtonScreenField {
  return {
    fieldKey,
    label: quoteFrontDoorFieldLabel(fieldKey),
    control: "pending",
    required: true,
    multi: false,
    choices: [],
    defaultValue: null,
    step: null,
    pending: true,
    askOrder: 100000,
    recheckAgainst: [],
    valueKind: "string",
    extras: [],
    dependsOn: [],
  };
}

function applyPicks(lines: QuoteButtonLine[], requestedIds: string[], accepted: Record<string, unknown>, reask: Set<string>) {
  const picks = Object.fromEntries(Object.entries(accepted).filter(([key]) => key !== "multiplier" && !reask.has(key)));
  const base = lines.length ? lines.map((line) => ({ ...line, answers: { ...line.answers } })) : [{ id: "1", label: "Line 1", answers: {} }];
  const chosen = requestedIds.length ? requestedIds : lines.length ? [] : ["1"];
  const byId = new Map(base.map((line) => [line.id, line]));
  for (const id of chosen) {
    const current = byId.get(id) ?? { id, label: `Line ${id}`, answers: {} };
    const answers = { ...current.answers, ...picks };
    for (const key of reask) delete answers[key];
    byId.set(id, { ...current, answers });
  }
  const ordered = base.map((line) => byId.get(line.id) ?? line);
  for (const id of chosen) {
    if (!base.some((line) => line.id === id)) {
      const created = byId.get(id);
      if (created) ordered.push(created);
    }
  }
  return { lines: ordered, chosen };
}

function emptyModel(): ScreenModel {
  return { fields: [], byKey: new Map(), duplicates: [] };
}

function withoutMultiplier(answers: Record<string, unknown>) {
  const next = { ...answers };
  delete next.multiplier;
  return next;
}

function hasValue(value: unknown) {
  if (value == null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}
