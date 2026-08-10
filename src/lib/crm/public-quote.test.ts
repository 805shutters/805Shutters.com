import { describe, it, expect } from "vitest";
import {
  applyStoredSignedSelection,
  buildSignedContractSnapshot,
  buildFutureContractSnapshot,
  buildPartialAcceptancePlan,
  describeDesign,
  buildQuotePaymentLinkSms,
  buildQuoteShareSms,
  buildSignedShopSms,
  buildSignedShopSmsForRecipient,
  buildSignedCustomerSms,
  buildLinkedSalesQuoteSignaturePatch,
  REQUIRED_SOLD_QUOTE_SMS_RECIPIENTS,
  SOLD_QUOTE_CONTACT_SMS_RECIPIENT,
  soldQuoteShopSmsRecipients,
  linkedSalesQuoteIdForPublicQuote,
  formatDimensions,
  publicQuoteCustomerDetails,
  expandPublicQuoteLine,
  labelDuplicatePublicQuoteRooms,
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
  it("omits non-applicable catalog choices and keeps physically selected details", () => {
    const d = describeDesign(design({
      product_id: "roller",
      details: { mount_type: "inside", control_side: "na", valance: "none" },
    }));
    expect(d.options).toContain("Mount: Inside mount");
    expect(d.options.join(" ")).not.toMatch(/Control side|Valance|N\/A|None/);
  });

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

  it("reduces historic surcharge metadata to its customer-facing description", () => {
    const d = describeDesign(design({
      product_id: "onyx_shutters",
      price_breakdown: {
        source: "mts_805_bookkeeping",
        productType: "Onyx Shutters",
        details: [{
          label: "Surcharges",
          value: "Id: shutters-onyx-shutter-fixed-surcharges-arch-fixed-200, Name: Arch, Type: fixed, Value: 200, Category: Onyx Shutter Fixed Surcharges, Quantity: 1",
        }],
      },
    }));
    expect(d.options).toContain("Arch");
    expect(d.options.join(" ")).not.toMatch(/Id:|Type:|Value:|Category:|Quantity:/);
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
  it("contract share message uses the requested 805 Shutters copy", () => {
    const msg = buildQuoteShareSms("https://www.805shutters.com/quote/test-token");
    expect(msg).toBe(
      "805 Shutters: Thank you for the opportunity to cover your windows. Your contract is ready to review and approve:\n\nContract: https://www.805shutters.com/quote/test-token\n\nOfficial contact: 805Shutters.com | 805-806-9344"
    );
    expect(msg).not.toContain("attached quote");
  });

  it("payment link message names card, Venmo, Zelle, amount due, and link", () => {
    const msg = buildQuotePaymentLinkSms("https://www.805shutters.com/quote/test-token#payment", {
      depositDue: 2125,
    });
    expect(msg).toContain("deposit payment link");
    expect(msg).toContain("$2,125.00");
    expect(msg).toContain("Square card");
    expect(msg).toContain("Venmo @");
    expect(msg).toContain("Zelle");
    expect(msg).toContain("#payment");
    expect(msg).toContain("3 monthly payments");
    expect(msg).toContain("Verify this request at 805Shutters.com or 805-806-9344");
  });

  it("shop message has the requested sale fields", () => {
    const msg = buildSignedShopSms("Jane Smith", 4250, 2125);
    expect(msg).toBe(
      [
        "Customer Name: Jane Smith",
        "Total Sale Amount: $4,250.00",
        "Deposit Amount: $2,125.00",
        "Technical Measure: Not Needed",
      ].join("\n")
    );
  });
  it("shop message can flag technical measure needed", () => {
    const msg = buildSignedShopSms("Jane Smith", 4250, 2125, { technicalMeasure: "needed" });
    expect(msg).toContain("Technical Measure: Needed");
  });
  it("primary shop recipient gets customer phone and address", () => {
    const msg = buildSignedShopSmsForRecipient(SOLD_QUOTE_CONTACT_SMS_RECIPIENT, "Jane Smith", 4250, 2125, {
      customerPhone: "805-555-1212",
      customerAddress: "123 Main St, Ventura, CA",
      technicalMeasure: "needed",
    });
    expect(msg).toBe(
      [
        "Customer Name: Jane Smith",
        "Total Sale Amount: $4,250.00",
        "Deposit Amount: $2,125.00",
        "Technical Measure: Needed",
        "Customer Phone: 805-555-1212",
        "Customer Address: 123 Main St, Ventura, CA",
      ].join("\n")
    );
  });
  it("primary shop recipient gets the technical measure form", () => {
    const msg = buildSignedShopSmsForRecipient(SOLD_QUOTE_CONTACT_SMS_RECIPIENT, "Jane Smith", 4250, 2125, {
      technicalMeasure: "needed",
      measureFormUrl: "https://805shutters.com/crm/technical-measures/form-id",
    });
    expect(msg).toContain("Measure Form: https://805shutters.com/crm/technical-measures/form-id");
  });
  it("other shop recipients do not get the technical measure form", () => {
    const msg = buildSignedShopSmsForRecipient("805-555-0400", "Jane Smith", 4250, 2125, {
      technicalMeasure: "needed",
      measureFormUrl: "https://805shutters.com/crm/technical-measures/form-id",
    });
    expect(msg).not.toContain("Measure Form:");
  });
  it("other shop recipients keep the base sale fields only", () => {
    const msg = buildSignedShopSmsForRecipient("805-555-0400", "Jane Smith", 4250, 2125, {
      customerPhone: "805-555-1212",
      customerAddress: "123 Main St, Ventura, CA",
      technicalMeasure: "needed",
    });
    expect(msg).toBe(buildSignedShopSms("Jane Smith", 4250, 2125, { technicalMeasure: "needed" }));
  });
  it("uses the resolver's primary role when Michael's configured number changes", () => {
    const msg = buildSignedShopSmsForRecipient("805-555-0200", "Jane Smith", 4250, 2125, {
      customerPhone: "805-555-1212",
      customerAddress: "123 Main St, Ventura, CA",
      technicalMeasure: "needed",
    }, true);
    expect(msg).toContain("Customer Phone: 805-555-1212");
    expect(msg).toContain("Customer Address: 123 Main St, Ventura, CA");
  });
  it("shop sale SMS always includes the required recipients", () => {
    expect(soldQuoteShopSmsRecipients()).toEqual([...REQUIRED_SOLD_QUOTE_SMS_RECIPIENTS]);
  });
  it("customer message thanks them by name", () => {
    const message = buildSignedCustomerSms("Jane");
    expect(message).toContain("Jane");
    expect(message).toContain("805Shutters.com | 805-806-9344");
  });
});

describe("public contract customer details", () => {
  it("lists full name, address, formatted phone, and email in that order", () => {
    expect(publicQuoteCustomerDetails({
      customerName: "Renee Appell",
      customerAddress: "123 Main St, Camarillo, CA 93010",
      customerPhone: "+1 805 555 1212",
      customerEmail: "renee@example.com",
    })).toEqual([
      "Renee Appell",
      "123 Main St, Camarillo, CA 93010",
      "(805) 555-1212",
      "renee@example.com",
    ]);
  });

  it("omits unavailable contact fields without leaving empty separators", () => {
    expect(publicQuoteCustomerDetails({
      customerName: "Renee Appell",
      customerAddress: null,
      customerPhone: "8055551212",
      customerEmail: null,
    })).toEqual(["Renee Appell", "(805) 555-1212"]);
  });
});

describe("linked sales quote signature sync helpers", () => {
  const sourceQuoteId = "806f6943-7fc8-4c55-a956-8e0608d7930d";
  const signedAt = "2026-07-06T22:06:59.263Z";

  it("resolves the source sales quote id from a CRM quote external id", () => {
    expect(linkedSalesQuoteIdForPublicQuote({ external_id: `quote:${sourceQuoteId}`, meta: {} })).toBe(sourceQuoteId);
  });

  it("falls back to meta.mts_quote_id when external_id is missing", () => {
    expect(linkedSalesQuoteIdForPublicQuote({ meta: { mts_quote_id: sourceQuoteId } })).toBe(sourceQuoteId);
  });

  it("ignores non-quote and non-uuid source identifiers", () => {
    expect(linkedSalesQuoteIdForPublicQuote({ external_id: "contract:quote-1", meta: {} })).toBeNull();
    expect(linkedSalesQuoteIdForPublicQuote({ external_id: "quote:not-a-uuid", meta: { mts_quote_id: "also-not-a-uuid" } })).toBeNull();
  });

  it("marks draft/sent source quotes sold with the customer signature", () => {
    expect(buildLinkedSalesQuoteSignaturePatch({
      currentStatus: "sent",
      signature: "Katie Kushner",
      printedName: "Katie Kushner",
      signedAt,
      soldTotal: 1410.304,
    })).toEqual({
      status: "sold",
      customer_signature: "Katie Kushner",
      customer_printed_name: "Katie Kushner",
      signed_at: signedAt,
      total_amount: 1410.3,
    });
  });

  it("does not downgrade source quotes that already moved past sold", () => {
    expect(buildLinkedSalesQuoteSignaturePatch({
      currentStatus: "ordered",
      signature: "Katie Kushner",
      printedName: "Katie Kushner",
      signedAt,
      soldTotal: 1410.3,
    }).status).toBe("ordered");
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

  it("preserves legacy product specifications for the contract and email", () => {
    const d = design({
      product_id: "roller",
      unit_price: 509.4,
      price_breakdown: {
        source: "mts_805_bookkeeping",
        productType: "Roller Shades",
        details: [
          { label: "Fabric", value: "Callie - Linen" },
          { label: "Lift System", value: "Cordless" },
          { label: "Mount Type", value: "Inside Mount" },
          { label: "Valance", value: "Cassette" },
        ],
      },
    });

    const line = projectLine(lineItem({ notes: "Roller Shades", designs: [d] }), true);

    expect(line.showDesignOptions).toBe(true);
    expect(line.designOptions[0]?.options).toEqual([
      "Fabric: Callie - Linen",
      "Lift System: Cordless",
      "Mount Type: Inside Mount",
      "Valance: Cassette",
    ]);
    expect(line.options).toContain("Fabric: Callie - Linen");
    expect(line.options).toContain("Lift System: Cordless");
    expect(line.options).toContain("Mount Type: Inside Mount");
    expect(line.options).toContain("Valance: Cassette");
  });

  it("omits unselected legacy option fields while retaining selected choices", () => {
    const d = design({
      product_id: "roller",
      unit_price: 509.4,
      price_breakdown: {
        source: "mts_805_bookkeeping",
        productType: "Roller Shades",
        details: [
          { label: "Mount Type", value: "Inside Mount" },
          { label: "End Cap", value: "None" },
          { label: "Control Side", value: "N/A" },
          { label: "Remote Type", value: "5 Channel" },
        ],
      },
    });
    const line = projectLine(lineItem({ notes: "Roller Shades", designs: [d] }), true);
    expect(line.designOptions[0]?.options).toEqual(["Mount Type: Inside Mount", "Remote Type: 5 Channel"]);
    expect(line.options.join(" ")).not.toMatch(/End Cap|N\/A/);
  });

  it("removes a zero-dollar generated placeholder when a priced legacy design exists", () => {
    const placeholder = {
      ...design({
        product_id: "onyx_shutters",
        unit_price: 0,
        price_breakdown: {
          source: "mts_805_bookkeeping",
          productType: "Shutters",
          details: [
            { label: "Supplier", value: "Onyx" },
            { label: "Catalog Product Id", value: "onyx_shutters" },
            { label: "Catalog Manufacturer", value: "Onyx" },
            { label: "Catalog Product Type", value: "Shutters" },
            { label: "Quote Lab Product Id", value: "onyx_shutters" },
          ],
        },
      }),
      id: "placeholder-a",
      label: "A",
      sort_order: 0,
    };
    const selected = {
      ...design({
        product_id: "onyx_shutters",
        unit_price: 527,
        price_breakdown: {
          source: "mts_805_bookkeeping",
          productType: "Shutters",
          details: [
            { label: "Supplier", value: "Onyx" },
            { label: "Material", value: "Poly Composite" },
            { label: "Control Type", value: "Hidden Tiltrod" },
          ],
        },
      }),
      id: "selected-c",
      label: "C",
      sort_order: 2,
    };

    const line = projectLine(lineItem({ notes: "Shutters", designs: [placeholder, selected] }), true);

    expect(line.designOptions).toHaveLength(1);
    expect(line.designOptions[0]?.id).toBe("selected-c");
    expect(line.lineTotal).toBe(527);
    expect(line.options.join(" ")).not.toMatch(/Option A|Option C|Catalog Product|Quote Lab/);
    expect(line.options).toContain("Material: Poly Composite");
    expect(line.options).toContain("Control Type: Hidden Tiltrod");
  });

  it("expands quantity into separate customer contract rows", () => {
    const d = design({ product_id: "honeycomb", program_id: "honeycomb_9_16in_cordless_single_cell", unit_price: 212 });
    const line = projectLine(lineItem({ id: "line-1", quantity: 3, designs: [d], selected_design_id: d.id }), false);
    const rows = expandPublicQuoteLine(line);

    expect(rows).toHaveLength(3);
    expect(rows.map((row) => row.id)).toEqual(["line-1#1", "line-1#2", "line-1#3"]);
    expect(rows.map((row) => row.lineItemId)).toEqual(["line-1", "line-1", "line-1"]);
    expect(rows.map((row) => row.quantity)).toEqual([1, 1, 1]);
    expect(rows.reduce((sum, row) => sum + row.lineTotal, 0)).toBe(636);
  });

  it("numbers only repeated room labels and does not expose dimensions", () => {
    const d = design({ product_id: "honeycomb", program_id: "honeycomb_9_16in_cordless_single_cell", unit_price: 212 });
    const livingRoom = projectLine(lineItem({ id: "line-1", room: "Living Room", designs: [d], selected_design_id: d.id }), false);
    const kitchen = projectLine(lineItem({ id: "line-2", room: "Kitchen", designs: [d], selected_design_id: d.id }), false);
    const rows = labelDuplicatePublicQuoteRooms([livingRoom, kitchen, { ...livingRoom, id: "line-3", lineItemId: "line-3" }]);

    expect(rows.map((row) => row.room)).toEqual(["Living Room 1", "Kitchen", "Living Room 2"]);
    expect(rows.every((row) => !("dimensions" in row))).toBe(true);
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

describe("applyStoredSignedSelection", () => {
  const publicLine = (id: string, room: string, lineTotal: number) => ({
    id,
    lineItemId: id,
    room,
    dimensions: "",
    productName: "Honeycomb Shades",
    styleName: "",
    options: [],
    designOptions: [],
    showDesignOptions: false,
    unitPrice: lineTotal,
    quantity: 1,
    lineTotal,
    discountPercent: 0,
    priceReady: true,
  });
  const allLines = [
    publicLine("sunroom-1", "Sunroom 1", 858.6),
    publicLine("primary-bedroom", "Primary Bedroom", 685.8),
    publicLine("bed-2", "Bed 2", 450),
  ];

  it("keeps only the persisted selection for a historical signed partial acceptance", () => {
    const lines = applyStoredSignedSelection(
      {
        signed_at: "2026-08-06T19:06:00.000Z",
        meta: { signed_selection: { lineItemIds: ["primary-bedroom"] } },
      },
      allLines,
    );
    expect(lines.map((line) => line.id)).toEqual(["primary-bedroom"]);
    expect(lines.reduce((sum, line) => sum + line.lineTotal, 0)).toBe(685.8);
  });

  it("does not refilter an atomically partitioned current quote", () => {
    const lines = applyStoredSignedSelection(
      {
        signed_at: "2026-08-06T19:06:00.000Z",
        meta: {
          signed_selection: { lineItemIds: ["legacy-expanded-id"] },
          partial_acceptance: { role: "current", future_quote_id: "future-quote" },
        },
      },
      [allLines[1]],
    );
    expect(lines).toEqual([allLines[1]]);
  });

  it("fails closed instead of restoring every original item when the stored selection is stale", () => {
    expect(() => applyStoredSignedSelection(
      {
        signed_at: "2026-08-06T19:06:00.000Z",
        meta: { signed_selection: { lineItemIds: ["missing-line"] } },
      },
      allLines,
    )).toThrow(/no longer matches/i);
  });
});

describe("buildPartialAcceptancePlan", () => {
  const quote = {
    token: "token",
    id: "quote-1",
    quoteNumber: "805-0161",
    customerName: "Maggie Moore",
    customerAddress: "805 Test Street",
    customerPhone: "805-555-0161",
    customerEmail: "maggie@example.com",
    status: "sent",
    signed: false,
    signedAt: null,
    lines: [
      { id: "selected-1", room: "Living", lineTotal: 500, priceReady: true },
      { id: "selected-2", room: "Dining", lineTotal: 251.72, priceReady: true },
      { id: "future-1", room: "Bedroom", lineTotal: 1200, priceReady: true },
    ].map((line) => ({
      ...line,
      lineItemId: line.id,
      productName: "Onyx Shutters",
      styleName: "Painted Basswood",
      options: ["Color: White"],
      designOptions: [],
      showDesignOptions: false,
      unitPrice: line.lineTotal,
      quantity: 1,
      discountPercent: 0,
    })),
    subtotal: 1951.72,
    fees: [],
    discount: 0,
    tax: 161.02,
    sourceTotalAdjustment: 0,
    depositDue: 1056.37,
    balanceDue: 1056.37,
    payment: { available: true, dueType: "deposit", amountDue: 1056.37, outstanding: 2112.74, depositPaid: 0, paidTotal: 0 },
    total: 2112.74,
    allPriced: true,
    hasOnyxShutters: true,
    adjustments: { ...DEFAULT_ADJUSTMENTS, taxPercent: 8.25, depositPercent: 50 },
    business: {
      name: "805 Shutters",
      phone: "805-555-0100",
      website: "https://805shutters.com",
      email: "805@805shutters.com",
    },
    versions: [],
  } satisfies PublicQuote;

  it("partitions selected and future lines and recalculates both contracts", () => {
    const plan = buildPartialAcceptancePlan(quote, ["selected-1", "selected-2"], {
      current: 320,
      future: 510,
    });
    expect(plan.selectedLineIds).toEqual(["selected-1", "selected-2"]);
    expect(plan.unselectedLineIds).toEqual(["future-1"]);
    expect(plan.current.lines.map((line) => line.id)).toEqual(["selected-1", "selected-2"]);
    expect(plan.future.lines.map((line) => line.id)).toEqual(["future-1"]);
    expect(plan.currentMoney).toMatchObject({
      subtotal: 751.72,
      tax: 62.02,
      total: 813.74,
      depositDue: 406.87,
      balanceDue: 406.87,
      materialsCost: 320,
    });
    expect(plan.futureMoney).toMatchObject({
      subtotal: 1200,
      tax: 99,
      total: 1299,
      depositDue: 649.5,
      balanceDue: 649.5,
      materialsCost: 510,
    });
  });

  it("fails closed for stale ids and for an all-items selection", () => {
    expect(() => buildPartialAcceptancePlan(quote, ["missing"])).toThrow(/changed/i);
    expect(() => buildPartialAcceptancePlan(quote, quote.lines.map((line) => line.id))).toThrow(/leave at least one/i);
  });

  it("builds a quantity split plan without dropping the stored design snapshot", () => {
    const repeated = {
      ...quote,
      lines: [
        { ...quote.lines[0], id: "selected-unit-1", lineItemId: "quantity-line" },
        { ...quote.lines[0], id: "future-unit-2", lineItemId: "quantity-line" },
        quote.lines[2],
      ],
      subtotal: 2200,
      total: 2381.5,
    };
    const plan = buildPartialAcceptancePlan(repeated, ["selected-unit-1"]);
    expect(plan.lineQuantities).toContainEqual({
      lineItemId: "quantity-line",
      selectedQuantity: 1,
      remainingQuantity: 1,
    });
  });

  it("allocates a legacy source-total adjustment without losing quote-total integrity", () => {
    const adjusted = { ...quote, sourceTotalAdjustment: 100, total: 2212.74 };
    const plan = buildPartialAcceptancePlan(adjusted, ["selected-1", "selected-2"]);
    expect(plan.currentMoney.sourceTotalAdjustment + plan.futureMoney.sourceTotalAdjustment).toBe(100);
    expect(plan.current.total).toBe(
      Math.round((813.74 + plan.currentMoney.sourceTotalAdjustment) * 100) / 100,
    );
    expect(plan.future.total).toBe(
      Math.round((1299 + plan.futureMoney.sourceTotalAdjustment) * 100) / 100,
    );
  });

  it("produces separate selected signed and unselected future snapshots", () => {
    const plan = buildPartialAcceptancePlan(quote, ["selected-1", "selected-2"]);
    const signed = buildSignedContractSnapshot(plan.current, "2026-07-27T12:00:00.000Z", "Maggie Moore");
    const future = buildFutureContractSnapshot(plan.future, "2026-07-27T12:00:00.000Z", quote.id);
    expect(signed.lines.map((line) => line.lineItemId)).toEqual(["selected-1", "selected-2"]);
    expect(signed.totals.total).toBe(813.74);
    expect(future.schema).toBe("805_future_quote_contract_v1");
    expect(future.lines.map((line) => line.lineItemId)).toEqual(["future-1"]);
    expect(future.totals.total).toBe(1299);
    expect(JSON.stringify(future)).not.toContain("wholesale");
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
    const lines = expandPublicQuoteLine(projectLine(lineItem({ id: "line-1", quantity: 2, designs: [d], selected_design_id: d.id }), false));
    const pub: PublicQuote = {
      token: "share-token",
      id: "quote-1",
      quoteNumber: "805-100",
      customerName: "Jane Smith",
      customerAddress: "123 Main St, Ventura, CA 93001",
      customerPhone: "805-555-1212",
      customerEmail: "jane@example.com",
      status: "sold",
      signed: true,
      signedAt: "2026-06-27T12:00:00.000Z",
      lines,
      subtotal: lines.reduce((sum, line) => sum + line.lineTotal, 0),
      fees: [{ name: "Install", amount: 100 }],
      discount: 0,
      tax: 0,
      sourceTotalAdjustment: 0,
      depositDue: 443.75,
      balanceDue: 443.75,
      payment: { available: true, dueType: "balance", amountDue: 443.75, outstanding: 443.75, depositPaid: 443.75, paidTotal: 443.75 },
      total: 887.5,
      allPriced: true,
      hasOnyxShutters: true,
      adjustments: DEFAULT_ADJUSTMENTS,
      business: {
        name: "805 Shutters",
        phone: "805-555-1212",
        website: "805Shutters.com",
        email: "805@805shutters.com",
      },
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
    expect(snapshot.lines).toHaveLength(2);
    expect(snapshot.lines[0]).toMatchObject({
      lineItemId: "line-1",
      room: "Living Room",
      productName: "Onyx Shutters",
      quantity: 1,
      unitPrice: 393.75,
      lineTotal: 393.75,
    });
    const serialized = JSON.stringify(snapshot).toLowerCase();
    expect(serialized).not.toContain("wholesale");
    expect(serialized).not.toContain("internal");
    expect(serialized).not.toContain("profit");
    expect(serialized).not.toContain("168.75");
    expect(serialized).not.toContain("337.5");
  });
});
