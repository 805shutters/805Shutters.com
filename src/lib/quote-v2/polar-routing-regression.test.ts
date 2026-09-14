import { describe, expect, it } from "vitest";
import { priceDesign } from "@/lib/quote/pricing";
import { QUOTE_V2_CATALOG_VERSION } from "./catalog";
import type { SelectionContext } from "./core";
import { priceQuoteV2Selection } from "./engine";
import { productRuleStatusForSelection, validateSelection } from "./rules";

function exterior(programId = "group_5", fabric = "Phifer SunTex 95"): SelectionContext {
  return {
    manufacturerId: "polar", productId: "polar_elite_patio", programId,
    catalogVersion: QUOTE_V2_CATALOG_VERSION, catalogAsOf: "2026-09-14",
    widthInches: 60, heightInches: 60, quantity: 1,
    configuration: { fabric_collection: fabric, polar_exterior_guide_type: "cable_guide" }, options: {},
  };
}

describe("Polar authoritative manufacturer routing", () => {
  it("uses product-specific readiness rather than blocking the whole manufacturer", () => {
    expect(productRuleStatusForSelection(exterior())).toBe("documented_limited");
    expect(productRuleStatusForSelection({ ...exterior(), productId: "polar_interior_roller" })).toBe("restriction_source_incomplete");
    expect(productRuleStatusForSelection({ ...exterior(), productId: "polar_tension_shade" })).toBe("manual_quote_required");
  });

  it("rejects a stale cheaper exterior group and unknown fabrics", () => {
    expect(validateSelection(exterior("group_1")).map(x => x.ruleId)).toContain("polar.exterior.fabric.program_mismatch");
    expect(validateSelection(exterior("group_5", "unknown")).map(x => x.ruleId)).toContain("polar.exterior.fabric.required");
    expect(validateSelection(exterior()).filter(x => x.ruleId.startsWith("polar.exterior.fabric"))).toEqual([]);
  });

  it("rejects incompatible Polar fabric and group even through the legacy engine", () => {
    expect(priceDesign({ productId: "polar_elite_patio", programId: "group_1", fabric: "Phifer SunTex 95", widthInches: 60, heightInches: 60 })).toMatchObject({ ok: false, code: "PROGRAM_NOT_RESOLVED" });
  });

  it("populates a complete interior grid price while retaining restriction-source status", () => {
    const selection: SelectionContext = {
      ...exterior("group_2"), productId: "polar_interior_roller", widthInches: 30, heightInches: 48,
      configuration: { fabric_collection: "SunTex 80 25%", polar_interior_fabric_orientation: "standard", lift_system: "manual_clutch" },
    };
    const result = priceQuoteV2Selection({ selection, priceInput: { productId: selection.productId, programId: "group_2", widthInches: 30, heightInches: 48 } });
    expect(result).toMatchObject({ ok: true, productStatus: "restriction_source_incomplete", matchedWidth: 30, matchedHeight: 48 });
  });
});
