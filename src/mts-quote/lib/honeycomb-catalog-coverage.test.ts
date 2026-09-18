import { describe, expect, it } from "vitest";
import { normanHoneycombV2Source } from "@/lib/quote-v2/generated/norman-honeycomb-v2.generated";
import { expectedHoneycombProgramId, quoteV2CatalogVersionFor } from "@/lib/quote-v2/catalog";
import { priceQuoteV2Selection } from "@/lib/quote-v2/engine";
import { HONEYCOMB_LIGHT_CONTROL } from "./quoteConstants";
import { getMtsProductColorRows } from "./productColorCatalog";
import { getMtsProductColorRows as getV1Rows } from "@/mts-quote-v1/lib/productColorCatalog";

// Independent input is the manufacturer workbook, not the picker's own list.
const offerings = normanHoneycombV2Source.activeColors.flatMap(color =>
  color.cellSizes.map(cell => ({ color, cell })),
);

describe("every current Honeycomb workbook offering reaches its correct grid", () => {
  for (const [engine, rowsFor] of [["current", getMtsProductColorRows], ["v1", getV1Rows]] as const) {
    it(`${engine}: all 191 colors survive an offered light-control filter at every supported cell size`, () => {
      expect(normanHoneycombV2Source.activeColors).toHaveLength(191);
      for (const { color, cell } of offerings) {
        const found = HONEYCOMB_LIGHT_CONTROL.flatMap(light_control => rowsFor("Honeycomb Shades", {
          quote_v2_backend: true, cell_size: cell, light_control,
        })).filter(row => row.colorCode === color.customerColorCode || row.colorCode === color.factoryColorCode);
        expect(found.length, `${color.family} ${color.customerColorCode} ${cell}`).toBeGreaterThan(0);
        expect(new Set(found.map(row => row.programId))).toEqual(new Set([
          expectedHoneycombProgramId(color.family, color.customerColorCode, cell),
        ]));
      }
    });
    it(`${engine}: Woven offers only Windsong/Breeze and respects unsupported cells`, () => {
      const rows = rowsFor("Honeycomb Shades", { quote_v2_backend: true, cell_size: '3/4" Single Cell', light_control: "Woven" });
      expect(rows).toHaveLength(13);
      expect(rows.every(row => /Windsong|Breeze/.test(row.collection))).toBe(true);
      expect(rowsFor("Honeycomb Shades", { quote_v2_backend: true, cell_size: '9/16" Single Cell', light_control: "Woven" })).toEqual([]);
    });
  }
  it("prices every restored Woven color/cell through authoritative validation", () => {
    for (const {color,cell} of offerings.filter(({color}) => /Windsong|Breeze/.test(color.family))) {
      const programId = expectedHoneycombProgramId(color.family, color.customerColorCode, cell)!;
      const result = priceQuoteV2Selection({
        selection: {manufacturerId:"norman",productId:"honeycomb",programId,
          catalogVersion:quoteV2CatalogVersionFor("honeycomb","2026-09-17"),catalogAsOf:"2026-09-17",
          widthInches:36,heightInches:60,quantity:1,options:{},configuration:{
            mount_type:"Inside Mount",application:"Standard Horizontal",lift_system:"Woven Cordless",
            cell_size:cell,fabric_collection:color.family,fabric_color_code:color.customerColorCode,light_control:"Woven",
          }},
        priceInput:{productId:"honeycomb",programId,widthInches:36,heightInches:60},
      });
      expect(result.ok, `${color.customerColorCode} ${cell}: ${JSON.stringify(result)}`).toBe(true);
    }
  });
});
