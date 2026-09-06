import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SalesQuoteDesign, SalesQuoteLineItem } from "@mts/types/quote";
const calls = vi.hoisted(() => ({ create: vi.fn(), mutate: vi.fn() }));
vi.mock("./sales-quote-v2-structure", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./sales-quote-v2-structure")>()),
  createSalesQuoteV2Draft: calls.create,
  mutateSalesQuoteV2Structure: calls.mutate,
}));
import {
  createSalesQuoteAlternative,
  parseQuoteAlternativeBody,
  quoteAlternativeCopyOperations,
} from "./sales-quote-v2-alternatives";
const sourceId = "11111111-1111-4111-8111-111111111111";
const actorId = "22222222-2222-4222-8222-222222222222";
const quoteId = "33333333-3333-4333-8333-333333333333";
const source = {
  id: sourceId,
  quote_v2_backend: true,
  quote_v2_revision: 4,
  quote_letter: "A",
  customer_name: "Test customer",
  sales_owner: "jessica",
  total_amount: 400,
  status: "draft",
};
const line = {
  id: "44444444-4444-4444-8444-444444444444",
  selected_design_id: "55555555-5555-4555-8555-555555555555",
  room_name: "Kitchen",
  product_type: "Roller Shades",
  width_whole: 34,
  width_fraction: "1/2",
  height_whole: 60,
  height_fraction: "0",
  quantity: 2,
  sort_order: 0,
} as SalesQuoteLineItem;
const design = {
  id: line.selected_design_id,
  line_item_id: line.id,
  variant: "B",
  product_type: "Roller Shades",
  supplier: "Norman",
  unit_price: 999,
  options_json: {
    fabric_color_code: "White",
    authoritative_v2_snapshot: { total: 999 },
    wholesale_cost: 50,
  },
  notes: "Keep this note",
} as unknown as SalesQuoteDesign;
function database(results: unknown[]) {
  const writes: { table: string; value: unknown }[] = [];
  const tables: string[] = [];
  const db = {
    from: (table: string) => {
      tables.push(table);
      const result = results.shift();
      const query: Record<string, unknown> = {};
      for (const name of [
        "select",
        "eq",
        "is",
        "in",
        "single",
        "maybeSingle",
        "order",
      ])
        query[name] = () => query;
      query.is = (column: string) => {
      if (column === "deleted_at") throw new Error("column sales_quotes.deleted_at does not exist");
      return query;
    };
    query.update = (value: unknown) => {
        writes.push({ table, value });
        return query;
      };
      query.then = (resolve: (value: unknown) => unknown) =>
        Promise.resolve(resolve(result));
      return query;
    },
  } as unknown as SupabaseClient;
  return { db, writes, tables };
}
const ok = (data: unknown) => ({ data, error: null });
const input = (mode = "blank") =>
  parseQuoteAlternativeBody({
    mode,
    expectedRevision: 4,
    idempotencyKey: "alternative:test:1",
  });
beforeEach(() => {
  vi.clearAllMocks();
  calls.create.mockResolvedValue({ quoteId, revision: 1 });
  calls.mutate.mockResolvedValue({ quoteId, revision: 2 });
});
describe("V2 quote alternatives", () => {
  it("rejects prices, invalid modes, and missing concurrency context", () => {
    for (const body of [
      {},
      { ...input(), unit_price: 100 },
      { ...input(), mode: "anything" },
      { ...input(), expectedRevision: 0 },
    ])
      expect(() => parseQuoteAlternativeBody(body)).toThrow();
  });
  it("copies config and explicit selected design with stable new identities, without financial snapshots", () => {
    const ops = quoteAlternativeCopyOperations([line], [design], "retry-key");
    expect(ops).toEqual(
      quoteAlternativeCopyOperations([line], [design], "retry-key"),
    );
    expect(ops[0]).toMatchObject({
      type: "line.create",
      patch: { roomName: "Kitchen", quantity: 2, widthFraction: "1/2" },
    });
    expect(ops[1]).toMatchObject({
      type: "design.upsert",
      selectDesign: true,
      variant: "B",
      patch: {
        notes: "Keep this note",
        optionsJson: { fabric_color_code: "White" },
      },
    });
    expect(JSON.stringify(ops)).not.toMatch(
      /unit_price|snapshot|wholesale_cost/,
    );
    expect(ops[0]).not.toMatchObject({ lineItemId: line.id });
    expect(() => quoteAlternativeCopyOperations([line], [], "key")).toThrow(
      /Select a design/,
    );
  });
  it("creates a server-owned blank B and changes only grouping metadata on A", async () => {
    const fixture = database([
      ok(source),
      ok(null),
      ok(null),
      ok([{ quote_letter: "A" }]),
      ok({ id: quoteId, quote_letter: "B" }),
    ]);
    const result = await createSalesQuoteAlternative(
      fixture.db,
      actorId,
      sourceId,
      input(),
    );
    expect(result.quote.id).toBe(quoteId);
    expect(calls.create).toHaveBeenCalledWith(
      fixture.db,
      actorId,
      expect.objectContaining({
        quotePatch: expect.objectContaining({
          customerName: "Test customer",
          quoteGroupId: sourceId,
          quoteLetter: "B",
        }),
      }),
    );
    expect(fixture.writes[0].value).toEqual({
      quote_group_id: sourceId,
      quote_letter: "A",
    });
    expect(fixture.writes[1].value).toMatchObject({ sales_owner: "jessica" });
    expect(calls.mutate).not.toHaveBeenCalled();
  });
  it("does not create a blank option when copying cannot read the source", async () => {
    const fixture = database([
      ok(source),
      ok(null),
      { data: null, error: { message: "Read failed" } },
    ]);
    await expect(
      createSalesQuoteAlternative(fixture.db, actorId, sourceId, input("copy")),
    ).rejects.toThrow("Read failed");
    expect(calls.create).not.toHaveBeenCalled();
    expect(fixture.writes).toEqual([]);
  });
  it("copies all lines and designs in one validated structural transaction", async () => {
    const fixture = database([
      ok(source),
      ok(null),
      ok([line]),
      ok([design]),
      ok(null),
      ok([{ quote_letter: "A" }]),
      ok({ id: quoteId }),
    ]);
    await createSalesQuoteAlternative(
      fixture.db,
      actorId,
      sourceId,
      input("copy"),
    );
    expect(calls.mutate).toHaveBeenCalledWith(
      fixture.db,
      quoteId,
      actorId,
      expect.objectContaining({
        expectedRevision: 1,
        operations: expect.arrayContaining([
          expect.objectContaining({ type: "line.create" }),
          expect.objectContaining({
            type: "design.upsert",
            selectDesign: true,
          }),
        ]),
      }),
    );
  });
  it("resumes an interrupted copy into the same draft without creating another option", async () => {
    const fixture = database([
      ok({ ...source, quote_group_id: sourceId }),
      ok({ actor_id: actorId, result: { quoteId } }),
      ok(null),
      ok([line]),
      ok([design]),
      ok({ id: quoteId }),
    ]);
    await createSalesQuoteAlternative(
      fixture.db,
      actorId,
      sourceId,
      input("copy"),
    );
    expect(calls.create).not.toHaveBeenCalled();
    expect(calls.mutate).toHaveBeenCalledOnce();
  });
  it("returns a completed copy on retry even if the source has since changed", async () => {
    const fixture = database([
      ok({ ...source, quote_v2_revision: 99, quote_group_id: sourceId }),
      ok({ actor_id: actorId, result: { quoteId } }),
      ok({ id: "event-id" }),
      ok({ id: quoteId }),
    ]);
    await createSalesQuoteAlternative(
      fixture.db,
      actorId,
      sourceId,
      input("copy"),
    );
    expect(calls.create).not.toHaveBeenCalled();
    expect(calls.mutate).not.toHaveBeenCalled();
  });
  it("rejects stale source revisions before any write", async () => {
    const fixture = database([
      ok({ ...source, quote_v2_revision: 5 }),
      ok(null),
    ]);
    await expect(
      createSalesQuoteAlternative(fixture.db, actorId, sourceId, input()),
    ).rejects.toThrow(/changed/);
    expect(fixture.writes).toEqual([]);
    expect(calls.create).not.toHaveBeenCalled();
  });
});
