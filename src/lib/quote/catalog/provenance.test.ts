import { describe, expect, it } from "vitest";
import { getCatalogPricingProvenance } from "./index";

describe("legacy catalog pricing provenance", () => {
  it("uses pinned Norman catalog metadata without inventing a guide date", () => {
    const provenance = getCatalogPricingProvenance(
      "roman",
      "roman_roman_shades_price_group_1_pg1",
    );
    expect(provenance?.source).toContain("2026Jul Retail Price Guide");
    expect(provenance?.sourceVersion).toContain("roman");
    expect(provenance?.sourceVersion).toContain("2026-07-01");
  });

  it("keeps Onyx source limitations in the saved provenance", () => {
    const provenance = getCatalogPricingProvenance("onyx_shutters");
    expect(provenance?.source).toContain("restrictions remain unverified");
    expect(provenance?.sourceVersion).toContain("onyx_shutters");
  });

  it("does not label an unknown product with another catalog source", () => {
    expect(getCatalogPricingProvenance("missing_product")).toBeNull();
  });
});
