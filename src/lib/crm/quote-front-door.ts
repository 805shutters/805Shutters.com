import { createHash } from "node:crypto";
import { CrmAuthError } from "@/lib/crm/auth";
import { normalizePhone } from "@/lib/crm/phone-matching";

/**
 * The CRM side of Quoter's front door.
 * Legend order comes from public.quote_next_required_field.
 * A tapped legend value is checked with public.quote_validate_tapped_value.
 * The margin multiplier is asked only after every required legend field is complete.
 * Saving calls create_quote_v2_draft and does not send the quote.
 */

/** The product-cost multipliers already offered on a CRM supplier draft. */
export const QUOTE_FRONT_DOOR_MULTIPLIERS = ["1.75", "2", "2.25", "2.5", "2.75", "3", "3.25", "3.5"] as const;

export type QuoteFrontDoorMultiplier = (typeof QUOTE_FRONT_DOOR_MULTIPLIERS)[number];

export type QuoteFrontDoorSpec = {
  answers?: Record<string, unknown>;
  catalog_version?: string | null;
  previous?: { manufacturer?: string; category?: string };
  multiplier?: string | number | null;
};

export type SequenceChoice = { value: string; label: string };

export type SequenceNext = {
  status: "ask" | "needs_input" | "blocked" | "complete";
  reason: string | null;
  field_key: string | null;
  input_kind: string | null;
  required: boolean | null;
  ask_order: number | null;
  choices: SequenceChoice[];
  invalidated: string[];
  kept: Record<string, unknown>;
  optional_field: { field_key: string; input_kind: string; choices: SequenceChoice[] } | null;
  catalog_version: string | null;
};

export type FrontDoorPhase = "legend" | "multiplier" | "ready" | "blocked";

export type FrontDoorNext = SequenceNext & {
  phase: FrontDoorPhase;
  multiplier: string | null;
};

export type TapResult = {
  ok: boolean;
  status: "ok" | "blocked" | "needs_input";
  reason: string | null;
  choices: SequenceChoice[];
};

export type SequenceFieldOrder = {
  field_key: string;
  ask_order: number;
};

export type CustomerLookupQuery = {
  name?: string | null;
  phone?: string | null;
  address?: string | null;
};

export type CustomerSelection = CustomerLookupQuery & {
  customerId?: string | null;
  jobId?: string | null;
  candidateId?: string | null;
  confirmNewCustomer?: boolean;
};

export type QuoteFrontDoorAppointment = {
  id: string;
  source: "calendar" | "appointment" | "job";
  start: string | null;
  end: string | null;
  status: string | null;
  assignedTo: string | null;
  location: string | null;
  eventType: string | null;
};

export type CustomerRecord = {
  source: "customer" | "job" | "calendar" | "appointment";
  id: string;
  customerId: string | null;
  jobId: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  appointment: QuoteFrontDoorAppointment | null;
};

export type CustomerCandidate = {
  candidateId: string;
  customerId: string | null;
  customerIds: string[];
  jobId: string | null;
  jobIds: string[];
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  appointments: QuoteFrontDoorAppointment[];
  matchedOn: Array<"name" | "phone" | "address">;
  sources: CustomerRecord["source"][];
  records: Array<{ source: CustomerRecord["source"]; id: string; customerId: string | null; jobId: string | null }>;
};

export type ReadBackField = {
  fieldKey: string;
  label: string;
  valueText: string;
};

export type QuoteFrontDoorReadBack = {
  ready: boolean;
  phase: FrontDoorPhase;
  summary: string;
  fields: ReadBackField[];
  multiplier: string | null;
  nextField: string | null;
};

/** Arguments for the existing create_quote_v2_draft(p_idempotency_key, p_actor_id, p_quote_patch). */
export type FrontDoorReadBackRecord = {
  summary: string;
  customerId: string | null;
  jobId: string | null;
};

export type QuoteV2DraftCreate = {
  idempotencyKey: string;
  actorId: string;
  quotePatch: Record<string, unknown>;
  readBack: FrontDoorReadBackRecord;
};

/** A line-entry draft. Status is draft only. There is no multiplier until the line is complete. */
export type LineDraftInsert = {
  status: "draft";
  customer_id: string | null;
  job_id: string | null;
  customer_name: string;
  customer_phone: string | null;
  customer_address: string | null;
  manufacturer: string;
  category: string;
  catalog_version: string | null;
  spec: Record<string, unknown>;
  read_back: string;
  created_by: string | null;
  created_by_email: string | null;
};

export type SequenceDetailRow = {
  field_key: string;
  ask_order: number;
  required: boolean;
  input_kind: string;
  depends_on: string[];
};

export type SequenceChoiceRow = {
  field_key: string;
  value: string;
  label: string;
};

export type QuoteFrontDoorStore = {
  nextRequiredField(spec: Record<string, unknown>, manufacturer: string, category: string): Promise<SequenceNext>;
  validateTappedValue(
    spec: Record<string, unknown>,
    manufacturer: string,
    category: string,
    fieldKey: string,
    value: unknown,
  ): Promise<TapResult>;
  sequenceFields(catalogVersion: string): Promise<SequenceFieldOrder[]>;
  sequenceRows(catalogVersion: string): Promise<SequenceDetailRow[]>;
  choiceRows(catalogVersion: string): Promise<SequenceChoiceRow[]>;
  findCustomerRecords(query: CustomerLookupQuery): Promise<{ records: CustomerRecord[]; truncated: boolean }>;
  createQuoteV2Draft(input: QuoteV2DraftCreate): Promise<{ id: string; quoteNumber?: string | null }>;
};

export type FrontDoorActor = {
  email: string;
  userId: string | null;
};

const FIELD_LABELS: Record<string, string> = {
  customer_name: "Customer name",
  crm_customer_id: "CRM customer",
  contract_number: "Contract number",
  order_packet_id: "Order packet",
  project_address: "Project address",
  customer_phone: "Customer phone",
  customer_email: "Customer email",
  salesperson: "Salesperson",
  measure_status: "Measure status",
  final_order_source: "Final order source",
  line_item_number: "Line number",
  room_location: "Room",
  quantity: "Quantity",
  side_mark_po: "Side mark",
  mount_type: "Mount",
  ordered_width: "Width",
  ordered_height: "Height",
  multiplier: "Multiplier",
};

export function quoteFrontDoorFieldLabel(fieldKey: string) {
  return FIELD_LABELS[fieldKey] ?? fieldKey.replace(/_/g, " ").replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

export function normalizeCustomerName(value: string | null | undefined) {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function usableLookup(query: CustomerLookupQuery) {
  const name = normalizeCustomerName(query.name).split(" ").some((token) => token.length >= 2);
  const address = normalizeCustomerName(query.address).split(" ").some((token) => token.length >= 2);
  const phone = phoneDigits(query.phone).length >= 7;
  return { name, address, phone, any: name || address || phone };
}

export function phoneSearchPatterns(phone: string | null | undefined) {
  const digits = phoneDigits(phone);
  if (digits.length < 7) return [];
  const national = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (national.length !== 10) return [digits];
  const area = national.slice(0, 3);
  const prefix = national.slice(3, 6);
  const line = national.slice(6);
  return [
    national,
    `${area}-${prefix}-${line}`,
    `(${area}) ${prefix}-${line}`,
    `${area}.${prefix}.${line}`,
    `${prefix}-${line}`,
    `+1${national}`,
  ];
}

export function nameSearchNeedles(value: string | null | undefined) {
  const normalized = normalizeCustomerName(value);
  const tokens = normalized.split(" ").filter((token) => token.length >= 2);
  if (tokens.length === 0) return [];
  return [...new Set([normalized, ...tokens])];
}

export function canonicalMultiplier(value: unknown) {
  if (value == null) return null;
  const text = typeof value === "number" ? String(value) : typeof value === "string" ? value.trim() : "";
  if (!text || !/^\d+(?:\.\d+)?$/.test(text)) return null;
  const numeric = Number(text);
  if (!Number.isFinite(numeric)) return null;
  return QUOTE_FRONT_DOOR_MULTIPLIERS.find((choice) => Number(choice) === numeric) ?? null;
}

export function multiplierChoices(): SequenceChoice[] {
  return QUOTE_FRONT_DOOR_MULTIPLIERS.map((value) => ({ value, label: value }));
}

export function sequenceSpec(spec: QuoteFrontDoorSpec | null | undefined) {
  const source = spec ?? {};
  const answers = { ...(source.answers ?? {}) };
  const tucked = answers.multiplier;
  delete answers.multiplier;
  const sequence: Record<string, unknown> = {
    answers,
    catalog_version: source.catalog_version ?? null,
  };
  if (source.previous) sequence.previous = source.previous;
  return {
    spec: sequence,
    multiplier: source.multiplier ?? tucked ?? null,
  };
}

export function applyMultiplierLast(sequence: SequenceNext, multiplier: unknown): FrontDoorNext {
  const base: FrontDoorNext = {
    status: sequence.status,
    reason: sequence.reason ?? null,
    field_key: sequence.field_key ?? null,
    input_kind: sequence.input_kind ?? null,
    required: sequence.required ?? null,
    ask_order: sequence.ask_order ?? null,
    choices: Array.isArray(sequence.choices) ? sequence.choices : [],
    invalidated: Array.isArray(sequence.invalidated) ? sequence.invalidated : [],
    kept: sequence.kept ?? {},
    optional_field: sequence.optional_field ?? null,
    catalog_version: sequence.catalog_version ?? null,
    phase: "legend",
    multiplier: null,
  };
  if (sequence.status === "blocked") return { ...base, phase: "blocked" };
  if (sequence.status !== "complete") return base;
  const canonical = canonicalMultiplier(multiplier);
  if (!canonical) {
    return {
      ...base,
      status: "ask",
      reason: multiplier == null || multiplier === "" ? null : "Multiplier must be one of the 805 margin choices.",
      field_key: "multiplier",
      input_kind: "buttons",
      required: true,
      ask_order: null,
      choices: multiplierChoices(),
      phase: "multiplier",
      multiplier: null,
    };
  }
  return {
    ...base,
    status: "complete",
    reason: null,
    field_key: null,
    input_kind: null,
    required: null,
    ask_order: null,
    choices: [],
    phase: "ready",
    multiplier: canonical,
  };
}

export function quoteFrontDoorPlainValue(value: unknown) {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    if ("whole" in record || "fraction" in record) {
      const whole = record.whole == null ? "" : String(record.whole);
      const fraction = record.fraction == null || String(record.fraction) === "0" ? "" : String(record.fraction);
      return [whole, fraction].filter(Boolean).join(" ");
    }
  }
  return JSON.stringify(value);
}

export function formatQuoteFrontDoorReadBack(input: {
  manufacturer: string;
  category: string;
  next: FrontDoorNext;
  fields: SequenceFieldOrder[];
}): QuoteFrontDoorReadBack {
  const title = `${input.manufacturer} ${input.category}`;
  if (input.next.phase === "blocked" || input.next.status === "blocked") {
    return {
      ready: false,
      phase: "blocked",
      summary: `${title}\nBlocked: ${input.next.reason ?? "unknown manufacturer or category"}`,
      fields: [],
      multiplier: null,
      nextField: null,
    };
  }
  const invalidated = new Set(input.next.invalidated ?? []);
  const order = new Map(input.fields.map((field) => [field.field_key, field.ask_order]));
  const kept = input.next.kept ?? {};
  const keys = Object.keys(kept).filter((key) => {
    if (invalidated.has(key) || key === "multiplier") return false;
    const text = quoteFrontDoorPlainValue(kept[key]);
    return text.length > 0;
  });
  keys.sort((left, right) => (order.get(left) ?? 100000) - (order.get(right) ?? 100000) || left.localeCompare(right));
  const fields = keys.map((key) => ({
    fieldKey: key,
    label: quoteFrontDoorFieldLabel(key),
    valueText: quoteFrontDoorPlainValue(kept[key]),
  }));
  const lines = [title, ...fields.map((field) => `${field.label}: ${field.valueText}`)];
  if (input.next.phase === "ready" && input.next.multiplier) lines.push(`Multiplier: ${input.next.multiplier}`);
  else if (input.next.field_key) lines.push(`Still needed: ${quoteFrontDoorFieldLabel(input.next.field_key)}`);
  return {
    ready: input.next.phase === "ready",
    phase: input.next.phase,
    summary: lines.join("\n"),
    fields,
    multiplier: input.next.phase === "ready" ? input.next.multiplier : null,
    nextField: input.next.field_key,
  };
}

export function customerMatchReasons(record: CustomerRecord, query: CustomerLookupQuery) {
  const reasons: Array<"name" | "phone" | "address"> = [];
  const name = normalizeCustomerName(query.name);
  const recordName = normalizeCustomerName(record.name);
  if (name) {
    const tokens = name.split(" ").filter((token) => token.length >= 2);
    if (tokens.length > 0 && tokens.every((token) => recordName.includes(token))) reasons.push("name");
  }
  if (phonesMatch(query.phone, record.phone)) reasons.push("phone");
  const address = normalizeCustomerName(query.address);
  const recordAddress = normalizeCustomerName([record.address, record.city].filter(Boolean).join(" "));
  if (address) {
    const tokens = address.split(" ").filter((token) => token.length >= 2);
    if (tokens.length > 0 && tokens.every((token) => recordAddress.includes(token))) reasons.push("address");
  }
  return reasons;
}

export function collapseCustomerCandidates(records: CustomerRecord[], query: CustomerLookupQuery): CustomerCandidate[] {
  const seen = new Set<string>();
  const uniqueRecords = records.filter((record) => {
    const key = `${record.source}:${record.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const reasons = uniqueRecords.map((record) => customerMatchReasons(record, query));
  const matchedIndexes = reasons.map((reason, index) => (reason.length > 0 ? index : -1)).filter((index) => index >= 0);
  const matchedJobIds = new Set(matchedIndexes.map((index) => uniqueRecords[index]?.jobId).filter((id): id is string => Boolean(id)));
  const matchedCustomerIds = new Set(matchedIndexes.map((index) => uniqueRecords[index]?.customerId).filter((id): id is string => Boolean(id)));
  const poolIndexes = uniqueRecords.map((_, index) => index).filter((index) => {
    if (reasons[index]?.length) return true;
    const record = uniqueRecords[index];
    return Boolean(
      (record?.jobId && matchedJobIds.has(record.jobId))
      || (record?.customerId && matchedCustomerIds.has(record.customerId)),
    );
  });
  const parent = poolIndexes.map((_, index) => index);
  const find = (index: number): number => {
    let cursor = index;
    while (parent[cursor] !== cursor) cursor = parent[cursor];
    return cursor;
  };
  const union = (left: number, right: number) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parent[rightRoot] = leftRoot;
  };
  for (let left = 0; left < poolIndexes.length; left += 1) {
    for (let right = left + 1; right < poolIndexes.length; right += 1) {
      const leftRecord = uniqueRecords[poolIndexes[left]];
      const rightRecord = uniqueRecords[poolIndexes[right]];
      if (leftRecord && rightRecord && samePerson(leftRecord, rightRecord)) union(left, right);
    }
  }
  const groups = new Map<number, number[]>();
  poolIndexes.forEach((recordIndex, poolIndex) => {
    const root = find(poolIndex);
    groups.set(root, [...(groups.get(root) ?? []), recordIndex]);
  });
  return [...groups.values()]
    .map((indexes) => toCandidate(indexes.map((index) => uniqueRecords[index]).filter((record): record is CustomerRecord => Boolean(record)), indexes.flatMap((index) => reasons[index] ?? [])))
    .sort((left, right) => left.name.localeCompare(right.name) || left.candidateId.localeCompare(right.candidateId));
}

export async function nextQuoteFrontDoorField(
  store: QuoteFrontDoorStore,
  input: { manufacturer: string; category: string; spec?: QuoteFrontDoorSpec | null },
) {
  const manufacturer = requiredText(input.manufacturer, "Manufacturer");
  const category = requiredText(input.category, "Category");
  const prepared = sequenceSpec(input.spec);
  const sequence = await store.nextRequiredField(prepared.spec, manufacturer, category);
  return applyMultiplierLast(sequence, prepared.multiplier);
}

export async function validateQuoteFrontDoorTap(
  store: QuoteFrontDoorStore,
  input: { manufacturer: string; category: string; spec?: QuoteFrontDoorSpec | null; fieldKey: string; value: unknown },
) {
  const manufacturer = requiredText(input.manufacturer, "Manufacturer");
  const category = requiredText(input.category, "Category");
  const fieldKey = requiredText(input.fieldKey, "Field");
  if (fieldKey === "multiplier") {
    const answers = { ...(input.spec?.answers ?? {}) };
    delete answers.multiplier;
    const pending = await nextQuoteFrontDoorField(store, {
      manufacturer,
      category,
      spec: { ...(input.spec ?? {}), answers, multiplier: null },
    });
    if (pending.phase === "blocked") {
      return { ok: false, status: "blocked" as const, reason: pending.reason, choices: [] };
    }
    if (pending.field_key !== "multiplier") {
      return {
        ok: false,
        status: "needs_input" as const,
        reason: "The multiplier is asked after the required fields.",
        choices: [],
      };
    }
    const canonical = canonicalMultiplier(input.value);
    if (!canonical) {
      return {
        ok: false,
        status: "needs_input" as const,
        reason: "Multiplier must be one of the 805 margin choices.",
        choices: pending.choices,
      };
    }
    return { ok: true, status: "ok" as const, reason: null, choices: pending.choices };
  }
  const prepared = sequenceSpec(input.spec);
  return store.validateTappedValue(prepared.spec, manufacturer, category, fieldKey, input.value);
}

export async function readBackQuoteFrontDoor(
  store: QuoteFrontDoorStore,
  input: { manufacturer: string; category: string; spec?: QuoteFrontDoorSpec | null },
) {
  const next = await nextQuoteFrontDoorField(store, input);
  const fields = next.catalog_version ? await store.sequenceFields(next.catalog_version) : [];
  return formatQuoteFrontDoorReadBack({
    manufacturer: input.manufacturer.trim(),
    category: input.category.trim(),
    next,
    fields,
  });
}

export async function lookupQuoteFrontDoorCustomers(store: QuoteFrontDoorStore, query: CustomerLookupQuery) {
  if (!usableLookup(query).any) return { candidates: [], truncated: false, created: false as const };
  const found = await store.findCustomerRecords(query);
  return {
    candidates: collapseCustomerCandidates(found.records, query),
    truncated: found.truncated,
    created: false as const,
  };
}

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$/;

export function frontDoorIdempotencyKey(explicit: string | null | undefined, actorId: string, quotePatch: Record<string, unknown>) {
  const trimmed = (explicit ?? "").trim();
  if (trimmed) {
    if (!IDEMPOTENCY_KEY_PATTERN.test(trimmed)) {
      throw new CrmAuthError(400, "idempotencyKey must be 8-200 safe identifier characters.");
    }
    return trimmed;
  }
  return `fd.${createHash("sha256").update(`${actorId}\n${stableJson(quotePatch)}`).digest("hex")}`;
}

export function frontDoorQuotePatch(input: {
  customerName: string;
  customerPhone: string | null;
  customerEmail: string | null;
  customerAddress: string | null;
  appointmentDate: string | null;
  customerId: string | null;
  jobId: string | null;
}) {
  return {
    customerName: input.customerName,
    customerPhone: input.customerPhone,
    customerEmail: input.customerEmail,
    customerAddress: input.customerAddress,
    appointmentDate: input.appointmentDate,
    customerId: input.customerId,
    jobId: input.jobId,
  };
}

export async function saveQuoteFrontDoorDraft(
  store: QuoteFrontDoorStore,
  input: {
    manufacturer: string;
    category: string;
    spec?: QuoteFrontDoorSpec | null;
    customer: CustomerSelection;
    idempotencyKey?: string | null;
  },
  actor: FrontDoorActor,
) {
  const next = await nextQuoteFrontDoorField(store, input);
  const fields = next.catalog_version ? await store.sequenceFields(next.catalog_version) : [];
  const readBack = formatQuoteFrontDoorReadBack({
    manufacturer: input.manufacturer.trim(),
    category: input.category.trim(),
    next,
    fields,
  });
  const refused = (reason: string, message: string, candidates: CustomerCandidate[] = []) => ({
    saved: false as const,
    reason,
    message,
    candidates,
    readBack,
    sent: false as const,
    quote: null,
  });
  if (next.phase === "blocked") return refused("blocked", next.reason ?? "This manufacturer is not in the quote sequence.");
  if (next.phase !== "ready" || !next.multiplier) {
    return refused(
      next.phase === "multiplier" ? "multiplier_last" : "required_fields_incomplete",
      next.phase === "multiplier"
        ? "The multiplier is asked after the required fields."
        : "Required fields are still open.",
    );
  }
  const lookup = await lookupQuoteFrontDoorCustomers(store, input.customer);
  const selected = selectCandidate(lookup.candidates, input.customer);
  if (selected === "ambiguous") return refused("existing_customer", "That selection matches more than one customer.", lookup.candidates);
  if (lookup.candidates.length > 0 && !selected) {
    return refused("existing_customer", "Choose one of the existing customers. A new customer was not created.", lookup.candidates);
  }
  if (!selected && input.customer.confirmNewCustomer !== true) {
    return refused("customer_not_found", "No customer matched. Confirm a new customer before saving a draft.");
  }
  const customerName = selected?.name || input.customer.name?.trim() || "";
  if (!customerName) return refused("customer_name_required", "Customer name is required.");
  const actorId = actor.userId?.trim() ?? "";
  if (!actorId) throw new CrmAuthError(401, "A signed-in staff actor is required.");
  const quotePatch = frontDoorQuotePatch({
    customerName,
    customerPhone: blankToNull(selected?.phone ?? input.customer.phone),
    customerEmail: blankToNull(selected?.email),
    customerAddress: blankToNull(selected?.address ?? input.customer.address),
    appointmentDate: appointmentDay(selected),
    customerId: selected?.customerId ?? null,
    jobId: selected?.jobId ?? null,
  });
  const readBackRecord = {
    summary: readBack.summary,
    customerId: selected?.customerId ?? null,
    jobId: selected?.jobId ?? null,
  };
  const created = await store.createQuoteV2Draft({
    idempotencyKey: frontDoorIdempotencyKey(input.idempotencyKey, actorId, { ...quotePatch, frontDoorReadBack: readBackRecord.summary }),
    actorId,
    quotePatch,
    readBack: readBackRecord,
  });
  return {
    saved: true as const,
    reason: null,
    message: "Draft quote saved.",
    candidates: selected ? [selected] : [],
    readBack,
    sent: false as const,
    quote: { id: created.id, quoteNumber: created.quoteNumber ?? null, status: "draft" as const, sent: false as const },
  };
}

function blankToNull(value: string | null | undefined) {
  const text = (value ?? "").trim();
  return text || null;
}

function appointmentDay(candidate: CustomerCandidate | null) {
  const start = candidate?.appointments.find((appointment) => appointment.start)?.start ?? "";
  const day = start.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function selectCandidate(candidates: CustomerCandidate[], selection: CustomerSelection) {
  const wanted = [selection.candidateId, selection.customerId, selection.jobId].some((value) => Boolean(value && value.trim()));
  if (!wanted) return null;
  const matches = candidates.filter((candidate) => {
    if (selection.candidateId && candidate.candidateId !== selection.candidateId) return false;
    if (selection.customerId && !candidate.customerIds.includes(selection.customerId) && candidate.customerId !== selection.customerId) return false;
    if (selection.jobId && !candidate.jobIds.includes(selection.jobId) && candidate.jobId !== selection.jobId) return false;
    const mentioned = Boolean(selection.candidateId || selection.customerId || selection.jobId);
    return mentioned;
  });
  if (matches.length > 1) return "ambiguous" as const;
  return matches[0] ?? null;
}

function toCandidate(records: CustomerRecord[], reasons: Array<"name" | "phone" | "address">): CustomerCandidate {
  const customerIds = unique(records.filter((record) => record.source === "customer").map((record) => record.id).concat(records.map((record) => record.customerId).filter((id): id is string => Boolean(id))));
  const jobIds = unique(records.filter((record) => record.source === "job").map((record) => record.id).concat(records.map((record) => record.jobId).filter((id): id is string => Boolean(id))));
  const customerId = customerIds[0] ?? null;
  const jobId = jobIds[0] ?? null;
  const candidateId = customerId ? `customer:${customerId}` : jobId ? `job:${jobId}` : `${records[0]?.source ?? "customer"}:${records[0]?.id ?? "unknown"}`;
  const appointments = records
    .map((record) => record.appointment)
    .filter((appointment): appointment is QuoteFrontDoorAppointment => Boolean(appointment))
    .filter((appointment, index, all) => all.findIndex((item) => item.source === appointment.source && item.id === appointment.id) === index);
  return {
    candidateId,
    customerId,
    customerIds,
    jobId,
    jobIds,
    name: preferredName(records),
    phone: records.map((record) => normalizePhone(record.phone) ?? record.phone).find((phone) => Boolean(phone)) ?? null,
    email: records.map((record) => record.email).find((email) => Boolean(email)) ?? null,
    address: records.map((record) => record.address).find((address) => Boolean(address)) ?? null,
    city: records.map((record) => record.city).find((city) => Boolean(city)) ?? null,
    appointments,
    matchedOn: unique(reasons),
    sources: unique(records.map((record) => record.source)),
    records: records.map((record) => ({
      source: record.source,
      id: record.id,
      customerId: record.customerId,
      jobId: record.jobId,
    })),
  };
}

function preferredName(records: CustomerRecord[]) {
  for (const source of ["customer", "job", "appointment", "calendar"] as const) {
    const named = records.find((record) => record.source === source && record.name.trim());
    if (named) return named.name.trim();
  }
  return "Customer";
}

function linkedIdentity(left: CustomerRecord, right: CustomerRecord) {
  if (left.customerId && left.customerId === right.customerId) return true;
  if (left.jobId && left.jobId === right.jobId) return true;
  if (left.source === "customer" && (left.id === right.customerId || (right.source === "customer" && left.id === right.id))) return true;
  if (right.source === "customer" && right.id === left.customerId) return true;
  if (left.source === "job" && (left.id === right.jobId || (right.source === "job" && left.id === right.id))) return true;
  if (right.source === "job" && right.id === left.jobId) return true;
  return false;
}

function samePerson(left: CustomerRecord, right: CustomerRecord) {
  if (linkedIdentity(left, right)) return true;
  const leftPhone = normalizePhone(left.phone);
  const rightPhone = normalizePhone(right.phone);
  if (leftPhone && rightPhone) return leftPhone === rightPhone;
  const leftName = normalizeCustomerName(left.name);
  const rightName = normalizeCustomerName(right.name);
  if (!leftName || leftName !== rightName) return false;
  const leftAddress = normalizeCustomerName([left.address, left.city].filter(Boolean).join(" "));
  const rightAddress = normalizeCustomerName([right.address, right.city].filter(Boolean).join(" "));
  if (leftAddress && rightAddress && leftAddress !== rightAddress) return false;
  const visit = (record: CustomerRecord) => record.source === "calendar" || record.source === "appointment";
  if (visit(left) || visit(right)) return Boolean(leftAddress && rightAddress && leftAddress === rightAddress);
  return true;
}

function phonesMatch(queryPhone: string | null | undefined, recordPhone: string | null | undefined) {
  const query = phoneDigits(queryPhone);
  const record = phoneDigits(recordPhone);
  if (query.length < 7 || record.length < 7) return false;
  return query === record || record.endsWith(query) || query.endsWith(record);
}

function phoneDigits(value: string | null | undefined) {
  const normalized = normalizePhone(value);
  if (normalized) return normalized.replace(/\D/g, "");
  const digits = (value ?? "").replace(/\D/g, "");
  return digits.length >= 7 ? digits : "";
}

function requiredText(value: string | null | undefined, label: string) {
  const text = (value ?? "").trim();
  if (!text) throw new CrmAuthError(400, `${label} is required.`);
  return text;
}

function unique<T>(values: T[]) {
  return [...new Set(values)];
}
