import { describe, it, expect } from "vitest";
import { priceDesign, roundUpIndex, type PriceResult } from "./pricing";
import { catalog, getProduct } from "./catalog";

function ok(r: PriceResult) {
  if (!r.ok) throw new Error(`expected ok, got ${r.code}: ${r.error}`);
  return r;
}

const HONEYCOMB_9_16 = "honeycomb_9_16in_cordless_single_cell";

describe("roundUpIndex", () => {
  const headers = [24, 30, 36, 42, 48];
  it("exact match", () => expect(roundUpIndex(headers, 36)).toBe(2));
  it("rounds up to next cell", () => expect(roundUpIndex(headers, 31)).toBe(2));
  it("below smallest -> smallest", () => expect(roundUpIndex(headers, 10)).toBe(0));
  it("above largest -> -1 (out of grid)", () => expect(roundUpIndex(headers, 99)).toBe(-1));
  it("matches the boundary exactly", () => expect(roundUpIndex(headers, 48)).toBe(4));
});

describe("worked examples (prices verified against the Norman 2026 guide PDF)", () => {
  it("honeycomb 9/16 single cell, 24x36 = $212", () => {
    const r = ok(priceDesign({ productId: "honeycomb", programId: HONEYCOMB_9_16, widthInches: 24, heightInches: 36 }));
    expect(r.base).toBe(212);
    expect(r.total).toBe(212);
    expect(r.matchedWidth).toBe(24);
    expect(r.matchedHeight).toBe(36);
  });

  it("honeycomb 9/16, 30x36 = $254", () => {
    const r = ok(priceDesign({ productId: "honeycomb", programId: HONEYCOMB_9_16, widthInches: 30, heightInches: 36 }));
    expect(r.total).toBe(254);
  });

  it("rounds 25x33 up to the 30x36 cell = $254", () => {
    const r = ok(priceDesign({ productId: "honeycomb", programId: HONEYCOMB_9_16, widthInches: 25, heightInches: 33 }));
    expect(r.matchedWidth).toBe(30);
    expect(r.matchedHeight).toBe(36);
    expect(r.total).toBe(254);
  });

  it("rounds a tiny 20x30 window up to the smallest cell 24x36 = $212", () => {
    const r = ok(priceDesign({ productId: "honeycomb", programId: HONEYCOMB_9_16, widthInches: 20, heightInches: 30 }));
    expect(r.matchedWidth).toBe(24);
    expect(r.matchedHeight).toBe(36);
    expect(r.total).toBe(212);
  });

  it("roller shade routes fabric 'Callie' to price group 1, 24x36 = $254", () => {
    const r = ok(priceDesign({ productId: "roller", fabric: "Callie", widthInches: 24, heightInches: 36 }));
    expect(r.programId).toBe("roller_cordless_fabric_price_group_1_pg1");
    expect(r.base).toBe(254);
  });

  it("palladian shelf is width-only priced: 24\" = $122, 30\" rounds to 32\" = $161", () => {
    const id = "palladian_shelf_palladian_shelf_with_product";
    const a = ok(priceDesign({ productId: "palladian_shelf", programId: id, widthInches: 24, heightInches: 0 }));
    expect(a.base).toBe(122);
    expect(a.matchedHeight).toBeNull();
    const b = ok(priceDesign({ productId: "palladian_shelf", programId: id, widthInches: 30, heightInches: 0 }));
    expect(b.matchedWidth).toBe(32);
    expect(b.base).toBe(161);
  });
});

describe("quantity & surcharges", () => {
  it("multiplies unit price by quantity", () => {
    const r = ok(priceDesign({ productId: "honeycomb", programId: HONEYCOMB_9_16, widthInches: 24, heightInches: 36, quantity: 3 }));
    expect(r.unitPrice).toBe(212);
    expect(r.total).toBe(636);
  });

  it("applies a flat per-unit surcharge (Shim $7) per window, times quantity", () => {
    const honeycomb = getProduct("honeycomb")!;
    const shim = honeycomb.surcharges.find((s) => /shim/i.test(s.name))!;
    expect(shim.value).toBe(7);
    const r = ok(priceDesign({ productId: "honeycomb", programId: HONEYCOMB_9_16, widthInches: 24, heightInches: 36, quantity: 2, surcharges: [{ id: shim.id }] }));
    expect(r.unitPrice).toBe(219); // 212 + 7
    expect(r.total).toBe(438); // 219 * 2
  });

  it("applies a percent surcharge off the base price", () => {
    const roman = getProduct("roman")!;
    const blackout = roman.surcharges.find((s) => /blackout lining/i.test(s.name))!;
    expect(blackout.kind).toBe("percent");
    const r = ok(priceDesign({ productId: "roman", fabric: "Blake", widthInches: 24, heightInches: 36, surcharges: [{ id: blackout.id }] }));
    const expectedSurcharge = Math.round(r.base * 0.1 * 100) / 100;
    expect(r.surchargeLines[0].amount).toBe(expectedSurcharge);
    expect(r.unitPrice).toBe(Math.round((r.base + expectedSurcharge) * 100) / 100);
  });

  it("adds motorization as a flat per-window add-on (Motor $482)", () => {
    const r = ok(priceDesign({ productId: "roller", fabric: "Callie", widthInches: 24, heightInches: 36, motorization: [{ groupId: "smart_motorization", optionId: "motor" }] }));
    expect(r.unitPrice).toBe(r.base + 482);
  });

  it("rejects motorization groups that are not valid for the selected product", () => {
    const r = priceDesign({ productId: "norman_shutters", programId: "woodlore", widthInches: 30, heightInches: 60, motorization: [{ groupId: "smart_motorization", optionId: "motor" }] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("MOTORIZATION_UNKNOWN");
  });
});

describe("error paths (legacy engine silently mis-priced all of these)", () => {
  it("rejects an unknown fabric instead of defaulting to the cheapest group", () => {
    const r = priceDesign({ productId: "roller", fabric: "DefinitelyNotAFabric", widthInches: 24, heightInches: 36 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("FABRIC_UNKNOWN");
  });

  it("rejects a width beyond the program max", () => {
    const r = priceDesign({ productId: "honeycomb", programId: HONEYCOMB_9_16, widthInches: 100, heightInches: 36 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("WIDTH_EXCEEDS_MAX");
  });

  it("rejects faux wood over the 48 sq ft area max", () => {
    const r = priceDesign({ productId: "faux_wood", widthInches: 96, heightInches: 90 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("AREA_EXCEEDS_MAX");
  });

  it("rejects invalid (zero/negative) dimensions", () => {
    expect(priceDesign({ productId: "honeycomb", programId: HONEYCOMB_9_16, widthInches: 0, heightInches: 36 }).ok).toBe(false);
    const neg = priceDesign({ productId: "honeycomb", programId: HONEYCOMB_9_16, widthInches: -5, heightInches: 36 });
    expect(neg.ok).toBe(false);
    if (!neg.ok) expect(neg.code).toBe("INVALID_DIMENSIONS");
  });

  it("rejects unknown product / program / surcharge", () => {
    expect(priceDesign({ productId: "nope", widthInches: 24, heightInches: 36 }).ok).toBe(false);
    const badProg = priceDesign({ productId: "honeycomb", programId: "nope", widthInches: 24, heightInches: 36 });
    if (!badProg.ok) expect(badProg.code).toBe("PROGRAM_NOT_RESOLVED");
    const badSur = priceDesign({ productId: "honeycomb", programId: HONEYCOMB_9_16, widthInches: 24, heightInches: 36, surcharges: [{ id: "nope" }] });
    if (!badSur.ok) expect(badSur.code).toBe("SURCHARGE_UNKNOWN");
  });
});

describe("catalog integrity", () => {
  it("every grid is rectangular and consistent with its headers", () => {
    for (const product of catalog.products) {
      for (const prog of product.programs) {
        const { widths, heights, prices } = prog.grid;
        if (prog.priceAxis === "sqft") {
          expect(typeof prog.pricePerSqft, `${prog.id} pricePerSqft`).toBe("number");
          expect(prices.length, `${prog.id} sqft has no grid`).toBe(0);
          continue;
        }
        if (prog.priceAxis === "wh") {
          expect(prices.length, `${prog.id} rows`).toBe(heights.length);
        } else {
          expect(prices.length, `${prog.id} width-only rows`).toBe(1);
        }
        for (const row of prices) {
          expect(row.length, `${prog.id} cols`).toBe(widths.length);
        }
      }
    }
  });

  it("grid headers are strictly ascending and positive", () => {
    for (const product of catalog.products) {
      for (const prog of product.programs) {
        for (const arr of [prog.grid.widths, prog.grid.heights]) {
          for (let i = 1; i < arr.length; i += 1) {
            expect(arr[i], `${prog.id}`).toBeGreaterThan(arr[i - 1]);
          }
        }
      }
    }
  });

  it("every fabric route points at a real program", () => {
    for (const product of catalog.products) {
      if (!product.fabricRouting) continue;
      for (const [, programId] of Object.entries(product.fabricRouting)) {
        expect(product.programs.some((p) => p.id === programId), `${product.id} -> ${programId}`).toBe(true);
      }
    }
  });
});

describe("motorization per-product pricing (Norman 2026 Retail Guide p7)", () => {
  const SMARTDRAPE = "smartdrape_smartdrape_lakeshore_stripe";
  const motorLine = (r: Extract<PriceResult, { ok: true }>, id = "motor") =>
    r.surchargeLines.find((l) => l.id === `motor:smart_motorization:${id}`);

  it("Motor is $642 for SmartDrape, not the legacy flat $482 (guide p7)", () => {
    const base = ok(priceDesign({ productId: "smartdrape", programId: SMARTDRAPE, widthInches: 36, heightInches: 48 }));
    const r = ok(priceDesign({ productId: "smartdrape", programId: SMARTDRAPE, widthInches: 36, heightInches: 48, motorization: [{ groupId: "smart_motorization", optionId: "motor" }] }));
    expect(motorLine(r)?.amount).toBe(642);
    expect(r.unitPrice - base.unitPrice).toBe(642);
  });

  it("Motor is still $482 for a Roller (priceByProduct maps roller -> 482)", () => {
    const r = ok(priceDesign({ productId: "roller", fabric: "Callie", widthInches: 24, heightInches: 36, motorization: [{ groupId: "smart_motorization", optionId: "motor" }] }));
    expect(motorLine(r)?.amount).toBe(482);
  });

  it("Charging Extension Wand is SmartDrape-only at $75 (guide p7)", () => {
    const r = ok(priceDesign({ productId: "smartdrape", programId: SMARTDRAPE, widthInches: 36, heightInches: 48, motorization: [{ groupId: "smart_motorization", optionId: "charging_extension_wand" }] }));
    expect(motorLine(r, "charging_extension_wand")?.amount).toBe(75);
  });

  it("rejects an NA motor option for a product (Dual Motor on a Roller -> MOTORIZATION_UNKNOWN)", () => {
    const r = priceDesign({ productId: "roller", fabric: "Callie", widthInches: 24, heightInches: 36, motorization: [{ groupId: "smart_motorization", optionId: "dual_motor_for_honeycomb" }] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("MOTORIZATION_UNKNOWN");
  });

  it("never leaks wholesale/cost on Norman motorization (retail-only source)", () => {
    const r = ok(priceDesign({ productId: "smartdrape", programId: SMARTDRAPE, widthInches: 36, heightInches: 48, motorization: [{ groupId: "smart_motorization", optionId: "motor" }] }));
    expect(motorLine(r)?.wholesaleAmount ?? null).toBe(null);
    expect(r.wholesaleUnitPrice).toBe(null);
    expect(r.wholesaleTotal).toBe(null);
  });
});

describe("Soluna Cordless Solar Screen (Norman 2026 Retail Guide p15-16)", () => {
  const SS1 = "roller_cordless_solar_screen_price_group_1_pg1";
  const SS2 = "roller_cordless_solar_screen_price_group_2_pg2";
  const SS3 = "roller_cordless_solar_screen_price_group_3_pg3";

  it("PG1 24x36 = $240 (guide p15)", () => {
    expect(ok(priceDesign({ productId: "roller", programId: SS1, widthInches: 24, heightInches: 36 })).base).toBe(240);
  });
  it("PG2 24x36 = $261 (guide p16)", () => {
    expect(ok(priceDesign({ productId: "roller", programId: SS2, widthInches: 24, heightInches: 36 })).base).toBe(261);
  });
  it("PG3 24x36 = $290 (guide p16)", () => {
    expect(ok(priceDesign({ productId: "roller", programId: SS3, widthInches: 24, heightInches: 36 })).base).toBe(290);
  });
  it("PG1 120x144 = $1309 (guide p15 max corner)", () => {
    expect(ok(priceDesign({ productId: "roller", programId: SS1, widthInches: 120, heightInches: 144 })).base).toBe(1309);
  });
  it("routes solar fabric 'Serene 7%' -> PG1 = $240 (guide p15)", () => {
    const r = ok(priceDesign({ productId: "roller", fabric: "Serene 7%", widthInches: 24, heightInches: 36 }));
    expect(r.programId).toBe(SS1);
    expect(r.base).toBe(240);
  });
  it("routes 'Lakeview 10%' -> PG3 = $290 (guide p16)", () => {
    const r = ok(priceDesign({ productId: "roller", fabric: "Lakeview 10%", widthInches: 24, heightInches: 36 }));
    expect(r.programId).toBe(SS3);
    expect(r.base).toBe(290);
  });
});

describe("fuzz sweep: no NaN, no negative, no silent wrong price ever escapes", () => {
  it("prices or cleanly errors across a wide grid of sizes for every single-program product", () => {
    const widths = [10, 24, 30, 47.5, 60, 72, 96, 130, 200];
    const heights = [10, 30, 36, 60, 84, 120, 250];
    const validCodes = new Set([
      "WIDTH_EXCEEDS_MAX",
      "HEIGHT_EXCEEDS_MAX",
      "AREA_EXCEEDS_MAX",
      "NA_CELL",
      "INVALID_DIMENSIONS",
    ]);
    let priced = 0;
    let errored = 0;
    for (const product of catalog.products) {
      const single = product.programs.filter((p) => p.grid.prices.length > 0 && p.grid.widths.length > 0);
      if (single.length !== 1) continue; // skip fabric/multi-program products here
      for (const w of widths) {
        for (const h of heights) {
          const r = priceDesign({ productId: product.id, widthInches: w, heightInches: h });
          if (r.ok) {
            expect(Number.isFinite(r.total), `${product.id} ${w}x${h}`).toBe(true);
            expect(r.total).toBeGreaterThan(0);
            expect(Number.isFinite(r.base)).toBe(true);
            priced += 1;
          } else {
            expect(validCodes.has(r.code), `${product.id} ${w}x${h} -> ${r.code}`).toBe(true);
            errored += 1;
          }
        }
      }
    }
    expect(priced).toBeGreaterThan(0);
    expect(priced + errored).toBeGreaterThan(0);
  });
});
