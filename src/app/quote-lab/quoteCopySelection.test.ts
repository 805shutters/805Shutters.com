import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  QuoteLabCatalogResponse,
  QuoteLabComparison,
  QuoteLabFixture,
} from "@/lib/quote-lab/types";
import { QUOTE_V2_SELECTED_DESIGN_MARKER } from "@/lib/quote-v2/selected-design";
import { buildCopiedDesignSet } from "@mts/lib/quoteDesignCopy";
import type { SalesQuoteDesign } from "@mts/types/quote";
import { createExactQuoteLabDatabase } from "./quoteLabDatabase";

const isolation: QuoteLabComparison["isolation"] = {
  database: "isolated_sqlite",
  productionWrites: false,
  email: false,
  sms: false,
  payments: false,
  manufacturerOrders: false,
  persistence: "server-test-database",
};

const catalog: QuoteLabCatalogResponse = {
  source: "test",
  effectiveDate: "2026-07-21",
  products: [],
  fixtures: [],
  isolation,
};

const comparison: QuoteLabComparison = {
  quoteId: "copy-selected-design",
  quoteName: "copy-selected-design",
  authoritativeTotal: 0,
  legacyTotal: 0,
  difference: 0,
  sendBlocked: true,
  findings: [],
  orderCharges: [],
  orderChargeTotal: 0,
  lines: [],
  isolation,
};

const fixture: QuoteLabFixture = {
  id: "copy-selected-design",
  name: "copy-selected-design",
  description: "copy-selected-design",
  quote: {
    id: "copy-selected-design",
    name: "copy-selected-design",
    lines: [
      {
        id: "source",
        room: "Living Room",
        quantity: 1,
        selectedDesignId: "source-c",
        designs: [
          {
            id: "source-a",
            label: "A",
            productId: "norman_shutters",
            programId: "norman-program",
            widthInches: 36,
            heightInches: 60,
          },
          {
            id: "source-c",
            label: "C",
            productId: "onyx_shutters",
            programId: "onyx-program",
            widthInches: 36,
            heightInches: 60,
          },
        ],
      },
      {
        id: "target",
        room: "Kitchen",
        quantity: 1,
        selectedDesignId: "target-a",
        designs: [
          {
            id: "target-a",
            label: "A",
            productId: "norman_shutters",
            programId: "norman-program",
            widthInches: 30,
            heightInches: 48,
          },
          {
            id: "target-c",
            label: "C",
            productId: "onyx_shutters",
            programId: "onyx-program",
            widthInches: 30,
            heightInches: 48,
          },
        ],
      },
    ],
  },
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("isolated quote copy selection", () => {
  it("persists the source selected variant after a multi-row copy", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({ quote: { total: 0, designs: [] } }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        )
      )
    );
    const database = createExactQuoteLabDatabase(catalog, fixture, comparison);
    const sourceResult = await database
      .from("sales_quote_designs")
      .select()
      .eq("line_item_id", "quote-lab-line-1");
    expect(sourceResult.error).toBeNull();
    const sourceDesigns = (sourceResult.data ?? []) as SalesQuoteDesign[];
    const copied = buildCopiedDesignSet(sourceDesigns, "quote-lab-line-2", {
      invalidateAuthoritativePrice: true,
    });

    const batchResult = await database
      .from("sales_quote_designs")
      .upsert(copied.rows as any, { onConflict: "line_item_id,variant" });
    expect(batchResult.error).toBeNull();
    const selectedRow = copied.rows.find(
      (row) => row.variant === copied.selectedVariant
    );
    expect(selectedRow?.variant).toBe("C");
    const selectionResult = await database
      .from("sales_quote_designs")
      .upsert(selectedRow! as any, { onConflict: "line_item_id,variant" });
    expect(selectionResult.error).toBeNull();

    const targetResult = await database
      .from("sales_quote_designs")
      .select()
      .eq("line_item_id", "quote-lab-line-2");
    expect(targetResult.error).toBeNull();
    const targetDesigns = (targetResult.data ?? []) as Array<
      SalesQuoteDesign & { [QUOTE_V2_SELECTED_DESIGN_MARKER]?: boolean }
    >;
    expect(
      targetDesigns.map((design) => [
        design.variant,
        design[QUOTE_V2_SELECTED_DESIGN_MARKER],
      ])
    ).toEqual([
      ["A", false],
      ["C", true],
    ]);
    expect(targetDesigns.every((design) => design.unit_price === 0)).toBe(true);
  });
});
