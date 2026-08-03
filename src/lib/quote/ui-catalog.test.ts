import { describe, it, expect } from "vitest";
import { buildPricingReference, buildUiCatalog, resolveMotorizationOptionsForProduct } from "./ui-catalog";

describe("buildUiCatalog", () => {
  const ui = buildUiCatalog();

  it("exposes products with programs and surcharges", () => {
    expect(ui.products.length).toBeGreaterThan(10);
    const honeycomb = ui.products.find((p) => p.id === "honeycomb");
    expect(honeycomb).toBeTruthy();
    expect(honeycomb!.programs.length).toBeGreaterThan(0);
    expect(honeycomb!.surcharges.length).toBeGreaterThan(0);
    expect(honeycomb!.details.length).toBeGreaterThan(0);
    expect(honeycomb!.image).toContain("/images/");
  });

  it("exposes fabric routing for fabric-priced products", () => {
    const roller = ui.products.find((p) => p.id === "roller")!;
    expect(roller.fabrics.length).toBeGreaterThan(0);
    expect(roller.fabrics.every((f) => typeof f.programId === "string")).toBe(true);
  });

  it("exposes every Norman roller fabric color with verified pricing availability", () => {
    const roller = ui.products.find((p) => p.id === "roller")!;
    expect(roller.fabricColors).toHaveLength(350);
    expect(roller.fabricColors.filter((row) => row.available)).toHaveLength(350);
    expect(roller.fabricColors.find((row) => row.colorCode === "F1515")).toMatchObject({
      collection: "Garden",
      colorName: "Ecru",
      programId: "roller_cordless_fabric_price_group_3_pg3",
      available: true,
    });
    expect(roller.fabricColors.find((row) => row.colorCode === "F0407")).toMatchObject({
      collection: "NA820 (3%)",
      colorName: "Oyster/Pewter",
      programId: "roller_cordless_solar_screen_price_group_2_pg2",
      available: true,
    });
    expect(roller.fabricColors.find((row) => row.colorCode === "F0818")).toBeUndefined();
  });

  it("exposes searchable Norman colors for every supported product category", () => {
    expect(ui.products.find((p) => p.id === "roman")!.fabricColors).toHaveLength(202);
    expect(ui.products.find((p) => p.id === "honeycomb")!.fabricColors).toHaveLength(191);
    expect(ui.products.find((p) => p.id === "vertical_honeycomb")!.fabricColors).toHaveLength(191);
    expect(ui.products.find((p) => p.id === "smartdrape")!.fabricColors).toHaveLength(74);
    expect(ui.products.find((p) => p.id === "perfectsheer")!.fabricColors).toHaveLength(32);
    expect(ui.products.find((p) => p.id === "smartfold")!.fabricColors).toHaveLength(21);
    expect(ui.products.find((p) => p.id === "synchrony_vertical")!.fabricColors).toHaveLength(42);
    expect(ui.products.find((p) => p.id === "faux_wood")!.fabricColors).toHaveLength(16);
    expect(ui.products.find((p) => p.id === "smartprivacy_faux")!.fabricColors).toHaveLength(16);
    expect(ui.products.find((p) => p.id === "wood_blinds")!.fabricColors).toHaveLength(26);
    expect(ui.products.find((p) => p.id === "citylights_aluminum")!.fabricColors).toHaveLength(33);
    expect(ui.products.find((p) => p.id === "roman")!.fabricColors.find((row) => row.colorCode === "F1064")).toMatchObject({
      collection: "Solids",
      programId: "roman_cordless_usa_price_group_2_pg2",
      selectionMode: "fabric",
    });
    expect(ui.products.find((p) => p.id === "wood_blinds")!.fabricColors.find((row) => row.colorCode === "1003")).toMatchObject({
      colorName: "White Matte",
      automaticDetails: { fabric_surcharge_id: "premium_color" },
    });
  });

  it("includes shutters flagged provisional with sqft programs", () => {
    const norman = ui.products.find((p) => p.id === "norman_shutters")!;
    expect(norman.provisional).toBe(true);
    expect(norman.programs.every((pr) => pr.priceAxis === "sqft")).toBe(true);
    expect(norman.details.some((field) => field.id === "louver_size")).toBe(true);
  });

  it("includes motorization groups", () => {
    expect(ui.motorization.length).toBeGreaterThan(0);
    const smart = ui.motorization.find((g) => g.groupId === "smart_motorization");
    expect(smart!.options.length).toBeGreaterThan(0);
    expect(ui.products.find((p) => p.id === "roller")!.motorizationGroups).toContain("smart_motorization");
    expect(ui.products.find((p) => p.id === "norman_shutters")!.motorizationGroups).toEqual([]);
  });

  it("keeps per-product motorization prices for source-backed UI hints", () => {
    const smart = ui.motorization.find((g) => g.groupId === "smart_motorization")!;
    const motor = smart.options.find((o) => o.id === "motor")!;
    expect(motor.price).toBe(482);
    expect(motor.priceByProduct?.roller).toBe(482);
    expect(motor.priceByProduct?.smartdrape).toBe(642);

    const dualMotor = smart.options.find((o) => o.id === "dual_motor_for_honeycomb")!;
    expect(dualMotor.priceByProduct?.honeycomb).toBe(642);
    expect(dualMotor.priceByProduct?.roller).toBeNull();
  });

  it("omits authoritative NA motor options from each product selector", () => {
    const smart = ui.motorization.find((group) => group.groupId === "smart_motorization")!;
    expect(resolveMotorizationOptionsForProduct(smart, "roller").find((option) => option.id === "smartsense")?.price).toBe(60);
    expect(resolveMotorizationOptionsForProduct(smart, "smartfold").find((option) => option.id === "smartsense")?.price).toBe(60);
    expect(resolveMotorizationOptionsForProduct(smart, "honeycomb").some((option) => option.id === "smartsense")).toBe(false);
    expect(resolveMotorizationOptionsForProduct(smart, "smartdrape").some((option) => option.id === "wired_charging_wand")).toBe(false);
  });

  it("does not leak full price grids to the UI projection", () => {
    const json = JSON.stringify(ui);
    expect(json).not.toContain("\"prices\"");
    expect(json).not.toContain("\"costs\"");
    expect(json).not.toContain("dealerNetPrice");
    expect(json).not.toContain("\"grid\"");
    expect(json).not.toContain("dealerFactor");
    expect(json).not.toContain("wholesale");
  });

  it("exposes Polar as quote-only without exposing pricing or internal cost policy", () => {
    const polar = ui.products.filter((product) => product.manufacturer === "Polar");
    expect(polar).toHaveLength(13);
    expect(polar.find((product) => product.id === "polar_interior_roller")).toMatchObject({
      productType: "Roller Shades",
      system: "Interior Roller",
      priceBasis: "manual_required",
    });
    const interior = polar.find(
      (product) => product.id === "polar_interior_roller",
    );
    expect(interior?.fabricMetadata).toEqual([]);
    expect(interior?.sourcePages).toContain(53);
    expect(interior?.notes.join(" ")).toMatch(/manual shades before options/i);
    expect(interior?.programs).toEqual([]);
    expect(interior?.motorizationGroups).toEqual([]);
    expect(polar.find((product) => product.id === "polar_tension_shade")?.priceBasis).toBe("manual_required");
  });

  it("exposes Cordless Solar Screen roller programs + solar fabrics (guide p15-16)", () => {
    const roller = ui.products.find((p) => p.id === "roller")!;
    const solar = roller.programs.filter((pr) => pr.id.includes("solar_screen"));
    expect(solar.length).toBe(3);
    expect(roller.programs.map((pr) => pr.id)).toContain("roller_cordless_solar_screen_price_group_1_pg1");
    const serene = roller.fabrics.find((f) => f.name === "Serene 7%");
    expect(serene?.programId).toBe("roller_cordless_solar_screen_price_group_1_pg1");
  });
});

describe("buildPricingReference", () => {
  const ref = buildPricingReference();

  it("exposes authoritative grid numbers for CRM reference", () => {
    const honeycomb = ref.programs.find((p) => p.programId === "honeycomb_9_16in_cordless_single_cell");
    expect(honeycomb).toBeTruthy();
    expect(honeycomb!.source).toBe("2026Jul Retail Price Guide (1).pdf");
    expect(honeycomb!.widths).toContain(24);
    expect(honeycomb!.heights).toContain(36);
    expect(honeycomb!.prices[0][0]).toBe(212);
    expect(honeycomb!.costs[0][0]).toBe(63.6);
    expect(honeycomb).toMatchObject({
      manufacturer: "Norman",
      costBasis: "dealer_factor",
      costCoverage: "complete",
      provenanceStatus: "complete",
      sourceId: "norman-retail-guide-2026-07",
      sourceRevision: "2026-07",
      sourceEffectiveDate: "2026-07-01",
      sourcePages: [10],
    });
  });

  it("keeps provisional shutter provenance visible", () => {
    const shutter = ref.programs.find((p) => p.productId === "norman_shutters");
    expect(shutter).toBeTruthy();
    expect(shutter!.provisional).toBe(true);
    expect(shutter!.source).toContain("MTS pricingData");
    expect(shutter!.priceAxis).toBe("sqft");
    expect(shutter!.pricePerSqft).toBeGreaterThan(0);
    expect(shutter!.costPerSqft).toBe(13.1);
    expect(shutter!.provenanceStatus).toBe("provisional");
    expect(shutter!.customerPriceEligible).toBe(false);
  });

  it("exposes full guide reference sections for the CRM pricing page", () => {
    const norman = ref.products.find((p) => p.productId === "norman_shutters");
    expect(norman).toBeTruthy();
    expect(norman!.surcharges.length).toBeGreaterThan(0);
    expect(ref.globalSurcharges.length).toBeGreaterThan(0);
    expect(ref.motorization.length).toBeGreaterThan(0);
    expect(ref.motorization[0].options.length).toBeGreaterThan(0);
    expect(ref.currency).toBe("USD");
    expect(ref.sources.map((source) => source.sourceId)).toContain(
      "norman-retail-guide-2026-07",
    );
  });

  it("lists every automated-pricing manufacturer and preserves Lotus send restrictions", () => {
    expect(new Set(ref.products.map((product) => product.manufacturer))).toEqual(
      new Set(["Lotus", "Norman", "Onyx"]),
    );
    const lotus = ref.programs.find(
      (program) => program.productId === "lotus_mini_blinds",
    );
    expect(lotus).toMatchObject({
      priceBasis: "suggested_retail",
      customerPriceEligible: false,
      provenanceStatus: "effective_date_missing",
    });
    expect(lotus!.costs.flat().some((cost) => cost !== null)).toBe(true);
  });

  it("surfaces the blocking Lotus FLX source reconciliation in the staff ledger", () => {
    const flx = ref.programs.find(
      (program) =>
        program.programId === "lotus_flx_2in_bright_white_custom",
    );
    expect(flx).toMatchObject({
      provenanceStatus: "source_conflict",
      customerPriceEligible: false,
      authorityFindings: [
        { code: "SOURCE_PRICE_CONFLICT", blocking: true },
        { code: "PORTAL_METADATA_CONFLICT", blocking: true },
        { code: "EFFECTIVE_DATE_MISSING", blocking: true },
      ],
    });
  });

  it("keeps product-specific motorization price maps in the pricing reference", () => {
    const smart = ref.motorization.find((group) => group.groupId === "smart_motorization")!;
    const motor = smart.options.find((option) => option.id === "motor")!;
    expect(motor.priceByProduct?.roller).toBe(482);
    expect(motor.priceByProduct?.smartdrape).toBe(642);
  });
});
