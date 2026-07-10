import { describe, expect, it } from "vitest";
import {
  HONEYCOMB_CELL_SIZES,
  HONEYCOMB_MOTORS_DAYNIGHT,
  HONEYCOMB_MOTORS_FULL,
  HONEYCOMB_MOTORS_TD,
  HONEYCOMB_MOTORS_TDBU,
  HONEYCOMB_OPERATING_SYSTEMS,
  HONEYCOMB_RAIL_COLORS,
  HONEYCOMB_SMARTFIT_OPERATING_SYSTEMS,
  canonicalizeHoneycombCellSize,
  getHoneycombOperatingSystemsFor,
  honeycombOperatingSystemAllows2On1,
  isHoneycombChainOperatingSystem,
  isHoneycombCordlessPoleOperatingSystem,
  isHoneycombDayNightOperatingSystem,
  isHoneycombFrameCellSize,
  isHoneycombMotorizedOperatingSystem,
} from "./quoteConstants";
import {
  HONEYCOMB_PRICING,
  HONEYCOMB_SURCHARGES,
  MOTORIZATION_OPTIONS,
  VERTICAL_HONEYCOMB_PRICING,
} from "./pricingData";
import {
  getHoneycombDealerFabricTypesFor,
  getHoneycombDealerRowsFor,
  isHoneycombDealerColorAvailable,
  isHoneycombDealerColorSurcharged,
} from "./honeycombDealerFabrics";
import { getMtsProductColorRows } from "./productColorCatalog";
import { normanHoneycombDealerFabricRows } from "@/lib/quote/norman-honeycomb-dealer-fabrics.generated";

describe("Honeycomb Shades Norman-mirroring options", () => {
  it("offers the eight Norman shade sizes", () => {
    expect(HONEYCOMB_CELL_SIZES).toEqual([
      '3/8" Single Cell',
      '9/16" Single Cell',
      '3/4" Single Cell',
      '1 1/4" Single Cell',
      '1/2" Double Cell',
      '3/4" Double Cell',
      "SmartFit with Frame",
      "SmartFit Sloped with Frame",
    ]);
  });

  it("canonicalizes the legacy SmartFit cell-size labels", () => {
    expect(canonicalizeHoneycombCellSize("SmartFit® with Frame")).toBe("SmartFit with Frame");
    expect(canonicalizeHoneycombCellSize("SmartFit® for Sloped Windows with Frame")).toBe(
      "SmartFit Sloped with Frame"
    );
    expect(canonicalizeHoneycombCellSize('3/8" Single Cell')).toBe('3/8" Single Cell');
    expect(isHoneycombFrameCellSize("SmartFit with Frame")).toBe(true);
    expect(isHoneycombFrameCellSize('3/4" Double Cell')).toBe(false);
  });

  it("offers the fourteen Norman operating systems in order", () => {
    expect(HONEYCOMB_OPERATING_SYSTEMS).toEqual([
      "SmartRise Cordless",
      "Cordless TDBU",
      "Cordless Day & Night",
      "SmartFit",
      "Cord Loop",
      "SmartRelease",
      "Cord Loop TD",
      "Cord Loop Day & Night",
      "SmartFit for Sloped Windows",
      "SmartFit Dual Shade",
      "Motorized",
      "Motorized TD",
      "Motorized TDBU",
      "Motorized Day & Night",
    ]);
  });

  it("restricts frame sizes to the SmartFit family, permissive elsewhere", () => {
    expect(getHoneycombOperatingSystemsFor("SmartFit with Frame")).toEqual(
      HONEYCOMB_SMARTFIT_OPERATING_SYSTEMS
    );
    expect(getHoneycombOperatingSystemsFor("SmartFit® with Frame")).toEqual(
      HONEYCOMB_SMARTFIT_OPERATING_SYSTEMS
    );
    expect(getHoneycombOperatingSystemsFor('3/8" Single Cell')).toEqual(
      HONEYCOMB_OPERATING_SYSTEMS
    );
    expect(getHoneycombOperatingSystemsFor(null)).toEqual(HONEYCOMB_OPERATING_SYSTEMS);
  });

  it("classifies operating systems like the Norman form cascades", () => {
    for (const os of ["Cord Loop", "SmartRelease", "Cord Loop TD", "Cord Loop Day & Night"]) {
      expect(isHoneycombChainOperatingSystem(os), os).toBe(true);
    }
    expect(isHoneycombChainOperatingSystem("SmartRise Cordless")).toBe(false);

    for (const os of [
      "SmartRise Cordless",
      "Cordless TDBU",
      "Cordless Day & Night",
      "SmartFit",
      "SmartFit for Sloped Windows",
      "SmartFit Dual Shade",
    ]) {
      expect(isHoneycombCordlessPoleOperatingSystem(os), os).toBe(true);
    }
    expect(isHoneycombCordlessPoleOperatingSystem("Cord Loop")).toBe(false);

    for (const os of ["Motorized", "Motorized TD", "Motorized TDBU", "Motorized Day & Night"]) {
      expect(isHoneycombMotorizedOperatingSystem(os), os).toBe(true);
    }
    expect(isHoneycombMotorizedOperatingSystem("SmartRise Cordless")).toBe(false);

    for (const os of ["Cordless Day & Night", "Cord Loop Day & Night", "Motorized Day & Night"]) {
      expect(isHoneycombDayNightOperatingSystem(os), os).toBe(true);
    }
    expect(isHoneycombDayNightOperatingSystem("SmartFit Dual Shade")).toBe(false);

    expect(honeycombOperatingSystemAllows2On1("SmartRise Cordless")).toBe(true);
    expect(honeycombOperatingSystemAllows2On1("Cord Loop")).toBe(true);
    expect(honeycombOperatingSystemAllows2On1("SmartRelease")).toBe(true);
    expect(honeycombOperatingSystemAllows2On1("Cordless TDBU")).toBe(false);
    expect(honeycombOperatingSystemAllows2On1("Motorized")).toBe(false);
  });

  it("offers the nineteen Norman rail colors", () => {
    expect(HONEYCOMB_RAIL_COLORS).toHaveLength(19);
    expect(HONEYCOMB_RAIL_COLORS[0]).toBe("Default");
    expect(HONEYCOMB_RAIL_COLORS).toContain("Ginger Spice");
    expect(HONEYCOMB_RAIL_COLORS).toContain("White");
  });

  it("prices every honeycomb power source via the motorization lookup", () => {
    const priced = new Map(MOTORIZATION_OPTIONS.map((option) => [option.name, option]));
    const allSources = new Set([
      ...HONEYCOMB_MOTORS_FULL,
      ...HONEYCOMB_MOTORS_TD,
      ...HONEYCOMB_MOTORS_TDBU,
      ...HONEYCOMB_MOTORS_DAYNIGHT,
    ]);
    for (const source of allSources) {
      expect(priced.has(source), `MOTORIZATION_OPTIONS is missing "${source}"`).toBe(true);
    }
    // Guide honeycomb column: Norman motor $482, Automate Home motor $682.
    expect(priced.get("Rechargeable Battery (Wireless Charging Wand)")).toMatchObject({
      price: 482,
      brand: "Norman",
    });
    expect(priced.get("Rechargeable Battery (Wired Charging Wand)")).toMatchObject({
      price: 482,
      brand: "Norman",
    });
    expect(priced.get("Automate Home Battery Pack")).toMatchObject({
      price: 682,
      brand: "Automate Home",
    });
    expect(priced.get("Automate Home AC Adapter")).toMatchObject({
      price: 682,
      brand: "Automate Home",
    });
  });
});

describe("Honeycomb Shades July 2026 retail guide pricing", () => {
  it("fixed grids match the guide (spot corners)", () => {
    // Flame Resistant (was a copy of the 3/8" single grid).
    const fr = HONEYCOMB_PRICING.flame_resistant_3_8_single;
    expect(fr.heights).toHaveLength(13);
    expect(fr.maxHeight).toBe(120);
    expect(fr.prices[0][0]).toBe(471);
    expect(fr.prices[12][12]).toBe(3486);

    // 3/4" woven groups (heights previously stopped at 86").
    const woven1 = HONEYCOMB_PRICING.three_4_single_woven_group1;
    expect(woven1.heights).toHaveLength(13);
    expect(woven1.prices[0][0]).toBe(402);
    expect(woven1.prices[12][10]).toBe(1943);

    const woven2 = HONEYCOMB_PRICING.three_4_single_woven_group2;
    expect(woven2.heights).toHaveLength(13);
    expect(woven2.prices[0][0]).toBe(463);
    expect(woven2.prices[12][10]).toBe(2189);
  });

  it("grids that already matched the guide are untouched (spot corners)", () => {
    expect(HONEYCOMB_PRICING.nine_16_cordless_single.prices[0][0]).toBe(212);
    expect(HONEYCOMB_PRICING.nine_16_cordless_single.prices[13][12]).toBe(1790);
    expect(HONEYCOMB_PRICING.three_8_single_and_3_4_single.prices[0][0]).toBe(270);
    expect(HONEYCOMB_PRICING.three_8_single_and_3_4_single.prices[13][12]).toBe(2450);
    expect(HONEYCOMB_PRICING.half_cordless_double.prices[0][0]).toBe(281);
    expect(HONEYCOMB_PRICING.half_cordless_double.prices[13][12]).toBe(2543);
    expect(HONEYCOMB_PRICING.general_3_4_double.prices[0][0]).toBe(336);
    expect(HONEYCOMB_PRICING.general_3_4_double.prices[13][12]).toBe(3048);
  });

  it("adds the vertical honeycomb grids from the guide", () => {
    const vertical = VERTICAL_HONEYCOMB_PRICING.vertical_3_4_single;
    expect(vertical.widths).toHaveLength(16);
    expect(vertical.heights).toHaveLength(13);
    expect(vertical.maxWidth).toBe(146);
    expect(vertical.prices[0][0]).toBe(565);
    expect(vertical.prices[12][15]).toBe(3404);

    const verticalFr = VERTICAL_HONEYCOMB_PRICING.vertical_flame_resistant;
    expect(verticalFr.widths).toHaveLength(16);
    expect(verticalFr.heights).toHaveLength(11);
    expect(verticalFr.maxHeight).toBe(96);
    expect(verticalFr.prices[0][0]).toBe(987);
    expect(verticalFr.prices[10][15]).toBe(4949);
  });

  it("surcharges match the guide", () => {
    const byName = new Map(HONEYCOMB_SURCHARGES.map((s) => [s.name, s]));
    expect(byName.get("Shim")).toMatchObject({ type: "fixed", value: 7 });
    expect(byName.get("Side Mount Bracket")).toMatchObject({ type: "fixed", value: 23 });
    expect(byName.get("Light Guard - Pole Attachment Only")).toMatchObject({ value: 45 });
    expect(byName.get("Magnetic Hold Down")).toMatchObject({ value: 28 });
    expect(byName.get("Cut-out Cordless Operating Pole")).toMatchObject({ value: 89 });
    expect(byName.get("Specialty Shapes")).toMatchObject({ value: 117 });
    expect(byName.get("SmartFit")).toMatchObject({ value: 89 });
    expect(byName.get("SmartFit with Frame")).toMatchObject({ value: 293 });
    expect(byName.get("SmartFit Dual Shade")).toMatchObject({ value: 178 });
    expect(byName.get("SmartFit Dual Shade with Frame")).toMatchObject({ value: 382 });
    expect(byName.get("Continuous Cord Loop")).toMatchObject({ value: 73 });
    expect(byName.get("SmartRelease")).toMatchObject({ value: 89 });
    expect(byName.get("TDBU (Top Down Bottom Up)")).toMatchObject({ value: 89 });
  });

  it("replaces the fixed $20 fabric surcharges with the 20% entry", () => {
    const byName = new Map(HONEYCOMB_SURCHARGES.map((s) => [s.name, s]));
    expect(byName.get("Room Darkening | Sheer | Solus | FR Essentials Fabric")).toMatchObject({
      type: "percentage",
      value: 20,
    });
    expect(byName.get("Day & Night (priced as 2 shades)")).toMatchObject({
      type: "percentage",
      value: 100,
    });
    for (const name of byName.keys()) {
      expect(name, `stale fixed fabric surcharge "${name}"`).not.toMatch(/Fabric Surcharge$/);
    }
  });
});

describe("Honeycomb Shades dealer fabric availability", () => {
  it("covers all eight shade sizes from the dealer capture", () => {
    expect(normanHoneycombDealerFabricRows.length).toBe(913);
    const sizes = new Set(normanHoneycombDealerFabricRows.map((row) => row.cellSize));
    for (const cellSize of HONEYCOMB_CELL_SIZES) {
      expect(sizes.has(cellSize), `no dealer rows for "${cellSize}"`).toBe(true);
    }
    // Decoflex for skylights carries the same fabric set as Decoflex.
    expect(getHoneycombDealerRowsFor("SmartFit Sloped with Frame").length).toBe(
      getHoneycombDealerRowsFor("SmartFit with Frame").length
    );
  });

  it('9/16" offers only Light Filtering and Room Darkening fabrics', () => {
    expect(getHoneycombDealerFabricTypesFor('9/16" Single Cell')).toEqual([
      "Light Filtering",
      "Room Darkening",
    ]);
    expect(getHoneycombDealerFabricTypesFor('1/2" Double Cell')).toEqual([
      "Light Filtering",
      "Room Darkening",
    ]);
    expect(getHoneycombDealerFabricTypesFor('3/4" Single Cell')).toContain("Solus");
    expect(getHoneycombDealerFabricTypesFor('3/8" Single Cell')).toContain("Sheer");
  });

  it("resolves color availability per shade size (suffix-tolerant)", () => {
    // Woven Windsong is a 3/4" & 1 1/4" single-cell fabric only.
    expect(isHoneycombDealerColorAvailable('3/4" Single Cell', "F1527")).toBe(true);
    expect(isHoneycombDealerColorAvailable('9/16" Single Cell', "F1527")).toBe(false);
    // Space Gray is a 9/16"-only color.
    expect(isHoneycombDealerColorAvailable('9/16" Single Cell', "C7208K")).toBe(true);
    expect(isHoneycombDealerColorAvailable('3/8" Single Cell', "C7208K")).toBe(false);
    // Light-control narrowing.
    expect(
      isHoneycombDealerColorAvailable('9/16" Single Cell', "C7015K", "Room Darkening")
    ).toBe(false);
    expect(
      isHoneycombDealerColorAvailable('9/16" Single Cell', "C7015K", "Light Filtering")
    ).toBe(true);
    // Legacy SmartFit label resolves through canonicalization.
    expect(isHoneycombDealerColorAvailable("SmartFit® with Frame", "C7015K")).toBe(true);
  });

  it("flags the RD | Sheer | Solus | FR Essentials colors as surcharged", () => {
    expect(isHoneycombDealerColorSurcharged('9/16" Single Cell', "C4008T")).toBe(true);
    expect(isHoneycombDealerColorSurcharged('9/16" Single Cell', "C7015K")).toBe(false);
    // Solus (3/4" & 1 1/4" single) and Sheer carry the surcharge.
    expect(isHoneycombDealerColorSurcharged('3/4" Single Cell', "C7514")).toBe(true);
    expect(isHoneycombDealerColorSurcharged('3/8" Single Cell', "C5001")).toBe(true);
    // Flame Resistant LF does not; FR RD does.
    expect(isHoneycombDealerColorSurcharged('3/8" Single Cell', "C6001")).toBe(false);
    expect(isHoneycombDealerColorSurcharged('3/8" Single Cell', "C8001")).toBe(true);
  });

  it("filters picker rows to the dealer availability for a shade size", () => {
    const rows916 = getMtsProductColorRows("Honeycomb Shades", {
      cell_size: '9/16" Single Cell',
    });
    expect(rows916.length).toBeGreaterThan(0);
    for (const row of rows916) {
      expect(
        isHoneycombDealerColorAvailable('9/16" Single Cell', row.colorCode),
        `${row.fabricType} ${row.colorCode} is not a 9/16" dealer color`
      ).toBe(true);
      // The 9/16"-specific pricing program is the only one allowed.
      if (row.programId) {
        expect(row.programId).toBe("honeycomb_9_16in_cordless_single_cell");
      }
    }

    // Woven colors disappear for sizes that don't offer them.
    const rows12 = getMtsProductColorRows("Honeycomb Shades", {
      cell_size: '1/2" Double Cell',
    });
    expect(rows12.some((row) => row.collection === "Windsong")).toBe(false);
    const rows34 = getMtsProductColorRows("Honeycomb Shades", {
      cell_size: '3/4" Single Cell',
    });
    expect(rows34.some((row) => row.collection === "Windsong")).toBe(true);

    // Legacy bare stored cell sizes still resolve.
    const legacy = getMtsProductColorRows("Honeycomb Shades", { cell_size: '3/4"' });
    expect(legacy.length).toBeGreaterThan(0);

    // No cell size selected → full dealer order-form catalog (permissive).
    expect(getMtsProductColorRows("Honeycomb Shades", {}).length).toBe(191);
  });
});
