import { describe, expect, it } from "vitest";
import {
  ROLLER_PRICING,
  ROLLER_SURCHARGES,
  ROLLER_VALANCE_SURCHARGE_LADDERS,
  getRollerValanceLadder,
  getRollerValanceSurchargePrice,
} from "./pricingData";
import { getRollerFabricPriceGroup } from "./quoteConstants";
import { getMtsGridKeyForCatalogProgram, getMtsProductColorRows } from "./productColorCatalog";

describe("Roller Shades July 2026 retail guide pricing", () => {
  it("fabric grids match the guide (spot corners)", () => {
    // h=36 w=24 and h=144 w=120 corners from the Soluna pages.
    expect(ROLLER_PRICING.group1.prices[0][0]).toBe(254);
    expect(ROLLER_PRICING.group1.prices[9][14]).toBe(1362);
    expect(ROLLER_PRICING.group2.prices[0][0]).toBe(278);
    expect(ROLLER_PRICING.group2.prices[9][14]).toBe(1537);
    expect(ROLLER_PRICING.group3.prices[0][0]).toBe(307);
    expect(ROLLER_PRICING.group3.prices[9][14]).toBe(1974);
  });

  it("solar screen grids match the guide (previously one group off)", () => {
    expect(ROLLER_PRICING.solarCordlessGroup1.prices[0][0]).toBe(240);
    expect(ROLLER_PRICING.solarCordlessGroup1.prices[9][14]).toBe(1309);
    expect(ROLLER_PRICING.solarCordlessGroup2.prices[0][0]).toBe(261);
    expect(ROLLER_PRICING.solarCordlessGroup2.prices[9][14]).toBe(1488);
    expect(ROLLER_PRICING.solarCordlessGroup3.prices[0][0]).toBe(290);
    expect(ROLLER_PRICING.solarCordlessGroup3.prices[9][14]).toBe(1888);
  });

  it("resolves solar_screen catalog program ids to the solar grids", () => {
    expect(
      getMtsGridKeyForCatalogProgram("Roller Shades", "roller_cordless_solar_screen_price_group_1_pg1")
    ).toBe("solarCordlessGroup1");
    expect(
      getMtsGridKeyForCatalogProgram("Roller Shades", "roller_cordless_solar_screen_price_group_2_pg2")
    ).toBe("solarCordlessGroup2");
    expect(
      getMtsGridKeyForCatalogProgram("Roller Shades", "roller_cordless_solar_screen_price_group_3_pg3")
    ).toBe("solarCordlessGroup3");
  });

  it("routes solar collections to solar grids in the fallback map", () => {
    expect(getRollerFabricPriceGroup("Breeze Screen 1%")).toBe("solarCordlessGroup2");
    expect(getRollerFabricPriceGroup("NA300 (3%)")).toBe("solarCordlessGroup1");
    expect(getRollerFabricPriceGroup("NA300 (1%)")).toBe("solarCordlessGroup2");
    expect(getRollerFabricPriceGroup("Lakeview (7%)")).toBe("solarCordlessGroup3");
    expect(getRollerFabricPriceGroup("Meadows (1%)")).toBe("solarCordlessGroup3");
    expect(getRollerFabricPriceGroup("Kendra")).toBe("group3");
    // Plain Breeze (woven) stays a group-3 fabric.
    expect(getRollerFabricPriceGroup("Breeze")).toBe("group3");
  });

  it("every roller picker row resolves to a priced grid", () => {
    const rows = getMtsProductColorRows("Roller Shades", {}, { includeUnavailable: false });
    expect(rows.length).toBeGreaterThan(300);
    for (const row of rows) {
      const key = getMtsGridKeyForCatalogProgram("Roller Shades", row.programId);
      expect(
        key && key in ROLLER_PRICING,
        `${row.collection} ${row.colorCode} -> ${row.programId} -> ${key}`
      ).toBe(true);
    }
  });

  it("surcharges match the guide", () => {
    const byName = new Map(ROLLER_SURCHARGES.map((s) => [s.name, s.value]));
    expect(byName.get("Dual Shade")).toBe(73);
    expect(byName.get("SmartRelease")).toBe(89);
    expect(byName.get("Coupled Shade")).toBe(117);
    expect(byName.get("Basic Light Guard")).toBe(45);
    expect(byName.get("Premium Wood Light Guard")).toBe(117);
    expect(byName.get("LightGuard 360")).toBe(375);
    expect(byName.get("T-Post for LightGuard 360")).toBe(150);
    expect(byName.get("Shim")).toBe(7);
    expect(byName.get("Magnetic Hold Down")).toBe(28);
    expect(byName.get("Pole Attachment Only")).toBe(40);
    expect(byName.get("Keystone")).toBe(73);
    expect(byName.get("Cordless Operating Pole / Premium Hardware")).toBe(89);
    expect(byName.get("Premium Hem Bar")).toBe(16);
    expect(byName.get("Additional Fiberglass Pole")).toBe(28);
  });

  it("prices fascia and valances by the width ladders", () => {
    expect(getRollerValanceLadder("No Valance")).toBeNull();
    expect(getRollerValanceLadder("Square Fascia*")).toBe("fasciaWood");
    expect(getRollerValanceLadder('4 1/2" Modern Wood Valance*')).toBe("fasciaWood");
    expect(getRollerValanceLadder('3 1/2" Fabric Valance*')).toBe("fabricValance");
    expect(getRollerValanceLadder('8" Fabric Valance*')).toBe("fabricValance8Cassette");
    expect(getRollerValanceLadder("Cassette*")).toBe("fabricValance8Cassette");

    expect(getRollerValanceSurchargePrice("Square Fascia*", 24)).toBe(117);
    expect(getRollerValanceSurchargePrice("Square Fascia*", 100)).toBe(293);
    expect(getRollerValanceSurchargePrice('6" Fabric Valance*', 144)).toBe(431);
    expect(getRollerValanceSurchargePrice("Cassette*", 60)).toBe(282);
    // Beyond 144": +$28 per additional foot.
    expect(getRollerValanceSurchargePrice('3 1/2" Fabric Valance*', 156)).toBe(431 + 28);
    expect(getRollerValanceSurchargePrice("No Valance", 60)).toBeNull();

    // Ladder shapes: 17 width columns each.
    for (const prices of Object.values(ROLLER_VALANCE_SURCHARGE_LADDERS)) {
      expect(prices).toHaveLength(17);
    }
  });
});
