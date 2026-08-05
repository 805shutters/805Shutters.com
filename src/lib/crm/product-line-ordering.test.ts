import { describe, expect, it } from "vitest";
import {
  deriveQuoteOrderPatch,
  resolveProductLineOrderStates,
  type ProductLineOrderEvent,
} from "./product-line-ordering";

const lines = [
  { id: "line-shutter", room_name: "Living Room", product_type: "Shutters", sort_order: 1 },
  { id: "line-roman", room_name: "Bedroom", product_type: "Roman Shades", sort_order: 2 },
];

function orderedEvent(lineId: string, createdAt: string, orderRef?: string): ProductLineOrderEvent {
  return {
    entity_id: lineId,
    action: "sales_quote_line.ordered",
    created_at: createdAt,
    after_data: {
      orderStatus: "ordered",
      orderedAt: createdAt,
      manufacturerOrderRef: orderRef || null,
    },
  };
}

describe("product-line ordering", () => {
  it("keeps untouched product lines outstanding when one line is ordered", () => {
    const states = resolveProductLineOrderStates({
      lines,
      events: [orderedEvent("line-shutter", "2026-08-05T02:00:00.000Z", "N-100")],
      quoteStatus: "sold",
      quoteOrderedAt: null,
      quoteOrderRef: null,
    });

    expect(states).toEqual([
      expect.objectContaining({ id: "line-shutter", orderStatus: "ordered", manufacturerOrderRef: "N-100" }),
      expect.objectContaining({ id: "line-roman", orderStatus: "outstanding", manufacturerOrderRef: null }),
    ]);
    expect(deriveQuoteOrderPatch("sold", states, "2026-08-05T02:01:00.000Z")).toBeNull();
  });

  it("advances the quote only after every required product line is ordered", () => {
    const states = resolveProductLineOrderStates({
      lines,
      events: [
        orderedEvent("line-shutter", "2026-08-05T02:00:00.000Z", "N-100"),
        orderedEvent("line-roman", "2026-08-05T02:05:00.000Z", "O-200"),
      ],
      quoteStatus: "sold",
      quoteOrderedAt: null,
      quoteOrderRef: null,
    });

    expect(deriveQuoteOrderPatch("sold", states, "2026-08-05T02:06:00.000Z")).toEqual({
      status: "ordered",
      ordered_at: "2026-08-05T02:06:00.000Z",
      manufacturer_order_ref: "N-100, O-200",
    });
  });

  it("treats legacy fully ordered quotes as ordered without downgrading later lifecycle stages", () => {
    const states = resolveProductLineOrderStates({
      lines,
      events: [],
      quoteStatus: "received",
      quoteOrderedAt: "2026-08-04T10:00:00.000Z",
      quoteOrderRef: "LEGACY-1",
    });

    expect(states.every((line) => line.orderStatus === "ordered")).toBe(true);
    expect(deriveQuoteOrderPatch("received", states, "2026-08-05T02:06:00.000Z")).toBeNull();
  });
});
