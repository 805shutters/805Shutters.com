import { describe, expect, it } from "vitest";
import type { SalesQuoteDesign, SalesQuoteLineItem } from "@mts/types/quote";
import { toCustomerQuotePriceResult } from "@/lib/quote-v2/engine";
import {
  POLAR_ALL_SEASONS_FREIGHT_SURCHARGE_ID,
  QUOTE_V2_CATALOG_VERSION,
  QUOTE_V2_ROLLER_PREVIEW_VERSION,
} from "@/lib/quote-v2/catalog";
import {
  priceExactQuoteBuilderDesign,
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

function lotusDesign(
  lineItemId: string,
  options: Record<string, unknown> = {},
): SalesQuoteDesign {
  return {
    id: `${lineItemId}-design-A`,
    line_item_id: lineItemId,
    variant: "A",
    product_type: "Mini Blinds",
    supplier: "Lotus",
    mount_type: "Inside Mount",
    unit_price: 0,
    options_json: {
      quote_v2_backend: true,
      quote_lab_product_id: "lotus_mini_blinds",
      fabric_program_id: "lotus_amx_1in_aluminum_custom",
      ...options,
    },
  } as unknown as SalesQuoteDesign;
}

type RepricedQuote = ReturnType<typeof repriceExactQuoteBuilder>;
type V2Quote = Extract<RepricedQuote, { backend: "v2" }>;

const PRE_MSRP_ROLLER_PREVIEW_VERSION =
  "805-v2-norman-roller-2026-08-01";

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
        catalogVersion: "stale-catalog-version",
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

    const current = priceOne(1);
    const currentSnapshot = current.designs[0]?.snapshot;
    if (!currentSnapshot?.dealerPolicy) {
      throw new Error("Expected a pinned Norman dealer policy snapshot.");
    }
    const stalePolicy = priceOne(1, {
      authoritative_v2_snapshot: {
        ...currentSnapshot,
        dealerPolicy: {
          ...currentSnapshot.dealerPolicy,
          revision: `${currentSnapshot.dealerPolicy.revision}-stale`,
        },
      },
    });
    expect(stalePolicy.designs[0].result.ok).toBe(true);
    expect(stalePolicy.sendability.lines[0]).toMatchObject({
      stale: true,
      sendable: false,
    });
    expect(
      stalePolicy.sendability.lines[0].reasons.map((reason) => reason.code),
    ).toContain("price_not_authoritative");

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

  it("marks a pre-MSRP-policy catalog snapshot stale even when its fingerprint matches", () => {
    const current = priceOne(1);
    const currentSnapshot = current.designs[0]?.snapshot;
    const currentResult = current.designs[0]?.result;
    if (!currentSnapshot || !currentResult?.ok) {
      throw new Error("Expected a current authoritative Roller snapshot.");
    }
    expect(currentResult.catalogVersion).toBe(
      QUOTE_V2_ROLLER_PREVIEW_VERSION,
    );

    const prePolicy = priceOne(1, {
      authoritative_v2_snapshot: {
        ...currentSnapshot,
        // Keep the current fingerprint deliberately: this isolates the
        // catalog revision as an independently sufficient stale-price guard.
        catalogVersion: PRE_MSRP_ROLLER_PREVIEW_VERSION,
        retail: {
          ...currentSnapshot.retail,
          catalogVersion: PRE_MSRP_ROLLER_PREVIEW_VERSION,
        },
      },
    });
    expect(prePolicy.designs[0].result).toMatchObject({
      ok: true,
      catalogVersion: QUOTE_V2_ROLLER_PREVIEW_VERSION,
    });
    expect(prePolicy.sendability.lines[0]).toMatchObject({
      stale: true,
      sendable: false,
      pricedSelectionFingerprint: currentResult.selectionFingerprint,
      pricedCatalogVersion: PRE_MSRP_ROLLER_PREVIEW_VERSION,
      catalogVersion: QUOTE_V2_ROLLER_PREVIEW_VERSION,
    });
    expect(
      prePolicy.sendability.lines[0].reasons.map((reason) => reason.code),
    ).toContain("catalog_version_mismatch");
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

  it("hard-blocks a legacy-picker surcharge ID instead of silently dropping it", () => {
    const unsupportedId =
      "roller-shades-roller-motorization-automate-hub-fixed-96-3";
    const quote = priceOne(1, {
      surcharges: [
        {
          id: unsupportedId,
          name: "Automate: Hub",
          type: "fixed",
          value: 96.3,
          quantity: 1,
          category: "Roller Motorization Components",
        },
      ],
    });
    expect(quote.designs[0].result).toMatchObject({
      ok: false,
      code: "CONFIGURATION_INCOMPLETE",
      validationStatus: "blocked",
      pricedSelectionFingerprint: null,
    });
    expect(
      quote.designs[0].result.validationIssues.map((issue) => issue.ruleId),
    ).toContain("engine.surcharge.unsupported");
    expect(quote.total).toBe(0);
    expect(quote.sendability.sendable).toBe(false);
  });

  it("prices an exact catalog surcharge ID and quantity in V2", () => {
    const quote = priceOne(1, {
      surcharges: [
        {
          id: "additional_fiberglass_pole",
          quantity: 2,
        },
      ],
    });
    const result = quote.designs[0].result;
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.surchargeLines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "additional_fiberglass_pole",
          amount: 56,
          wholesaleAmount: 18.48,
          detail: "28 x 2 units",
        }),
      ]),
    );
    expect(result.components).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "accessory:additional_fiberglass_pole",
          catalogAmount: 56,
          wholesaleAmount: 18.48,
          customerAmount: 56,
        }),
      ]),
    );
    expect(result.componentTotals).toMatchObject({
      catalogPerWindow: 440,
      wholesalePerWindow: 145.2,
      customerPerWindow: 440,
    });
    expect(quote.sendability.sendable).toBe(true);
  });

  it("preserves the legacy backend's historical unsupported-surcharge filtering", () => {
    const quoteLine = line("line-legacy-surcharge");
    const design = rollerDesign(quoteLine.id, "A", {
      quote_v2_backend: false,
      surcharges: [
        {
          id: "legacy-ui-only-surcharge-id",
          quantity: 1,
        },
      ],
    });
    const result = priceExactQuoteBuilderDesign(quoteLine, design);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.surchargeLines).toEqual([]);
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
      QUOTE_V2_ROLLER_PREVIEW_VERSION,
    );
    expect(injected.designs[0].result.catalogAsOf).toBe("2026-08-01");
  });

  it("keeps the future Roller appendix blocked on the production server date", () => {
    const quoteLine = line("line-production-date");
    const design = rollerDesign(quoteLine.id, "A", {
      // These browser-stored preview labels must not activate the appendix.
      quote_v2_catalog_version: QUOTE_V2_ROLLER_PREVIEW_VERSION,
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
      catalogVersion: QUOTE_V2_CATALOG_VERSION,
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
    if (!first.internalCost || !second.internalCost) {
      throw new Error("Expected protected internal cost for both Norman lines.");
    }

    const firstProcessingFee =
      Math.round(
        (first.internalCost.productCostTotal + 25) * 0.02 * 100,
      ) / 100;
    const totalProcessingFee =
      Math.round(
        (first.internalCost.productCostTotal +
          second.internalCost.productCostTotal +
          36) *
          0.02 *
          100,
      ) / 100;
    const secondProcessingFee =
      Math.round((totalProcessingFee - firstProcessingFee) * 100) / 100;

    expect(first.internalCost).toMatchObject({
      freightAllocated: 25,
      oversizeAllocated: 80,
      processingFeeAllocated: firstProcessingFee,
      freightStatus: "published",
    });
    expect(second.internalCost).toMatchObject({
      freightAllocated: 11,
      oversizeAllocated: 50,
      processingFeeAllocated: secondProcessingFee,
      freightStatus: "published",
    });
    expect(first.internalCost.landedCostTotal).toBe(
      Math.round(
        (first.internalCost.productCostTotal +
          25 +
          80 +
          firstProcessingFee) *
          100,
      ) / 100,
    );
    expect(second.internalCost.landedCostTotal).toBe(
      Math.round(
        (second.internalCost.productCostTotal +
          11 +
          50 +
          secondProcessingFee) *
          100,
      ) / 100,
    );
    expect(quote.costSummary).toMatchObject({
      status: "incomplete",
      freightHandling: 36,
      oversize: 130,
      processingFee: totalProcessingFee,
    });
    expect(quote.costSummary.warnings).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/oversize charge is not source-verified/i),
      ]),
    );
    expect(first.validationStatus).toBe("blocked");
    expect(second.validationStatus).toBe("blocked");
    expect(first.validationIssues.map((issue) => issue.ruleId)).toContain(
      "norman.processing_fee.oversize_scope_unverified",
    );
    expect(second.validationIssues.map((issue) => issue.ruleId)).toContain(
      "norman.processing_fee.oversize_scope_unverified",
    );
    expect(quote.sendability.sendable).toBe(false);
    expect(quote.sendability.lines.every((entry) => !entry.sendable)).toBe(true);
    expect(quote.designs.every((entry) => entry.snapshot === null)).toBe(true);
    expect(
      first.internalCost.processingFeeAllocated +
        second.internalCost.processingFeeAllocated,
    ).toBe(totalProcessingFee);
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
          amount: 682,
          wholesaleAmount: 225.06,
        }),
      ]),
    );
    const costResult = quote.designs[0].costResult;
    expect(costResult.ok).toBe(true);
    if (costResult.ok) {
      expect(costResult.wholesaleBase).toBe(result.wholesaleBase);
      expect(costResult.wholesaleAddOns).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "motor:automate_home:motor_rechargeable_battery_pack",
            amount: 225.06,
          }),
        ]),
      );
      expect(costResult.wholesaleUnitCost).toBe(
        result.internalCost?.productCostUnit,
      );
      expect(costResult).toMatchObject({
        freightAllocated: result.internalCost?.freightAllocated,
        oversizeAllocated: result.internalCost?.oversizeAllocated,
        processingFeeAllocated:
          result.internalCost?.processingFeeAllocated,
        landedCostTotal: result.internalCost?.landedCostTotal,
        freightStatus: result.internalCost?.freightStatus,
      });
    }
    expect(result.components).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "operating:motor:automate_home:motor_rechargeable_battery_pack",
          category: "operating_system",
          catalogAmount: 682,
          wholesaleAmount: 225.06,
          customerAmount: 682,
        }),
      ]),
    );
    expect(result.componentTotals).toMatchObject({
      catalogPerWindow: 1_066,
      wholesalePerWindow: 351.78,
      customerPerWindow: 1_066,
    });

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
    ).toContain("roller.motorization.legacy_motor_mismatch");
  });

  it("gives a canonical Roller motor array precedence and prices one exact Hub", () => {
    const quoteLine = line("line-canonical-motor");
    const design = {
      ...rollerDesign(quoteLine.id),
      lift_system: "Motorized",
      // These stale legacy strings must not be reconstructed once canonical
      // identities are stored.
      motor_type: "Mystery legacy motor",
      remote_type: "Hub",
      options_json: {
        ...(rollerDesign(quoteLine.id).options_json as Record<string, unknown>),
        roller_tube: '1 3/4" (43mm) Tube',
        roller_power_configuration: "Norman Smart AC Adapter Plug-In 36W",
        motorization_selections: [
          {
            groupId: "smart_motorization",
            optionId: "motor",
            role: "base_motor",
            units: 1,
          },
          {
            groupId: "smart_motorization",
            optionId: "hub",
            role: "hub",
            units: 1,
          },
        ],
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
    expect(
      result.surchargeLines.filter((line) => line.id.endsWith(":hub")),
    ).toEqual([
      expect.objectContaining({
        id: "motor:smart_motorization:hub",
        amount: 321,
        wholesaleAmount: 105.93,
      }),
    ]);
    expect(result.components).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "motor:smart_motorization:hub",
          category: "accessory",
          catalogAmount: 321,
          wholesaleAmount: 105.93,
          customerAmount: 321,
        }),
      ]),
    );
    expect(result.componentTotals).toMatchObject({
      catalogPerWindow: 1_187,
      wholesalePerWindow: 391.71,
      customerPerWindow: 1_187,
    });
  });

  it("keeps Lotus dealer cost internal while applying owner-approved x3 retail", () => {
    const quoteLine = line("line-lotus-cost", {
      product_type: "Mini Blinds",
      width_whole: 30,
      height_whole: 48,
      quantity: 2,
    });
    const quote = requireV2(
      repriceExactQuoteBuilder({
        lines: [quoteLine],
        designs: [lotusDesign(quoteLine.id)],
        selectedVariantByLine: { [quoteLine.id]: "A" },
      }),
    );
    const priced = quote.designs[0];

    expect(priced.result).toMatchObject({
      ok: true,
      base: 72.9,
      unitPrice: 72.9,
      quantity: 2,
      total: 145.8,
      internalCost: {
        basis: "dealer_net",
        productCostUnit: 24.3,
        productCostTotal: 48.6,
        freightAllocated: 0,
        oversizeAllocated: 0,
        processingFeeAllocated: 0,
        landedCostTotal: 48.6,
        freightStatus: "unresolved",
      },
    });
    expect(priced.costResult).toMatchObject({
      ok: true,
      productId: "lotus_mini_blinds",
      programId: "lotus_amx_1in_aluminum_custom",
      basis: "dealer_net",
      matchedWidth: 30,
      matchedHeight: 48,
      wholesaleBase: 24.3,
      wholesaleAddOns: [],
      wholesaleUnitCost: 24.3,
      quantity: 2,
      wholesaleTotal: 48.6,
      landedCostTotal: 48.6,
      freightStatus: "unresolved",
    });
    expect(quote.costSummary).toMatchObject({
      status: "incomplete",
      productCost: 48.6,
      dealerCostTotal: 48.6,
    });
    expect(quote.total).toBe(145.8);
    expect(quote.sendability.sendable).toBe(false);
    expect(priced.result.pricedSelectionFingerprint).not.toBeNull();
    expect(priced.result.pricedCatalogVersion).not.toBeNull();
    expect(priced.snapshot).toBeNull();

    const customerProjections = [
      toCustomerQuotePriceResult(priced.result),
      quote.customerQuote,
    ];
    for (const customerProjection of customerProjections) {
      const serialized = JSON.stringify(customerProjection);
      expect(serialized).not.toMatch(
        /wholesale|internalCost|costStatus|landedCost|freightAllocated|oversizeAllocated|processingFeeAllocated|productCost|dealer(?:[-_\s]?net)?|effectiveDealerFactor|multiplier|margin|schedule|2\.5/i,
      );
    }
    expect(customerProjections[0]).toMatchObject({
      ok: true,
      base: 72.9,
      unitPrice: 72.9,
      total: 145.8,
    });
    expect(quote.customerQuote.lines[0].price).toMatchObject({
      ok: true,
      base: 72.9,
      unitPrice: 72.9,
      total: 145.8,
    });
  });

  it("does not preserve Lotus dealer cost when authoritative validation hard-blocks", () => {
    const quoteLine = line("line-lotus-hard-block", {
      product_type: "Mini Blinds",
      width_whole: 30,
      height_whole: 48,
    });
    const quote = requireV2(
      repriceExactQuoteBuilder({
        lines: [quoteLine],
        designs: [
          lotusDesign(quoteLine.id, {
            surcharges: [{ id: "unsupported-lotus-charge", quantity: 1 }],
          }),
        ],
        selectedVariantByLine: { [quoteLine.id]: "A" },
      }),
    );
    const priced = quote.designs[0];

    expect(priced.result).toMatchObject({
      ok: false,
      code: "CONFIGURATION_INCOMPLETE",
      validationStatus: "blocked",
    });
    expect(priced.result).not.toHaveProperty("internalCost");
    expect(priced.costResult).toMatchObject({
      ok: false,
      code: "CONFIGURATION_INCOMPLETE",
    });
    expect(quote.costSummary).toMatchObject({
      status: "incomplete",
      productCost: 0,
      dealerCostTotal: 0,
    });
  });

  it.skip("retires Polar All Seasons pricing from the launch path", () => {
    const quoteLine = line("line-polar-dealer-option", {
      product_type: "Retractable Screens",
      width_whole: 48,
      height_whole: 96,
    });
    const design = {
      id: `${quoteLine.id}-design-A`,
      line_item_id: quoteLine.id,
      variant: "A",
      product_type: "Retractable Screens",
      supplier: "Polar",
      mount_type: "Inside Mount",
      unit_price: 0,
      options_json: {
        quote_v2_backend: true,
        quote_lab_product_id: "polar_all_seasons_screen",
        fabric_program_id: "single_48x96",
        surcharges: [{ id: "sliding_glass_door", quantity: 1 }],
      },
    } as unknown as SalesQuoteDesign;
    const quote = requireV2(
      repriceExactQuoteBuilder({
        lines: [quoteLine],
        designs: [design],
        selectedVariantByLine: { [quoteLine.id]: "A" },
      }),
    );
    const priced = quote.designs[0];

    expect(priced.result).toMatchObject({
      ok: true,
      base: 375,
      unitPrice: 400,
      onceTotal: 100,
      total: 500,
    });
    expect(priced.result.validationIssues).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ severity: "hard_block" }),
      ]),
    );
    expect(priced.result).toMatchObject({
      internalCost: {
        basis: "catalog_factor",
        productCostUnit: 180,
        productCostTotal: 180,
        landedCostTotal: 180,
        freightStatus: "not_applicable",
      },
    });
    expect(priced.costResult).toMatchObject({
      ok: true,
      wholesaleBase: 168.75,
      wholesaleAddOns: [
        {
          id: "sliding_glass_door",
          label: "Sliding Glass Door",
          amount: 11.25,
        },
        {
          id: POLAR_ALL_SEASONS_FREIGHT_SURCHARGE_ID,
          label: "Freight",
          amount: 0,
        },
      ],
      wholesaleUnitCost: 180,
      wholesaleTotal: 180,
    });
    expect(quote.costSummary).toMatchObject({
      status: "complete",
      productCost: 180,
      dealerCostTotal: 180,
    });
    expect(quote.total).toBe(500);
    expect(quote.sendability.sendable).toBe(true);
    expect(priced.snapshot).toMatchObject({
      retail: {
        onceTotal: 100,
        total: 500,
      },
    });
    expect(quote.customerQuote.lines[0].price).toMatchObject({
      onceTotal: 100,
      total: 500,
      surchargeLines: expect.arrayContaining([
        {
          id: POLAR_ALL_SEASONS_FREIGHT_SURCHARGE_ID,
          label: "Freight",
          amount: 100,
          kind: "flat",
        },
      ]),
    });
    expect(JSON.stringify(quote.customerQuote)).not.toMatch(
      /wholesale|internalCost|landedCost|productCost|dealerCost|margin/i,
    );
  });

  it.skip("retires copied Polar All Seasons pricing from the launch path", () => {
    const firstLine = line("line-all-seasons-first", {
      product_type: "Retractable Screens",
      width_whole: 48,
      height_whole: 96,
      quantity: 2,
      sort_order: 0,
    });
    const secondLine = line("line-all-seasons-second", {
      product_type: "Retractable Screens",
      width_whole: 48,
      height_whole: 96,
      quantity: 3,
      sort_order: 1,
    });
    const copiedSurcharges = [
      { id: POLAR_ALL_SEASONS_FREIGHT_SURCHARGE_ID, quantity: 8 },
      { id: POLAR_ALL_SEASONS_FREIGHT_SURCHARGE_ID, quantity: 4 },
    ];
    const designFor = (quoteLine: SalesQuoteLineItem) =>
      ({
        id: `${quoteLine.id}-design-A`,
        line_item_id: quoteLine.id,
        variant: "A",
        product_type: "Retractable Screens",
        supplier: "Polar",
        mount_type: "Inside Mount",
        unit_price: 0,
        options_json: {
          quote_v2_backend: true,
          quote_lab_product_id: "polar_all_seasons_screen",
          fabric_program_id: "single_48x96",
          surcharges: copiedSurcharges,
        },
      }) as unknown as SalesQuoteDesign;
    const quote = requireV2(
      repriceExactQuoteBuilder({
        lines: [firstLine, secondLine],
        designs: [designFor(firstLine), designFor(secondLine)],
        selectedVariantByLine: {
          [firstLine.id]: "A",
          [secondLine.id]: "A",
        },
      }),
    );

    expect(quote.total).toBe(1975);
    expect(
      quote.designs.flatMap((entry) =>
        entry.result.ok
          ? entry.result.surchargeLines.filter(
              (line) =>
                line.id === POLAR_ALL_SEASONS_FREIGHT_SURCHARGE_ID,
            )
          : [],
      ),
    ).toHaveLength(1);
    expect(
      quote.customerQuote.lines.map((entry) =>
        entry.price.onceTotal,
      ),
    ).toEqual([100, 0]);
    expect(
      quote.designs.map((entry) =>
        entry.snapshot?.retail.onceTotal,
      ),
    ).toEqual([100, 0]);
  });

  it("hard-blocks ambiguous and unknown populated legacy Roller accessories", () => {
    const quoteLine = line("line-legacy-accessory");
    const base = {
      ...rollerDesign(quoteLine.id),
      lift_system: "Motorized",
      motor_type: "Motor",
      options_json: {
        ...(rollerDesign(quoteLine.id).options_json as Record<string, unknown>),
        roller_tube: '1 3/4" (43mm) Tube',
        roller_power_configuration: "Norman Smart AC Adapter Plug-In 36W",
      },
    } as SalesQuoteDesign;
    const price = (remote_type: string) =>
      requireV2(
        repriceExactQuoteBuilder({
          lines: [quoteLine],
          designs: [{ ...base, remote_type }],
          selectedVariantByLine: { [quoteLine.id]: "A" },
        }),
      ).designs[0].result;

    const ambiguous = price("Hub");
    expect(ambiguous.ok).toBe(false);
    expect(ambiguous.validationIssues.map((entry) => entry.ruleId)).toContain(
      "roller.motorization.legacy_option_ambiguous",
    );

    const unknown = price("Mystery Controller");
    expect(unknown.ok).toBe(false);
    expect(unknown.validationIssues.map((entry) => entry.ruleId)).toContain(
      "roller.motorization.legacy_option_unknown",
    );
  });

  it("hard-blocks a canonical base motor that disagrees with the power configuration", () => {
    const quoteLine = line("line-canonical-mismatch");
    const design = {
      ...rollerDesign(quoteLine.id),
      lift_system: "Motorized",
      motor_type: "Motor (Rechargeable Battery Pack)",
      options_json: {
        ...(rollerDesign(quoteLine.id).options_json as Record<string, unknown>),
        roller_tube: '1 3/4" (43mm) Tube',
        roller_power_configuration: "Automate ARC Motor",
        motorization_selections: [
          {
            groupId: "automate_home",
            optionId: "low_voltage_dc_motor",
            role: "base_motor",
            units: 1,
          },
        ],
      },
    } as SalesQuoteDesign;
    const result = requireV2(
      repriceExactQuoteBuilder({
        lines: [quoteLine],
        designs: [design],
        selectedVariantByLine: { [quoteLine.id]: "A" },
      }),
    ).designs[0].result;
    expect(result.ok).toBe(false);
    expect(result.validationIssues.map((entry) => entry.ruleId)).toContain(
      "roller.motorization.power_motor_mismatch",
    );
  });

  it("projects selected retail without cost, freight, markup, or margin data", () => {
    const quote = priceOne(1);
    const serialized = JSON.stringify(quote.customerQuote);
    expect(serialized).not.toMatch(
      /wholesale|internalCost|costStatus|landed|freight|oversize|processing|dealer|multiplier|margin|2\.5/i,
    );
    expect(quote.customerQuote.total).toBe(quote.total);
    expect(quote.customerQuote.lines[0].price).toMatchObject({
      ok: true,
      total: quote.total,
    });
  });
});
