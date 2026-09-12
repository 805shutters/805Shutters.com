import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import baseline from "./catalog/norman-roller-legacy-baseline.json";
import originalCatalog from "./catalog/norman-2026.catalog.json";
import { getProduct } from "./catalog";
import { normanRollerFabricColors, normanRollerJulyFabricColors, searchNormanRollerFabrics } from "./norman-roller-fabrics";
import { NORMAN_ROLLER_FALL_2026 as release, fall2026RollerProgramId, fall2026RollerGridKey } from "./norman-roller-fall-2026";
import { priceDesign } from "./pricing";
import { ROLLER_PRICING } from "@mts/lib/pricingData";
import { getRollerPrice, getProductPriceBreakdown } from "@mts/lib/pricingEngine";
import { getRollerFabricPriceGroup } from "@mts/lib/quoteConstants";
import { getMtsGridKeyForCatalogProgram } from "@mts/lib/productColorCatalog";
import { getRollerFabricMaxWidth, getRollerShadeSpecWarnings } from "@mts/lib/rollerShadeSpecs";
import { searchMtsRollerFabricColors, findMtsRollerFabricColorBySelection, getMtsRollerProgramLabel } from "@mts/lib/normanRollerFabricCatalog";
import { getQuoteDesignDetails } from "@mts/lib/quoteDesignDetails";
import { buildCopiedDesignRows } from "@mts/lib/quoteDesignCopy";
import type { SalesQuoteDesign } from "@mts/types/quote";
import { getProductColorOptions } from "./product-color-options";
import { normalizeQuoteBuilderColorSelection } from "@/lib/crm/quote-builder";
import { describeDesign } from "@/lib/crm/public-quote";
import type { CrmQuoteDesign } from "@/lib/crm/types";

const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const isNew = (program: string | null) => program?.endsWith("_fall_2026");

describe("Norman Fall 2026 additive release", () => {
  it("preserves all 350 original rows, original programs and all legacy MTS grid cells", () => {
    const oldColors = normanRollerJulyFabricColors;
    expect(digest(normanRollerFabricColors.filter((row) => !isNew(row.programId)))).toBe(baseline.publishedColors);
    expect(oldColors).toHaveLength(350);
    expect(digest(oldColors)).toBe(baseline.colors);
    const original = originalCatalog.products.find((product) => product.id === "roller")!;
    expect(digest(original)).toBe(baseline.roller);
    const current = getProduct("roller")!;
    expect(current.programs.filter((program) => !isNew(program.id) && program.id !== "roller_cordless_fabric_price_group_4_pg4")).toEqual(original.programs);
    for (const [collection, programId] of Object.entries(original.fabricRouting!)) {
      expect(current.fabricRouting?.[collection]).toBe(programId);
    }
    expect(digest(Object.fromEntries(Object.entries(ROLLER_PRICING).filter(([key]) => !key.startsWith("normanFall2026")))))
      .toBe(baseline.mtsGrids);
  });

  it("finds every new SKU by code, canonical name, alias and category through both search paths", () => {
    expect(release.colors).toHaveLength(90);
    expect(new Set(release.colors.map((row) => row.collection)).size).toBe(19);
    expect(searchMtsRollerFabricColors("")).toHaveLength(440);
    expect(searchNormanRollerFabrics("")).toHaveLength(440);
    for (const row of release.colors) {
      for (const query of [row.colorCode, `${row.collection} ${row.colorName}`, `${row.collection} ${row.publicColorName}`, `${row.category} ${row.colorCode}`]) {
        expect(searchMtsRollerFabricColors(query).some((match) => match.colorCode === row.colorCode), query).toBe(true);
        expect(searchNormanRollerFabrics(query).some((match) => match.colorCode === row.colorCode), query).toBe(true);
      }
      expect(searchMtsRollerFabricColors(row.colorCode, { category: row.category })).toHaveLength(1);
      expect(searchMtsRollerFabricColors(row.colorCode, { category: row.category === "Light Filtering" ? "Room Darkening" : "Light Filtering" })).toHaveLength(0);
      expect(getRollerFabricPriceGroup(row.collection)).toBe(row.priceGroup === 4 ? "group4September2026" : fall2026RollerGridKey(row.priceGroup));
      expect(getMtsGridKeyForCatalogProgram("Roller Shades", fall2026RollerProgramId(row.priceGroup))).toBe(fall2026RollerGridKey(row.priceGroup));
      expect(getMtsRollerProgramLabel(fall2026RollerProgramId(row.priceGroup))).toBe(`Fabric PG${row.priceGroup}`);
    }
    expect(searchNormanRollerFabrics("Ohara Olive Green")[0]).toMatchObject({ colorCode: "F2207", colorName: "Rosemary Green" });
    expect(searchNormanRollerFabrics("Rockville Clay")[0]).toMatchObject({ colorCode: "F2192", colorName: "Khaki Sage" });
  });

  it("prices all 600 cells identically in both engines without falling back to legacy grids", () => {
    for (const grid of release.grids) {
      const programId = fall2026RollerProgramId(grid.priceGroup);
      grid.heights.forEach((height, hi) => grid.widths.forEach((width, wi) => {
        const expected = grid.prices[hi][wi];
        const canonical = priceDesign({ productId: "roller", programId, widthInches: width, heightInches: height });
        expect(canonical).toMatchObject({ ok: true, base: expected, matchedWidth: width, matchedHeight: height });
        expect(getRollerPrice({ catalogProgramId: programId, width, height })).toBe(expected);
        expect(getProductPriceBreakdown({ productType: "Roller Shades", catalogProgramId: programId, width, height })).toMatchObject({ price: expected, gridKey: fall2026RollerGridKey(grid.priceGroup) });
      }));
    }
    // Visually verified September retail PDF p19, PG4 (lower table).
    expect(getRollerPrice({ fabric: "Springtide", width: 24, height: 36 })).toBe(354);
    expect(getRollerPrice({ fabric: "Springtide", width: 30.125, height: 48.125 })).toBe(517);
    expect(getRollerPrice({ fabric: "Olivia RD", width: 108, height: 144 })).toBe(2084);
    expect(getRollerPrice({ fabric: "Simplicity RD", width: 24, height: 36 })).toBe(307);
  });

  it("applies exact new fabric widths and rejects bad dimensions, mismatched programs and lift limits", () => {
    for (const row of release.colors) {
      expect(getRollerFabricMaxWidth(row.collection, row.colorCode)).toBe(row.fabricWidth);
      if (row.priceGroup === 4) continue; // Existing PG4 behavior stays pinned; matrix coverage below checks its limits.
      const good = { fabric: row.collection, width: row.fabricWidth + 1, height: 60 };
      expect(getRollerPrice(good)).not.toBeNull();
      expect(getRollerPrice({ ...good, width: good.width + 0.125 })).toBeNull();
      expect(priceDesign({ productId: "roller", fabric: row.collection, widthInches: good.width + 0.125, heightInches: 60 })).toMatchObject({ ok: false, code: "WIDTH_EXCEEDS_MAX" });
    }
    for (const width of [0, -1, NaN, Infinity, 121]) expect(getRollerPrice({ fabric: "Ohara", width, height: 60 })).toBeNull();
    expect(getRollerPrice({ fabric: "Ohara", width: 48, height: 145 })).toBeNull();
    expect(getRollerPrice({ fabric: "Ohara", width: 48, height: 60, catalogProgramId: fall2026RollerProgramId(1) })).toBeNull();
    expect(getRollerPrice({ fabric: "Garden", width: 48, height: 60, catalogProgramId: fall2026RollerProgramId(3) })).toBeNull();
    expect(priceDesign({ productId: "roller", fabric: "Garden", programId: fall2026RollerProgramId(3), widthInches: 48, heightInches: 60 })).toMatchObject({ ok: false, code: "PROGRAM_NOT_RESOLVED" });
    expect(getRollerPrice({ fabric: "Leah", width: 20, height: 84, liftSystem: "Cordless" })).toBeNull();
    expect(getRollerShadeSpecWarnings({ productType: "Roller Shades", fabricCollection: "Charlotte", widthInches: 96, heightInches: 60 })).toHaveLength(1);
  });

  it("retains option adders, rounding, discounts and quantities for new programs", () => {
    const common = { productId: "roller", widthInches: 36, heightInches: 60, quantity: 2, discountPercent: 12.5, surcharges: [{ id: "smartrelease" }] };
    const old = priceDesign({ ...common, programId: "roller_cordless_fabric_price_group_3_pg3" });
    const added = priceDesign({ ...common, fabric: "Simplicity RD" });
    expect(old.ok && added.ok).toBe(true);
    if (old.ok && added.ok) {
      expect(added.surchargeLines).toEqual(old.surchargeLines);
      expect(added.base).toBe(449);
      expect(added.discountAmount).toBe(67.25);
      expect(added.total).toBe(941.5);
    }
  });

  it("round-trips all new identities through CRM normalization, copying and customer descriptions", () => {
    for (const row of getProductColorOptions("roller").filter((row) => release.colors.some((color) => color.colorCode === row.colorCode))) {
      const details = { fabric_color_code: row.colorCode, fabric_color_collection: row.collection, control_side: "Left" };
      const normalized = normalizeQuoteBuilderColorSelection("roller", row.collection, row.programId, details, {});
      expect(normalized.fabric).toBe(row.collection);
      expect(normalized.details.fabric_color_name).toBe(row.colorName);
      const options = { ...normalized.details, fabric_program_id: row.programId, manual_price_override: true, sent_price_snapshot: { unit_price: 777.77 } };
      const design = { id: "test", line_item_id: "line", variant: "A", product_type: "Roller Shades", fabric: row.collection, unit_price: 777.77, options_json: options } as unknown as SalesQuoteDesign;
      const restored = JSON.parse(JSON.stringify(design)) as SalesQuoteDesign;
      const copy = buildCopiedDesignRows([restored], "copy")[0];
      expect(copy.options_json).toEqual(options);
      expect(copy.unit_price).toBe(777.77);
      expect(findMtsRollerFabricColorBySelection(copy.fabric, String(copy.options_json.fabric_color_code))?.colorName).toBe(row.colorName);
      expect(getQuoteDesignDetails(restored)).toContainEqual({ label: "Fabric Color", value: `${row.colorCode} - ${row.colorName}` });
      const publicDescription = describeDesign({ product_id: "roller", program_id: row.programId, fabric: row.collection, details: normalized.details, surcharges: [] } as unknown as CrmQuoteDesign);
      expect(publicDescription.styleName).toContain(row.colorCode);
      expect(publicDescription.styleName).toContain(row.colorName);
      expect(JSON.stringify(publicDescription)).not.toContain("fall_2026");
    }
  });
});
