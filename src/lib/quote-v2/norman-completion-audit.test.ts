import { describe, expect, it } from "vitest";
import { writeFileSync } from "node:fs";
import { getDetailFieldsForProduct, getMotorizationGroupsForProduct } from "@/lib/quote/product-options";
import { catalog, getProgram, getProduct } from "@/lib/quote/catalog";
import { productColorOptions } from "@/lib/quote/product-color-options";
import { expectedHoneycombProgramId, QUOTE_V2_PRODUCT_STATUS } from "./catalog";
import { normanHoneycombV2Source } from "./generated/norman-honeycomb-v2.generated";
import { QUOTE_V2_SOURCE_MANIFEST } from "./source-manifest";

const products = catalog.products.filter(p => p.manufacturer?.toLowerCase() === "norman");
const productIds = products.map(p => p.id);
const colors = productColorOptions.filter(c => productIds.includes(c.productId));
const honeycombCellRoutes = normanHoneycombV2Source.activeColors.flatMap(c => c.cellSizes.map(cell => ({ collection:c.family, code:c.customerColorCode, color:c.colorName, cell, programId:expectedHoneycombProgramId(c.family,c.customerColorCode,cell) })));

describe("Norman catalog coverage ledger", () => {
  it("accounts for every imported family, program and retained color identity", () => {
    expect(products).toHaveLength(25);
    expect(products.flatMap(p => p.programs)).toHaveLength(60);
    for (const id of ["norman_roller_valance_only", "norman_roller_separate_valance", "norman_ultimate_faux_valance_only", "norman_smartprivacy_valance_only", "norman_roman_fabric_by_yard", "norman_roman_pillow_covers", "norman_smartdrape_replacement_vanes"]) {
      expect(getProduct(id)?.priceBasis).toBe("manual_required");
      expect(getProduct(id)?.programs[0].grid.prices).toEqual([]);
    }
    const replacement = getProduct("norman_smartdrape_replacement_vanes")!;
    expect(replacement.productType).toBe("Vane Packs");
    expect(replacement.programs[0].sourceId).toBe("norman-perfectsheer-smartdrape-guide-2026-09");
    expect(replacement.programs[0].sourcePages).toEqual([24]);
    expect(replacement.customerRetailStatus).toBe("unverified");
    expect(QUOTE_V2_PRODUCT_STATUS[replacement.id]).toBe("manual_quote_required");
    expect(new Set(colors.map(c => c.id)).size).toBe(colors.length);
    for (const color of colors) {
      expect(color.sourcePage || color.sourceNote, color.id).toBeTruthy();
      if (color.programId) expect(getProgram(getProduct(color.productId)!, color.programId), color.id).toBeDefined();
    }
    if (process.env.NORMAN_AUDIT_EXPORT) writeFileSync(process.env.NORMAN_AUDIT_EXPORT, JSON.stringify({products, colors, honeycombCellRoutes, optionFields:Object.fromEntries(products.map(p=>[p.id,getDetailFieldsForProduct(p.id)])), motorization:catalog.motorization, motorGroups:Object.fromEntries(products.map(p=>[p.id,getMotorizationGroupsForProduct(p.id)])), status:QUOTE_V2_PRODUCT_STATUS, sources:QUOTE_V2_SOURCE_MANIFEST.filter(s => s.manufacturer.toLowerCase()==="norman")}, null, 2));
  });
  it("routes every source-listed Honeycomb color and cell to an existing grid", () => {
    for (const row of honeycombCellRoutes) {
      expect(row.programId, JSON.stringify(row)).toBeTruthy();
      expect(getProgram(getProduct("honeycomb")!, row.programId!), JSON.stringify(row)).toBeDefined();
    }
  });
  it("retains incomplete families as exceptions until their evidence is closed", () => {
    for (const id of ["norman_shutters", "vertical_honeycomb", "smartfold", "perfectsheer", "smartdrape", "wood_blinds", "citylights_aluminum", "palladian_shelf"]) {
      expect(QUOTE_V2_PRODUCT_STATUS[id]).not.toBe("complete");
    }
  });
});
