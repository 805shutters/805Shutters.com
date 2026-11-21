import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { nextQuoteFrontDoorField, validateQuoteFrontDoorTap, type QuoteFrontDoorStore, type SequenceNext } from "@/lib/crm/quote-front-door";
import { nextQuoteButtonBatch, validateQuoteButtonBatch, type QuoteStructureWriter } from "@/lib/crm/quote-front-door-batch";
import { parseSalesQuoteV2StructureBody } from "@/lib/crm/sales-quote-v2-structure";

const catalog = "order-form:norman:roller:v1";
const actor = { email: "805shutters@gmail.com", userId: "11111111-1111-4111-8111-111111111111" };
const quoteId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const lineA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const lineB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const lineC = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const quote = { id: quoteId, expectedRevision: 3, idempotencyKey: "front-door-batch-1" };

function sequence(spec: Record<string, unknown>): SequenceNext {
  const answers = (spec.answers ?? {}) as Record<string, unknown>;
  const kept: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(answers)) {
    if (value == null || value === "" || value === "Ceiling") continue;
    kept[key] = value;
  }
  return {
    status: "ask",
    reason: null,
    field_key: "room_location",
    input_kind: "typed",
    required: true,
    ask_order: 1,
    choices: [],
    invalidated: answers.mount_type === "Ceiling" ? ["mount_type"] : [],
    kept,
    optional_field: null,
    catalog_version: catalog,
  };
}

function store() {
  const saves: Array<Parameters<QuoteStructureWriter["save"]>[0]> = [];
  const db: QuoteFrontDoorStore = {
    nextRequiredField: vi.fn(async (spec) => sequence(spec)),
    validateTappedValue: vi.fn(async (_spec, _manufacturer, _category, fieldKey, value) => {
      if (fieldKey === "mount_type" && value === "Ceiling") {
        return { ok: false, status: "needs_input" as const, reason: "value is not a catalog choice", choices: [{ value: "Inside Mount", label: "Inside Mount" }] };
      }
      return { ok: true, status: "ok" as const, reason: null, choices: [] };
    }),
    sequenceFields: async () => [],
    sequenceRows: async () => [],
    choiceRows: async () => [],
    findCustomerRecords: async () => ({ records: [], truncated: false }),
    createQuoteV2Draft: async () => ({ id: "draft-1", quoteNumber: "805-0001" }),
  };
  const writer: QuoteStructureWriter = {
    async save(input) {
      saves.push(input);
      return { quoteId: input.quoteId, revision: input.expectedRevision + 1, status: "draft", quoteV2Status: "stale" };
    },
  };
  return { db, saves, writer };
}

const validPicks = {
  room_location: "Office",
  quantity: 1,
  mount_type: "Inside Mount",
  ordered_width: 36.125,
  ordered_height: 48,
  roll_type: "Standard Roll",
};

describe("quote button batch", () => {
  it("writes every valid pick onto the real quote lines", async () => {
    const { db, saves, writer } = store();
    const first = await nextQuoteButtonBatch(db, { manufacturer: "Norman", category: "roller", spec: { answers: {} } });
    expect(first.sent).toBe(false);
    expect(first.fields.map((field) => field.fieldKey)).toEqual(expect.arrayContaining(["room_location", "quantity", "mount_type", "ordered_width"]));
    expect(first.fields.map((field) => field.fieldKey)).not.toContain("collection");
    expect(first.fields.find((field) => field.fieldKey === "quantity")?.defaultValue).toBe("1");

    const saved = await validateQuoteButtonBatch(db, {
      manufacturer: "Norman",
      category: "roller",
      spec: { answers: {} },
      picks: validPicks,
      lines: [{ id: lineA, label: "Line A", answers: {}, options: { existing: "kept" } }],
      applyToLineIds: [lineA],
      quote,
    }, actor, writer);
    expect(saved.saved).toBe(true);
    expect(saved.sent).toBe(false);
    expect(saved.quote).toMatchObject({ id: quoteId, status: "draft", sent: false, quoteV2Status: "stale" });
    expect(saved.reask).toEqual([]);
    expect(saved.accepted).toMatchObject(validPicks);
    expect(saves).toHaveLength(1);
    expect(saves[0]).toMatchObject({ quoteId, actorId: actor.userId, expectedRevision: 3, idempotencyKey: "front-door-batch-1" });
    const parsed = parseSalesQuoteV2StructureBody({
      expectedRevision: saves[0].expectedRevision,
      idempotencyKey: saves[0].idempotencyKey,
      operations: saves[0].operations,
    });
    const lineUpdate = parsed.operations.find((operation) => operation.type === "line.update");
    const design = parsed.operations.find((operation) => operation.type === "design.upsert");
    expect(lineUpdate).toMatchObject({
      lineItemId: lineA,
      patch: { roomName: "Office", quantity: 1, widthWhole: 36, widthFraction: "1/8", heightWhole: 48, heightFraction: "0" },
    });
    expect(design).toMatchObject({
      lineItemId: lineA,
      variant: "A",
      selectDesign: true,
      patch: { mountType: "Inside Mount", optionsJson: { existing: "kept", mount_type: "Inside Mount", roll_type: "Standard Roll" } },
    });
    expect(JSON.stringify(saves[0].operations)).not.toContain("blocked");
    expect(saved.next.fields.map((field) => field.fieldKey)).toContain("collection");
    expect(saved.next.fields.map((field) => field.fieldKey)).not.toContain("room_location");
  });

  it("re-asks only the conflicting field and keeps the other picks", async () => {
    const { db, saves, writer } = store();
    const saved = await validateQuoteButtonBatch(db, {
      manufacturer: "Norman",
      category: "roller",
      spec: { answers: {} },
      picks: { ...validPicks, mount_type: "Ceiling" },
      lines: [{ id: lineA, label: "Line A", answers: {} }],
      applyToLineIds: [lineA],
      quote,
    }, actor, writer);
    expect(saved.reask.map((item) => item.fieldKey)).toEqual(["mount_type"]);
    expect(saved.accepted.mount_type).toBeUndefined();
    expect(saved.accepted).toMatchObject({ room_location: "Office", ordered_width: 36.125, roll_type: "Standard Roll" });
    expect(saved.sent).toBe(false);
    expect(saved.saved).toBe(true);
    expect(saved.quote?.status).toBe("draft");
    const written = JSON.stringify(saves[0].operations);
    expect(written).toContain("Office");
    expect(written).not.toContain("Ceiling");
    expect(saved.next.fields.some((field) => field.fieldKey === "mount_type")).toBe(true);
  });

  it("writes the same picks onto every chosen line and leaves the others", async () => {
    const { db, saves, writer } = store();
    const saved = await validateQuoteButtonBatch(db, {
      manufacturer: "Norman",
      category: "roller",
      spec: { answers: {} },
      picks: { room_location: "Office", mount_type: "Inside Mount" },
      lines: [
        { id: lineA, label: "Line A", answers: {} },
        { id: lineB, label: "Line B", answers: { room_location: "Kitchen" } },
        { id: lineC, label: "Line C", answers: {} },
      ],
      applyToLineIds: [lineA, lineC],
      quote,
    }, actor, writer);
    expect(saved.saved).toBe(true);
    expect(saved.sent).toBe(false);
    const ids = saves[0].operations.map((operation) => operation.lineItemId);
    expect(ids).toEqual(expect.arrayContaining([lineA, lineC]));
    expect(ids).not.toContain(lineB);
    expect(saved.lines.find((line) => line.id === lineB)?.answers).toEqual({ room_location: "Kitchen" });
    expect(saved.lines.find((line) => line.id === lineA)?.answers).toMatchObject({ room_location: "Office", mount_type: "Inside Mount" });
  });

  it("keeps the single-field routes working", async () => {
    const { db } = store();
    const next = await nextQuoteFrontDoorField(db, { manufacturer: "Norman", category: "roller", spec: { answers: {} } });
    expect(next.field_key).toBe("room_location");
    expect(next.phase).toBe("legend");
    const tap = await validateQuoteFrontDoorTap(db, {
      manufacturer: "Norman",
      category: "roller",
      fieldKey: "room_location",
      value: "Office",
      spec: { answers: {} },
    });
    expect(tap).toMatchObject({ ok: true, status: "ok" });
    const singleRoutes = [
      readFileSync("src/app/api/crm/quote-front-door/next-field/route.ts", "utf8"),
      readFileSync("src/app/api/crm/quote-front-door/validate/route.ts", "utf8"),
    ].join("\n");
    expect(singleRoutes).toContain("nextQuoteFrontDoorField");
    expect(singleRoutes).toContain("validateQuoteFrontDoorTap");
  });

  it("has no send path and does not write a front-door side table", () => {
    const source = [
      "src/lib/crm/quote-front-door-batch.ts",
      "src/app/api/crm/quote-front-door/batch-next-field/route.ts",
      "src/app/api/crm/quote-front-door/batch-validate/route.ts",
      "src/components/crm/quotes/QuoteLineButtons.tsx",
      "src/components/crm/quotes/QuoteLineEntry.tsx",
    ].map((path) => readFileSync(path, "utf8")).join("\n");
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toMatch(/twilio|sendgrid|resend|nodemailer|customer-send|sendQuote|Send quote/i);
    expect(code).not.toMatch(/crm_quote_front_door_line_drafts|crm_quote_front_door_drafts/);
    expect(code).toContain("mutateSalesQuoteV2Structure");
    expect(code).toContain("sent: false");
    expect(existsSync("supabase/migrations/20261122013000_quote_front_door_line_drafts.sql")).toBe(false);
  });
});
