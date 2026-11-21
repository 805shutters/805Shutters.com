import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { nextQuoteFrontDoorField, validateQuoteFrontDoorTap, type QuoteFrontDoorStore, type SequenceNext } from "@/lib/crm/quote-front-door";
import { nextQuoteButtonBatch, validateQuoteButtonBatch } from "@/lib/crm/quote-front-door-batch";

const catalog = "order-form:norman:roller:v1";
const actor = { email: "805shutters@gmail.com", userId: "11111111-1111-4111-8111-111111111111" };

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
  const lineDrafts: Array<Record<string, unknown>> = [];
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
    insertDraft: async () => ({ id: "draft-1" }),
    insertLineDraft: async (row) => {
      lineDrafts.push(row as unknown as Record<string, unknown>);
      return { id: "line-draft-1" };
    },
  };
  return { db, lineDrafts };
}

const validPicks = {
  room_location: "Office",
  quantity: 1,
  mount_type: "Inside Mount",
  ordered_width: 36.125,
  ordered_height: 48,
  roll_type: "Standard Roll",
};

const customer = { name: "New Person", phone: "805-555-0177", confirmNewCustomer: true };

describe("quote button batch", () => {
  it("saves every valid pick on the line draft", async () => {
    const { db, lineDrafts } = store();
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
      customer,
    }, actor);
    expect(saved.saved).toBe(true);
    expect(saved.sent).toBe(false);
    expect(saved.draft).toEqual({ id: "line-draft-1", status: "draft", sent: false });
    expect(saved.reask).toEqual([]);
    expect(saved.accepted).toMatchObject(validPicks);
    const spec = lineDrafts[0]?.spec as { lines: Array<{ answers: Record<string, unknown> }> };
    expect(spec.lines).toHaveLength(1);
    expect(spec.lines[0]?.answers).toMatchObject(validPicks);
    expect(saved.next.fields.map((field) => field.fieldKey)).toContain("collection");
    expect(saved.next.fields.map((field) => field.fieldKey)).not.toContain("room_location");
    expect(String(lineDrafts[0]?.read_back)).toContain("Draft only.");
  });

  it("re-asks only the conflicting field and keeps the other picks", async () => {
    const { db, lineDrafts } = store();
    const saved = await validateQuoteButtonBatch(db, {
      manufacturer: "Norman",
      category: "roller",
      spec: { answers: {} },
      picks: { ...validPicks, mount_type: "Ceiling" },
      lines: [{ id: "1", label: "Line 1", answers: {} }],
      applyToLineIds: ["1"],
      customer,
    }, actor);
    expect(saved.reask.map((item) => item.fieldKey)).toEqual(["mount_type"]);
    expect(saved.accepted.mount_type).toBeUndefined();
    expect(saved.accepted).toMatchObject({ room_location: "Office", ordered_width: 36.125, roll_type: "Standard Roll" });
    expect(saved.sent).toBe(false);
    expect(saved.saved).toBe(true);
    const spec = lineDrafts[0]?.spec as { lines: Array<{ answers: Record<string, unknown> }> };
    expect(spec.lines[0]?.answers.room_location).toBe("Office");
    expect(spec.lines[0]?.answers.mount_type).toBeUndefined();
    expect(saved.next.fields.some((field) => field.fieldKey === "mount_type")).toBe(true);
  });

  it("writes the same picks onto every chosen line and leaves the others", async () => {
    const { db, lineDrafts } = store();
    const saved = await validateQuoteButtonBatch(db, {
      manufacturer: "Norman",
      category: "roller",
      spec: { answers: {} },
      picks: { room_location: "Office", mount_type: "Inside Mount" },
      lines: [
        { id: "a", label: "Line A", answers: {} },
        { id: "b", label: "Line B", answers: { room_location: "Kitchen" } },
        { id: "c", label: "Line C", answers: {} },
      ],
      applyToLineIds: ["a", "c"],
      customer,
    }, actor);
    expect(saved.saved).toBe(true);
    expect(saved.sent).toBe(false);
    const lines = (lineDrafts[0]?.spec as { lines: Array<{ id: string; answers: Record<string, unknown> }> }).lines;
    expect(lines.find((line) => line.id === "a")?.answers).toMatchObject({ room_location: "Office", mount_type: "Inside Mount" });
    expect(lines.find((line) => line.id === "c")?.answers).toMatchObject({ room_location: "Office", mount_type: "Inside Mount" });
    expect(lines.find((line) => line.id === "b")?.answers).toEqual({ room_location: "Kitchen" });
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

  it("has no send path", () => {
    const source = [
      "src/lib/crm/quote-front-door-batch.ts",
      "src/app/api/crm/quote-front-door/batch-next-field/route.ts",
      "src/app/api/crm/quote-front-door/batch-validate/route.ts",
      "src/components/crm/quotes/QuoteLineButtons.tsx",
      "src/components/crm/quotes/QuoteLineEntry.tsx",
      "supabase/migrations/20261122013000_quote_front_door_line_drafts.sql",
    ].map((path) => readFileSync(path, "utf8")).join("\n");
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toMatch(/twilio|sendgrid|resend|nodemailer|customer-send|sendQuote|Send quote/i);
    expect(code).not.toMatch(/\bdrop\s+(table|column|schema|function)\b/i);
    expect(code).not.toMatch(/\bdelete\s+from\b/i);
    expect(code).toContain("sent: false");
    expect(code).toContain("status = 'draft'");
  });
});
