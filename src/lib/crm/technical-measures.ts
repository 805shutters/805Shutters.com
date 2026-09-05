import { enrichMeasureOrders } from "./technical-measure-orders-server";
import { collectCrmPages } from "./pagination";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CrmAuthError } from "@/lib/crm/auth";
import { recordCrmActivity } from "@/lib/crm/backend";
import { parseAdjustments, round2, selectedDesign } from "@/lib/crm/quote-builder";
import { loadQuoteBuilder } from "@/lib/crm/quote-builder";
import { getMeasureNeededMeta, MEASURE_NEEDED_META_KEY } from "@/lib/crm/measure-needed-state";
import type { CrmJob, CrmQuote, CrmQuoteDesign, CrmQuoteDetailValue } from "@/lib/crm/types";
import { sendEmail, type EmailResult } from "@/lib/notify/email";
import {
  enqueueOnyxShutterPreparations,
  enqueueVendorOrderPreparations,
  type VendorOrderPreparationSummary,
} from "@/lib/crm/vendor-orders/norman-order-preparation";
import {
  upsertOnyxCustomerFileArtifact,
  type OnyxAgentOrderPacket,
} from "@/lib/crm/vendor-orders/onyx-order-packet";
import {
  buildTechnicalMeasureOrderManifest,
  upsertManufacturerOrderManifestArtifact,
} from "@/lib/crm/vendor-orders/manufacturer-order-artifacts";
import {
  resolveManufacturerTechnicalMeasureSchema,
  type ManufacturerTechnicalMeasureSchema,
} from "@/lib/crm/vendor-orders/manufacturer-technical-measure-schemas";
import { persistVendorOrderPreparations } from "@/lib/crm/vendor-orders/manufacturer-order-task-store";
import { normalizeInstallationDurationMinutes } from "@/lib/crm/installation-handoff";
import { preserveTechnicalMeasureNotes } from "@/lib/crm/technical-measure-edits";
import { technicalMeasureCompletionIssues } from "@/lib/crm/technical-measure-completion";

type CrmActor = { email: string; userId?: string; displayName?: string | null };

export type SignaturePoint = { x: number; y: number };
export type SignatureStroke = SignaturePoint[];

export type TechnicalMeasureLineValues = {
  design_id: string | null;
  room: string;
  opening_label: string;
  width_in: number | null;
  height_in: number | null;
  quantity: number;
  notes: string;
  product_id: string;
  program_id: string | null;
  fabric: string | null;
  details: Record<string, CrmQuoteDetailValue>;
  motorization: Array<{ groupId: string; optionId: string; units?: number }>;
  surcharges: Array<{ id: string; units?: number }>;
  discount_percent: number;
  measure_complete?: boolean;
  width_confirmed?: boolean;
  height_confirmed?: boolean;
};

export type FutureMeasureEntry = {
  id: string;
  room: string;
  width_in: number;
  height_in: number;
  notes: string;
  created_at: string;
  created_by: string;
};

export type TechnicalMeasureScheduling = {
  status: "unscheduled" | "scheduled";
  scheduled_at: string | null;
  scheduled_by: string | null;
  scheduled_start_at: string | null;
  scheduled_end_at: string | null;
  calendar_event_id: string | null;
};

export type TechnicalMeasureChange = {
  lineId: string;
  room: string;
  field: string;
  label: string;
  original: string;
  revised: string;
  kind: "measurement" | "internal" | "contract";
};

export type TechnicalMeasureLine = {
  id: string;
  form_id: string;
  quote_line_item_id: string;
  sort_order: number;
  baseline: TechnicalMeasureLineValues;
  current_values: TechnicalMeasureLineValues;
  baseline_unit_price: number;
  current_unit_price: number;
  price_status: string;
  changes: TechnicalMeasureChange[];
  measure_schema?: ManufacturerTechnicalMeasureSchema | null;
  source_quote_line_item_id?: string;
  source_quantity_index?: number;
  source_quantity?: number;
};

export type TechnicalMeasureLineInstance = {
  measure_quote_line_item_id: string;
  source_quote_line_item_id: string;
  source_quantity_index: number;
  source_quantity: number;
  sort_order: number;
};

export type TechnicalMeasureAddendum = {
  id: string;
  form_id: string;
  status: "required" | "signed" | "emailed" | "email_failed" | "superseded";
  changes: TechnicalMeasureChange[];
  original_total: number;
  revised_total: number;
  price_difference: number;
  acknowledged: boolean;
  signer_name: string | null;
  signature_strokes: SignatureStroke[] | null;
  signed_at: string | null;
  signed_by_technician: string | null;
  emailed_at: string | null;
  email_recipient: string | null;
  email_message_id: string | null;
  email_error: string | null;
};

export type TechnicalMeasureForm = {
  contractUrl?: string | null;
  id: string;
  created_at: string;
  updated_at: string;
  job_id: string;
  quote_id: string;
  customer_id: string | null;
  contract_id: string | null;
  status: "draft" | "awaiting_signature" | "submitted";
  customer_snapshot: {
    name: string;
    email: string | null;
    phone: string | null;
    address: string | null;
    city: string | null;
  };
  quote_snapshot: { quoteNumber: string | null; signedAt: string | null; adjustments: Record<string, unknown> };
  baseline_total: number;
  current_total: number;
  technician_email: string | null;
  technician_name: string | null;
  submitted_at: string | null;
  meta: Record<string, unknown>;
  lines: TechnicalMeasureLine[];
  addendum: TechnicalMeasureAddendum | null;
  changes: TechnicalMeasureChange[];
  contractChanges: TechnicalMeasureChange[];
  requiresAddendum: boolean;
  futureMeasures?: FutureMeasureEntry[];
  scheduling?: TechnicalMeasureScheduling;
};

export function technicalMeasureIsArchived(form: Pick<TechnicalMeasureForm, "meta"> | Record<string, unknown>) {
  const meta = "meta" in form ? object(form.meta) : object(form);
  return Boolean(nullableText(meta.archived_at));
}

export function technicalMeasureInstallationDuration(
  form: Pick<TechnicalMeasureForm, "meta">,
): number | null {
  try {
    return normalizeInstallationDurationMinutes(form.meta.installation_duration_minutes);
  } catch {
    return null;
  }
}

export function technicalMeasureFormUrl(formId: string): string {
  const origin = (process.env.NEXT_PUBLIC_SITE_URL || "https://805shutters.com").replace(/\/+$/, "");
  return `${origin}/crm/technical-measures/${encodeURIComponent(formId)}`;
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function nullableText(value: unknown) {
  const valueText = text(value);
  return valueText || null;
}

function numeric(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function dimension(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0 || number > 300) throw new CrmAuthError(400, "Measurements must be valid positive inches.");
  return Math.round(number * 16) / 16;
}

export function normalizeFutureMeasureInput(value: unknown) {
  const source = object(value);
  const room = text(source.room) || "Future Window";
  const width_in = dimension(source.width_in);
  const height_in = dimension(source.height_in);
  if (!width_in || !height_in) throw new CrmAuthError(400, "Width and height are required for a future measure.");
  return { room, width_in, height_in, notes: text(source.notes) };
}

function futureMeasures(value: unknown): FutureMeasureEntry[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const source = object(item);
    try {
      const normalized = normalizeFutureMeasureInput(source);
      return [{
        id: text(source.id) || crypto.randomUUID(),
        ...normalized,
        created_at: text(source.created_at) || new Date(0).toISOString(),
        created_by: text(source.created_by),
      }];
    } catch {
      return [];
    }
  });
}

export function technicalMeasureScheduling(value: unknown): TechnicalMeasureScheduling {
  const source = object(value);
  return {
    status: source.status === "scheduled" ? "scheduled" : "unscheduled",
    scheduled_at: nullableText(source.scheduled_at),
    scheduled_by: nullableText(source.scheduled_by),
    scheduled_start_at: nullableText(source.scheduled_start_at),
    scheduled_end_at: nullableText(source.scheduled_end_at),
    calendar_event_id: nullableText(source.calendar_event_id),
  };
}

export function normalizeTechnicalMeasureScheduleWindow(startAt: unknown, endAt: unknown) {
  const start = new Date(text(startAt));
  const end = new Date(text(endAt));
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) {
    throw new CrmAuthError(400, "Choose a valid technical measure date and time.");
  }
  return { startAt: start.toISOString(), endAt: end.toISOString() };
}

function detailRecord(value: unknown): Record<string, CrmQuoteDetailValue> {
  const source = object(value);
  return Object.fromEntries(
    Object.entries(source).filter(([, item]) => item === null || typeof item === "string" || typeof item === "number" || typeof item === "boolean"),
  ) as Record<string, CrmQuoteDetailValue>;
}

function selectionList(value: unknown, mode: "motorization" | "surcharges") {
  if (!Array.isArray(value)) return [];
  const result: Array<Record<string, string | number>> = [];
  for (const item of value) {
    const row = object(item);
    if (mode === "motorization") {
      const groupId = text(row.groupId);
      const optionId = text(row.optionId);
      if (!groupId || !optionId) continue;
      const units = Math.max(1, Math.floor(numeric(row.units, 1)));
      result.push({ groupId, optionId, ...(units > 1 ? { units } : {}) });
      continue;
    }
    const id = text(row.id);
    if (!id) continue;
    const units = Math.max(1, Math.floor(numeric(row.units, 1)));
    result.push({ id, ...(units > 1 ? { units } : {}) });
  }
  return result;
}

export function normalizeTechnicalMeasureLineValues(value: unknown, fallback?: TechnicalMeasureLineValues): TechnicalMeasureLineValues {
  const source = object(value);
  return {
    design_id: nullableText(source.design_id ?? fallback?.design_id),
    room: text(source.room) || fallback?.room || "Window",
    opening_label: text(source.opening_label ?? fallback?.opening_label),
    width_in: dimension(source.width_in ?? fallback?.width_in),
    height_in: dimension(source.height_in ?? fallback?.height_in),
    quantity: Math.max(1, Math.floor(numeric(source.quantity, fallback?.quantity || 1))),
    notes: preserveTechnicalMeasureNotes(source.notes, fallback?.notes),
    product_id: text(source.product_id) || fallback?.product_id || "",
    program_id: nullableText(source.program_id ?? fallback?.program_id),
    fabric: nullableText(source.fabric ?? fallback?.fabric),
    details: detailRecord(source.details ?? fallback?.details),
    motorization: selectionList(source.motorization ?? fallback?.motorization, "motorization") as TechnicalMeasureLineValues["motorization"],
    surcharges: selectionList(source.surcharges ?? fallback?.surcharges, "surcharges") as TechnicalMeasureLineValues["surcharges"],
    discount_percent: Math.min(100, Math.max(0, numeric(source.discount_percent, fallback?.discount_percent || 0))),
    measure_complete: source.measure_complete === true || (source.measure_complete === undefined && fallback?.measure_complete === true),
    width_confirmed: source.width_confirmed === true || (source.width_confirmed === undefined && fallback?.width_confirmed === true),
    height_confirmed: source.height_confirmed === true || (source.height_confirmed === undefined && fallback?.height_confirmed === true),
  };
}

function display(value: unknown) {
  if (value === null || value === undefined || value === "") return "Not specified";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.length ? value.map((item) => JSON.stringify(item)).join(", ") : "None";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function fieldLabel(field: string) {
  const known: Record<string, string> = {
    width_in: "Width",
    height_in: "Height",
    quantity: "Quantity",
    opening_label: "Opening",
    product_id: "Product",
    program_id: "Program / operating system",
    fabric: "Color / fabric",
    motorization: "Motorization",
    surcharges: "Product options",
  };
  return known[field] || field.replace(/^details\./, "").replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function equal(left: unknown, right: unknown) {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

const INTERNAL_MEASURE_DETAIL_KEYS = new Set([
  "supplier",
  "window_type",
  "installation_location",
  "fabric_color_type",
  "fabric_color_collection",
  "fabric_color_code",
  "fabric_color_name",
  "fabric_direction",
  "fabric_join_confirmed",
  "bracket_type",
  "raceway",
  "light_guard",
  "hold_downs",
  "hold_down_color",
  "frame_sides",
  "field_measure_custom_room",
  "field_measure_bedroom",
]);

function comparableContractDetail(key: string, value: unknown) {
  const normalized = String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
  if (key === "lift_system" && ["cordless", "precisionlift cordless", "precisionlift™ cordless"].includes(normalized)) return "precisionlift cordless";
  if (key === "hem_bar" && ["fabric covered", "fabric-wrapped", "fabric wrapped"].includes(normalized)) return "fabric wrapped";
  if (key === "roll_type" && ["standard", "standard roll", "regular roll"].includes(normalized)) return "standard";
  return value;
}

export function technicalMeasureLineChanges(lineId: string, baseline: TechnicalMeasureLineValues, current: TechnicalMeasureLineValues): TechnicalMeasureChange[] {
  const changes: TechnicalMeasureChange[] = [];
  const add = (field: string, original: unknown, revised: unknown, kind: TechnicalMeasureChange["kind"]) => {
    if (equal(original, revised)) return;
    changes.push({ lineId, room: current.room || baseline.room, field, label: fieldLabel(field), original: display(original), revised: display(revised), kind });
  };
  add("width_in", baseline.width_in, current.width_in, "measurement");
  add("height_in", baseline.height_in, current.height_in, "measurement");
  add("room", baseline.room, current.room, "internal");
  add("opening_label", baseline.opening_label, current.opening_label, "internal");
  add("notes", baseline.notes, current.notes, "internal");
  add("quantity", baseline.quantity, current.quantity, "contract");
  add("product_id", baseline.product_id, current.product_id, "contract");
  add("program_id", baseline.program_id, current.program_id, "contract");
  add("fabric", baseline.fabric, current.fabric, "contract");
  add("motorization", baseline.motorization, current.motorization, "contract");
  add("surcharges", baseline.surcharges, current.surcharges, "contract");
  const detailKeys = new Set([...Object.keys(baseline.details), ...Object.keys(current.details)]);
  for (const key of detailKeys) {
    const kind = INTERNAL_MEASURE_DETAIL_KEYS.has(key) ? "internal" : "contract";
    const original = kind === "contract" ? comparableContractDetail(key, baseline.details[key]) : baseline.details[key];
    const revised = kind === "contract" ? comparableContractDetail(key, current.details[key]) : current.details[key];
    add(`details.${key}`, original, revised, kind);
  }
  return changes;
}

export function requiresTechnicalMeasureAddendum(changes: TechnicalMeasureChange[]) {
  return changes.some((change) => change.kind === "contract");
}

function lineSnapshot(line: { room: string | null; width_in: number | null; height_in: number | null; quantity: number; notes: string | null; discount_percent: number }, design: CrmQuoteDesign): TechnicalMeasureLineValues {
  const details = { ...detailRecord(design.details) };
  const priceBreakdown = object(design.price_breakdown);
  const legacyDetails = priceBreakdown.details;
  if (Array.isArray(legacyDetails)) {
    for (const item of legacyDetails) {
      const row = object(item);
      const key = text(row.label).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
      if (key && !Object.prototype.hasOwnProperty.call(details, key)) details[key] = text(row.value);
    }
  }
  const legacyOptions = detailRecord(priceBreakdown.optionsJson);
  for (const [key, value] of Object.entries(legacyOptions)) {
    if (!Object.prototype.hasOwnProperty.call(details, key)) details[key] = value;
  }
  return normalizeTechnicalMeasureLineValues({
    design_id: design.id,
    room: line.room,
    width_in: line.width_in,
    height_in: line.height_in,
    quantity: line.quantity,
    notes: line.notes || design.notes,
    product_id: design.product_id,
    program_id: design.program_id,
    fabric: design.fabric,
    details,
    motorization: design.motorization,
    surcharges: design.surcharges,
    discount_percent: line.discount_percent,
  });
}

function selectedSignedLineIds(quote: CrmQuote) {
  const ids = object(object(quote.meta).signed_selection).lineItemIds;
  return Array.isArray(ids) ? new Set(ids.filter((id): id is string => typeof id === "string")) : null;
}

function deterministicWindowLineId(sourceLineId: string, quantityIndex: number) {
  const hex = createHash("sha256")
    .update(`805-technical-measure:${sourceLineId}:window:${quantityIndex}`)
    .digest("hex")
    .slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20)}`;
}

export function expandTechnicalMeasureLineQuantity(input: {
  id: string;
  quantity: number;
  sort_order: number;
}): TechnicalMeasureLineInstance[] {
  const quantity = Math.max(1, Math.floor(Number(input.quantity) || 1));
  return Array.from({ length: quantity }, (_, offset) => {
    const quantityIndex = offset + 1;
    return {
      measure_quote_line_item_id: quantityIndex === 1
        ? input.id
        : deterministicWindowLineId(input.id, quantityIndex),
      source_quote_line_item_id: input.id,
      source_quantity_index: quantityIndex,
      source_quantity: quantity,
      sort_order: quantity === 1 ? input.sort_order : input.sort_order * 1000 + offset,
    };
  });
}

export function normalizeTechnicalMeasureLineInstanceSort<
  T extends { instance: TechnicalMeasureLineInstance },
>(entries: T[]): T[] {
  return entries.map((entry, sortOrder) => ({
    ...entry,
    instance: { ...entry.instance, sort_order: sortOrder },
  }));
}

async function updateJobMeasureFormMeta(supabase: SupabaseClient, job: CrmJob, formId: string, formStatus: string) {
  const measure = getMeasureNeededMeta(job.meta);
  const storedForms = Array.isArray((measure as Record<string, unknown>).forms)
    ? ((measure as Record<string, unknown>).forms as unknown[]).map(object)
    : [];
  const legacyFormId = text((measure as Record<string, unknown>).form_id);
  const savedForms = storedForms.length || !legacyFormId
    ? storedForms
    : [{ id: legacyFormId, status: text((measure as Record<string, unknown>).form_status) || "draft" }];
  const nextForms = [
    ...savedForms.filter((form) => text(form.id) !== formId),
    { id: formId, status: formStatus },
  ];
  await supabase.from("crm_jobs").update({
    meta: {
      ...object(job.meta),
      [MEASURE_NEEDED_META_KEY]: { ...measure, form_id: formId, form_status: formStatus, forms: nextForms },
    },
  }).eq("id", job.id);
}

export async function ensureTechnicalMeasureForm(
  supabase: SupabaseClient,
  input: { jobId: string; quoteId: string },
  actor: CrmActor,
): Promise<TechnicalMeasureForm> {
  const existing = await supabase.from("crm_technical_measure_forms").select("id").eq("quote_id", input.quoteId).maybeSingle();
  if (existing.data?.id) return loadTechnicalMeasureForm(supabase, existing.data.id);

  const [built, jobResult, contractResult] = await Promise.all([
    loadQuoteBuilder(supabase, input.quoteId),
    supabase.from("crm_jobs").select("*").eq("id", input.jobId).maybeSingle(),
    supabase.from("crm_customer_contracts").select("id, customer_id").eq("job_id", input.jobId).eq("quote_id", input.quoteId).order("signed_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (!jobResult.data) throw new CrmAuthError(404, "The sold job was not found for this technical measure.");
  const job = jobResult.data as CrmJob;
  const signedIds = selectedSignedLineIds(built);
  const lines = built.lineItems.filter((line) => !signedIds || signedIds.has(line.id)).flatMap((line) => {
    const design = selectedDesign(line);
    return design ? [{ line, design }] : [];
  });
  const expandedLines = normalizeTechnicalMeasureLineInstanceSort(lines.flatMap(({ line, design }) =>
    expandTechnicalMeasureLineQuantity(line).map((instance) => ({ line, design, instance }))
  ));
  const lineProvenance = expandedLines.map(({ instance }) => instance);

  const customerSnapshot = {
    name: job.customer_name || built.customer_name || "Customer",
    email: built.customer_email || job.email || null,
    phone: built.customer_phone || job.phone || null,
    address: built.customer_address || job.address || null,
    city: job.city || null,
  };
  const quoteSnapshot = { quoteNumber: built.quote_number, signedAt: built.signed_at, adjustments: parseAdjustments(built.meta) };
  const { data: form, error } = await supabase.from("crm_technical_measure_forms").insert({
    job_id: input.jobId,
    quote_id: input.quoteId,
    customer_id: contractResult.data?.customer_id || null,
    contract_id: contractResult.data?.id || null,
    customer_snapshot: customerSnapshot,
    quote_snapshot: quoteSnapshot,
    baseline_total: built.quote_total,
    current_total: built.quote_total,
    technician_email: actor.email,
    technician_name: actor.displayName || null,
    meta: {
      source: "sold_contract",
      immutable_quote_id: built.id,
      technical_measure_line_provenance: lineProvenance,
    },
  }).select("*").single();
  if (error || !form) {
    // The quote-level unique constraint closes the read/insert race when the
    // signing route is retried concurrently.
    const raced = await supabase.from("crm_technical_measure_forms").select("id").eq("quote_id", input.quoteId).maybeSingle();
    if (raced.data?.id) return loadTechnicalMeasureForm(supabase, raced.data.id);
    throw new CrmAuthError(502, "The technical measure form could not be created.");
  }

  const lineRows = expandedLines.map(({ line, design, instance }) => {
    const baseline = {
      ...lineSnapshot(line, design),
      quantity: 1,
    };
    return {
      form_id: form.id,
      quote_line_item_id: instance.measure_quote_line_item_id,
      sort_order: instance.sort_order,
      baseline,
      current_values: baseline,
      baseline_unit_price: design.unit_price,
      current_unit_price: design.unit_price,
      price_status: design.price_status,
    };
  });
  if (lineRows.length) {
    const { error: lineError } = await supabase.from("crm_technical_measure_lines").insert(lineRows);
    if (lineError) throw new CrmAuthError(502, "The technical measure line items could not be created.");
  }
  await updateJobMeasureFormMeta(supabase, job, form.id, "draft");
  await recordCrmActivity(supabase, actor, { entityType: "job", entityId: input.jobId, action: "technical_measure.create", metadata: { formId: form.id, quoteId: input.quoteId, lineCount: lineRows.length } });
  return loadTechnicalMeasureForm(supabase, form.id);
}

function decorateForm(form: Record<string, unknown>, lineRows: Record<string, unknown>[], addendumRow: Record<string, unknown> | null): TechnicalMeasureForm {
  const meta = object(form.meta);
  const provenanceRows = Array.isArray(meta.technical_measure_line_provenance)
    ? meta.technical_measure_line_provenance.map(object)
    : [];
  const provenanceByMeasureLineId = new Map(
    provenanceRows.map((row) => [text(row.measure_quote_line_item_id), row])
  );
  const lines = lineRows.map((row) => {
    const baseline = normalizeTechnicalMeasureLineValues(row.baseline);
    const current = normalizeTechnicalMeasureLineValues(row.current_values, baseline);
    const provenance = provenanceByMeasureLineId.get(text(row.quote_line_item_id));
    const measureSchema = resolveManufacturerTechnicalMeasureSchema({
      product_id: current.product_id,
      program_id: current.program_id,
      quantity: current.quantity,
      details: current.details,
    });
    return {
      ...row,
      baseline,
      current_values: current,
      baseline_unit_price: numeric(row.baseline_unit_price),
      current_unit_price: numeric(row.current_unit_price),
      changes: technicalMeasureLineChanges(String(row.id), baseline, current),
      measure_schema: measureSchema,
      source_quote_line_item_id: text(provenance?.source_quote_line_item_id) || text(row.quote_line_item_id),
      source_quantity_index: Math.max(1, Math.floor(numeric(provenance?.source_quantity_index, 1))),
      source_quantity: Math.max(1, Math.floor(numeric(provenance?.source_quantity, baseline.quantity))),
    } as TechnicalMeasureLine;
  });
  const changes = lines.flatMap((line) => line.changes);
  const contractChanges = changes.filter((change) => change.kind === "contract");
  return {
    ...form,
    customer_snapshot: object(form.customer_snapshot),
    quote_snapshot: object(form.quote_snapshot),
    baseline_total: numeric(form.baseline_total),
    current_total: numeric(form.current_total),
    meta,
    lines,
    addendum: addendumRow ? ({ ...addendumRow, changes: Array.isArray(addendumRow.changes) ? addendumRow.changes : [] } as unknown as TechnicalMeasureAddendum) : null,
    changes,
    contractChanges,
    requiresAddendum: addendumRow?.status === "required",
    futureMeasures: futureMeasures(meta.future_measures),
    scheduling: technicalMeasureScheduling(meta.measure_scheduling),
  } as TechnicalMeasureForm;
}

export async function setTechnicalMeasureSchedulingStatus(
  supabase: SupabaseClient,
  formId: string,
  scheduled: boolean,
  actor: CrmActor,
  window?: { startAt?: unknown; endAt?: unknown },
) {
  const form = await loadTechnicalMeasureForm(supabase, formId);
  if (form.status === "submitted") throw new CrmAuthError(409, "Completed measures cannot be moved in the scheduling queue.");
  const now = new Date().toISOString();
  const previousScheduling = technicalMeasureScheduling(form.meta.measure_scheduling);
  let calendarEventId = previousScheduling.calendar_event_id;
  let scheduleWindow: { startAt: string; endAt: string } | null = null;

  if (scheduled) {
    scheduleWindow = normalizeTechnicalMeasureScheduleWindow(window?.startAt, window?.endAt);
    const calendarRecord = {
      job_id: form.job_id,
      title: `${form.customer_snapshot.name} technical measure`,
      event_type: "measure",
      status: "scheduled",
      assigned_to: "Mike",
      start_at: scheduleWindow.startAt,
      end_at: scheduleWindow.endAt,
      location: [form.customer_snapshot.address, form.customer_snapshot.city].filter(Boolean).join(", ") || null,
      notes: `Technical measure for ${form.quote_snapshot.quoteNumber || "sold contract"}`,
      meta: {
        source: "technical_measure",
        technical_measure_form_id: form.id,
        createdBy: actor.email,
      },
    };

    if (calendarEventId) {
      const { data, error } = await supabase
        .from("crm_calendar_events")
        .update(calendarRecord)
        .eq("id", calendarEventId)
        .select("id")
        .maybeSingle();
      if (error || !data) throw new CrmAuthError(502, "The technical measure calendar appointment could not be updated.");
    } else {
      const { data, error } = await supabase
        .from("crm_calendar_events")
        .insert(calendarRecord)
        .select("id")
        .single();
      if (error || !data) throw new CrmAuthError(502, "The technical measure calendar appointment could not be saved.");
      calendarEventId = String(data.id);
    }
  } else if (calendarEventId) {
    const { error } = await supabase
      .from("crm_calendar_events")
      .update({ status: "canceled", meta: { source: "technical_measure", technical_measure_form_id: form.id, canceledBy: actor.email } })
      .eq("id", calendarEventId);
    if (error) throw new CrmAuthError(502, "The technical measure calendar appointment could not be canceled.");
  }

  const scheduling: TechnicalMeasureScheduling = scheduled
    ? {
        status: "scheduled",
        scheduled_at: now,
        scheduled_by: actor.email,
        scheduled_start_at: scheduleWindow!.startAt,
        scheduled_end_at: scheduleWindow!.endAt,
        calendar_event_id: calendarEventId,
      }
    : {
        status: "unscheduled",
        scheduled_at: null,
        scheduled_by: null,
        scheduled_start_at: null,
        scheduled_end_at: null,
        calendar_event_id: calendarEventId,
      };
  const { error: formError } = await supabase
    .from("crm_technical_measure_forms")
    .update({
      meta: { ...form.meta, measure_scheduling: scheduling },
      technician_email: actor.email,
      technician_name: actor.displayName || form.technician_name,
    })
    .eq("id", formId);
  if (formError) throw new CrmAuthError(502, "The measure scheduling status could not be saved.");

  const { data: job, error: jobReadError } = await supabase
    .from("crm_jobs")
    .select("meta")
    .eq("id", form.job_id)
    .maybeSingle();
  if (jobReadError || !job) throw new CrmAuthError(502, "The linked job could not be updated.");
  const jobMeta = object(job.meta);
  const measureMeta = object(jobMeta[MEASURE_NEEDED_META_KEY]);
  const { error: jobError } = await supabase
    .from("crm_jobs")
    .update({
      meta: {
        ...jobMeta,
        [MEASURE_NEEDED_META_KEY]: {
          ...measureMeta,
          schedule_status: scheduling.status,
          scheduled_at: scheduling.scheduled_at,
          scheduled_by: scheduling.scheduled_by,
          scheduled_start_at: scheduling.scheduled_start_at,
          scheduled_end_at: scheduling.scheduled_end_at,
          calendar_event_id: scheduling.calendar_event_id,
        },
      },
    })
    .eq("id", form.job_id);
  if (jobError) throw new CrmAuthError(502, "The measure was updated, but the linked job scheduling status could not be saved.");

  await recordCrmActivity(supabase, actor, {
    entityType: "job",
    entityId: form.job_id,
    action: scheduled ? "technical_measure.mark_scheduled" : "technical_measure.mark_unscheduled",
    metadata: { formId, scheduling },
  });
  return loadTechnicalMeasureForm(supabase, formId);
}

export async function addFutureMeasure(
  supabase: SupabaseClient,
  formId: string,
  input: unknown,
  actor: CrmActor,
) {
  const form = await loadTechnicalMeasureForm(supabase, formId);
  const next: FutureMeasureEntry = {
    id: crypto.randomUUID(),
    ...normalizeFutureMeasureInput(input),
    created_at: new Date().toISOString(),
    created_by: actor.email,
  };
  const entries = [...(form.futureMeasures || []), next];
  const meta = { ...form.meta, future_measures: entries };
  const { error: formError } = await supabase
    .from("crm_technical_measure_forms")
    .update({ meta, technician_email: actor.email, technician_name: actor.displayName || form.technician_name })
    .eq("id", formId);
  if (formError) throw new CrmAuthError(502, "The future measure could not be saved.");

  const { error: folderError } = await supabase.from("crm_customer_contracts").upsert({
    external_source: "technical_measure_future_folder",
    external_id: `future-measures:${form.id}`,
    customer_id: form.customer_id,
    job_id: form.job_id,
    quote_id: form.quote_id,
    title: `Future Measures (${entries.length})`,
    contract_url: `/crm/technical-measures/${form.id}#future-measures`,
    status: "future_measure",
    total_amount: 0,
    meta: { form_id: form.id, future_measure_count: entries.length, future_measures: entries },
  }, { onConflict: "external_source,external_id" });
  if (folderError) throw new CrmAuthError(502, "The future measure was saved, but its Customer Files folder could not be updated.");

  await recordCrmActivity(supabase, actor, {
    entityType: "job",
    entityId: form.job_id,
    action: "technical_measure.future_measure_add",
    metadata: { formId, futureMeasureId: next.id, room: next.room, widthIn: next.width_in, heightIn: next.height_in },
  });
  return loadTechnicalMeasureForm(supabase, formId);
}

export async function loadTechnicalMeasureForm(supabase: SupabaseClient, formId: string): Promise<TechnicalMeasureForm> {
  const [formResult, linesResult, addendumResult] = await Promise.all([
    supabase.from("crm_technical_measure_forms").select("*").eq("id", formId).maybeSingle(),
    supabase.from("crm_technical_measure_lines").select("*").eq("form_id", formId).order("sort_order"),
    supabase.from("crm_technical_measure_addendums").select("*").eq("form_id", formId).neq("status", "superseded").order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (formResult.error || !formResult.data) throw new CrmAuthError(404, "Technical measure form was not found.");
  if (linesResult.error) throw new CrmAuthError(502, "Technical measure line items could not be loaded.");
  const form = decorateForm(formResult.data, linesResult.data || [], addendumResult.data || null);
  // Use the actual customer contract route, not a reconstructed measure summary.
  const { data: quote } = await supabase.from("crm_quotes").select("share_token").eq("id", form.quote_id).maybeSingle();
  form.contractUrl = quote?.share_token ? `/quote/${encodeURIComponent(quote.share_token)}/` : null;
  if (!form.contractUrl && form.contract_id) {
    const { data: contract } = await supabase.from("crm_customer_contracts").select("contract_url").eq("id", form.contract_id).eq("quote_id", form.quote_id).maybeSingle();
    const url = text(contract?.contract_url);
    if (/^https:\/\//.test(url) || /^\/quote\/[A-Za-z0-9_-]+\/?$/.test(url)) form.contractUrl = url;
  }
  return form;
}

export async function listTechnicalMeasureForms(supabase: SupabaseClient, jobId?: string | null, includeArchived = false) {
  const { data, error } = await collectCrmPages<Record<string, any>>(async (from, to) => {
    let query = supabase.from("crm_technical_measure_forms").select("*").order("updated_at", { ascending: false }).order("id").range(from, to);
    if (jobId) query = query.eq("job_id", jobId);
    return query;
  });
  if (error) throw new CrmAuthError(502, "Technical measure forms could not be loaded.");
  return enrichMeasureOrders(supabase, (data || []).filter(form => includeArchived || !technicalMeasureIsArchived(form)));
}

export async function setTechnicalMeasureArchived(
  supabase: SupabaseClient,
  formId: string,
  archived: boolean,
  actor: CrmActor,
) {
  const form = await loadTechnicalMeasureForm(supabase, formId);
  const archivedAt = archived ? new Date().toISOString() : null;
  const meta = {
    ...form.meta,
    archived_at: archivedAt,
    archived_by: archived ? actor.email : null,
    ...(archived ? {} : { restored_at: new Date().toISOString(), restored_by: actor.email }),
  };
  const { error } = await supabase.from("crm_technical_measure_forms").update({ meta }).eq("id", formId);
  if (error) throw new CrmAuthError(502, archived ? "The technical measure could not be archived." : "The technical measure could not be restored.");
  await recordCrmActivity(supabase, actor, {
    entityType: "job",
    entityId: form.job_id,
    action: archived ? "technical_measure.archive" : "technical_measure.restore",
    metadata: { formId, quoteId: form.quote_id },
  });
  return loadTechnicalMeasureForm(supabase, formId);
}

export function soldQuoteNeedsTechnicalMeasureForm(
  quote: { id: string; job_id: string | null },
  formQuoteIds: ReadonlySet<string>,
) {
  return Boolean(quote.job_id) && !formQuoteIds.has(quote.id);
}

export async function reconcileSoldTechnicalMeasureForms(
  supabase: SupabaseClient,
  actor: CrmActor,
  jobId?: string | null,
) {
  let quotesQuery = supabase
    .from("crm_quotes")
    .select("id,job_id,signed_at,created_at")
    .in("status", ["sold", "approved"])
    .order("signed_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(250);
  if (jobId) quotesQuery = quotesQuery.eq("job_id", jobId);
  const [quotesResult, formsResult] = await Promise.all([
    quotesQuery,
    supabase.from("crm_technical_measure_forms").select("quote_id"),
  ]);
  if (quotesResult.error || formsResult.error) return { created: 0, failed: 0 };

  const formQuoteIds = new Set((formsResult.data || []).map((row) => String(row.quote_id)));
  const candidates = ((quotesResult.data || []) as Array<{ id: string; job_id: string | null }>)
    .filter((quote) => soldQuoteNeedsTechnicalMeasureForm(quote, formQuoteIds));
  if (!candidates.length) return { created: 0, failed: 0 };

  let created = 0;
  let failed = 0;
  for (const quote of candidates) {
    try {
      await ensureTechnicalMeasureForm(supabase, { jobId: quote.job_id!, quoteId: quote.id }, actor);
      created += 1;
    } catch (error) {
      failed += 1;
      console.error("technical measure reconciliation failed", { jobId: quote.job_id, quoteId: quote.id, error });
    }
  }
  return { created, failed };
}

export function technicalMeasureDraftDisposition(
  form: Pick<TechnicalMeasureForm, "baseline_total">,
  changes: TechnicalMeasureChange[],
) {
  return {
    status: "draft" as const,
    currentTotal: form.baseline_total,
    requiresAddendum: false,
    changeCount: changes.length,
  };
}

export async function saveTechnicalMeasureDraft(
  supabase: SupabaseClient,
  formId: string,
  input: { lines?: Array<{ id: string; currentValues: unknown }> },
  actor: CrmActor,
) {
  const form = await loadTechnicalMeasureForm(supabase, formId);
  if (form.status === "submitted") throw new CrmAuthError(409, "This technical measure has already been submitted.");
  const incoming = new Map((input.lines || []).map((line) => [line.id, line.currentValues]));
  const nextLines: TechnicalMeasureLine[] = [];
  for (const line of form.lines) {
    const current = incoming.has(line.id)
      ? normalizeTechnicalMeasureLineValues(incoming.get(line.id), line.current_values)
      : line.current_values;
    if (!current.product_id) throw new CrmAuthError(400, `${current.room}: product is required.`);
    const changes = technicalMeasureLineChanges(line.id, line.baseline, current);
    const { error } = await supabase.from("crm_technical_measure_lines").update({
      current_values: current,
      current_unit_price: line.baseline_unit_price,
      price_status: "ok",
    }).eq("id", line.id).eq("form_id", formId);
    if (error) throw new CrmAuthError(502, "Technical measure changes could not be saved.");
    nextLines.push({ ...line, current_values: current, current_unit_price: line.baseline_unit_price, price_status: "ok", changes });
  }
  const contractChanges = nextLines.flatMap((line) => line.changes).filter((change) => change.kind === "contract");
  const disposition = technicalMeasureDraftDisposition(form, nextLines.flatMap((line) => line.changes));
  const { error: formError } = await supabase.from("crm_technical_measure_forms").update({
    status: disposition.status,
    current_total: disposition.currentTotal,
    technician_email: actor.email,
    technician_name: actor.displayName || form.technician_name,
  }).eq("id", formId);
  if (formError) throw new CrmAuthError(502, "Technical measure form could not be saved.");

  const { data: job } = await supabase.from("crm_jobs").select("*").eq("id", form.job_id).maybeSingle();
  if (job) await updateJobMeasureFormMeta(supabase, job as CrmJob, formId, disposition.status);
  await syncRequiredAddendum(supabase, form, [], disposition.currentTotal);
  await recordCrmActivity(supabase, actor, { entityType: "job", entityId: form.job_id, action: "technical_measure.save", metadata: { formId, changeCount: disposition.changeCount, contractChangeCount: contractChanges.length, requiresAddendum: disposition.requiresAddendum } });
  return loadTechnicalMeasureForm(supabase, formId);
}

async function syncRequiredAddendum(supabase: SupabaseClient, form: TechnicalMeasureForm, changes: TechnicalMeasureChange[], revisedTotal: number) {
  const { data: pending } = await supabase.from("crm_technical_measure_addendums").select("id").eq("form_id", form.id).eq("status", "required").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!changes.length) {
    if (pending?.id) await supabase.from("crm_technical_measure_addendums").update({ status: "superseded" }).eq("id", pending.id);
    return;
  }
  const row = { form_id: form.id, status: "required", changes, original_total: form.baseline_total, revised_total: revisedTotal, price_difference: round2(revisedTotal - form.baseline_total) };
  if (pending?.id) await supabase.from("crm_technical_measure_addendums").update(row).eq("id", pending.id);
  else await supabase.from("crm_technical_measure_addendums").insert(row);
}

export async function submitTechnicalMeasureWithoutAddendum(
  supabase: SupabaseClient,
  formId: string,
  actor: CrmActor,
  input: { installationDurationMinutes?: unknown } = {},
) {
  const form = await loadTechnicalMeasureForm(supabase, formId);
  if (form.status === "submitted") {
    const { createAndSendInstallerForm } = await import("@/lib/crm/installer-forms");
    await createAndSendInstallerForm(supabase, form.quote_id);
    return loadTechnicalMeasureForm(supabase, formId);
  }
  if (form.requiresAddendum) throw new CrmAuthError(409, "The customer must acknowledge and sign the listed contract changes.");
  return finalizeTechnicalMeasure(
    supabase,
    form,
    actor,
    input.installationDurationMinutes,
  );
}

function validSignatureStrokes(value: unknown): SignatureStroke[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 50).flatMap((stroke) => {
    if (!Array.isArray(stroke)) return [];
    const points = stroke.slice(0, 2000).flatMap((point) => {
      const row = object(point);
      const x = Number(row.x);
      const y = Number(row.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return [];
      return [{ x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) }];
    });
    return points.length > 1 ? [points] : [];
  });
}

export async function signTechnicalMeasureAddendum(
  supabase: SupabaseClient,
  formId: string,
  input: {
    acknowledged?: unknown;
    signerName?: unknown;
    signatureStrokes?: unknown;
    installationDurationMinutes?: unknown;
  },
  actor: CrmActor,
) {
  const installationDurationMinutes = normalizeInstallationDurationMinutes(
    input.installationDurationMinutes,
  );
  const form = await loadTechnicalMeasureForm(supabase, formId);
  if (!form.requiresAddendum || !form.addendum) throw new CrmAuthError(409, "There are no contract changes requiring an addendum.");
  if (input.acknowledged !== true) throw new CrmAuthError(400, "The customer must acknowledge all listed changes.");
  const signerName = text(input.signerName);
  const signatureStrokes = validSignatureStrokes(input.signatureStrokes);
  if (!signerName) throw new CrmAuthError(400, "Customer printed name is required.");
  if (!signatureStrokes.length) throw new CrmAuthError(400, "Customer signature is required.");
  const signedAt = new Date().toISOString();
  const pdf = buildTechnicalMeasureAddendumPdf({ ...form.addendum, signer_name: signerName, signature_strokes: signatureStrokes, signed_at: signedAt, signed_by_technician: actor.email }, form);
  const { error } = await supabase.from("crm_technical_measure_addendums").update({
    status: "signed",
    acknowledged: true,
    signer_name: signerName,
    signature_strokes: signatureStrokes,
    signed_at: signedAt,
    signed_by_technician: actor.email,
    pdf_base64: pdf.toString("base64"),
    email_error: null,
  }).eq("id", form.addendum.id);
  if (error) throw new CrmAuthError(502, "The signed change order could not be saved.");
  await upsertAddendumCustomerContract(supabase, form, form.addendum.id, signedAt);
  await finalizeTechnicalMeasure(
    supabase,
    form,
    actor,
    installationDurationMinutes,
  );
  const email = await deliverTechnicalMeasureAddendum(supabase, formId);
  await recordCrmActivity(supabase, actor, { entityType: "job", entityId: form.job_id, action: "technical_measure.addendum_signed", metadata: { formId, addendumId: form.addendum.id, signerName, email } });
  return { form: await loadTechnicalMeasureForm(supabase, formId), email };
}

async function finalizeTechnicalMeasure(
  supabase: SupabaseClient,
  form: TechnicalMeasureForm,
  actor: CrmActor,
  installationDurationMinutesInput: unknown,
) {
  if (form.lines.some((line) => !line.current_values.measure_complete)) {
    throw new CrmAuthError(409, "Every opening must be submitted before the technical measure can be completed.");
  }
  const completionIssues = technicalMeasureCompletionIssues(form);
  if (completionIssues.length) {
    throw new CrmAuthError(409, completionIssues[0].instruction);
  }
  const installationDurationMinutes = normalizeInstallationDurationMinutes(
    installationDurationMinutesInput,
  );
  const submittedAt = new Date().toISOString();
  await syncTechnicalMeasureOperationalOverride(supabase, form, submittedAt);
  const { error } = await supabase.from("crm_technical_measure_forms").update({
    status: "submitted",
    submitted_at: submittedAt,
    technician_email: actor.email,
    technician_name: actor.displayName || form.technician_name,
    meta: {
      ...form.meta,
      installation_duration_minutes: installationDurationMinutes,
      ...(actor.userId ? { submitted_by_source_profile_id: actor.userId } : {}),
    },
  }).eq("id", form.id);
  if (error) throw new CrmAuthError(502, "The technical measure could not be submitted.");
  const { data: job } = await supabase.from("crm_jobs").select("*").eq("id", form.job_id).maybeSingle();
  if (job) {
    const row = job as CrmJob;
    const measure = getMeasureNeededMeta(row.meta);
    await supabase.from("crm_jobs").update({ meta: { ...object(row.meta), [MEASURE_NEEDED_META_KEY]: { ...measure, status: "measured", measured_at: submittedAt, measured_by: actor.email, form_id: form.id, form_status: "submitted" } } }).eq("id", form.job_id);
  }
  let orderPreparations: VendorOrderPreparationSummary[] = [];
  const submittedForm = await loadTechnicalMeasureForm(supabase, form.id);
  const orderManifest = buildTechnicalMeasureOrderManifest(submittedForm);
  await upsertManufacturerOrderManifestArtifact(supabase, orderManifest, {
    customerId: submittedForm.customer_id || "",
    customerName: submittedForm.customer_snapshot.name,
    jobId: submittedForm.job_id,
    quoteId: submittedForm.quote_id,
    quoteNumber: submittedForm.quote_snapshot.quoteNumber,
    measureStatus: "measure_required",
    generatedAt: submittedAt,
    sourceKind: "submitted_technical_measure",
    sourceId: submittedForm.id,
  });
  try {
    orderPreparations = await enqueueVendorOrderPreparations(submittedForm, actor.userId);
    await persistVendorOrderPreparations(supabase, {
      sourceKind: "submitted_technical_measure",
      sourceId: submittedForm.id,
      sourceRevision: `submitted_technical_measure:${submittedForm.id}:${submittedAt}`,
      technicalMeasureFormId: submittedForm.id,
      jobId: submittedForm.job_id,
      quoteId: submittedForm.quote_id,
      customerSnapshot: {
        id: submittedForm.customer_id,
        ...submittedForm.customer_snapshot,
      },
      quoteSnapshot: submittedForm.quote_snapshot,
    }, orderPreparations);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Vendor order preparation could not be queued.";
    const manufacturer = submittedForm.lines[0]?.measure_schema?.manufacturer;
    const safeManufacturer = manufacturer === "Norman"
      || manufacturer === "Onyx"
      || manufacturer === "Lotus"
      || manufacturer === "Polar"
      ? manufacturer
      : "Norman";
    orderPreparations = [{
      manufacturer: safeManufacturer,
      productType: submittedForm.lines[0]?.measure_schema?.productKey || "unresolved",
      status: "queue_failed",
      taskId: null,
      issueCount: 1,
      message,
    }];
    console.error("Vendor order preparation queue failed", { formId: form.id, error });
  }
  if (orderPreparations.length) {
    const legacyPreparation = orderPreparations.find((item) => item.manufacturer === "Norman")
      || orderPreparations[0];
    const nextMeta = {
      ...submittedForm.meta,
      vendor_order_preparation: legacyPreparation,
      vendor_order_preparations: orderPreparations,
    };
    await supabase.from("crm_technical_measure_forms").update({ meta: nextMeta }).eq("id", form.id);
    const onyx = enqueueOnyxShutterPreparations(submittedForm, actor.userId).filter((item) => item.payload);
    await Promise.all(onyx.map((item) => upsertOnyxCustomerFileArtifact(
      supabase,
      item.payload as unknown as OnyxAgentOrderPacket,
    )));
  }
  const { createAndSendInstallerForm } = await import("@/lib/crm/installer-forms");
  const installerHandoff = await createAndSendInstallerForm(supabase, form.quote_id);
  await recordCrmActivity(supabase, actor, {
    entityType: "job",
    entityId: form.job_id,
    action: "technical_measure.submit",
    metadata: {
      formId: form.id,
      submittedAt,
      installationDurationMinutes,
      installationHandoff: {
        sent: installerHandoff.email.sent,
        messageId: installerHandoff.email.id || null,
        skipped: installerHandoff.email.skipped || null,
      },
      orderPreparations,
    },
  });
  return loadTechnicalMeasureForm(supabase, form.id);
}

export async function backfillSubmittedVendorOrderPreparation(
  supabase: SupabaseClient,
  formId: string,
  actor: CrmActor,
  options: { force?: boolean } = {},
) {
  const form = await loadTechnicalMeasureForm(supabase, formId);
  if (form.status !== "submitted" || !form.submitted_at) {
    throw new CrmAuthError(409, "Only a submitted technical measure can be queued for order entry.");
  }
  const existingPreparations = Array.isArray(form.meta.vendor_order_preparations)
    ? form.meta.vendor_order_preparations
    : form.meta.vendor_order_preparation
      ? [form.meta.vendor_order_preparation]
      : [];
  const expectedManufacturers = new Set(form.lines
    .map((line) => line.measure_schema?.manufacturer)
    .filter((item): item is string => Boolean(item)));
  const activeManufacturers = new Set(existingPreparations.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const preparation = item as Record<string, unknown>;
    return ["queued", "processing", "review_ready"].includes(String(preparation.status || ""))
      && typeof preparation.manufacturer === "string"
      ? [preparation.manufacturer]
      : [];
  }));
  if (
    !options.force
    &&
    expectedManufacturers.size > 0
    && Array.from(expectedManufacturers).every((manufacturer) => activeManufacturers.has(manufacturer))
  ) {
    try {
      await persistVendorOrderPreparations(supabase, {
        sourceKind: "submitted_technical_measure",
        sourceId: form.id,
        sourceRevision: `submitted_technical_measure:${form.id}:${form.submitted_at}`,
        technicalMeasureFormId: form.id,
        jobId: form.job_id,
        quoteId: form.quote_id,
        customerSnapshot: {
          id: form.customer_id,
          ...form.customer_snapshot,
        },
        quoteSnapshot: form.quote_snapshot,
      }, existingPreparations as VendorOrderPreparationSummary[]);
    } catch (error) {
      console.warn("Durable manufacturer queue is not available; keeping the submitted-measure queue metadata active.", error);
    }
    return form;
  }
  const orderPreparations = await enqueueVendorOrderPreparations(form, actor.userId);
  if (!orderPreparations.length) {
    throw new CrmAuthError(409, "This measure does not contain an exactly routed manufacturer order.");
  }
  try {
    await persistVendorOrderPreparations(supabase, {
      sourceKind: "submitted_technical_measure",
      sourceId: form.id,
      sourceRevision: `submitted_technical_measure:${form.id}:${form.submitted_at}`,
      technicalMeasureFormId: form.id,
      jobId: form.job_id,
      quoteId: form.quote_id,
      customerSnapshot: {
        id: form.customer_id,
        ...form.customer_snapshot,
      },
      quoteSnapshot: form.quote_snapshot,
    }, orderPreparations);
  } catch (error) {
    console.warn("Durable manufacturer queue is not available; rebuilding the submitted-measure queue metadata.", error);
  }
  const legacyPreparation = orderPreparations.find((item) => item.manufacturer === "Norman")
    || orderPreparations[0];
  const { error } = await supabase
    .from("crm_technical_measure_forms")
    .update({
      meta: {
        ...form.meta,
        vendor_order_preparation: legacyPreparation,
        vendor_order_preparations: orderPreparations,
      },
    })
    .eq("id", form.id);
  if (error) throw new CrmAuthError(502, "The submitted measure could not be queued for order entry.");
  const onyx = enqueueOnyxShutterPreparations(form, actor.userId).filter((item) => item.payload);
  await Promise.all(onyx.map((item) => upsertOnyxCustomerFileArtifact(
    supabase,
    item.payload as unknown as OnyxAgentOrderPacket,
  )));
  await recordCrmActivity(supabase, actor, {
    entityType: "job",
    entityId: form.job_id,
    action: "technical_measure.vendor_order_backfill",
    metadata: {
      formId: form.id,
      force: options.force === true,
      preparations: orderPreparations.map((preparation) => ({
        manufacturer: preparation.manufacturer,
        productType: preparation.productType,
        taskId: preparation.taskId,
      })),
    },
  });
  return loadTechnicalMeasureForm(supabase, form.id);
}

function legacyDimension(value: number | null) {
  const total = Math.round(Number(value || 0) * 16);
  const fractionValues = ["0", "1/16", "1/8", "3/16", "1/4", "5/16", "3/8", "7/16", "1/2", "9/16", "5/8", "11/16", "3/4", "13/16", "7/8", "15/16"];
  return { whole: Math.floor(total / 16), fraction: fractionValues[total % 16] || "0" };
}

async function syncTechnicalMeasureOperationalOverride(supabase: SupabaseClient, form: TechnicalMeasureForm, submittedAt: string) {
  const override = {
    form_id: form.id,
    submitted_at: submittedAt,
    addendum_id: form.addendum?.signed_at ? form.addendum.id : null,
    baseline_total: form.baseline_total,
    revised_total: form.current_total,
    lines: form.lines.map((line) => ({
      technical_measure_line_id: line.id,
      quote_line_item_id: line.source_quote_line_item_id || line.quote_line_item_id,
      source_quantity_index: line.source_quantity_index || 1,
      source_quantity: line.source_quantity || line.current_values.quantity,
      values: line.current_values,
      unit_price: line.current_unit_price,
    })),
  };
  const { data: quote, error: quoteReadError } = await supabase.from("crm_quotes").select("meta").eq("id", form.quote_id).maybeSingle();
  if (quoteReadError || !quote) throw new CrmAuthError(502, "The ordering override could not be linked to the sold quote.");
  const quoteMeta = object(quote.meta);
  const { error: quoteError } = await supabase.from("crm_quotes").update({ meta: { ...quoteMeta, technical_measure_override: override } }).eq("id", form.quote_id);
  if (quoteError) throw new CrmAuthError(502, "The ordering override could not be saved.");

  const sourceQuoteId = typeof quoteMeta.mts_quote_id === "string" ? quoteMeta.mts_quote_id : null;
  if (!sourceQuoteId) return;
  for (const line of form.lines) {
    const sourceLineItemId = line.source_quote_line_item_id || line.quote_line_item_id;
    if ((line.source_quantity || 1) > 1) continue;
    const width = legacyDimension(line.current_values.width_in);
    const height = legacyDimension(line.current_values.height_in);
    const { error: lineError } = await supabase.from("sales_quote_line_items").update({
      room_name: line.current_values.room,
      width_whole: width.whole,
      width_fraction: width.fraction,
      height_whole: height.whole,
      height_fraction: height.fraction,
      quantity: line.current_values.quantity,
    }).eq("id", sourceLineItemId).eq("quote_id", sourceQuoteId);
    if (lineError) throw new CrmAuthError(502, "Measured dimensions could not be projected to the ordering record.");

    if (line.current_values.design_id) {
      const details = line.current_values.details;
      const optionsJson = { ...details, technical_measure_form_id: form.id, technical_measure_submitted_at: submittedAt };
      const designPatch: Record<string, unknown> = {
        product_type: line.current_values.product_id,
        fabric: line.current_values.fabric,
        mount_type: nullableText(details.mount_type),
        lift_system: nullableText(details.lift_system ?? details.operating_system),
        motor_type: nullableText(details.motor_type),
        remote_type: nullableText(details.remote_type),
        options_json: optionsJson,
        unit_price: line.current_unit_price,
      };
      const directDesignValues = {
        supplier: details.supplier ?? details.manufacturer,
        material: details.material,
        louver_size: details.louver_size ?? details.louver_size_inches,
        tilt_type: details.tilt_type ?? details.tilt ?? details.tilt_rod,
        hinge_color: details.hinge_color,
        panel_config: details.panel_config ?? details.panel_configuration ?? details.folding_direction,
      };
      for (const [key, value] of Object.entries(directDesignValues)) {
        if (value !== null && value !== undefined && String(value).trim()) designPatch[key] = nullableText(value);
      }
      const { error: designError } = await supabase.from("sales_quote_designs").update(designPatch).eq("id", line.current_values.design_id).eq("line_item_id", sourceLineItemId);
      if (designError) throw new CrmAuthError(502, "Changed product details could not be projected to the ordering record.");
    }
  }
  await supabase.from("sales_quotes").update({ total_amount: form.current_total }).eq("id", sourceQuoteId);
}

async function upsertAddendumCustomerContract(supabase: SupabaseClient, form: TechnicalMeasureForm, addendumId: string, signedAt: string) {
  const row = {
    external_source: "technical_measure_addendum",
    external_id: `addendum:${addendumId}`,
    customer_id: form.customer_id,
    job_id: form.job_id,
    quote_id: form.quote_id,
    title: `Change Order - ${form.customer_snapshot.name}`,
    contract_url: `/crm/technical-measures/${form.id}`,
    status: "signed",
    signed_at: signedAt,
    total_amount: form.current_total,
    meta: { form_id: form.id, addendum_id: addendumId, original_total: form.baseline_total, revised_total: form.current_total, operational_override: true },
  };
  const { error } = await supabase.from("crm_customer_contracts").upsert(row, { onConflict: "external_source,external_id" });
  if (error) throw new CrmAuthError(502, "The signed change order could not be attached to the customer file.");
}

export async function deliverTechnicalMeasureAddendum(supabase: SupabaseClient, formId: string): Promise<EmailResult> {
  const form = await loadTechnicalMeasureForm(supabase, formId);
  const addendum = form.addendum;
  if (!addendum?.signed_at) throw new CrmAuthError(409, "The change order must be signed before it can be emailed.");
  const { data: stored } = await supabase.from("crm_technical_measure_addendums").select("pdf_base64").eq("id", addendum.id).maybeSingle();
  const pdfBase64 = text(stored?.pdf_base64);
  if (!pdfBase64) throw new CrmAuthError(409, "The signed change order PDF is unavailable.");
  const to = form.customer_snapshot.email;
  const difference = addendum.price_difference;
  const priceLine = difference === 0 ? "There is no price change." : `The contract total changed by ${money(difference)} to ${money(addendum.revised_total)}.`;
  const email = await sendEmail({
    to,
    subject: `Signed 805 Shutters change order - ${form.customer_snapshot.name}`,
    text: `Hello ${form.customer_snapshot.name},\n\nAttached is the signed change order from your technical measure. ${priceLine}\n\nThis addendum updates the listed details of your original contract.\n\nThank you,\n805 Shutters`,
    html: `<div style="font-family:Arial,Helvetica,sans-serif;color:#111;max-width:640px;margin:0 auto;padding:24px"><h1 style="font-size:24px">Your signed change order</h1><p>Hello ${escapeHtml(form.customer_snapshot.name)},</p><p>Attached is the signed change order from your technical measure. ${escapeHtml(priceLine)}</p><p>This addendum updates the listed details of your original contract.</p><p>Thank you,<br><strong>805 Shutters</strong></p></div>`,
    attachments: [{ filename: `805-Shutters-Change-Order-${form.id.slice(0, 8)}.pdf`, content: pdfBase64, contentType: "application/pdf" }],
  });
  await supabase.from("crm_technical_measure_addendums").update({
    status: email.sent ? "emailed" : "email_failed",
    emailed_at: email.sent ? new Date().toISOString() : null,
    email_recipient: to,
    email_message_id: email.id || null,
    email_error: email.error || email.skipped || null,
  }).eq("id", addendum.id);
  return email;
}

export async function technicalMeasureAddendumPdf(supabase: SupabaseClient, formId: string) {
  const form = await loadTechnicalMeasureForm(supabase, formId);
  if (!form.addendum?.signed_at) throw new CrmAuthError(404, "Signed change order was not found.");
  const { data } = await supabase.from("crm_technical_measure_addendums").select("pdf_base64").eq("id", form.addendum.id).maybeSingle();
  const encoded = text(data?.pdf_base64);
  if (!encoded) throw new CrmAuthError(404, "Signed change order PDF was not found.");
  return Buffer.from(encoded, "base64");
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

function escapePdfText(value: unknown) {
  return String(value ?? "").replace(/[^\x20-\x7E]/g, " ").replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function escapeHtml(value: unknown) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function buildTechnicalMeasureAddendumPdf(addendum: TechnicalMeasureAddendum, form: TechnicalMeasureForm) {
  const width = 612;
  const height = 792;
  const pages: string[][] = [[]];
  let page = pages[0];
  let y = 748;
  const write = (value: string, size = 10, bold = false, x = 48) => {
    if (y < 72) { page = []; pages.push(page); y = 748; }
    page.push(`BT /${bold ? "F2" : "F1"} ${size} Tf ${x} ${y} Td (${escapePdfText(value).slice(0, 105)}) Tj ET`);
    y -= size + 6;
  };
  write("805 SHUTTERS - CONTRACT CHANGE ORDER", 18, true);
  write(`Customer: ${form.customer_snapshot.name}`, 11, true);
  write(`Project: ${[form.customer_snapshot.address, form.customer_snapshot.city].filter(Boolean).join(", ") || "Not specified"}`);
  write(`Original contract: ${form.quote_snapshot.quoteNumber || form.quote_id}`);
  write(`Signed: ${new Date(addendum.signed_at || Date.now()).toLocaleString("en-US", { timeZone: "America/Los_Angeles" })}`);
  y -= 8;
  write("The customer acknowledges and approves these changes to the original contract:", 10, true);
  for (const change of addendum.changes) {
    write(`${change.room} - ${change.label}`, 10, true);
    write(`Original: ${change.original}`, 9, false, 60);
    write(`Revised: ${change.revised}`, 9, false, 60);
  }
  y -= 8;
  write(`Original total: ${money(addendum.original_total)}`, 11);
  write(`Revised total: ${money(addendum.revised_total)}`, 11, true);
  write(`Difference: ${money(addendum.price_difference)}`, 11, true);
  y -= 12;
  write("Customer acknowledgment", 11, true);
  write("I approve the changes listed above. This addendum updates those details of my original contract.", 9);
  write(`Printed name: ${addendum.signer_name || ""}`, 10);
  const signatureY = Math.max(92, y - 90);
  page.push(`0.6 w 48 ${signatureY} 260 72 re S`);
  for (const stroke of addendum.signature_strokes || []) {
    if (stroke.length < 2) continue;
    const [first, ...rest] = stroke;
    page.push(`1.2 w ${48 + first.x * 260} ${signatureY + (1 - first.y) * 72} m`);
    for (const point of rest) page.push(`${48 + point.x * 260} ${signatureY + (1 - point.y) * 72} l`);
    page.push("S");
  }
  page.push(`BT /F1 8 Tf 48 ${signatureY - 14} Td (Customer signature) Tj ET`);
  page.push(`BT /F1 8 Tf 360 ${signatureY - 14} Td (Technician: ${escapePdfText(addendum.signed_by_technician || form.technician_email || "")}) Tj ET`);

  const objects: string[] = [];
  const pageIds = pages.map((_, index) => 5 + index * 2);
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`;
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  objects[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>";
  pages.forEach((commands, index) => {
    const pageId = pageIds[index];
    const contentId = pageId + 1;
    const stream = commands.join("\n");
    objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`;
    objects[contentId] = `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`;
  });
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let index = 1; index < objects.length; index += 1) {
    offsets[index] = Buffer.byteLength(pdf, "latin1");
    pdf += `${index} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let index = 1; index < objects.length; index += 1) pdf += `${String(offsets[index] || 0).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}
