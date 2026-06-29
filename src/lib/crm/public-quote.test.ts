import { describe, it, expect } from "vitest";
import {
  buildSignedContractSnapshot,
  describeDesign,
  buildSignedShopSms,
  buildSignedCustomerSms,
  formatDimensions,
  projectLine,
  computeSelectionMoney,
  type PublicQuote,
} from "./public-quote";
import { DEFAULT_ADJUSTMENTS, type QuoteAdjustments } from "@/lib/crm/quote-builder";
import { getProductColorOptions } from "@/lib/quote/product-color-options";
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

  it("uses the exact Norman roller fabric color when one is selected", () => {
    const d = describeDesign(
      design({
        product_id: "roller",
        fabric: "Garden",
        details: { fabric_color_code: "F1515", fabric_color_name: "Ecru" },
      }),
    );
    expect(d.styleName).toBe("F1515 - Ecru | Garden");
  });

  it("shows program-priced product colors as customer-safe options", () => {
    const color = getProductColorOptions("wood_blinds").find((row) => row.colorCode === "1003")!;
    const d = describeDesign(
      design({
        product_id: "wood_blinds",
        program_id: "wood_blinds_2in_and_2_1_2in_slats",
        details: { fabric_color_id: color.id, fabric_surcharge_id: "premium_color" },
      }),
    );
    expect(d.styleName).toBe('2" & 2 1/2" Slats');
    expect(d.options).toContain("Color: 1003 - White Matte | Premium Colors Finish");
    expect(d.options.join(" ")).not.toContain("fabric_surcharge_id");
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

describe("computeSelectionMoney (Purchase some)", () => {
  const adj: QuoteAdjustments = { ...DEFAULT_ADJUSTMENTS, taxPercent: 8.25, depositPercent: 50 };

  it("sums all priced items when nothing is filtered", () => {
    const m = computeSelectionMoney(
      [
        { id: "a", lineTotal: 1000, priceReady: true },
        { id: "b", lineTotal: 500, priceReady: true },
        { id: "c", lineTotal: 0, priceReady: false },
      ],
      DEFAULT_ADJUSTMENTS,
    );
    expect(m.selectedLineIds).toEqual(["a", "b"]);
    expect(m.subtotal).toBe(1500);
    expect(m.total).toBe(1500);
  });

  it("drops unselected items and recomputes tax/deposit on the trimmed base", () => {
    const m = computeSelectionMoney([{ id: "a", lineTotal: 1000, priceReady: true }], adj);
    expect(m.subtotal).toBe(1000);
    expect(m.tax).toBe(82.5); // 8.25% of 1000
    expect(m.total).toBe(1082.5);
    expect(m.depositDue).toBe(541.25); // 50% of 1082.5
    expect(m.balanceDue).toBe(541.25);
  });

  it("excludes items still being priced from the selection", () => {
    const m = computeSelectionMoney([{ id: "c", lineTotal: 0, priceReady: false }], DEFAULT_ADJUSTMENTS);
    expect(m.selectedLineIds).toEqual([]);
    expect(m.total).toBe(0);
  });
});

describe("buildSignedContractSnapshot", () => {
  it("archives the exact customer-safe signed quote without wholesale/internal pricing", () => {
    const d = design({
      id: "selected-design",
      product_id: "onyx_shutters",
      program_id: "painted_basswood",
      unit_price: 393.75,
      wholesale_unit_price: 168.75,
      price_breakdown: {
        wholesaleUnitPrice: 168.75,
        wholesaleTotal: 337.5,
        profit: 225,
        internalMargin: 225,
      },
    });
    const line = projectLine(lineItem({ id: "line-1", quantity: 2, designs: [d], selected_design_id: d.id }), false);
    const pub: PublicQuote = {
      token: "share-token",
      id: "quote-1",
      quoteNumber: "805-100",
      customerName: "Jane Smith",
      status: "sold",
      signed: true,
      signedAt: "2026-06-27T12:00:00.000Z",
      lines: [line],
      subtotal: line.lineTotal,
      fees: [{ name: "Install", amount: 100 }],
      discount: 0,
      tax: 0,
      sourceTotalAdjustment: 0,
      depositDue: 443.75,
      balanceDue: 443.75,
      total: 887.5,
      allPriced: true,
      hasOnyxShutters: true,
      adjustments: DEFAULT_ADJUSTMENTS,
      business: { name: "805 Shutters", phone: "805-555-1212" },
      versions: [],
    };

    const snapshot = buildSignedContractSnapshot(pub, "2026-06-27T12:00:00.000Z", "Jane Smith");

    expect(snapshot).toMatchObject({
      schema: "805_signed_quote_contract_v1",
      customerPrintedName: "Jane Smith",
      quote: { id: "quote-1", quoteNumber: "805-100" },
      totals: { total: 887.5, depositDue: 443.75, balanceDue: 443.75 },
      hasOnyxShutters: true,
    });
    expect(snapshot.lines[0]).toMatchObject({
      lineItemId: "line-1",
      room: "Living Room",
      productName: "Onyx Shutters",
      quantity: 2,
      unitPrice: 393.75,
      lineTotal: 787.5,
    });
    const serialized = JSON.stringify(snapshot).toLowerCase();
    expect(serialized).not.toContain("wholesale");
    expect(serialized).not.toContain("internal");
    expect(serialized).not.toContain("profit");
    expect(serialized).not.toContain("168.75");
    expect(serialized).not.toContain("337.5");
  });
});
