import { describe, expect, it } from "vitest";
import { CrmAuthError } from "./auth";
import {
  parseLegacyPriceRestoreInput,
  planHistoricalLegacyPriceRestore,
} from "./sales-quote-legacy-price-restore";

const sourceShape = [
  ["Flex Room", 35, 60, 1, 0, 406.87],
  ["Dining Room", 35, 60, 1, 2, 406.87],
  ["Dining Room", 60, 52, 1, 3, 604.5],
  ["Living Room", 35, 60, 2, 4, 406.87],
  ["Bed 1", 22, 60, 1, 5, 255.75],
  ["Bed 1", 35, 60, 1, 6, 406.87],
  ["Bed 2", 60, 52, 1, 7, 604.5],
  ["Primary Bedroom", 35, 60, 2, 8, 406.87],
] as const;

function line(id: string, item: (typeof sourceShape)[number]) {
  return {
    id,
    room_name: item[0],
    width_whole: item[1],
    width_fraction: "0",
    height_whole: item[2],
    height_fraction: "0",
    quantity: item[3],
    sort_order: item[4],
    product_type: "Shutters",
    selected_design_id: `${id}-design`,
  };
}

describe("historical legacy price-lock restore", () => {
  it("requires an explicit apply confirmation", () => {
    expect(() => parseLegacyPriceRestoreInput({
      mode: "apply",
      confirmation: "",
      sourceSalesQuoteId: "source",
      expectedQuoteNumber: "805-0161-FUTURE",
      expectedTotal: 3499.1,
      expectedColor: "101_White",
    })).toThrowError(CrmAuthError);
  });

  it("recovers Maggie's six matching prices and one uniquely missing line", () => {
    const sourceLines = sourceShape.map((item, index) => line(`source-${index}`, item));
    const futureIndexes = [0, 1, 2, 3, 4, 6];
    const targetLines = futureIndexes.map((sourceIndex, index) => ({
      ...line(`target-${index}`, sourceShape[sourceIndex]),
      selected_design_id: `target-${index}-design`,
    }));
    const sourceDesigns = sourceLines.map((sourceLine, index) => ({
      id: `${sourceLine.id}-design`,
      line_item_id: sourceLine.id,
      unit_price: sourceShape[index][5],
      options_json: { discount_percent: 10, color: "100_Pure White" },
    }));
    const targetDesigns = targetLines.map((targetLine) => ({
      id: `${targetLine.id}-design`,
      line_item_id: targetLine.id,
      unit_price: 0,
      options_json: { color: "101_White" },
    }));

    const plan = planHistoricalLegacyPriceRestore({
      targetQuote: { id: "target-quote" },
      sourceQuote: { id: "source-quote" },
      targetLines,
      sourceLines,
      targetDesigns,
      sourceDesigns,
      expectedTotal: 3499.1,
    });

    expect(plan.matched.map((item) => item.unitPrice)).toEqual([
      406.87,
      406.87,
      604.5,
      406.87,
      255.75,
      604.5,
    ]);
    expect(plan.missing.sourceLine.room_name).toBe("Bed 1");
    expect(plan.missing.sourceLine.width_whole).toBe(35);
    expect(plan.missing.lineTotal).toBe(406.87);
    expect(plan.matched.reduce((sum, item) => sum + item.lineTotal, plan.missing.lineTotal))
      .toBeCloseTo(3499.1, 2);
  });
});
