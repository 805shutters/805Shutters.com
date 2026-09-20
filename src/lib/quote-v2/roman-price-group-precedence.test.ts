import { findRomanFrontColor } from './catalog';
import { getProductColorOptions } from '@/lib/quote/product-color-options';
import { describe, expect, it } from "vitest";
import { normanRomanDealerFabricRows } from "@/lib/quote/norman-roman-dealer-fabrics.generated";
import { ROMAN_JULY_PRICE_GROUP_CONFLICTS } from "./roman-price-group-precedence";

describe("Roman July 2026 price-group source precedence", () => {
  it("routes the two current dealer-confirmed corrections to group2 while retaining July history",()=>{
    for(const [collection,code] of [["Sheer Elegance","F1085"],["Valencia","F0255"]]){
      expect(findRomanFrontColor(collection,code,"2026-09-18")?.priceGroup).toBe("group1");
      expect(findRomanFrontColor(collection,code,"2026-09-19")?.priceGroup).toBe("group2");
      expect(getProductColorOptions("roman").find(c=>c.colorCode===code)?.programId).toBe("roman_cordless_usa_price_group_2_pg2");
    }
  });
  it("exposes current Caroline styles without rewriting imported historical fabric rows",()=>{
    const current=["Flat Fold without Seams","Flat Fold with Batten Back","Soft Fold"];
    expect(getProductColorOptions("roman").find(c=>c.colorCode==="F1090")?.romanStyles).toEqual(current);
    expect(findRomanFrontColor("Caroline","F1090","2026-09-20")?.styles).toEqual(current);
    expect(findRomanFrontColor("Caroline","F1090","2026-09-19")?.styles).toEqual(["Flat Fold with Batten Back"]);
  });
  it("pins all ten guide-versus-price-book conflicts", () => {
    expect(ROMAN_JULY_PRICE_GROUP_CONFLICTS).toHaveLength(10);
    expect(
      ROMAN_JULY_PRICE_GROUP_CONFLICTS.map(
        ({ collection, colorCode, romanGuidePriceGroup, julyRetailPriceGroup }) =>
          `${collection}|${colorCode}|${romanGuidePriceGroup}->${julyRetailPriceGroup}`,
      ),
    ).toEqual([
      "Sheer Elegance|F1085|group2->group1",
      "Valencia|F0255|group2->group1",
      "Sierra|F1916|group3->group2",
      "Sierra|F1917|group3->group2",
      "Sierra|F1918|group3->group2",
      "Sierra|F1919|group3->group2",
      "Sierra|F1920|group3->group2",
      "Sierra|F1921|group3->group2",
      "Sierra|F1922|group3->group2",
      "Sierra|F1923|group3->group2",
    ]);
  });

  it("uses the newer July Retail Guide assignment in the selectable catalog", () => {
    for (const conflict of ROMAN_JULY_PRICE_GROUP_CONFLICTS) {
      const catalogRow = normanRomanDealerFabricRows.find(
        (row) =>
          row.collection === conflict.collection &&
          row.colorCode === conflict.colorCode,
      );
      expect(
        catalogRow,
        `${conflict.collection} ${conflict.colorCode} must exist`,
      ).toBeDefined();
      expect(catalogRow?.priceGroup).toBe(conflict.julyRetailPriceGroup);
      expect(conflict.pricingSource.sourceId).toBe(
        "norman-retail-guide-2026-07",
      );
    }
  });
});
