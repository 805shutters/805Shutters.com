import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { COST_MULTIPLIERS } from "@/lib/crm/mobile-supplier-spec";
import {
  QUOTE_FRONT_DOOR_MULTIPLIERS,
  applyMultiplierLast,
  collapseCustomerCandidates,
  formatQuoteFrontDoorReadBack,
  lookupQuoteFrontDoorCustomers,
  nextQuoteFrontDoorField,
  phoneSearchPatterns,
  readBackQuoteFrontDoor,
  saveQuoteFrontDoorDraft,
  sequenceSpec,
  validateQuoteFrontDoorTap,
  type CustomerRecord,
  type QuoteFrontDoorStore,
  type QuoteV2DraftCreate,
  type SequenceNext,
} from "@/lib/crm/quote-front-door";
import { quoteFrontDoorStore, type QuoteFrontDoorDb } from "@/lib/crm/quote-front-door-server";

const catalog = "order-form:norman:roller:v1";
const order = ["room_location", "ordered_width"] as const;

function blocked(reason = "unknown manufacturer or category"): SequenceNext {
  return {
    status: "blocked",
    reason,
    field_key: null,
    input_kind: null,
    required: null,
    ask_order: null,
    choices: [],
    invalidated: [],
    kept: {},
    optional_field: null,
    catalog_version: null,
  };
}

function legend(spec: Record<string, unknown>, manufacturer: string, category: string): SequenceNext {
  if (manufacturer === "Sundance" || category.startsWith("sundance")) return blocked();
  const answers = (spec.answers ?? {}) as Record<string, unknown>;
  const kept: Record<string, unknown> = {};
  for (const [index, key] of order.entries()) {
    const value = answers[key];
    if (value == null || value === "") {
      return {
        status: "ask",
        reason: null,
        field_key: key,
        input_kind: key === "ordered_width" ? "typed" : "typed",
        required: true,
        ask_order: index + 1,
        choices: key === "room_location" ? [] : [{ value: "36 1/8", label: "36 1/8" }],
        invalidated: [],
        kept,
        optional_field: null,
        catalog_version: catalog,
      };
    }
    kept[key] = value;
  }
  return {
    status: "complete",
    reason: null,
    field_key: null,
    input_kind: null,
    required: null,
    ask_order: null,
    choices: [],
    invalidated: ["color_name"],
    kept: { ...kept, color_name: "not confirmed" },
    optional_field: { field_key: "valance", input_kind: "buttons", choices: [{ value: "No Valance", label: "No Valance" }] },
    catalog_version: catalog,
  };
}

function store(overrides: Partial<QuoteFrontDoorStore> = {}): QuoteFrontDoorStore & { creates: QuoteV2DraftCreate[]; taps: unknown[] } {
  const creates: QuoteV2DraftCreate[] = [];
  const taps: unknown[] = [];
  return {
    creates,
    taps,
    nextRequiredField: vi.fn(async (spec, manufacturer, category) => legend(spec, manufacturer, category)),
    validateTappedValue: vi.fn(async (spec, manufacturer, category, fieldKey, value) => {
      taps.push({ spec, manufacturer, category, fieldKey, value });
      if (manufacturer === "Sundance") return { ok: false, status: "blocked" as const, reason: "unknown manufacturer or category", choices: [] };
      return { ok: true, status: "ok" as const, reason: null, choices: [{ value: "Inside Mount", label: "Inside Mount" }] };
    }),
    sequenceFields: async () => [
      { field_key: "ordered_width", ask_order: 2 },
      { field_key: "room_location", ask_order: 1 },
    ],
    findCustomerRecords: async () => ({ records: [], truncated: false }),
    createQuoteV2Draft: async (input) => {
      creates.push(input);
      return { id: "draft-1", quoteNumber: "805-0001" };
    },
    ...overrides,
  };
}

const janeCustomer: CustomerRecord = {
  source: "customer", id: "c1", customerId: "c1", jobId: null, name: "Jane Smith",
  phone: "(805) 555-0100", email: "jane@example.com", address: "1 Main St", city: "Ventura", appointment: null,
};
const janeJob: CustomerRecord = {
  source: "job", id: "j1", customerId: null, jobId: "j1", name: "Jane Smith",
  phone: "8055550100", email: null, address: "1 Main St", city: "Ventura",
  appointment: { id: "j1", source: "job", start: "2026-11-22T15:00:00Z", end: null, status: "scheduled", assignedTo: null, location: "1 Main St", eventType: "job" },
};
const janeCalendar: CustomerRecord = {
  source: "calendar", id: "e1", customerId: null, jobId: "j1", name: "Consult", phone: null, email: null, address: "1 Main St", city: null,
  appointment: { id: "e1", source: "calendar", start: "2026-11-22T15:00:00Z", end: "2026-11-22T16:00:00Z", status: "scheduled", assignedTo: "Mike", location: "1 Main St", eventType: "sales_consult" },
};
const janeAppointment: CustomerRecord = {
  source: "appointment", id: "a1", customerId: null, jobId: null, name: "Jane Smith",
  phone: "+1 805-555-0100", email: null, address: "1 Main St", city: null,
  appointment: { id: "a1", source: "appointment", start: "2026-11-22T15:00:00", end: null, status: "scheduled", assignedTo: "Mike", location: "1 Main St", eventType: "appointment" },
};
const otherJane: CustomerRecord = {
  source: "customer", id: "c2", customerId: "c2", jobId: null, name: "Jane Smith",
  phone: "805-555-0199", email: null, address: "9 Other Rd", city: "Oxnard", appointment: null,
};
const people = [janeCustomer, janeJob, janeCalendar, janeAppointment, otherJane, { ...janeCustomer, id: "c1" }];

const readySpec = {
  answers: { room_location: "Office", ordered_width: { whole: 36, fraction: "1/8" }, multiplier: "2.50" },
  multiplier: "2.5" as const,
};

describe("quote front door next field", () => {
  it("asks legend fields in order and the multiplier only after they are complete", async () => {
    const db = store();
    const answers: Record<string, unknown> = {};
    const seen: string[] = [];
    const early = await nextQuoteFrontDoorField(db, {
      manufacturer: "Norman", category: "roller", spec: { answers, multiplier: "2.5" },
    });
    expect(early.field_key).toBe("room_location");
    expect(early.phase).toBe("legend");
    expect(early.multiplier).toBeNull();

    for (let step = 0; step < 5; step += 1) {
      const next = await nextQuoteFrontDoorField(db, { manufacturer: "Norman", category: "roller", spec: { answers } });
      if (next.phase === "ready") break;
      seen.push(next.field_key ?? "");
      if (next.field_key === "multiplier") answers.multiplier = "2.5";
      else if (next.field_key === "ordered_width") answers.ordered_width = { whole: 36, fraction: "1/8" };
      else if (next.field_key) answers[next.field_key] = "Office";
    }
    expect(seen).toEqual(["room_location", "ordered_width", "multiplier"]);
    const done = await nextQuoteFrontDoorField(db, {
      manufacturer: "Norman", category: "roller", spec: { answers, multiplier: "2.5" },
    });
    expect(done.phase).toBe("ready");
    expect(done.field_key).toBeNull();
    expect(done.multiplier).toBe("2.5");
    expect(done.optional_field?.field_key).toBe("valance");
  });

  it("keeps a preset multiplier from being treated as the next field", () => {
    const asking = applyMultiplierLast(legend({ answers: {} }, "Norman", "roller"), "2.5");
    expect(asking).toMatchObject({ phase: "legend", field_key: "room_location", multiplier: null });
    const needsInput = applyMultiplierLast({ ...legend({ answers: {} }, "Norman", "roller"), status: "needs_input" }, "2.5");
    expect(needsInput.phase).toBe("legend");
    expect(needsInput.field_key).not.toBe("multiplier");
  });
});

describe("quote front door validation", () => {
  it("checks a legend tap with quote_validate_tapped_value and holds the multiplier until the end", async () => {
    const db = store();
    const width = await validateQuoteFrontDoorTap(db, {
      manufacturer: "Norman",
      category: "roller",
      fieldKey: "ordered_width",
      value: { whole: 36, fraction: "1/8" },
      spec: { answers: { room_location: "Office" }, multiplier: "2.5" },
    });
    expect(width).toMatchObject({ ok: true, status: "ok" });
    expect(db.taps[0]).toMatchObject({ fieldKey: "ordered_width", manufacturer: "Norman", category: "roller" });
    expect((db.taps[0] as { spec: { answers: Record<string, unknown> } }).spec.answers.multiplier).toBeUndefined();

    const early = await validateQuoteFrontDoorTap(db, {
      manufacturer: "Norman", category: "roller", fieldKey: "multiplier", value: "2.5", spec: { answers: {} },
    });
    expect(early).toMatchObject({ ok: false, status: "needs_input", reason: "The multiplier is asked after the required fields." });
    expect(db.taps).toHaveLength(1);

    const accepted = await validateQuoteFrontDoorTap(db, {
      manufacturer: "Norman", category: "roller", fieldKey: "multiplier", value: "2.50", spec: readySpec,
    });
    expect(accepted).toMatchObject({ ok: true, status: "ok" });
    expect(accepted.choices.map((choice) => choice.value)).toEqual([...QUOTE_FRONT_DOOR_MULTIPLIERS]);
    const rejected = await validateQuoteFrontDoorTap(db, {
      manufacturer: "Norman", category: "roller", fieldKey: "multiplier", value: "9", spec: readySpec,
    });
    expect(rejected).toMatchObject({ ok: false, status: "needs_input" });
    expect(db.validateTappedValue).toHaveBeenCalledTimes(1);
  });
});

describe("quote front door blocked manufacturer", () => {
  it("blocks unseeded Sundance before any multiplier question", async () => {
    const db = store();
    const next = await nextQuoteFrontDoorField(db, {
      manufacturer: "Sundance",
      category: "sundance_roller",
      spec: { answers: { room_location: "Office" }, multiplier: "2.5" },
    });
    expect(next).toMatchObject({ status: "blocked", phase: "blocked", reason: "unknown manufacturer or category", field_key: null, multiplier: null });
    const tap = await validateQuoteFrontDoorTap(db, {
      manufacturer: "Sundance", category: "sundance_roller", fieldKey: "multiplier", value: "2.5", spec: {},
    });
    expect(tap).toMatchObject({ ok: false, status: "blocked", reason: "unknown manufacturer or category" });
    expect(db.taps).toHaveLength(0);
    const legendTap = await validateQuoteFrontDoorTap(db, {
      manufacturer: "Sundance", category: "sundance_roller", fieldKey: "room_location", value: "Office", spec: {},
    });
    expect(legendTap).toMatchObject({ ok: false, status: "blocked" });
  });
});

describe("quote front door read-back", () => {
  it("reads captured fields back in legend order and leaves the multiplier off until it is asked", async () => {
    const open = formatQuoteFrontDoorReadBack({
      manufacturer: "Norman",
      category: "roller",
      next: applyMultiplierLast(legend({ answers: { room_location: "Office", ordered_width: { whole: 36, fraction: "1/8" } } }, "Norman", "roller"), null),
      fields: [
        { field_key: "ordered_width", ask_order: 2 },
        { field_key: "room_location", ask_order: 1 },
      ],
    });
    expect(open.ready).toBe(false);
    expect(open.summary).toBe(["Norman roller", "Room: Office", "Width: 36 1/8", "Still needed: Multiplier"].join("\n"));
    expect(open.fields.map((field) => field.fieldKey)).toEqual(["room_location", "ordered_width"]);
    expect(open.summary).not.toContain("not confirmed");

    const db = store();
    const confirmed = await readBackQuoteFrontDoor(db, { manufacturer: "Norman", category: "roller", spec: readySpec });
    expect(confirmed.ready).toBe(true);
    expect(confirmed.multiplier).toBe("2.5");
    expect(confirmed.summary).toBe(["Norman roller", "Room: Office", "Width: 36 1/8", "Multiplier: 2.5"].join("\n"));

    const blockedRead = formatQuoteFrontDoorReadBack({
      manufacturer: "Sundance",
      category: "sundance_roller",
      next: applyMultiplierLast(blocked(), "2.5"),
      fields: [],
    });
    expect(blockedRead.summary).toBe("Sundance sundance_roller\nBlocked: unknown manufacturer or category");
    expect(blockedRead.fields).toEqual([]);
  });
});

describe("quote front door customer lookup", () => {
  it("returns one candidate for the same phone and does not create a customer", async () => {
    const db = store({
      findCustomerRecords: vi.fn(async () => ({ records: people, truncated: false })),
    });
    const byName = await lookupQuoteFrontDoorCustomers(db, { name: "Jane Smith" });
    expect(byName.created).toBe(false);
    expect(byName.candidates).toHaveLength(2);
    const jane = byName.candidates.find((candidate) => candidate.customerIds.includes("c1"));
    expect(jane?.customerIds).toEqual(["c1"]);
    expect(jane?.jobIds).toEqual(["j1"]);
    expect(jane?.appointments.map((appointment) => appointment.source).sort()).toEqual(["appointment", "calendar", "job"]);
    expect(jane?.phone).toBe("+18055550100");
    const other = byName.candidates.find((candidate) => candidate.customerIds.includes("c2"));
    expect(other?.address).toBe("9 Other Rd");

    const byPhone = collapseCustomerCandidates(people, { phone: "805-555-0100" });
    expect(byPhone).toHaveLength(1);
    expect(byPhone[0]?.records.map((record) => record.id).sort()).toEqual(["a1", "c1", "e1", "j1"]);
    expect(db.creates).toEqual([]);
    expect(db.findCustomerRecords).toHaveBeenCalledTimes(1);

    const blank = await lookupQuoteFrontDoorCustomers(db, { name: "J", phone: "555", address: "" });
    expect(blank).toEqual({ candidates: [], truncated: false, created: false });
    expect(db.findCustomerRecords).toHaveBeenCalledTimes(1);
  });

  it("refuses to save a second customer when one already matches", async () => {
    const db = store({
      findCustomerRecords: async () => ({ records: people, truncated: false }),
    });
    const actor = { email: "805shutters@gmail.com", userId: "11111111-1111-4111-8111-111111111111" };
    const duplicate = await saveQuoteFrontDoorDraft(db, {
      manufacturer: "Norman",
      category: "roller",
      spec: readySpec,
      customer: { name: "Jane Smith", phone: "(805) 555-0100", confirmNewCustomer: true },
    }, actor);
    expect(duplicate.saved).toBe(false);
    expect(duplicate.reason).toBe("existing_customer");
    expect(duplicate.sent).toBe(false);
    expect(db.creates).toEqual([]);

    const saved = await saveQuoteFrontDoorDraft(db, {
      manufacturer: "Norman",
      category: "roller",
      spec: readySpec,
      customer: { name: "Jane Smith", phone: "(805) 555-0100", customerId: "c1" },
      idempotencyKey: "front-door-jane-1",
    }, actor);
    expect(saved.saved).toBe(true);
    expect(saved.quote).toEqual({ id: "draft-1", quoteNumber: "805-0001", status: "draft", sent: false });
    expect(saved.sent).toBe(false);
    expect(db.creates).toHaveLength(1);
    expect(db.creates[0]?.actorId).toBe(actor.userId);
    expect(db.creates[0]?.idempotencyKey).toBe("front-door-jane-1");
    expect(db.creates[0]?.quotePatch).toMatchObject({
      customerName: "Jane Smith",
      customerId: "c1",
      jobId: "j1",
      appointmentDate: "2026-11-22",
    });
    expect(db.creates[0]?.quotePatch).not.toHaveProperty("installerNotes");
    expect(db.creates[0]?.readBack.summary).toContain("Norman roller");
    expect(db.creates[0]?.readBack.summary).toContain("Room: Office");
    expect(db.creates[0]?.readBack.summary).toContain("Multiplier: 2.5");
    expect(db.creates[0]?.quotePatch).not.toHaveProperty("status");

    const fresh = store();
    const created = await saveQuoteFrontDoorDraft(fresh, {
      manufacturer: "Norman",
      category: "roller",
      spec: readySpec,
      customer: { name: "New Person", phone: "805-555-0177", confirmNewCustomer: true },
    }, actor);
    expect(created.saved).toBe(true);
    expect(created.quote?.status).toBe("draft");
    expect(created.sent).toBe(false);
    expect(fresh.creates[0]?.actorId).toBe(actor.userId);
    expect(fresh.creates[0]?.quotePatch).toMatchObject({ customerName: "New Person", customerId: null, jobId: null });
    expect(fresh.creates[0]?.quotePatch).not.toHaveProperty("installerNotes");
    expect(fresh.creates[0]?.readBack.summary).toContain("Norman roller");
  });

  it("writes nothing when customer details are missing", async () => {
    const db = store();
    const actor = { email: "805shutters@gmail.com", userId: "11111111-1111-4111-8111-111111111111" };
    const missing = await saveQuoteFrontDoorDraft(db, {
      manufacturer: "Norman",
      category: "roller",
      spec: readySpec,
      customer: { confirmNewCustomer: true },
    }, actor);
    expect(missing).toMatchObject({ saved: false, reason: "customer_name_required", sent: false, quote: null });
    expect(db.creates).toEqual([]);
  });

  it("repeats an idempotency key instead of minting a second one", async () => {
    const db = store();
    const actor = { email: "805shutters@gmail.com", userId: "11111111-1111-4111-8111-111111111111" };
    const input = {
      manufacturer: "Norman",
      category: "roller",
      spec: readySpec,
      customer: { name: "New Person", phone: "805-555-0177", confirmNewCustomer: true },
      idempotencyKey: "front-door-repeat-1",
    };
    await saveQuoteFrontDoorDraft(db, input, actor);
    await saveQuoteFrontDoorDraft(db, input, actor);
    expect(db.creates.map((create) => create.idempotencyKey)).toEqual(["front-door-repeat-1", "front-door-repeat-1"]);
    expect(db.creates[0]?.quotePatch).toEqual(db.creates[1]?.quotePatch);
    expect(db.creates[0]?.quotePatch).not.toHaveProperty("installerNotes");
    expect(db.creates[0]?.readBack).toEqual(db.creates[1]?.readBack);
  });

  it("does not save a draft before the multiplier", async () => {
    const db = store();
    const result = await saveQuoteFrontDoorDraft(db, {
      manufacturer: "Norman",
      category: "roller",
      spec: { answers: { room_location: "Office", ordered_width: { whole: 36, fraction: "1/8" } } },
      customer: { name: "New Person", confirmNewCustomer: true },
    }, { email: "jessica@805shutters.com", userId: null });
    expect(result).toMatchObject({ saved: false, reason: "multiplier_last", sent: false, quote: null });
    expect(db.creates).toEqual([]);
  });
});

describe("quote front door boundaries", () => {
  it("uses the CRM multiplier list and does not send, bill, or call another company", () => {
    expect([...QUOTE_FRONT_DOOR_MULTIPLIERS]).toEqual([...COST_MULTIPLIERS]);
    expect(phoneSearchPatterns("(805) 555-0100")).toContain("8055550100");
    expect(phoneSearchPatterns("(805) 555-0100")).toContain("(805) 555-0100");
    const prepared = sequenceSpec({ answers: { room_location: "Office", multiplier: "2.5" }, multiplier: "2.5" });
    expect(prepared.spec.answers).toEqual({ room_location: "Office" });
    expect(prepared.multiplier).toBe("2.5");

    const source = [
      readFileSync("src/lib/crm/quote-front-door.ts", "utf8"),
      readFileSync("src/lib/crm/quote-front-door-server.ts", "utf8"),
      readFileSync("src/app/api/crm/quote-front-door/draft/route.ts", "utf8"),
    ].join("\n");
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toMatch(/twilio|sendgrid|square|quickbooks|resend|nodemailer|fetch\(|mts-quote|customer-send/i);
    expect(code).toContain("quote_next_required_field");
    expect(code).toContain("quote_validate_tapped_value");
    expect(code).toContain("create_quote_v2_draft");
    const created = readFileSync("supabase/migrations/20261121233000_quote_front_door_drafts.sql", "utf8");
    expect(created).not.toMatch(/\bdrop\s+(table|column|schema|function)\b/i);
    expect(created).not.toMatch(/\bdelete\s+from\b/i);
    const removed = readFileSync("supabase/migrations/20261122035000_drop_empty_front_door_side_table.sql", "utf8");
    expect(removed).toMatch(/raise exception/i);
    expect(removed).not.toMatch(/\bdelete\s+from\b/i);
  });
});

describe("quote front door database adapter", () => {
  it("calls the sequence functions and creates one quote draft", async () => {
    const calls: Array<{ type: string; table?: string; fn?: string; row?: Record<string, unknown>; args?: Record<string, unknown> }> = [];
    const quoteId = "44444444-4444-4444-8444-444444444444";
    const actorId = "11111111-1111-4111-8111-111111111111";
    const jobId = "22222222-2222-4222-8222-222222222222";
    const customerId = "33333333-3333-4333-8333-333333333333";
    const filter = (table: string) => {
      const api = {
        eq: () => api,
        is: () => api,
        or: () => api,
        in: () => api,
        order: () => api,
        limit: async () => {
          calls.push({ type: "select", table });
          return { data: [], error: null };
        },
      };
      return api;
    };
    const db: QuoteFrontDoorDb = {
      async rpc(fn, args) {
        calls.push({ type: "rpc", fn, args });
        if (fn === "create_quote_v2_draft") {
          return {
            data: {
              backend: "authoritative_v2",
              quoteId,
              quoteNumber: "805-0009",
              revision: 1,
              status: "draft",
              quoteV2Status: "draft",
              lineCount: 0,
            },
            error: null,
          };
        }
        return {
          data: {
            status: "complete",
            reason: null,
            field_key: null,
            input_kind: null,
            required: null,
            ask_order: null,
            choices: [],
            invalidated: [],
            kept: { room_location: "Office" },
            optional_field: null,
            catalog_version: catalog,
          },
          error: null,
        };
      },
      from(table: string) {
        return {
          select: () => filter(table),
          update(row: Record<string, unknown>) {
            const update = {
              eq: () => update,
              is: async () => {
                calls.push({ type: "update", table, row });
                return { error: null };
              },
            };
            return update;
          },
        };
      },
    };
    const adapter = quoteFrontDoorStore(db);
    await lookupQuoteFrontDoorCustomers(adapter, { name: "Jane Smith" });
    expect(calls.some((call) => call.type === "insert")).toBe(false);
    expect(calls.filter((call) => call.type === "select").map((call) => call.table)).toEqual([
      "crm_customers",
      "crm_jobs",
      "sales_805_appointments",
      "crm_calendar_events",
    ]);

    const saved = await saveQuoteFrontDoorDraft(adapter, {
      manufacturer: "Norman",
      category: "roller",
      spec: { answers: { room_location: "Office", multiplier: "9" }, multiplier: "2.5" },
      customer: { name: "New Person", phone: "805-555-0177", confirmNewCustomer: true, customerId, jobId },
      idempotencyKey: "front-door-route-1",
    }, { email: "805shutters@gmail.com", userId: actorId });
    expect(saved.quote).toEqual({ id: quoteId, quoteNumber: "805-0009", status: "draft", sent: false });
    expect(saved.sent).toBe(false);
    const rpc = calls.find((call) => call.fn === "quote_next_required_field");
    expect((rpc?.args?.spec as { answers: Record<string, unknown> }).answers.multiplier).toBeUndefined();
    const created = calls.find((call) => call.fn === "create_quote_v2_draft");
    expect(created?.args).toMatchObject({
      p_idempotency_key: "front-door-route-1",
      p_actor_id: actorId,
      p_quote_patch: { customerName: "New Person", customerId: null, jobId: null },
    });
    expect(created?.args?.p_quote_patch).not.toHaveProperty("installerNotes");
    expect(calls.some((call) => call.type === "insert")).toBe(false);
    const readBackWrite = calls.find((call) => call.type === "update");
    expect(readBackWrite).toMatchObject({ table: "sales_quotes" });
    expect(readBackWrite?.row).not.toHaveProperty("installer_notes");
    expect(String((readBackWrite?.row?.front_door_readback as { summary?: string } | undefined)?.summary)).toContain("Norman roller");
    expect(calls.some((call) => call.table === "crm_customers" && call.type !== "select")).toBe(false);

    calls.length = 0;
    adapter.findCustomerRecords = async () => ({
      records: [{
        source: "customer",
        id: customerId,
        customerId,
        jobId,
        name: "Jane Smith",
        phone: "+18055550100",
        email: "jane@example.com",
        address: "1 Main St",
        city: "Ventura",
        appointment: null,
      }, {
        source: "job",
        id: jobId,
        customerId,
        jobId,
        name: "Jane Smith",
        phone: "+18055550100",
        email: "jane@example.com",
        address: "1 Main St",
        city: "Ventura",
        appointment: { id: jobId, source: "job", start: "2026-11-22T15:00:00Z", end: null, status: "scheduled", assignedTo: null, location: "1 Main St", eventType: "job" },
      }],
      truncated: false,
    });
    const matched = await saveQuoteFrontDoorDraft(adapter, {
      manufacturer: "Norman",
      category: "roller",
      spec: { answers: { room_location: "Office" }, multiplier: "2.5" },
      customer: { name: "Jane Smith", customerId, jobId },
      idempotencyKey: "front-door-matched-1",
    }, { email: "805shutters@gmail.com", userId: actorId });
    expect(matched.sent).toBe(false);
    const matchedCreate = calls.find((call) => call.fn === "create_quote_v2_draft");
    expect(matchedCreate?.args?.p_actor_id).toBe(actorId);
    expect(matchedCreate?.args?.p_quote_patch).toMatchObject({
      customerName: "Jane Smith",
      customerId,
      jobId,
      customerPhone: "+18055550100",
      customerEmail: "jane@example.com",
      customerAddress: "1 Main St",
    });
    const writes = calls.filter((call) => call.type === "update");
    expect(writes.map((call) => call.row && Object.keys(call.row)[0])).toEqual(["front_door_readback", "created_job_id"]);
    expect(writes[0]?.row).not.toHaveProperty("installer_notes");
    expect(writes[1]).toMatchObject({ table: "sales_quotes", row: { created_job_id: jobId } });
    expect((writes[0]?.row?.front_door_readback as { summary?: string; customerId?: string }).summary).toContain("Norman roller");
    expect((writes[0]?.row?.front_door_readback as { customerId?: string }).customerId).toBe(customerId);
  });
});
