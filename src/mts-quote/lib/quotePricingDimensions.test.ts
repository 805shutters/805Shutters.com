import { describe, expect, it } from "vitest";
import type { SalesQuoteDesign, SalesQuoteLineItem } from "@mts/types/quote";
import { formatQuoteDesignDimensions } from "./quotePricingDimensions";
import { emptyReplacementRequest, SMARTDRAPE_REPLACEMENT, SMARTDRAPE_REPLACEMENT_RECORD } from "@/lib/quote/norman-smartdrape-replacement";

const empty = { width_whole: 0, width_fraction: "0", height_whole: 0, height_fraction: "0" } as SalesQuoteLineItem;
const design = (product: string, record?: unknown) => ({ supplier: "Norman", options_json: { catalog_product_id: product, norman_roman_ancillary_v1: record } }) as unknown as SalesQuoteDesign;
describe("contract pricing dimensions", () => {
  it("distinguishes replacement pack shade length from finished vane length", () => {
    const replacement = design(SMARTDRAPE_REPLACEMENT);
    replacement.options_json[SMARTDRAPE_REPLACEMENT_RECORD] = { ...emptyReplacementRequest(), shadeLengthInches: 72, vaneLengthInches: 69 };
    expect(formatQuoteDesignDimensions(empty, replacement)).toBe("72 inch shade length · 6 per pack");
  });
  it("uses a fabric cut's yards without requiring a window width and height", () => {
    expect(formatQuoteDesignDimensions(empty, design("norman_roman_fabric_by_yard", { version: 1, kind: "yardage", colorCode: "F1599", yards: 3 }))).toBe("3 yards per cut");
  });
  it("uses the pillow cover size", () => {
    expect(formatQuoteDesignDimensions(empty, design("norman_roman_pillow_covers", { version: 1, kind: "pillow_cover", colorCode: "F1051", size: "24x24", edge: "piping", pattern: "standard" }))).toBe("24 × 24 inch cover");
  });
  it("keeps missing and mismatched ancillary units missing", () => {
    expect(formatQuoteDesignDimensions(empty, design("norman_roman_pillow_covers"))).toBeNull();
    expect(formatQuoteDesignDimensions(empty, design("norman_roman_pillow_covers", { version: 1, kind: "yardage", colorCode: "F1599", yards: 3 }))).toBeNull();
  });
  it("shows width-only shelves without a false missing-height warning", () => {
    expect(formatQuoteDesignDimensions({ ...empty, width_whole: 48, width_fraction: "1/2" }, design("palladian_shelf"))).toBe('48 1/2" wide');
  });
  it("preserves opening dimensions and other manufacturers", () => {
    expect(formatQuoteDesignDimensions(empty, design("roman"))).toBeNull();
    expect(formatQuoteDesignDimensions({ ...empty, width_whole: 36, height_whole: 60 }, design("roman"))).toBe('36" × 60"');
    expect(formatQuoteDesignDimensions(empty, { ...design("palladian_shelf"), supplier: "Onyx" })).toBeNull();
  });
});
