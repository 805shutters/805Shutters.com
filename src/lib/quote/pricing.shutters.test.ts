import { describe, it, expect } from "vitest";
import {
  priceDealerNetDesign,
  priceDesign,
  type DealerNetCostResult,
  type PriceResult,
} from "./pricing";
import { getProduct, catalog } from "./catalog";
import { deriveAutomaticSurcharges } from "./automatic-surcharges";

// Shutter pricing is $/sqft. Norman and Onyx retail rates are independently
// approved business prices; source-backed dealer costs remain separate.

function ok(r: PriceResult) {
  if (!r.ok) throw new Error(`expected ok, got ${r.code}: ${r.error}`);
  return r;
}

function dealerOk(r: DealerNetCostResult) {
  if (!r.ok) throw new Error(`expected dealer cost, got ${r.code}: ${r.error}`);
  return r;
}

function line(r: ReturnType<typeof ok>, id: string) {
  const surchargeLine = r.surchargeLines.find((item) => item.id === id);
  if (!surchargeLine) throw new Error(`surcharge line ${id} not found`);
  return surchargeLine;
}

describe("shutter $/sqft pricing", () => {
  it("uses the configured manufacturer-retail shutter square-foot rates", () => {
    const cases = [
      ["Composite", "norman_shutters", "woodlore", 35],
      ["Painted Wood - Norman", "norman_shutters", "normandy_painted", 42],
      ["Stained Wood - Norman", "norman_shutters", "normandy_stained", 46],
      ["Onyx Basswood", "onyx_shutters", "painted_basswood", 35],
      ["Onyx Basswood Stain", "onyx_shutters", "stained_basswood", 38],
      ["Onyx Sycamore", "onyx_shutters", "secamore", 31],
      ["Onyx Vinyl", "onyx_shutters", "vinyl", 31],
      ["Onyx MDF Hybrid", "onyx_shutters", "vlo_hybrid", 29],
      ["Onyx USA Poly", "onyx_shutters", "onyx_us_made_vinyl", 32],
      ["Onyx Poly Composite", "onyx_shutters", "poly_composite", 31],
    ] as const;

    for (const [label, productId, programId, pricePerSqft] of cases) {
      const r = ok(priceDesign({ productId, programId, widthInches: 30, heightInches: 60 }));
      expect(r.sqft, label).toBe(12.5);
      expect(r.billableSqft, label).toBe(13);
      expect(r.base, label).toBe(13 * pricePerSqft);
      expect(r.total, label).toBe(13 * pricePerSqft);
    }
  });

  it("rounds 30x60 from 12.5 sqft up to the Woodlore 13 sqft grid row", () => {
    const r = ok(priceDesign({ productId: "norman_shutters", programId: "woodlore", widthInches: 30, heightInches: 60 }));
    expect(r.sqft).toBe(12.5);
    expect(r.billableSqft).toBe(13);
    expect(r.base).toBe(455);
    expect(r.wholesaleBase).toBe(170.3);
    expect(r.wholesaleUnitPrice).toBe(170.3);
    expect(r.total).toBe(455);
  });

  it("applies the 8 sq ft minimum: Woodlore 24x24 (4 sqft) bills 8 sqft = $280", () => {
    const r = ok(priceDesign({ productId: "norman_shutters", programId: "woodlore", widthInches: 24, heightInches: 24 }));
    expect(r.sqft).toBe(4);
    expect(r.billableSqft).toBe(8);
    expect(r.base).toBe(280);
  });

  it("prices Onyx Basswood dealer cost independently from customer retail", () => {
    const r = dealerOk(priceDealerNetDesign({ productId: "onyx_shutters", programId: "painted_basswood", widthInches: 30, heightInches: 60 }));
    expect(r.sqft).toBe(12.5);
    expect(r.billableSqft).toBe(13);
    expect(r.dealerNetBaseCost).toBe(175.5);
    expect(r.dealerNetOptionLines).toEqual([]);
    expect(r.dealerNetUnitCost).toBe(175.5);
    expect(r.dealerNetTotalCost).toBe(175.5);
  });

  it("uses the owner-confirmed $12/sqft Onyx Poly Composite wholesale rate", () => {
    expect(
      priceDealerNetDesign({
        productId: "onyx_shutters",
        programId: "poly_composite",
        widthInches: 24,
        heightInches: 24,
      }),
    ).toMatchObject({
      ok: true,
      sqft: 4,
      billableSqft: 8,
      dealerNetBaseCost: 96,
      dealerNetUnitCost: 96,
    });
  });

  it("prices Onyx Basswood Stain as dealer cost only", () => {
    const r = dealerOk(priceDealerNetDesign({ productId: "onyx_shutters", programId: "stained_basswood", widthInches: 30, heightInches: 60 }));
    expect(r.dealerNetUnitCost).toBe(214.5);
  });

  it("percent surcharge (Cafe Shutters 30%) applies off the sqft base", () => {
    const r = ok(priceDesign({ productId: "norman_shutters", programId: "woodlore", widthInches: 30, heightInches: 60, surcharges: [{ id: "cafe_shutters" }] }));
    expect(r.surchargeLines[0].amount).toBe(136.5); // 30% of the $455 row
    expect(r.surchargeLines[0].wholesaleAmount).toBe(51.09); // 30% of $170.30
    expect(r.unitPrice).toBe(591.5);
    expect(r.wholesaleUnitPrice).toBe(221.39);
  });

  it("does not convert Onyx H3 dealer cost into a customer surcharge", () => {
    expect(priceDesign({ productId: "onyx_shutters", programId: "painted_basswood", widthInches: 30, heightInches: 60, surcharges: [{ id: "hidden_tilt_rod" }] })).toMatchObject({
      ok: false,
      code: "SURCHARGE_NO_PRICE",
    });
  });

  it("itemizes Onyx H2 and H3 dealer costs without dropping either selection", () => {
    const h2 = dealerOk(
      priceDealerNetDesign({
        productId: "onyx_shutters",
        programId: "painted_basswood",
        widthInches: 30,
        heightInches: 60,
        surcharges: [{ id: "h2_tilt" }],
      }),
    );
    expect(h2).toMatchObject({
      dealerNetBaseCost: 175.5,
      dealerNetUnitCost: 175.5,
      dealerNetTotalCost: 175.5,
      dealerNetOptionLines: [
        {
          id: "h2_tilt",
          label: "H2 Tilt",
          amount: 0,
          billingScope: "per_window",
          sourceId: "onyx-price-screenshot-2026-07-20",
        },
      ],
    });

    const h3 = dealerOk(
      priceDealerNetDesign({
        productId: "onyx_shutters",
        programId: "painted_basswood",
        widthInches: 30,
        heightInches: 60,
        quantity: 2,
        surcharges: [{ id: "hidden_tilt_rod" }],
      }),
    );
    expect(h3).toMatchObject({
      sqft: 12.5,
      billableSqft: 13,
      dealerNetBaseCost: 175.5,
      dealerNetUnitCost: 188.5,
      quantity: 2,
      dealerNetOnceCost: 0,
      dealerNetTotalCost: 377,
      dealerNetOptionLines: [
        {
          id: "hidden_tilt_rod",
          label: "H3 Hidden Gear",
          amount: 13,
          billingScope: "per_window",
          sourceId: "onyx-price-screenshot-2026-07-20",
          detail: "$1/sq ft x 13",
        },
      ],
    });
  });

  it("fails closed for unknown or unproven dealer-net options", () => {
    const baseInput = {
      productId: "onyx_shutters",
      programId: "painted_basswood",
      widthInches: 30,
      heightInches: 60,
    } as const;
    expect(
      priceDealerNetDesign({
        ...baseInput,
        surcharges: [{ id: "unknown-option" }],
      }),
    ).toMatchObject({ ok: false, code: "SURCHARGE_UNKNOWN" });
    expect(
      priceDealerNetDesign({
        ...baseInput,
        surcharges: [{ id: "double_hung" }],
      }),
    ).toMatchObject({ ok: false, code: "SURCHARGE_NO_PRICE" });
    expect(
      priceDealerNetDesign({
        ...baseInput,
        motorization: [
          { groupId: "smart_motorization", optionId: "motor" },
        ],
      }),
    ).toMatchObject({ ok: false, code: "MOTORIZATION_UNKNOWN" });
  });

  it("prices Norman bypass/bifold track selections from the visible detail options", () => {
    const cases = [
      [{ panel_config: "bypass" }, "bypass_and_bifold_track_shutters", 182],
      [{ panel_config: "bifold" }, "bypass_and_bifold_track_shutters", 182],
      [{ track_system: "bypass_track" }, "bypass_track", 182],
      [{ track_system: "bifold_180" }, "bifold_180", 182],
      [{ track_system: "floating_90_bifold" }, "floating_90_bifold", 204.75],
      [{ track_system: "triple_track" }, "triple_track", 45.5],
      [{ track_system: "track_only" }, "track_only", 45.5],
      [{ track_system: "track_header_fascia" }, "track_w_header_and_fascia", 91],
    ] as const;

    for (const [details, surchargeId, expectedAmount] of cases) {
      const surcharges = deriveAutomaticSurcharges("norman_shutters", details);
      expect(surcharges, surchargeId).toEqual([{ id: surchargeId }]);
      const r = ok(priceDesign({ productId: "norman_shutters", programId: "woodlore", widthInches: 30, heightInches: 60, surcharges }));
      expect(line(r, surchargeId).amount, surchargeId).toBe(expectedAmount);
    }
  });

  it("prices Norman specialty shape and French door cutout selections", () => {
    const cases = [
      [{ specialty_shape: "liberty_arch" }, "liberty_arch", 60],
      [{ specialty_shape: "angle_top" }, "angle_top", 215],
      [{ specialty_shape: "arch_top_picture" }, "arch_top_picture_window_with_horizontal_louvers", 322.5],
      [{ specialty_shape: "quarter_sunburst" }, "quarter_sunburst_panel_with_continuous_frame", 430],
      [{ specialty_shape: "horizontal_center_arch" }, "horizontal_center_arch_with_quarter_round_side_panels", 430],
      [{ specialty_shape: "sunburst_center_arch" }, "sunburst_center_arch_with_quarter_round_side_panels", 645],
      [{ specialty_shape: "all_other_shapes" }, "all_other_shapes", 215],
      [{ custom_work: "french_door_cutout" }, "french_door_cutout", 200],
    ] as const;

    for (const [details, surchargeId, expectedAmount] of cases) {
      const surcharges = deriveAutomaticSurcharges("norman_shutters", details);
      expect(surcharges, surchargeId).toEqual([{ id: surchargeId }]);
      const r = ok(priceDesign({ productId: "norman_shutters", programId: "woodlore", widthInches: 30, heightInches: 60, surcharges }));
      expect(line(r, surchargeId).amount, surchargeId).toBe(expectedAmount);
    }
  });

  it("applies Onyx source-defined customer option prices to the confirmed retail base", () => {
    const cases = [
      [{ panel_config: "bypass" }, "close_by_pass_2_tracks", 220],
      [{ panel_config: "bifold" }, "bi_fold", 220],
      [{ track_type: "close_bypass" }, "close_by_pass_2_tracks", 220],
      [{ track_type: "open_bypass" }, "open_by_pass_2_tracks", 250],
      [{ track_type: "bifold" }, "bi_fold", 220],
      [{ specialty_shape: "arch" }, "arch", 200],
      [{ specialty_shape: "sunburst" }, "sunburst", 220],
      [{ specialty_shape: "octagon" }, "octagon", 220],
      [{ specialty_shape: "hexagon" }, "hexagon", 220],
      [{ specialty_shape: "circle" }, "circle", 220],
      [{ specialty_shape: "elongated_eyebrow" }, "elongated_eyebrow", 220],
      [{ specialty_shape: "liberty_arch_panel" }, "liberty_arch_panel", 36.4],
      [{ specialty_shape: "racked" }, "racked", 140],
      [{ custom_work: "french_door_cutout" }, "french_door_cutout_l_frame_only", 110],
      [{ custom_work: "dishout_cut" }, "dishout_cut_per_cut_1_1_4in_max", 30],
      [{ custom_work: "scribe_small" }, "scribe_less_than_27_cubic_inches_per_piece", 7],
      [{ custom_work: "scribe_medium" }, "scribe_greater_than_27_and_less_than_54_cubic_inches_per_piece", 10],
      [{ custom_work: "scribe_large" }, "scribe_greater_than_54_cubic_inches_per_piece", 15],
    ] as const;

    for (const [details, surchargeId, expectedAmount] of cases) {
      const surcharges = deriveAutomaticSurcharges("onyx_shutters", details);
      expect(surcharges, surchargeId).toEqual([{ id: surchargeId }]);
      const r = ok(priceDesign({ productId: "onyx_shutters", programId: "painted_basswood", widthInches: 30, heightInches: 60, surcharges }));
      expect(line(r, surchargeId).amount, surchargeId).toBe(expectedAmount);
    }
  });

  it("shutter products are flagged provisional", () => {
    expect(getProduct("norman_shutters")?.provisional).toBe(true);
    expect(getProduct("onyx_shutters")?.provisional).toBe(true);
  });

  it("requires a height (sqft needs both dimensions)", () => {
    const r = priceDesign({ productId: "norman_shutters", programId: "woodlore", widthInches: 30, heightInches: 0 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("INVALID_DIMENSIONS");
  });
});

describe("shutter fuzz sweep: no NaN / negative ever escapes", () => {
  it("prices cleanly across sizes for every shutter program", () => {
    const sizes: [number, number][] = [
      [12, 12], [24, 36], [30, 60], [36, 84], [48, 96], [60, 120],
    ];
    let priced = 0;
    for (const product of catalog.products) {
      if (product.productType !== "shutter") continue;
      for (const prog of product.programs) {
        const effectiveBasis = prog.priceBasis ?? product.priceBasis;
        if (effectiveBasis === "manual_required" || effectiveBasis === "unavailable") {
          continue;
        }
        for (const [w, h] of sizes) {
          const dealerNet = effectiveBasis === "dealer_net";
          const r = dealerNet
            ? priceDealerNetDesign({ productId: product.id, programId: prog.id, widthInches: w, heightInches: h })
            : priceDesign({ productId: product.id, programId: prog.id, widthInches: w, heightInches: h });
          expect(r.ok, `${product.id}/${prog.id} ${w}x${h}`).toBe(true);
          if (r.ok) {
            const amount = "dealerNetUnitCost" in r ? r.dealerNetUnitCost : r.total;
            expect(Number.isFinite(amount)).toBe(true);
            expect(amount).toBeGreaterThan(0);
            expect(r.billableSqft).toBeGreaterThanOrEqual(8);
            priced += 1;
          }
        }
      }
    }
    expect(priced).toBe(13 * sizes.length);
  });
});
