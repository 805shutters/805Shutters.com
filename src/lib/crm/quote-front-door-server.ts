import {
  nameSearchNeedles,
  phoneSearchPatterns,
  usableLookup,
  type CustomerLookupQuery,
  type CustomerRecord,
  type QuoteFrontDoorAppointment,
  type QuoteFrontDoorStore,
  type QuoteV2DraftCreate,
  type SequenceChoice,
  type SequenceFieldOrder,
  type SequenceNext,
  type TapResult,
} from "@/lib/crm/quote-front-door";
import { CrmAuthError } from "@/lib/crm/auth";

/**
 * Staff CRM calls reach this store through the service client after requireCrmUser.
 * The store reads customers, jobs, calendar events, and appointments.
 * The only write is create_quote_v2_draft for the signed-in staff actor, which stays a draft.
 */

const SEARCH_LIMIT = 50;

export type QuoteFrontDoorDb = {
  rpc(fn: string, args: Record<string, unknown>): Promise<{ data: unknown; error: { message: string; code?: string } | null }>;
  from(table: string): {
    select(columns: string): QuoteFrontDoorFilter;
    update(values: Record<string, unknown>): QuoteFrontDoorUpdate;
  };
};

type QuoteFrontDoorUpdate = {
  eq(column: string, value: string): QuoteFrontDoorUpdate;
  is(column: string, value: null): Promise<{ error: { message: string; code?: string } | null }>;
};

type QuoteFrontDoorFilter = {
  eq(column: string, value: string): QuoteFrontDoorFilter;
  is(column: string, value: null): QuoteFrontDoorFilter;
  or(filters: string): QuoteFrontDoorFilter;
  in(column: string, values: string[]): QuoteFrontDoorFilter;
  order(column: string, options: { ascending: boolean }): QuoteFrontDoorFilter;
  limit(count: number): Promise<{ data: unknown[] | null; error: { message: string } | null }>;
};

export function quoteFrontDoorStore(db: QuoteFrontDoorDb): QuoteFrontDoorStore {
  return {
    async nextRequiredField(spec, manufacturer, category) {
      const result = await callRpc(db, "quote_next_required_field", { spec, manufacturer, category }, "The next quote field could not be read.");
      return normalizeSequence(result);
    },
    async validateTappedValue(spec, manufacturer, category, fieldKey, value) {
      const result = await callRpc(
        db,
        "quote_validate_tapped_value",
        { spec, manufacturer, category, p_field_key: fieldKey, p_value: value },
        "The tapped value could not be checked.",
      );
      return normalizeTap(result);
    },
    async sequenceFields(catalogVersion) {
      const { data, error } = await db
        .from("quote_category_field_sequence")
        .select("field_key, ask_order")
        .eq("catalog_version", catalogVersion)
        .order("ask_order", { ascending: true })
        .limit(500);
      if (error) throw new CrmAuthError(502, "The quote field order could not be read.");
      return (data ?? []).flatMap((row) => {
        const record = asRecord(row);
        const fieldKey = text(record.field_key);
        const askOrder = typeof record.ask_order === "number" ? record.ask_order : Number(record.ask_order);
        if (!fieldKey || !Number.isFinite(askOrder)) return [];
        return [{ field_key: fieldKey, ask_order: askOrder }];
      }) satisfies SequenceFieldOrder[];
    },
    findCustomerRecords(query) {
      return findCustomerRecords(db, query);
    },
    createQuoteV2Draft(input) {
      return createQuoteV2Draft(db, input);
    },
  };
}

const STAFF_ACTOR_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function createQuoteV2Draft(db: QuoteFrontDoorDb, input: QuoteV2DraftCreate) {
  const actorId = input.actorId.trim();
  if (!STAFF_ACTOR_ID.test(actorId)) throw new CrmAuthError(401, "A signed-in staff actor is required.");
  const { data, error } = await db.rpc("create_quote_v2_draft", {
    p_idempotency_key: input.idempotencyKey,
    p_actor_id: actorId,
    p_quote_patch: input.quotePatch,
  });
  if (error) throw draftWriteError(error);
  const result = asRecord(data);
  const quoteId = text(result.quoteId);
  if (!quoteId || result.status !== "draft" || result.quoteV2Status !== "draft") {
    throw new CrmAuthError(502, "The draft quote could not be saved.");
  }
  const jobId = text(input.quotePatch.jobId);
  if (jobId && STAFF_ACTOR_ID.test(jobId)) {
    const linked = await db
      .from("sales_quotes")
      .update({ created_job_id: jobId })
      .eq("id", quoteId)
      .eq("created_by", actorId)
      .is("created_job_id", null);
    if (linked.error) throw new CrmAuthError(502, "The draft quote could not be saved.");
  }
  return { id: quoteId, quoteNumber: text(result.quoteNumber) };
}

function draftWriteError(error: { message: string; code?: string }) {
  if (error.code === "23505" || /already used/i.test(error.message)) {
    return new CrmAuthError(409, "That draft was already saved with different details.");
  }
  if (error.code === "42501" || /not authorized/i.test(error.message)) {
    return new CrmAuthError(403, "This CRM account cannot create Quote V2 drafts.");
  }
  return new CrmAuthError(502, "The draft quote could not be saved.");
}

async function findCustomerRecords(db: QuoteFrontDoorDb, query: CustomerLookupQuery) {
  if (!usableLookup(query).any) return { records: [], truncated: false };
  const nameNeedles = nameSearchNeedles(query.name);
  const addressNeedles = nameSearchNeedles(query.address);
  const phoneNeedles = phoneSearchPatterns(query.phone);
  const [customers, jobs, appointments, calendar] = await Promise.all([
    searchTable(db, "crm_customers", "id, display_name, phone, email, address, city", orIlike(["display_name"], nameNeedles).concat(orIlike(["phone"], phoneNeedles), orIlike(["address", "city"], addressNeedles)), true),
    searchTable(db, "crm_jobs", "id, customer_name, phone, email, address, city, status, appointment_start, appointment_end", orIlike(["customer_name"], nameNeedles).concat(orIlike(["phone"], phoneNeedles), orIlike(["address", "city"], addressNeedles)), true),
    searchTable(db, "sales_805_appointments", "id, customer_name, customer_phone, customer_address, appointment_date, start_time, end_time, assigned_to, status", orIlike(["customer_name"], nameNeedles).concat(orIlike(["customer_phone"], phoneNeedles), orIlike(["customer_address"], addressNeedles)), false),
    searchTable(db, "crm_calendar_events", "id, job_id, title, event_type, status, start_at, end_at, location, assigned_to", orIlike(["title", "location", "notes"], nameNeedles.concat(addressNeedles)), false),
  ]);
  const jobIds = jobs.rows.map((row) => text(asRecord(row).id)).filter((id): id is string => Boolean(id));
  const linkedCalendar = jobIds.length
    ? await searchIn(db, "crm_calendar_events", "id, job_id, title, event_type, status, start_at, end_at, location, assigned_to", "job_id", jobIds)
    : { rows: [], truncated: false };
  const records = [
    ...customers.rows.map(customerRecord),
    ...jobs.rows.map(jobRecord),
    ...appointments.rows.map(appointmentRecord),
    ...calendar.rows.map(calendarRecord),
    ...linkedCalendar.rows.map(calendarRecord),
  ].filter((record): record is CustomerRecord => Boolean(record));
  return {
    records,
    truncated: customers.truncated || jobs.truncated || appointments.truncated || calendar.truncated || linkedCalendar.truncated,
  };
}

function customerRecord(row: unknown): CustomerRecord | null {
  const record = asRecord(row);
  const id = text(record.id);
  const name = text(record.display_name);
  if (!id || !name) return null;
  return {
    source: "customer",
    id,
    customerId: id,
    jobId: null,
    name,
    phone: text(record.phone),
    email: text(record.email),
    address: text(record.address),
    city: text(record.city),
    appointment: null,
  };
}

function jobRecord(row: unknown): CustomerRecord | null {
  const record = asRecord(row);
  const id = text(record.id);
  const name = text(record.customer_name);
  if (!id || !name) return null;
  const start = text(record.appointment_start);
  return {
    source: "job",
    id,
    customerId: null,
    jobId: id,
    name,
    phone: text(record.phone),
    email: text(record.email),
    address: text(record.address),
    city: text(record.city),
    appointment: start
      ? {
          id,
          source: "job",
          start,
          end: text(record.appointment_end),
          status: text(record.status),
          assignedTo: null,
          location: text(record.address),
          eventType: "job",
        }
      : null,
  };
}

function appointmentRecord(row: unknown): CustomerRecord | null {
  const record = asRecord(row);
  const id = text(record.id);
  const name = text(record.customer_name);
  if (!id || !name) return null;
  const date = text(record.appointment_date);
  const startTime = text(record.start_time);
  return {
    source: "appointment",
    id,
    customerId: null,
    jobId: null,
    name,
    phone: text(record.customer_phone),
    email: null,
    address: text(record.customer_address),
    city: null,
    appointment: appointmentSummary({
      id,
      source: "appointment",
      start: date ? `${date}T${startTime ?? "00:00:00"}` : startTime,
      end: text(record.end_time),
      status: text(record.status),
      assignedTo: text(record.assigned_to),
      location: text(record.customer_address),
      eventType: "appointment",
    }),
  };
}

function calendarRecord(row: unknown): CustomerRecord | null {
  const record = asRecord(row);
  const id = text(record.id);
  if (!id) return null;
  const jobId = text(record.job_id);
  return {
    source: "calendar",
    id,
    customerId: null,
    jobId,
    name: text(record.title) ?? "",
    phone: null,
    email: null,
    address: text(record.location),
    city: null,
    appointment: appointmentSummary({
      id,
      source: "calendar",
      start: text(record.start_at),
      end: text(record.end_at),
      status: text(record.status),
      assignedTo: text(record.assigned_to),
      location: text(record.location),
      eventType: text(record.event_type),
    }),
  };
}

function appointmentSummary(appointment: QuoteFrontDoorAppointment) {
  return appointment;
}

async function searchTable(db: QuoteFrontDoorDb, table: string, columns: string, filters: string[], hideDeleted: boolean) {
  if (filters.length === 0) return { rows: [], truncated: false };
  let query = db.from(table).select(columns);
  if (hideDeleted) query = query.is("meta->>deleted_at", null);
  const { data, error } = await query.or(filters.join(",")).limit(SEARCH_LIMIT);
  if (error) throw new CrmAuthError(502, "Customers could not be searched.");
  const rows = data ?? [];
  return { rows, truncated: rows.length >= SEARCH_LIMIT };
}

async function searchIn(db: QuoteFrontDoorDb, table: string, columns: string, column: string, values: string[]) {
  const { data, error } = await db.from(table).select(columns).in(column, values).limit(SEARCH_LIMIT);
  if (error) throw new CrmAuthError(502, "Customers could not be searched.");
  const rows = data ?? [];
  return { rows, truncated: rows.length >= SEARCH_LIMIT };
}

function orIlike(columns: string[], needles: string[]) {
  const clauses: string[] = [];
  for (const needle of needles) {
    const escaped = escapeFilter(needle);
    if (escaped.length < 2) continue;
    for (const column of columns) clauses.push(`${column}.ilike.%${escaped}%`);
  }
  return [...new Set(clauses)];
}

function escapeFilter(value: string) {
  return value
    .replace(/[\\%_*]/g, (char) => `\\${char}`)
    .replace(/[,()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function callRpc(db: QuoteFrontDoorDb, fn: string, args: Record<string, unknown>, message: string) {
  const { data, error } = await db.rpc(fn, args);
  if (error) throw new CrmAuthError(502, message);
  return parseJson(data);
}

function normalizeSequence(value: unknown): SequenceNext {
  const record = asRecord(value);
  const status = text(record.status);
  if (status !== "ask" && status !== "needs_input" && status !== "blocked" && status !== "complete") {
    throw new CrmAuthError(502, "The next quote field could not be read.");
  }
  return {
    status,
    reason: text(record.reason),
    field_key: text(record.field_key),
    input_kind: text(record.input_kind),
    required: typeof record.required === "boolean" ? record.required : null,
    ask_order: typeof record.ask_order === "number" ? record.ask_order : null,
    choices: choices(record.choices),
    invalidated: Array.isArray(record.invalidated) ? record.invalidated.filter((item): item is string => typeof item === "string") : [],
    kept: asRecord(record.kept),
    optional_field: optionalField(record.optional_field),
    catalog_version: text(record.catalog_version),
  };
}

function normalizeTap(value: unknown): TapResult {
  const record = asRecord(value);
  const status = text(record.status);
  if (status !== "ok" && status !== "blocked" && status !== "needs_input") {
    throw new CrmAuthError(502, "The tapped value could not be checked.");
  }
  return {
    ok: record.ok === true,
    status,
    reason: text(record.reason),
    choices: choices(record.choices),
  };
}

function optionalField(value: unknown): SequenceNext["optional_field"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const fieldKey = text(record.field_key);
  if (!fieldKey) return null;
  return {
    field_key: fieldKey,
    input_kind: text(record.input_kind) ?? "buttons",
    choices: choices(record.choices),
  };
}

function choices(value: unknown): SequenceChoice[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const record = asRecord(item);
    const choice = text(record.value);
    if (!choice) return [];
    return [{ value: choice, label: text(record.label) ?? choice }];
  });
}

function parseJson(value: unknown) {
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      throw new CrmAuthError(502, "The quote sequence returned an unreadable result.");
    }
  }
  return value;
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

