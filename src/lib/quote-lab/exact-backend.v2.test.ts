import { describe, expect, it } from "vitest";
import type { SalesQuoteDesign, SalesQuoteLineItem } from "@mts/types/quote";
import {
  repriceExactQuoteBuilderForQuoteLabPreview as repriceExactQuoteBuilder,
  repriceExactQuoteBuilderForServerDate,
} from "./exact-backend";

function line(
  id: string,
  overrides: Partial<SalesQuoteLineItem> = {},
): SalesQuoteLineItem {
  return {
    id,
    quote_id: "quote-v2",
    room_name: "Living Room",
    product_type: "Roller Shades",
    width_whole: 36,
    width_fraction: "0",
    height_whole: 60,
    height_fraction: "0",
    quantity: 1,
    sort_order: 0,
    created_at: "2026-07-20T00:00:00.000Z",
    ...overrides,
  };
}

function rollerDesign(
  lineItemId: string,
  variant = "A",
  options: Record<string, unknown> = {},
): SalesQuoteDesign {
  return {
    id: `${lineItemId}-design-${variant}`,
    line_item_id: lineItemId,
    variant,
    product_type: "Roller Shades",
    supplier: "Norman",
    mount_type: "Inside Mount",
    shade_type: "Single",
    lift_system: "Cordless",
    valance: "No Top Treatment",
    fabric: "Amelia",
    unit_price: 0,
    options_json: {
      quote_v2_backend: true,
      quote_lab_product_id: "roller",
      quote_lab_program_id: "roller_cordless_fabric_price_group_1_pg1",
      fabric_program_id: "roller_cordless_fabric_price_group_2_pg2",
      quote_v2_catalog_as_of: "2026-08-01",
      fabric_color_collection: "Amelia",
      fabric_color_code: "F1484",
      fabric_color_name: "Mist Gray",
      roller_application: "Single",
      roller_tube: "all tubes",
      roller_region_scope: "ca_ma",
      shipping_region: "continental_us",
      ...options,
    },
  } as unknown as SalesQuoteDesign;
}

function honeycombDesign(
  lineItemId: string,
  pairedLineId: string,
  position: "Left Shade" | "Right Shade",
  options: Record<string, unknown> = {},
): SalesQuoteDesign {
  return {
    id: `${lineItemId}-design-A`,
    line_item_id: lineItemId,
    variant: "A",
    product_type: "Honeycomb Shades",
    supplier: "Norman",
    mount_type: "Inside Mount",
    shade_type: "Single",
    lift_system: "SmartRise Cordless",
    fabric: "Light Filtering",
    unit_price: 0,
    options_json: {
      quote_v2_backend: true,
      quote_lab_product_id: "honeycomb",
      quote_lab_program_id: "honeycomb_3_8in_cordless_single_and_3_4in_single",
      fabric_color_collection: "Light Filtering",
      fabric_color_code: "C7015K",
      fabric_color_name: "Brilliant White",
      cell_size: '3/8" Single Cell',
      honeycomb_application: "Side-by-Side",
      side_by_side_position: position,
      side_by_side_match_line_id: pairedLineId,
      // This untrusted value must be ignored. The backend derives the same
      // shape only after comparing both selected line snapshots.
      side_by_side_matches: {
        mount_type: true,
        lift_system: true,
        fabric_color: true,
        shade_height: true,
        cell_size: true,
      },
      shipping_region: "continental_us",
      ...options,
    },
  } as unknown as SalesQuoteDesign;
}

type RepricedQuote = ReturnType<typeof repriceExactQuoteBuilder>;
type V2Quote = Extract<RepricedQuote, { backend: "v2" }>;

function requireV2(quote: RepricedQuote): V2Quote {
  if (!("backend" in quote) || quote.backend !== "v2") {
    throw new Error("Expected the exact-interface V2 backend.");
  }
  return quote;
}

function priceOne(
  quantity: number,
  designOptions: Record<string, unknown> = {},
): V2Quote {
  const quoteLine = line("line-1", { quantity });
  return requireV2(
    repriceExactQuoteBuilder({
      lines: [quoteLine],
      designs: [rollerDesign(quoteLine.id, "A", designOptions)],
      selectedVariantByLine: { [quoteLine.id]: "A" },
    }),
  );
}

describe("exact-interface V2 integration", () => {
  it("opts in only for the literal boolean V2 flag", () => {
    const quoteLine = line("line-legacy-flag");
    const legacyFlag = rollerDesign(quoteLine.id, "A", {
      quote_v2_backend: "true",
    });
    const quote = repriceExactQuoteBuilder({
      lines: [quoteLine],
      designs: [legacyFlag],
      selectedVariantByLine: {},
    });
    expect("backend" in quote).toBe(false);
    expect(quote.total).toBeGreaterThan(0);
  });

  it("accepts 1 and 40 measured-window line items but rejects the 41st", () => {
    const one = priceOne(1);
    expect(one.designs[0].result.ok).toBe(true);
    expect(one.designs[0].result.ok && one.designs[0].result.programId).toBe(
      "roller_cordless_fabric_price_group_2_pg2",
    );
    expect(one.sendability.sendable).toBe(true);

    const quantityFortyOne = priceOne(41);
    expect(quantityFortyOne.designs[0].result.ok).toBe(true);
    expect(quantityFortyOne.designs[0].result.ok && quantityFortyOne.designs[0].result.quantity).toBe(41);

    const lines = Array.from({ length: 40 }, (_, index) => line(`line-${index + 1}`));
    const designs = lines.map((item) => rollerDesign(item.id));
    const selectedVariantByLine = Object.fromEntries(lines.map((item) => [item.id, "A"]));
    expect(() => repriceExactQuoteBuilder({ lines, designs, selectedVariantByLine })).not.toThrow();

    const fortyFirst = line("line-41");
    expect(() => repriceExactQuoteBuilder({
      lines: [...lines, fortyFirst],
      designs: [...designs, rollerDesign(fortyFirst.id)],
      selectedVariantByLine: { ...selectedVariantByLine, [fortyFirst.id]: "A" },
    })).toThrow("A quote can contain no more than 40 line items.");
  });

  it("does not let quantity 1 -> 0 retain an authoritative fingerprint or price", () => {
    const valid = priceOne(1);
    expect(valid.designs[0].result.ok).toBe(true);
    expect(valid.designs[0].result.selectionFingerprint).toMatch(/^sha256:/);
    expect(valid.total).toBeGreaterThan(0);

    const invalidLine = line("line-invalid-quantity", { quantity: 0 });
    expect(() =>
      repriceExactQuoteBuilder({
        lines: [invalidLine],
        designs: [rollerDesign(invalidLine.id)],
        selectedVariantByLine: { [invalidLine.id]: "A" },
      }),
    ).toThrow(/quantity.*positive whole number/);
  });

  it("does not let fraction 0 -> 1/0 retain an authoritative fingerprint or price", () => {
    const valid = priceOne(1);
    expect(valid.designs[0].result.ok).toBe(true);
    expect(valid.designs[0].result.selectionFingerprint).toMatch(/^sha256:/);
    expect(valid.total).toBeGreaterThan(0);

    const invalidLine = line("line-invalid-fraction", {
      width_fraction: "1/0",
    });
    expect(() =>
      repriceExactQuoteBuilder({
        lines: [invalidLine],
        designs: [rollerDesign(invalidLine.id)],
        selectedVariantByLine: { [invalidLine.id]: "A" },
      }),
    ).toThrow(/width_fraction.*supported sixteenth-inch tokens/);
  });

  it("derives Honeycomb pair evidence only after exact reciprocal quote-level validation", () => {
    const first = line("honeycomb-a", {
      product_type: "Honeycomb Shades",
      room_name: "Living Room",
    });
    const second = line("honeycomb-b", {
      product_type: "Honeycomb Shades",
      room_name: "Dining Room",
      sort_order: 1,
    });
    const selectedVariantByLine = { [first.id]: "A", [second.id]: "A" };

    const valid = requireV2(
      repriceExactQuoteBuilder({
        lines: [first, second],
        designs: [
          honeycombDesign(first.id, second.id, "Left Shade"),
          honeycombDesign(second.id, first.id, "Right Shade"),
        ],
        selectedVariantByLine,
      }),
    );
    expect(valid.designs.map((entry) => entry.result.ok)).toEqual([true, true]);
    expect(
      valid.designs.flatMap((entry) =>
        entry.result.validationIssues.map((issue) => issue.ruleId),
      ),
    ).not.toContain("honeycomb.matrix.side_by_side.exact_match_required");

    const nonreciprocal = requireV2(
      repriceExactQuoteBuilder({
        lines: [first, second],
        designs: [
          honeycombDesign(first.id, second.id, "Left Shade"),
          honeycombDesign(second.id, "missing-line", "Right Shade"),
        ],
        selectedVariantByLine,
      }),
    );
    const nonreciprocalRuleIds = nonreciprocal.designs.flatMap((entry) =>
      entry.result.validationIssues.map((issue) => issue.ruleId),
    );
    expect(nonreciprocal.designs.every((entry) => !entry.result.ok)).toBe(true);
    expect(nonreciprocalRuleIds).toContain(
      "honeycomb.side_by_side.quote.reference.not_reciprocal",
    );
    expect(nonreciprocalRuleIds).toContain(
      "honeycomb.matrix.side_by_side.exact_match_required",
    );

    const mismatchedHeight = requireV2(
      repriceExactQuoteBuilder({
        lines: [first, { ...second, height_whole: 61 }],
        designs: [
          honeycombDesign(first.id, second.id, "Left Shade"),
          honeycombDesign(second.id, first.id, "Right Shade"),
        ],
        selectedVariantByLine,
      }),
    );
    expect(
      mismatchedHeight.designs.flatMap((entry) =>
        entry.result.validationIssues.map((issue) => issue.ruleId),
      ),
    ).toContain("honeycomb.side_by_side.quote.match.shade_height");
    expect(mismatchedHeight.designs.every((entry) => !entry.result.ok)).toBe(true);
  });

  it("requires an explicit selected design and totals alternatives selected-only", () => {
    const quoteLine = line("line-alternatives");
    const designA = rollerDesign(quoteLine.id, "A");
    const designB = rollerDesign(quoteLine.id, "B", { discount_percent: 15 });

    expect(() =>
      repriceExactQuoteBuilder({
        lines: [quoteLine],
        designs: [designA, designB],
        selectedVariantByLine: {},
      }),
    ).toThrow(/explicit selected design variant/);

    const quote = requireV2(
      repriceExactQuoteBuilder({
        lines: [quoteLine],
        designs: [designA, designB],
        selectedVariantByLine: { [quoteLine.id]: "A" },
      }),
    );
    const pricedA = quote.designs.find((entry) => entry.variant === "A")?.result;
    const pricedB = quote.designs.find((entry) => entry.variant === "B")?.result;
    expect(pricedA?.ok).toBe(true);
    expect(pricedB?.ok).toBe(true);
    if (!pricedA?.ok || !pricedB?.ok) return;
    expect(quote.total).toBe(pricedA.total);
    expect(quote.total).not.toBe(pricedA.total + pricedB.total);
    expect(quote.customerQuote.lines).toHaveLength(1);
    expect(quote.customerQuote.lines[0]).toMatchObject({
      selectedDesignId: designA.id,
      selectedVariant: "A",
    });
  });

  it("blocks sending when a stored fingerprint is stale or the selection is incomplete", () => {
    const stale = priceOne(1, {
      authoritative_v2_snapshot: {
        catalogVersion: "805-v2-norman-2026-07",
        catalogAsOf: "2026-08-01",
        selectionFingerprint: `sha256:${"0".repeat(64)}`,
        priceStatus: "authoritative",
        retail: {},
      },
    });
    expect(stale.designs[0].result.ok).toBe(true);
    expect(stale.sendability.sendable).toBe(false);
    expect(stale.sendability.lines[0]).toMatchObject({ stale: true, sendable: false });
    expect(stale.sendability.lines[0].reasons.map((reason) => reason.code)).toContain(
      "selection_fingerprint_mismatch",
    );

    const quoteLine = line("line-incomplete");
    const incomplete = rollerDesign(quoteLine.id);
    delete (incomplete.options_json as Record<string, unknown>).roller_tube;
    const blocked = requireV2(
      repriceExactQuoteBuilder({
        lines: [quoteLine],
        designs: [incomplete],
        selectedVariantByLine: { [quoteLine.id]: "A" },
      }),
    );
    expect(blocked.designs[0].result).toMatchObject({
      ok: false,
      validationStatus: "blocked",
      pricedSelectionFingerprint: null,
    });
    expect(blocked.total).toBe(0);
    expect(blocked.sendability.sendable).toBe(false);
  });

  it("fails closed for unknown explicitly selected product and program codes", () => {
    const unknownProgram = priceOne(1, {
      fabric_program_id: "unknown-selected-program",
    });
    expect(unknownProgram.designs[0].result).toMatchObject({
      ok: false,
      code: "CONFIGURATION_INCOMPLETE",
      pricedSelectionFingerprint: null,
    });
    expect(unknownProgram.sendability.sendable).toBe(false);

    const unknownProduct = priceOne(1, {
      fabric_product_id: "unknown-selected-product",
    });
    expect(unknownProduct.designs[0].result).toMatchObject({
      ok: false,
      validationStatus: "blocked",
      pricedSelectionFingerprint: null,
    });
    expect(unknownProduct.sendability.sendable).toBe(false);
  });

  it("rejects a fabric price-group mismatch and ignores a browser-supplied catalog identity", () => {
    const wrongProgram = priceOne(1, {
      fabric_program_id: "roller_cordless_fabric_price_group_1_pg1",
    });
    expect(wrongProgram.designs[0].result.ok).toBe(false);
    expect(wrongProgram.designs[0].result.validationIssues.map((issue) => issue.ruleId)).toContain(
      "roller.program.fabric_mismatch",
    );
    expect(wrongProgram.sendability.sendable).toBe(false);

    const injected = priceOne(1, {
      quote_v2_catalog_version: "attacker-version",
      quote_v2_catalog_as_of: "2099-01-01",
    });
    expect(injected.designs[0].result.ok).toBe(true);
    expect(injected.designs[0].result.catalogVersion).toBe(
      "805-v2-norman-roller-2026-08-01",
    );
    expect(injected.designs[0].result.catalogAsOf).toBe("2026-08-01");
  });

  it("keeps the future Roller appendix blocked on the production server date", () => {
    const quoteLine = line("line-production-date");
    const design = rollerDesign(quoteLine.id, "A", {
      // These browser-stored preview labels must not activate the appendix.
      quote_v2_catalog_version: "805-v2-norman-roller-2026-08-01",
      quote_v2_catalog_as_of: "2026-08-01",
    });
    const production = requireV2(
      repriceExactQuoteBuilderForServerDate(
        {
          lines: [quoteLine],
          designs: [design],
          selectedVariantByLine: { [quoteLine.id]: "A" },
        },
        "2026-07-31",
      ),
    );

    expect(production.designs[0].result).toMatchObject({
      ok: false,
      catalogVersion: "805-v2-norman-2026-07",
      catalogAsOf: "2026-07-31",
      validationStatus: "blocked",
    });
    expect(
      production.designs[0].result.validationIssues.map(
        (issue) => issue.ruleId,
      ),
    ).toContain("roller.appendix.effective_date");
    expect(production.sendability.sendable).toBe(false);
  });

  it("allocates published freight and oversize into selected landed cost only", () => {
    const firstLine = line("line-first", {
      width_whole: 90,
      sort_order: 0,
    });
    const secondLine = line("line-second", {
      width_whole: 90,
      sort_order: 1,
    });
    const quote = requireV2(
      repriceExactQuoteBuilder({
        lines: [firstLine, secondLine],
        designs: [rollerDesign(firstLine.id), rollerDesign(secondLine.id)],
        selectedVariantByLine: {
          [firstLine.id]: "A",
          [secondLine.id]: "A",
        },
      }),
    );

    const first = quote.designs.find((entry) => entry.lineItemId === firstLine.id)?.result;
    const second = quote.designs.find((entry) => entry.lineItemId === secondLine.id)?.result;
    expect(first?.ok).toBe(true);
    expect(second?.ok).toBe(true);
    if (!first?.ok || !second?.ok) return;

    expect(first.internalCost).toMatchObject({
      freightAllocated: 25,
      oversizeAllocated: 80,
      freightStatus: "published",
    });
    expect(second.internalCost).toMatchObject({
      freightAllocated: 11,
      oversizeAllocated: 50,
      freightStatus: "published",
    });
    expect(first.internalCost?.landedCostTotal).toBe(
      Math.round(
        ((first.internalCost?.productCostTotal ?? 0) + 25 + 80) * 100,
      ) / 100,
    );
    expect(second.internalCost?.landedCostTotal).toBe(
      Math.round(
        ((second.internalCost?.productCostTotal ?? 0) + 11 + 50) * 100,
      ) / 100,
    );
    expect(quote.costSummary).toMatchObject({
      status: "complete",
      freightHandling: 36,
      oversize: 130,
    });
    expect(quote.total).toBe(first.total + second.total);
  });

  it("charges the exact motor bound to the validated Roller power configuration", () => {
    const quoteLine = line("line-motorized");
    const design = {
      ...rollerDesign(quoteLine.id),
      lift_system: "Motorized",
      motor_type: "Motor (Rechargeable Battery Pack)",
      options_json: {
        ...(rollerDesign(quoteLine.id).options_json as Record<string, unknown>),
        roller_tube: '1 3/4" (43mm) Tube',
        roller_power_configuration: "Automate ARC Motor",
      },
    } as SalesQuoteDesign;
    const quote = requireV2(
      repriceExactQuoteBuilder({
        lines: [quoteLine],
        designs: [design],
        selectedVariantByLine: { [quoteLine.id]: "A" },
      }),
    );
    const result = quote.designs[0].result;
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.surchargeLines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "motor:automate_home:motor_rechargeable_battery_pack",
          amount: 511.5,
        }),
      ]),
    );

    const undercharged = {
      ...design,
      motor_type: "Low Voltage DC Motor",
    } as SalesQuoteDesign;
    const blocked = requireV2(
      repriceExactQuoteBuilder({
        lines: [quoteLine],
        designs: [undercharged],
        selectedVariantByLine: { [quoteLine.id]: "A" },
      }),
    );
    expect(blocked.designs[0].result.ok).toBe(false);
    expect(
      blocked.designs[0].result.validationIssues.map((issue) => issue.ruleId),
    ).toContain("roller.motor.price_configuration_mismatch");
  });

  it("projects selected retail without cost, freight, markup, or margin data", () => {
    const quote = priceOne(1);
    const serialized = JSON.stringify(quote.customerQuote);
    expect(serialized).not.toMatch(
      /wholesale|internalCost|costStatus|landed|freight|oversize|dealer|multiplier|margin|2\.5/i,
    );
    expect(quote.customerQuote.total).toBe(quote.total);
    expect(quote.customerQuote.lines[0].price).toMatchObject({
      ok: true,
      total: quote.total,
    });
  });
});
