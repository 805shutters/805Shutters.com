import { describe, expect, it } from "vitest";
import { getProduct } from "@/lib/quote/catalog";
import julyCatalog from "@/lib/quote/catalog/norman-2026.catalog.json";
import { priceDesign } from "@/lib/quote/pricing";
import { normanRollerPg4Colors, normanRollerPg4Program, NORMAN_ROLLER_PG4_PROGRAM_ID as PG4 } from "@/lib/quote/norman-roller-pg4-2026-09.generated";
import { normanRollerPg4Source } from "./generated/norman-roller-pg4-2026-09.generated";
import { normanRollerV2Source } from "./generated/norman-roller-v2.generated";
import { resolveRollerOffering, resolveRollerMatrixProfile, validateRollerMatrix } from "./roller-matrix";
import { findRomanRearColor, quoteV2CatalogVersionFor } from "./catalog";
import { priceQuoteV2Selection } from "./engine";
import { validateSelection } from "./rules";
import type { ISODate, SelectionContext } from "./core";
import { ROLLER_PRICING as currentGrids } from "@/mts-quote/lib/pricingData";
import { ROLLER_PRICING as legacyGrids } from "@/mts-quote-v1/lib/pricingData";
import { getMtsGridKeyForCatalogProgram as currentGridKey } from "@/mts-quote/lib/productColorCatalog";
import { getMtsGridKeyForCatalogProgram as legacyGridKey } from "@/mts-quote-v1/lib/productColorCatalog";

function context(collection = "Springtide", color = "F2221", asOf: ISODate = "2026-09-01"): SelectionContext {
  return {
    manufacturerId: "norman", productId: "roller", programId: PG4,
    catalogAsOf: asOf, catalogVersion: quoteV2CatalogVersionFor("roller", asOf),
    widthInches: 24, heightInches: 36, quantity: 1, options: {},
    configuration: { mount_type: "Inside Mount", roller_application: "Single Shade", lift_system: "Cordless",
      fabric_collection: collection, fabric_color_code: color, roller_top_treatment: "No Top Treatment", roller_tube: "All Tubes" },
  };
}
function blocks(selection: SelectionContext) {
  return validateRollerMatrix(selection).filter((row) => row.severity === "hard_block");
}

// Independently transcribed September retail guide PDF p19 (printed p18), PG4.
const widths = [24,30,36,42,48,54,60,66,72,78,84,90,96,108,120];
const heights = [36,48,60,72,84,96,108,120,132,144];
const expectedPrices = [
  [354,388,420,456,488,523,558,595,635,701,742,782,827,904,985],
  [388,428,469,510,555,601,648,696,746,823,869,920,968,1067,1153],
  [421,469,517,572,627,684,740,797,857,940,999,1056,1101,1201,1295],
  [458,511,573,638,705,772,834,900,965,1055,1109,1163,1213,1326,1435],
  [493,561,632,710,779,851,931,1000,1058,1149,1207,1269,1328,1451,1571],
  [532,610,693,776,857,940,1011,1081,1145,1244,1308,1375,1443,1573,1713],
  [572,662,755,845,935,1011,1086,1156,1232,1334,1410,1483,1555,1702,1850],
  [615,716,814,911,1002,1081,1163,1241,1321,1429,1512,1590,1669,1831,1991],
  [658,768,873,973,1060,1149,1232,1321,1409,1524,1608,1694,1782,1960,2130],
  [699,815,933,1032,1123,1213,1309,1402,1497,1619,1708,1805,1895,2084,2271],
];

describe("September Norman Roller PG4 supplement", () => {
  it("prices all 150 source cells and fractional upward rounding identically in both quote interfaces", () => {
    expect(currentGridKey("Roller Shades", PG4)).toBe("group4September2026");
    expect(legacyGridKey("Roller Shades", PG4)).toBe("group4September2026");
    expect(currentGrids.group4September2026.prices).toEqual(expectedPrices);
    expect(legacyGrids.group4September2026.prices).toEqual(expectedPrices);
    expect(currentGrids.group4.prices[0][0]).toBe(337);
    expect(legacyGrids.group4.prices[0][0]).toBe(337);
    for (const [h, height] of heights.entries()) for (const [w, width] of widths.entries()) {
      for (const [actualWidth, actualHeight] of [[width, height], [width - 0.125, height - 0.125]]) {
        const result = priceDesign({ productId: "roller", programId: PG4, widthInches: actualWidth, heightInches: actualHeight });
        expect(result.ok, `${actualWidth}x${actualHeight}`).toBe(true);
        if (result.ok) expect(result.base).toBe(expectedPrices[h][w]);
      }
    }
    expect(priceDesign({ productId: "roller", programId: PG4, widthInches: 120.125, heightInches: 144 }).ok).toBe(false);
    expect(priceDesign({ productId: "roller", programId: PG4, widthInches: 120, heightInches: 144.125 }).ok).toBe(false);
  });

  it("routes precisely the 14 source colors to PG4 with exact fabric codes and dates", () => {
    expect(normanRollerPg4Colors).toHaveLength(14);
    for (const color of normanRollerPg4Colors) {
      expect(getProduct("roller")!.fabricRouting![color.collection]).toBe(PG4);
      expect(resolveRollerOffering(context(color.collection, color.colorCode))).toMatchObject({ ok: true, offering: {
        collection: color.collection, colorCode: color.colorCode,
        fabricCode: { Springtide: "AB06113", "Olivia RD": "AA0392", "Etch RD": "AB06117" }[color.collection],
        effectiveFrom: "2026-09-01",
      } });
      expect(resolveRollerOffering(context(color.collection, color.colorCode, "2026-08-31")).ok).toBe(false);
      expect(resolveRollerOffering(context("Olivia", color.colorCode)).ok).toBe(false);
      expect(findRomanRearColor(color.collection, color.colorCode)).toBeUndefined();
    }
  });

  it.each([ ["Springtide", "F2221", 96], ["Olivia RD", "F2102", 118], ["Etch RD", "F2201", 110] ] as const)(
    "enforces %s single cordless source boundaries without substituting grid width", (collection, color, maxWidth) => {
      const selected = context(collection, color);
      expect(resolveRollerMatrixProfile(selected)).toMatchObject({ ok: true, profile: { limits: {
        minWidth: 9.5, minHeight: 12, maxWidth: maxWidth, maxHeight: 144,
      } } });
      for (const [width, height] of [[9.5,12],[maxWidth,144]]) expect(blocks({ ...selected, widthInches: width, heightInches: height })).toEqual([]);
      for (const [width, height, rule] of [[9.375,12,"minWidth"],[maxWidth+.125,36,"maxWidth"],[24,11.875,"minHeight"],[24,144.125,"maxHeight"]] as const) {
        expect(blocks({ ...selected, widthInches: width, heightInches: height })).toEqual(expect.arrayContaining([
          expect.objectContaining({ ruleId: `roller.matrix.${rule}`, source: expect.objectContaining({ sourceId: "norman-roller-minmax-appendix-2026-09" }) }),
        ]));
      }
    },
  );

  it.each([
    ["Smart Release", "", 12, "D64"],
    ["Motorized", "Automate ARC Motor", 26, "V64"],
    ["Motorized", "Norman Smart AC Adapter Plug-In 36W", 16, "AJ64"],
  ] as const)("uses the distinct %s %s source minimum", (lift, power, minimum, cell) => {
    const selected = context();
    selected.configuration = { ...selected.configuration, lift_system: lift,
      roller_power_configuration: power, roller_tube: '1 3/4" (43mm) Tube' };
    expect(resolveRollerMatrixProfile(selected)).toMatchObject({ ok: true,
      profile: { limits: { minWidth: minimum, maxWidth: 96, maxHeight: 144 } },
      assignment: { sourceCells: { minWidth: cell } },
    });
    expect(blocks({ ...selected, widthInches: minimum })).toEqual([]);
    expect(blocks({ ...selected, widthInches: minimum - .125 })).toEqual(expect.arrayContaining([
      expect.objectContaining({ ruleId: "roller.matrix.minWidth" }),
    ]));
    expect(resolveRollerMatrixProfile({ ...selected, configuration: {
      ...selected.configuration, fabric_orientation: "Railroaded Fabric Orientation",
    } }).ok).toBe(false);
  });

  it("retains every PG4 application row and only complete source profiles", () => {
    expect(normanRollerPg4Source.profileDefinitions).toEqual(normanRollerV2Source.profileDefinitions);
    expect(normanRollerPg4Source.limitRows).toHaveLength(36);
    expect(new Set(normanRollerPg4Source.limitRows.map((row) => row.sheet)).size).toBe(12);
    expect(normanRollerPg4Source.profileAssignments).toHaveLength(432);
    for (const assignment of normanRollerPg4Source.profileAssignments) {
      const definition = normanRollerPg4Source.profileDefinitions.find((row) => row.id === assignment.profileDefinitionId)!;
      const profile = normanRollerPg4Source.limitProfiles.find((row) => row.id === assignment.profileId)!;
      expect(definition.usable).toBe(true);
      for (const metric of ["minWidth", "maxWidth", "minHeight", "maxHeight"]) {
        expect(profile.limits[metric]).toBeTypeOf("number");
        expect(assignment.sourceCells[metric]).toMatch(/^[A-Z]+\d+$/);
      }
    }
  });

  it("prices a current PG4 selection at MSRP with September provenance and blocks a PG3 substitution", () => {
    const selected = context();
    const result = priceQuoteV2Selection({ selection: selected, priceInput: { productId: "roller", programId: PG4, widthInches: 24, heightInches: 36 }, includeInternalCost: true });
    expect(result).toMatchObject({ ok: true, unitPrice: 354 });
    if (result.ok) expect(JSON.stringify(result)).toContain("norman-retail-guide-2026-09");
    const wrong = { ...selected, programId: "roller_cordless_fabric_price_group_3_pg3" };
    expect(validateSelection(wrong)).toEqual(expect.arrayContaining([expect.objectContaining({ ruleId: "roller.program.fabric_mismatch" })]));
    expect(priceQuoteV2Selection({ selection: context("Springtide", "F2221", "2026-08-31"), priceInput: { productId: "roller", programId: PG4, widthInches: 24, heightInches: 36 } }).ok).toBe(false);
  });

  it("preserves old program grids, regional offerings, source dates, and historical catalog identities", () => {
    const old = julyCatalog.products.find((row) => row.id === "roller")!;
    for (const program of old.programs) expect(getProduct("roller")!.programs.find((row) => row.id === program.id)).toEqual(program);
    expect(normanRollerV2Source.offerings).toHaveLength(373);
    expect(normanRollerV2Source.metadata.effectiveFrom).toBe("2026-08-01");
    expect(quoteV2CatalogVersionFor("roller", "2026-08-31")).toBe("805-v2-norman-roller-2026-08-01-msrp-r1");
    expect(quoteV2CatalogVersionFor("roller", "2026-09-01")).toContain("pg4-2026-09-r1");
    const oldSelection = { ...context("Amelia", "F1484", "2026-08-01"), programId: "roller_cordless_fabric_price_group_2_pg2" };
    expect(resolveRollerMatrixProfile(oldSelection).ok).toBe(true);
    expect(blocks(oldSelection)).toEqual([]);
    expect(normanRollerPg4Program.sourceId).toBe("norman-retail-guide-2026-09");
  });
});
