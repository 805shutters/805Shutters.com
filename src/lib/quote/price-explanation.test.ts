import { describe, it, expect } from "vitest";
import { summarizePriceBreakdown } from "./price-explanation";
import type { PriceBreakdown } from "./pricing";

function breakdown(over: Partial<PriceBreakdown>): PriceBreakdown {
  return {
    ok: true,
    productId: "honeycomb",
    programId: "p",
    programName: "P",
    matchedWidth: 24,
    matchedHeight: 36,
    base: 212,
    configurationUnits: 1,
    wholesaleBase: null,
    surchargeLines: [],
    unitPrice: 212,
    discountPercent: 0,
    discountAmount: 0,
    wholesaleUnitPrice: null,
    quantity: 1,
    onceTotal: 0,
    total: 212,
    wholesaleTotal: null,
    warnings: [],
    ...over,
  };
}

describe("summarizePriceBreakdown", () => {
  it("shows the grid-cell base + per-window price for a simple line", () => {
    const rows = summarizePriceBreakdown(breakdown({}), 1);
    expect(rows[0]).toMatchObject({ label: 'Base · grid 24" × 36"', amount: "$212.00", kind: "base" });
    expect(rows[rows.length - 1]).toMatchObject({ label: "Per window", amount: "$212.00", kind: "perwindow" });
    // qty 1 + no once charges -> per-window IS the line total (no redundant row)
    expect(rows.some((r) => r.kind === "total")).toBe(false);
  });

  it("lists each surcharge / motorization line", () => {
    const rows = summarizePriceBreakdown(
      breakdown({
        base: 254,
        unitPrice: 736,
        total: 736,
        surchargeLines: [{ id: "motor", label: "Motor", amount: 482, kind: "flat" }],
      }),
      1,
    );
    expect(rows.some((r) => r.label.startsWith("Motor") && r.amount === "$482.00")).toBe(true);
  });

  it("shows the per-line discount as a negative row", () => {
    const rows = summarizePriceBreakdown(
      breakdown({ base: 212, unitPrice: 190.8, total: 190.8, discountPercent: 10, discountAmount: 21.2 }),
      1,
    );
    const disc = rows.find((r) => r.kind === "discount");
    expect(disc?.label).toBe("10% line discount");
    expect(disc?.amount).toContain("$21.20");
  });

  it("multiplies by quantity and adds a line total", () => {
    const rows = summarizePriceBreakdown(breakdown({ unitPrice: 190.8, total: 381.6 }), 2);
    expect(rows.find((r) => r.kind === "qty")).toMatchObject({ label: "× 2 windows", amount: "$381.60" });
    expect(rows[rows.length - 1]).toMatchObject({ label: "Line total", amount: "$381.60", kind: "total" });
  });

  it("shows once charges separately from the per-window price", () => {
    const rows = summarizePriceBreakdown(breakdown({ unitPrice: 212, total: 262, onceTotal: 50 }), 1);
    expect(rows.find((r) => r.kind === "once")).toMatchObject({ label: "Once charges", amount: "$50.00" });
    expect(rows[rows.length - 1].kind).toBe("total");
  });

  it("labels the base by billable sq ft for shutter-style programs", () => {
    const rows = summarizePriceBreakdown(
      breakdown({ matchedHeight: null, billableSqft: 8, base: 312, unitPrice: 312, total: 312 }),
      1,
    );
    expect(rows[0].label).toBe("Base · 8 sq ft");
  });
});
