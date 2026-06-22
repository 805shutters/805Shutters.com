import { describe, it, expect } from "vitest";
import { describeDesign, buildSignedShopSms, buildSignedCustomerSms, formatDimensions, projectLine } from "./public-quote";
import type { CrmQuoteDesign, CrmQuoteLineItem } from "./types";

function design(over: Partial<CrmQuoteDesign>): CrmQuoteDesign {
  return {
    id: "d",
    created_at: "",
    updated_at: "",
    line_item_id: "li",
    label: "A",
    sort_order: 0,
    product_id: over.product_id ?? "honeycomb",
    program_id: over.program_id ?? null,
    fabric: over.fabric ?? null,
    details: over.details ?? {},
    surcharges: over.surcharges ?? [],
    motorization: over.motorization ?? [],
    unit_price: over.unit_price ?? 0,
    wholesale_unit_price: over.wholesale_unit_price ?? null,
    price_breakdown: over.price_breakdown ?? {},
    price_status: "ok",
    priced_at: null,
    notes: null,
  };
}

describe("describeDesign (customer-readable, no internal data leaked)", () => {
  it("names the product and program", () => {
    const d = describeDesign(design({ product_id: "honeycomb", program_id: "honeycomb_9_16in_cordless_single_cell" }));
    expect(d.productName).toContain("Honeycomb");
    expect(d.styleName).toContain("9/16");
  });

  it("uses fabric as the style when no program is set", () => {
    const d = describeDesign(design({ product_id: "roller", fabric: "Callie" }));
    expect(d.styleName).toBe("Callie");
  });

  it("resolves surcharge option names", () => {
    const d = describeDesign(design({ product_id: "honeycomb", program_id: "honeycomb_9_16in_cordless_single_cell", surcharges: [{ id: "shim" }] }));
    expect(d.options.some((o) => /shim/i.test(o))).toBe(true);
  });

  it("resolves customer-visible product details and motorization names", () => {
    const d = describeDesign(design({
      product_id: "roller",
      fabric: "Callie",
      details: { mount_type: "inside", control_side: "left", hard_surface_install: true },
      motorization: [{ groupId: "smart_motorization", optionId: "motor" }],
      wholesale_unit_price: 123.45,
    }));
    expect(d.options).toContain("Mount: Inside mount");
    expect(d.options).toContain("Control side: Left");
    expect(d.options.some((o) => /hard-surface/i.test(o))).toBe(false);
    expect(d.options.some((o) => /Norman Smart Motorization: Motor/i.test(o))).toBe(true);
    expect(JSON.stringify(d)).not.toContain("wholesale");
    expect(JSON.stringify(d)).not.toContain("123.45");
  });

  it("does not expose raw pricing snapshots or internal cost/profit terms", () => {
    const d = describeDesign(design({
      product_id: "onyx_shutters",
      program_id: "painted_basswood",
      wholesale_unit_price: 168.75,
      price_breakdown: {
        wholesaleUnitPrice: 168.75,
        wholesaleTotal: 337.5,
        internalMargin: 225,
        profit: 225,
      },
    }));
    const serialized = JSON.stringify(d).toLowerCase();
    expect(serialized).not.toContain("wholesale");
    expect(serialized).not.toContain("internal");
    expect(serialized).not.toContain("profit");
    expect(serialized).not.toContain("168.75");
    expect(serialized).not.toContain("337.5");
  });
});

describe("signed SMS copy", () => {
  it("shop message has the customer name and total", () => {
    const msg = buildSignedShopSms("Jane Smith", 4250);
    expect(msg).toContain("Jane Smith");
    expect(msg).toContain("$4,250");
  });
  it("customer message thanks them by name", () => {
    expect(buildSignedCustomerSms("Jane")).toContain("Jane");
  });
});

describe("formatDimensions (customer contract)", () => {
  it("formats fractional inches like the builder, not raw decimals", () => {
    expect(formatDimensions(24.5, 36)).toBe('24 1/2" W × 36" H');
    expect(formatDimensions(30, 48)).toBe('30" W × 48" H');
    expect(formatDimensions(47.875, 60.0625)).toBe('47 7/8" W × 60 1/16" H');
  });
  it("shows a pending message until both dimensions are set", () => {
    expect(formatDimensions(null, 36)).toBe("Measurements pending");
    expect(formatDimensions(24, null)).toBe("Measurements pending");
    expect(formatDimensions(null, null)).toBe("Measurements pending");
  });
});

function lineItem(over: Partial<CrmQuoteLineItem> & { designs?: CrmQuoteDesign[] }): CrmQuoteLineItem {
  const designs = over.designs ?? [];
  return {
    id: over.id ?? "li1",
    created_at: "",
    updated_at: "",
    quote_id: "q1",
    room: over.room ?? "Living Room",
    width_in: over.width_in ?? 24,
    height_in: over.height_in ?? 36,
    quantity: over.quantity ?? 1,
    discount_percent: over.discount_percent ?? 0,
    sort_order: over.sort_order ?? 0,
    selected_design_id: over.selected_design_id ?? designs[0]?.id ?? null,
    notes: over.notes ?? null,
    designs,
  };
}

describe("projectLine (per-line discount on the contract)", () => {
  it("surfaces the line's discount percent alongside the discounted price", () => {
    const d = design({ product_id: "honeycomb", program_id: "honeycomb_9_16in_cordless_single_cell", unit_price: 190.8 });
    const line = projectLine(lineItem({ discount_percent: 10, designs: [d] }), false);
    expect(line.discountPercent).toBe(10);
    expect(line.unitPrice).toBe(190.8);
    expect(line.lineTotal).toBe(190.8);
  });

  it("defaults to 0 discount when none is set", () => {
    const d = design({ product_id: "honeycomb", program_id: "honeycomb_9_16in_cordless_single_cell", unit_price: 212 });
    expect(projectLine(lineItem({ designs: [d] }), false).discountPercent).toBe(0);
  });

  it("never surfaces a per-line discount on legacy MTS quotes", () => {
    const d = design({ product_id: "honeycomb", program_id: "honeycomb_9_16in_cordless_single_cell", unit_price: 100 });
    expect(projectLine(lineItem({ discount_percent: 15, designs: [d] }), true).discountPercent).toBe(0);
  });
});
