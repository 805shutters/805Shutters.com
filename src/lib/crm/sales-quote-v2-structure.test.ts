import { describe, expect, it, vi } from "vitest";
import {
  createSalesQuoteV2Draft,
  isProtectedQuoteV2StructureKey,
  mutateSalesQuoteV2Structure,
  parseCreateSalesQuoteV2DraftBody,
  parseSalesQuoteV2StructureBody,
} from "./sales-quote-v2-structure";

const QUOTE_ID = "11111111-1111-4111-8111-111111111111";
const LINE_ID = "22222222-2222-4222-8222-222222222222";
const TARGET_LINE_ID = "33333333-3333-4333-8333-333333333333";
const DESIGN_ID = "44444444-4444-4444-8444-444444444444";
const ACTOR_ID = "55555555-5555-4555-8555-555555555555";

function rpcClient(result: { data: unknown; error: unknown }) {
  return {
    rpc: vi.fn().mockResolvedValue(result),
  } as never;
}

describe("Quote V2 structural request parsing", () => {
  it("normalizes a server draft request and rejects client price fields", () => {
    expect(
      parseCreateSalesQuoteV2DraftBody({
        idempotencyKey: "draft:create:one",
        customerName: "  Test Customer  ",
        customerPhone: "",
        customerEmail: "test@example.com",
        quoteLetter: "b",
      }),
    ).toEqual({
      idempotencyKey: "draft:create:one",
      quotePatch: {
        customerName: "Test Customer",
        customerPhone: null,
        customerEmail: "test@example.com",
        quoteLetter: "B",
      },
    });

    expect(() =>
      parseCreateSalesQuoteV2DraftBody({
        idempotencyKey: "draft:create:two",
        customerName: "Test Customer",
        productCost: 50,
      }),
    ).toThrow(/rejected field.*productCost/i);
  });

  it("normalizes core single-quote operations and line defaults", () => {
    const parsed = parseSalesQuoteV2StructureBody({
      expectedRevision: 4,
      idempotencyKey: "structure:batch:one",
      operations: [
        {
          type: "line.create",
          lineItemId: LINE_ID,
          patch: {
            roomName: "Living Room",
            productType: "Roller Shades",
          },
        },
        {
          type: "design.upsert",
          lineItemId: LINE_ID,
          designId: DESIGN_ID,
          variant: "A",
          selectDesign: true,
          patch: {
            supplier: "Norman",
            liftSystem: "Cordless",
            optionsJson: {
              quote_lab_product_id: "norman_roller",
              discount_percent: 10,
              schedule_discount_percent: 30,
              surcharges: [{ id: "cassette", quantity: 1 }],
            },
          },
        },
        {
          type: "line.copy",
          sourceLineItemId: LINE_ID,
          targetLineItemId: TARGET_LINE_ID,
          sortOrder: 1,
        },
      ],
    });

    expect(parsed.operations[0]).toEqual({
      type: "line.create",
      lineItemId: LINE_ID,
      patch: {
        roomName: "Living Room",
        productType: "Roller Shades",
        widthWhole: 0,
        heightWhole: 0,
        quantity: 1,
        sortOrder: 0,
        widthFraction: "0",
        heightFraction: "0",
      },
    });
    expect(parsed.operations[1]).toMatchObject({
      type: "design.upsert",
      lineItemId: LINE_ID,
      designId: DESIGN_ID,
      selectDesign: true,
    });
    expect(parsed.operations[2]).toEqual({
      type: "line.copy",
      sourceLineItemId: LINE_ID,
      targetLineItemId: TARGET_LINE_ID,
      sortOrder: 1,
    });
  });

  it("fails closed on price, cost, provenance, and snapshot injection", () => {
    for (const optionsJson of [
      { wholesale_cost: 100 },
      { nested: { landedCost: 100 } },
      { authoritative_v2_snapshot: { retail: 100 } },
      { priced_selection_fingerprint: "fake" },
      { dealer_portal_snapshot: { total: 100 } },
      { provenance: { source: "client" } },
      { price: 100 },
      { optionAmount: 100 },
      { customerRetail: 100 },
      { portal_line_price: 100 },
      { sourceId: "client-supplied-guide" },
      { source_hash: "client-supplied-hash" },
      { guideVersion: "2026-07" },
      { catalogVersion: "client-catalog" },
      { effectiveDate: "2026-07-01" },
    ]) {
      expect(() =>
        parseSalesQuoteV2StructureBody({
          expectedRevision: 1,
          idempotencyKey: `structure:reject:${Object.keys(optionsJson)[0]}`,
          operations: [
            {
              type: "design.upsert",
              lineItemId: LINE_ID,
              variant: "A",
              selectDesign: true,
              patch: { optionsJson },
            },
          ],
        }),
      ).toThrow(/protected pricing or cost field/i);
    }

    expect(() =>
      parseSalesQuoteV2StructureBody({
        expectedRevision: 1,
        idempotencyKey: "structure:reject:unit",
        operations: [
          {
            type: "design.upsert",
            lineItemId: LINE_ID,
            variant: "A",
            selectDesign: true,
            patch: { unitPrice: 500 },
          },
        ],
      }),
    ).toThrow(/rejected field.*unitPrice/i);
  });

  it("rejects copy operations that reuse the source identity", () => {
    expect(() =>
      parseSalesQuoteV2StructureBody({
        expectedRevision: 1,
        idempotencyKey: "structure:copy:same-line",
        operations: [
          {
            type: "line.copy",
            sourceLineItemId: LINE_ID,
            targetLineItemId: LINE_ID,
          },
        ],
      }),
    ).toThrow(/targetLineItemId must differ from sourceLineItemId/i);

    expect(() =>
      parseSalesQuoteV2StructureBody({
        expectedRevision: 1,
        idempotencyKey: "structure:copy:same-design-set",
        operations: [
          {
            type: "design.copySet",
            sourceLineItemId: LINE_ID,
            targetLineItemId: LINE_ID,
          },
        ],
      }),
    ).toThrow(/targetLineItemId must differ from sourceLineItemId/i);
  });

  it("requires explicit selected-design intent and bounded operation batches", () => {
    expect(() =>
      parseSalesQuoteV2StructureBody({
        expectedRevision: 1,
        idempotencyKey: "structure:missing:select",
        operations: [
          {
            type: "design.upsert",
            lineItemId: LINE_ID,
            variant: "A",
            patch: {},
          },
        ],
      }),
    ).toThrow(/selectDesign must be true or false/i);

    expect(() =>
      parseSalesQuoteV2StructureBody({
        expectedRevision: 1,
        idempotencyKey: "structure:empty:batch",
        operations: [],
      }),
    ).toThrow(/between 1 and 200/i);
  });

  it("keeps documented schedule and customer discount selections but identifies protected keys", () => {
    expect(isProtectedQuoteV2StructureKey("schedule_discount_percent")).toBe(false);
    expect(isProtectedQuoteV2StructureKey("discount_percent")).toBe(false);
    expect(isProtectedQuoteV2StructureKey("fabric_price_group")).toBe(false);
    expect(isProtectedQuoteV2StructureKey("manufacturer_cost")).toBe(true);
    expect(isProtectedQuoteV2StructureKey("authoritative_price_breakdown")).toBe(true);
    expect(isProtectedQuoteV2StructureKey("selection_fingerprint")).toBe(true);
    expect(isProtectedQuoteV2StructureKey("price")).toBe(true);
    expect(isProtectedQuoteV2StructureKey("optionAmount")).toBe(true);
    expect(isProtectedQuoteV2StructureKey("customerRetail")).toBe(true);
    expect(isProtectedQuoteV2StructureKey("portal_line_price")).toBe(true);
    expect(isProtectedQuoteV2StructureKey("fabric_price_group")).toBe(false);
    expect(isProtectedQuoteV2StructureKey("total_panel_width_inches")).toBe(false);
    expect(isProtectedQuoteV2StructureKey("sourceId")).toBe(true);
    expect(isProtectedQuoteV2StructureKey("source_hash")).toBe(true);
    expect(isProtectedQuoteV2StructureKey("guideVersion")).toBe(true);
    expect(isProtectedQuoteV2StructureKey("catalogVersion")).toBe(true);
    expect(isProtectedQuoteV2StructureKey("effectiveDate")).toBe(true);
  });

  it("persists a visible Polar QUOTE ONLY task marker on every design upsert", () => {
    const parsed = parseSalesQuoteV2StructureBody({
      expectedRevision: 1,
      idempotencyKey: "structure:polar:quote-only",
      operations: [{
        type: "design.upsert",
        lineItemId: LINE_ID,
        designId: DESIGN_ID,
        variant: "A",
        selectDesign: true,
        patch: {
          supplier: "Polar",
          optionsJson: { catalog_product_id: "polar_interior_roller" },
        },
      }],
    });
    expect(parsed.operations[0]).toMatchObject({
      type: "design.upsert",
      patch: {
        supplier: "Polar",
        optionsJson: {
          quote_only_status: "QUOTE_ONLY",
          quote_only_product_id: "polar_interior_roller",
          quote_only_internal_task: expect.stringContaining("manual Polar quote"),
          quote_only_blocks: expect.stringContaining("manufacturer_action"),
        },
      },
    });
  });
});

describe("Quote V2 structural persistence wrappers", () => {
  it("calls only the server draft RPC and projects a cost-free response", async () => {
    const client = rpcClient({
      data: {
        backend: "authoritative_v2",
        quoteId: QUOTE_ID,
        quoteNumber: "805-1234",
        revision: 1,
        status: "draft",
        quoteV2Status: "draft",
        lineCount: 0,
        internalCost: 999,
      },
      error: null,
    });
    const parsed = parseCreateSalesQuoteV2DraftBody({
      idempotencyKey: "draft:create:wrapper",
      customerName: "Test Customer",
    });
    const result = await createSalesQuoteV2Draft(client, ACTOR_ID, parsed);

    expect((client as { rpc: ReturnType<typeof vi.fn> }).rpc).toHaveBeenCalledWith(
      "create_quote_v2_draft",
      {
        p_idempotency_key: "draft:create:wrapper",
        p_actor_id: ACTOR_ID,
        p_quote_patch: { customerName: "Test Customer" },
      },
    );
    expect(result).toEqual({
      backend: "authoritative_v2",
      quoteId: QUOTE_ID,
      quoteNumber: "805-1234",
      revision: 1,
      status: "draft",
      quoteV2Status: "draft",
      lineCount: 0,
    });
    expect(result).not.toHaveProperty("internalCost");
  });

  it("calls one atomic structural RPC and strips unexpected internal response fields", async () => {
    const client = rpcClient({
      data: {
        backend: "authoritative_v2",
        quoteId: QUOTE_ID,
        revision: 3,
        status: "draft",
        quoteV2Status: "stale",
        lineCount: 1,
        selectedDesigns: { [LINE_ID]: DESIGN_ID },
        productCost: 999,
        operations: [
          {
            index: 1,
            type: "design.select",
            lineItemId: LINE_ID,
            designId: DESIGN_ID,
            internalLandedCost: 999,
          },
        ],
      },
      error: null,
    });
    const parsed = parseSalesQuoteV2StructureBody({
      expectedRevision: 2,
      idempotencyKey: "structure:wrapper:test",
      operations: [
        {
          type: "design.select",
          lineItemId: LINE_ID,
          designId: DESIGN_ID,
        },
      ],
    });
    const result = await mutateSalesQuoteV2Structure(
      client,
      QUOTE_ID,
      ACTOR_ID,
      parsed,
    );

    expect((client as { rpc: ReturnType<typeof vi.fn> }).rpc).toHaveBeenCalledWith(
      "mutate_quote_v2_structure",
      {
        p_quote_id: QUOTE_ID,
        p_expected_revision: 2,
        p_idempotency_key: "structure:wrapper:test",
        p_actor_id: ACTOR_ID,
        p_operations: parsed.operations,
      },
    );
    expect(result).not.toHaveProperty("productCost");
    expect(result.operations[0]).toEqual({
      index: 1,
      type: "design.select",
      lineItemId: LINE_ID,
      designId: DESIGN_ID,
    });
    expect(result.operations[0]).not.toHaveProperty("internalLandedCost");
  });

  it("maps revision conflicts to a reload-safe 409", async () => {
    const client = rpcClient({
      data: null,
      error: {
        code: "40001",
        message: "Quote V2 revision conflict",
      },
    });
    const parsed = parseSalesQuoteV2StructureBody({
      expectedRevision: 2,
      idempotencyKey: "structure:conflict:test",
      operations: [{ type: "lines.clear" }],
    });

    await expect(
      mutateSalesQuoteV2Structure(client, QUOTE_ID, ACTOR_ID, parsed),
    ).rejects.toMatchObject({
      status: 409,
      message: expect.stringMatching(/reload/i),
    });
  });

  it("rejects an incomplete selected-design response from persistence", async () => {
    const client = rpcClient({
      data: {
        backend: "authoritative_v2",
        quoteId: QUOTE_ID,
        revision: 3,
        status: "draft",
        quoteV2Status: "stale",
        lineCount: 1,
        selectedDesigns: { [LINE_ID]: null },
        operations: [],
      },
      error: null,
    });
    const parsed = parseSalesQuoteV2StructureBody({
      expectedRevision: 2,
      idempotencyKey: "structure:incomplete:selection",
      operations: [{ type: "lines.clear" }],
    });

    await expect(
      mutateSalesQuoteV2Structure(client, QUOTE_ID, ACTOR_ID, parsed),
    ).rejects.toMatchObject({
      status: 502,
      message: expect.stringMatching(/incomplete selected-design map/i),
    });
  });
});
