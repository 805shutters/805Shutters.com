import { describe, it, expect } from "vitest";
import { buildUiCatalog } from "./ui-catalog";

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
