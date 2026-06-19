import { describe, it, expect } from "vitest";
import { describeDesign, buildSignedShopSms, buildSignedCustomerSms } from "./public-quote";
import type { CrmQuoteDesign } from "./types";

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
    surcharges: over.surcharges ?? [],
    motorization: [],
    unit_price: 0,
    price_breakdown: {},
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
