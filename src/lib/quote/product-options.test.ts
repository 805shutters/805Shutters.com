import { describe, it, expect } from "vitest";
import { getDetailFieldsForProduct, SHUTTER_VARIANTS, shutterVariantsFor } from "./product-options";
import { catalog } from "./catalog";

describe("SHUTTER_VARIANTS (product-grounded)", () => {
  it("offers A/B/C tiers for each shutter manufacturer", () => {
    expect(SHUTTER_VARIANTS.norman_shutters.length).toBeGreaterThanOrEqual(3);
    expect(SHUTTER_VARIANTS.onyx_shutters.length).toBeGreaterThanOrEqual(3);
    const all = [...SHUTTER_VARIANTS.norman_shutters, ...SHUTTER_VARIANTS.onyx_shutters];
    for (const v of all) {
      expect(v.variant).toMatch(/^[A-F]$/);
      expect(v.label.length).toBeGreaterThan(0);
      expect(v.programId.length).toBeGreaterThan(0);
    }
  });

  it("every variant maps to a REAL catalog shutter program (no fabricated ids)", () => {
    let checked = 0;
    for (const product of catalog.products) {
      const variants = shutterVariantsFor(product.id);
      if (!variants) continue;
      for (const v of variants) {
        const program = product.programs.find((p) => p.id === v.programId);
        expect(program, `${product.id} variant ${v.variant} references missing program '${v.programId}'`).toBeTruthy();
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("returns null for non-shutter products", () => {
    expect(shutterVariantsFor("roller")).toBeNull();
    expect(shutterVariantsFor("nope")).toBeNull();
  });
});

describe("catalog-backed surcharge detail fields", () => {
  it("shows Light Guard options only when the product has priced catalog IDs", () => {
    const rollerLightGuard = getDetailFieldsForProduct("roller").find((field) => field.id === "light_guard");
    expect(rollerLightGuard?.options?.map((option) => option.value)).toEqual([
      "none",
      "basic_light_guard",
      "premium_wood_light_guard",
      "lightguard_360",
    ]);

    const perfectSheerLightGuard = getDetailFieldsForProduct("perfectsheer").find((field) => field.id === "light_guard");
    expect(perfectSheerLightGuard?.options?.map((option) => option.value)).toEqual([
      "none",
      "basic_light_guard",
      "premium_wood_light_guard",
    ]);

    const smartFoldLightGuard = getDetailFieldsForProduct("smartfold").find((field) => field.id === "light_guard");
    expect(smartFoldLightGuard?.options?.map((option) => option.value)).toEqual(["none", "basic_light_guard"]);
    expect(getDetailFieldsForProduct("honeycomb").some((field) => field.id === "light_guard")).toBe(false);
  });

  it("shows product-specific priced add-on fields only when the catalog supports them", () => {
    expect(getDetailFieldsForProduct("roller").map((field) => field.id)).toEqual(expect.arrayContaining(["shim", "keystone", "magnetic_hold_down"]));
    expect(getDetailFieldsForProduct("smartdrape").map((field) => field.id)).toEqual(expect.arrayContaining(["aluminum_shim", "keystone"]));
    expect(getDetailFieldsForProduct("citylights_aluminum").map((field) => field.id)).toEqual(expect.arrayContaining(["shim", "side_mount_bracket"]));
    expect(getDetailFieldsForProduct("palladian_shelf").map((field) => field.id)).not.toContain("shim");
  });

  it("shows the actual Soluna roller valance options in dropdown order", () => {
    const valance = getDetailFieldsForProduct("roller").find((field) => field.id === "valance");
    expect(valance?.label).toBe("Valance");
    expect(valance?.options).toEqual([
      { value: "none", label: "No Valance" },
      { value: "square_fascia", label: "Square Fascia*" },
      { value: "plain_curved_fascia", label: "Plain Curved Fascia*" },
      { value: "curved_fascia_with_fabric", label: "Curved Fascia with Fabric*" },
      { value: "fabric_valance_3_1_2", label: '3 1/2" Fabric Valance*' },
      { value: "fabric_valance_4_1_2", label: '4 1/2" Fabric Valance*' },
      { value: "fabric_valance_6", label: '6" Fabric Valance*' },
      { value: "fabric_valance_8", label: '8" Fabric Valance*' },
      { value: "modern_wood_valance_4_1_2", label: '4 1/2" Modern Wood Valance*' },
      { value: "cassette", label: "Cassette" },
    ]);
  });
});
