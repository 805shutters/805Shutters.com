import { describe, expect, it } from "vitest";
import { sundanceCellularColors, sundanceCellularSource } from "./cellular-assortment";
import { lookupSundanceSourceGrid, sundanceCatalog } from "./catalog";
import { getProductColorOptions, findProductColorOption } from "../product-color-options";
import { buildUiCatalog } from "../ui-catalog";
import { priceDesign } from "../pricing";
import { getMtsGridKeyForCatalogProgram, getMtsProductColorRows, findMtsProductColorById } from "@mts/lib/productColorCatalog";
import { getMtsProductColorRows as legacyRows } from "@/mts-quote-v1/lib/productColorCatalog";

describe("Sundance exact cellular assortment", () => {
  it("accounts for all 148 source identities without borrowing Norman codes or grids", () => {
    const rows = getProductColorOptions("sundance_cellular");
    expect(rows).toHaveLength(148);
    expect(new Set(rows.map(r => r.id)).size).toBe(148);
    expect(new Set(rows.map(r => r.colorCode)).size).toBe(148);
    for (const row of rows) {
      const source = sundanceCellularSource.rows.find(s => s.code === row.colorCode)!;
      expect(source).toBeDefined();
      expect(row.programId).toBe(`sundance_cellular_p${6 + Number(source.priceGroup)}_t1`);
      expect(getMtsGridKeyForCatalogProgram("Honeycomb Shades", row.programId)).toBe(row.programId);
      expect(sundanceCatalog.products.find(p => p.id === row.productId)?.fabricRouting?.[row.colorCode]).toBe(row.programId);
      expect(lookupSundanceSourceGrid(row.productId, row.programId!, 36, 60)).not.toBeNull();
      expect(findProductColorOption(row.productId, JSON.parse(JSON.stringify(row)).id)).toEqual(row);
    }
    expect(buildUiCatalog().products.find(p=>p.id==="sundance_cellular")?.fabricColors).toHaveLength(148);
  });

  it.each([
    ["PS41RA-023", "3", 626], ["PS42RA-023", "5", 785],
    ["PS47K0-001", "3", 626], ["PS410-001FR", "5", 785],
    ["PU422SS-766", "4", 690],
  ])("matches current dealer comparison %s, including printed-heading conflicts", (code, group, retail) => {
    const row=sundanceCellularColors.find(r=>r.colorCode===code)!;
    expect(row).toBeDefined();
    expect(sundanceCellularSource.rows.find(r=>r.code===code)?.priceGroup).toBe(group);
    expect(lookupSundanceSourceGrid(row.productId,row.programId!,36,60)?.sourceRetail).toBe(retail);
  });

  it.each([getMtsProductColorRows, legacyRows])("keeps Sundance identities across both saved editors and filters source cell/opacity", getRows => {
    const options = {quote_v2_backend:true,catalog_product_id:"sundance_cellular"};
    expect(getRows("Honeycomb Shades",options)).toHaveLength(148);
    const filtered=getRows("Honeycomb Shades",{...options,cell_size:'3/4"',light_control:"Blackout"});
    expect(filtered.length).toBeGreaterThan(0);
    expect(filtered.every(r=>r.automaticDetails.cell_size==='3/4"' && r.fabricType.includes("Blackout"))).toBe(true);
    expect(filtered.every(r=>r.programId?.startsWith("sundance_cellular_"))).toBe(true);
    expect(getRows("Honeycomb Shades",{...options,cell_size:'1/2"'})).toEqual([]);
    const selected=filtered.find(r=>r.colorCode==="PU422SS-766")!;
    expect(findMtsProductColorById("Honeycomb Shades",JSON.parse(JSON.stringify({...options,fabric_product_id:selected.productId})),selected.id)?.programId).toBe("sundance_cellular_p10_t1");
  });

  it("keeps account pricing gated until configuration and terms are certified", () => {
    expect(priceDesign({productId:"sundance_cellular",programId:"sundance_cellular_p9_t1",widthInches:36,heightInches:60})).toMatchObject({ok:false,code:"MANUAL_PRICE_REQUIRED"});
  });
});
