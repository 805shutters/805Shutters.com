import { describe, it, expect } from "vitest";
import { buildPricingReference, buildUiCatalog } from "./ui-catalog";

describe("buildUiCatalog", () => {
  const ui = buildUiCatalog();

  it("exposes products with programs and surcharges", () => {
    expect(ui.products.length).toBeGreaterThan(10);
    const honeycomb = ui.products.find((p) => p.id === "honeycomb");
    expect(honeycomb).toBeTruthy();
    expect(honeycomb!.programs.length).toBeGreaterThan(0);
    expect(honeycomb!.surcharges.length).toBeGreaterThan(0);
    expect(honeycomb!.image).toContain("/images/");
  });

  it("exposes fabric routing for fabric-priced products", () => {
    const roller = ui.products.find((p) => p.id === "roller")!;
    expect(roller.fabrics.length).toBeGreaterThan(0);
    expect(roller.fabrics.every((f) => typeof f.programId === "string")).toBe(true);
  });

  it("includes shutters flagged provisional with sqft programs", () => {
    const norman = ui.products.find((p) => p.id === "norman_shutters")!;
    expect(norman.provisional).toBe(true);
    expect(norman.programs.every((pr) => pr.priceAxis === "sqft")).toBe(true);
  });

  it("includes motorization groups", () => {
    expect(ui.motorization.length).toBeGreaterThan(0);
    const smart = ui.motorization.find((g) => g.groupId === "smart_motorization");
    expect(smart!.options.length).toBeGreaterThan(0);
  });

  it("does not leak full price grids to the UI projection", () => {
    const json = JSON.stringify(ui);
    expect(json).not.toContain("\"prices\"");
    expect(json).not.toContain("\"grid\"");
  });
});

describe("buildPricingReference", () => {
  const ref = buildPricingReference();

  it("exposes authoritative grid numbers for CRM reference", () => {
    const honeycomb = ref.programs.find((p) => p.programId === "honeycomb_9_16in_cordless_single_cell");
    expect(honeycomb).toBeTruthy();
    expect(honeycomb!.source).toBeNull();
    expect(honeycomb!.widths).toContain(24);
    expect(honeycomb!.heights).toContain(36);
    expect(honeycomb!.prices[0][0]).toBe(212);
    expect(honeycomb!.costs[0][0]).toBe(64);
  });

  it("keeps provisional shutter provenance visible", () => {
    const shutter = ref.programs.find((p) => p.productId === "norman_shutters");
    expect(shutter).toBeTruthy();
    expect(shutter!.provisional).toBe(true);
    expect(shutter!.source).toContain("MTS pricingData");
    expect(shutter!.priceAxis).toBe("sqft");
    expect(shutter!.pricePerSqft).toBeGreaterThan(0);
    expect(shutter!.costPerSqft).toBe(13.1);
  });

  it("exposes full guide reference sections for the CRM pricing page", () => {
    const norman = ref.products.find((p) => p.productId === "norman_shutters");
    expect(norman).toBeTruthy();
    expect(norman!.surcharges.length).toBeGreaterThan(0);
    expect(ref.globalSurcharges.length).toBeGreaterThan(0);
    expect(ref.motorization.length).toBeGreaterThan(0);
    expect(ref.motorization[0].options.length).toBeGreaterThan(0);
    expect(ref.currency).toBe("USD");
  });
});
