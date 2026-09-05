import { it, expect } from "vitest";
import { measureOrderSummary, measureFilter } from "./technical-measure-orders";
const line = (id: string, product_id = "faux_wood") => ({
  id,
  current_values: { product_id, quantity: 1 },
});
it("groups like products and counts openings", () => {
  const result = measureOrderSummary(
    [line("a"), line("b"), line("c", "roller")],
    {},
  );
  expect(result.groups.map((g) => g.openingCount)).toEqual([2, 1]);
  expect(result.error).toBeNull();
});
it("does not treat new openings as previously ordered", () => {
  const quote = {
    status: "ordered",
    meta: {
      measure_product_orders: {
        "norman:faux_wood": { lineIds: ["a"], orderedAt: "2026-09-01" },
      },
    },
  };
  expect(measureOrderSummary([line("a"), line("b")], quote).orderedCount).toBe(
    0,
  );
});
it("keeps unresolved products visible as an error", () => {
  expect(measureOrderSummary([line("a", "unknown")], {}).error).toContain(
    "manufacturer",
  );
});
it("assigns each record to exactly one filter with archive and partial-order precedence", () => {
  expect(measureFilter({ status: "draft" })).toBe("need_measure");
  expect(
    measureFilter({
      status: "draft",
      meta: { measure_scheduling: { status: "scheduled" } },
    }),
  ).toBe("scheduled");
  expect(measureFilter({ status: "submitted" })).toBe("needs_order");
  expect(
    measureFilter({ status: "draft", productOrders: { orderedCount: 1 } }),
  ).toBe("needs_order");
  expect(
    measureFilter({ status: "submitted", meta: { archived_at: "2026-09-01" } }),
  ).toBe("archive");
});
