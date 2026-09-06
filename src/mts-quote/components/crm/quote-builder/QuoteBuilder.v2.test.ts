import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import {
  changeLineItemProductTypeWithRollback,
  invalidateOptimisticV2Design,
  ProductTypeChangeRollbackError,
} from "./QuoteBuilder";

const quoteBuilderSource = readFileSync(
  fileURLToPath(new URL("./QuoteBuilder.tsx", import.meta.url)),
  "utf8",
);

describe("V2 quote builder load integrity", () => {
  it("never renders a missing sales quote as an empty saved quote", () => {
    expect(quoteBuilderSource).toContain("isError: isQuoteLoadError");
    expect(quoteBuilderSource).toContain("isError: isLineItemsLoadError");
    expect(quoteBuilderSource).toContain("isError: isDesignsLoadError");
    expect(quoteBuilderSource).toContain("Quote could not be opened safely");
    expect(quoteBuilderSource).toContain("No empty");
    expect(quoteBuilderSource).toContain("quote was created and no price was changed.");
  });

  it("keeps customer delivery and payment-link actions visibly blocked for V2", () => {
    expect(quoteBuilderSource).toContain(
      "disabled={isolated || authoritativeV2}",
    );
    expect(quoteBuilderSource).toContain(
      "Quote V2 delivery is blocked until the protected customer-send cutover",
    );
    expect(quoteBuilderSource).toContain(
      "Quote V2 payment links are blocked until customer delivery is cut over",
    );
  });

  it("derives the protected V2 mutation runtime from the persisted quote row", () => {
    expect(quoteBuilderSource).toContain(
      "runtimeServerOwnedV2 || quote?.quote_v2_backend === true",
    );
    expect(quoteBuilderSource).toContain(
      "runtimeAuthoritativeV2 || quote?.quote_v2_backend === true",
    );
    expect(quoteBuilderSource).toContain(
      "authoritativeV2={authoritativeV2}",
    );
  });

  it("keeps a historical line price after V2 copy operations replace the design ID", () => {
    expect(quoteBuilderSource).toContain(
      "const lineUnitPrice = priceLock.lineUnitPrices[lineItemId]",
    );
    expect(quoteBuilderSource).toContain(
      "priceLock.designUnitPrices[design.id] ?? lineUnitPrice",
    );
  });


  it("keeps the selected catalog identity on a newly created line and refreshes its design", () => {
    expect(quoteBuilderSource).toMatch(
      /buildCatalogSelectionPatch\(\s*\{\},\s*item\.catalog_product,?\s*\)/,
    );
    expect(quoteBuilderSource).toMatch(
      /sales_quote_designs[\s\S]*product_type:\s*item\.product_type,[\s\S]*\.\.\.catalogSelectionPatch/,
    );
    expect(quoteBuilderSource).toMatch(
      /onSuccess:\s*async\s*\(createdDesign\)\s*=>\s*\{[\s\S]*await queryClient\.invalidateQueries\(\{[\s\S]*queryKey:\s*lineItemsQueryKey[\s\S]*queryClient\.setQueryData<SalesQuoteDesign\[]>\(designsQueryKey[\s\S]*queryKey:\s*quoteQueryKey/,
    );
  });
});

describe("V2 quote builder optimistic pricing", () => {
  it("removes the previous authoritative amount while a changed selection reprices", () => {
    const next = invalidateOptimisticV2Design(
      {
        id: "design-a",
        line_item_id: "line-1",
        variant: "A",
        lift_system: "Cordless",
        unit_price: 246,
        options_json: {
          quote_v2_backend: true,
          authoritative_price_status: "ok",
          authoritative_price_breakdown: { ok: true, unitPrice: 246 },
          authoritative_cost_breakdown: { ok: true, wholesaleTotal: 98.4 },
          authoritative_v2_snapshot: { priceStatus: "authoritative" },
          priced_selection_fingerprint: "old-fingerprint",
          priced_catalog_version: "old-catalog",
          base_price: 246,
          surcharge_total: 0,
          fabric_color_code: "F1484",
        },
      },
      {
        lift_system: "Motorized",
        options_json: {
          quote_v2_backend: true,
          fabric_color_code: "F1484",
          power_configuration: null,
        },
      },
    );

    expect(next.unit_price).toBe(0);
    expect(next.lift_system).toBe("Motorized");
    expect(next.options_json).toMatchObject({
      quote_v2_backend: true,
      fabric_color_code: "F1484",
      power_configuration: null,
      authoritative_price_status: "stale",
    });
    expect(next.options_json).not.toHaveProperty("authoritative_price_breakdown");
    expect(next.options_json).not.toHaveProperty("authoritative_cost_breakdown");
    expect(next.options_json).not.toHaveProperty("authoritative_v2_snapshot");
    expect(next.options_json).not.toHaveProperty("priced_selection_fingerprint");
    expect(next.options_json).not.toHaveProperty("base_price");
  });

  it("treats a supplied options_json as a clean replacement instead of resurrecting hidden state", () => {
    const next = invalidateOptimisticV2Design(
      {
        id: "design-a",
        line_item_id: "line-1",
        variant: "A",
        unit_price: 757.5,
        options_json: {
          quote_v2_backend: true,
          quote_lab_product_id: "roller",
          catalog_product_id: "roller",
          fabric_program_id: "roller_old_program",
          fabric_color_code: "F1484",
          power_configuration: "Automate ARC Motor",
          motorization_selections: [
            {
              groupId: "automate_home",
              optionId: "motor_rechargeable_battery_pack",
              role: "base_motor",
              units: 1,
            },
          ],
          authoritative_v2_snapshot: { priceStatus: "authoritative" },
        },
      },
      {
        supplier: "Norman",
        material: '2" & 2 1/2" Slats Cordless',
        options_json: {
          quote_v2_backend: true,
          quote_lab_product_id: "smartprivacy_faux",
          catalog_product_id: "smartprivacy_faux",
          quote_lab_program_id: "smartprivacy_faux_2in_and_2_1_2in_slats_cordless",
          catalog_program_id: "smartprivacy_faux_2in_and_2_1_2in_slats_cordless",
          motorization_selections: [],
        },
      },
    );

    expect(next.options_json).toMatchObject({
      quote_lab_product_id: "smartprivacy_faux",
      catalog_product_id: "smartprivacy_faux",
      motorization_selections: [],
      authoritative_price_status: "stale",
    });
    expect(next.options_json).not.toHaveProperty("fabric_program_id");
    expect(next.options_json).not.toHaveProperty("fabric_color_code");
    expect(next.options_json).not.toHaveProperty("power_configuration");
    expect(next.options_json).not.toHaveProperty("authoritative_v2_snapshot");
  });
});

describe("product type transition rollback", () => {
  it("updates the category and clears its old designs on success", async () => {
    const productTypeWrites: string[] = [];
    const updateProductType = vi.fn(async (productType: string) => {
      productTypeWrites.push(productType);
      return null;
    });
    const deleteDesigns = vi.fn(async () => null);

    await changeLineItemProductTypeWithRollback({
      lineItemId: "line-1",
      previousProductType: "Roller Shades",
      nextProductType: "Roman Shades",
      updateProductType,
      deleteDesigns,
    });

    expect(productTypeWrites).toEqual(["Roman Shades"]);
    expect(deleteDesigns).toHaveBeenCalledTimes(1);
  });

  it("restores the known prior category and preserves the cleanup error", async () => {
    const cleanupError = new Error("design delete failed");
    const productTypeWrites: string[] = [];
    const updateProductType = vi.fn(async (productType: string) => {
      productTypeWrites.push(productType);
      return null;
    });

    const transition = changeLineItemProductTypeWithRollback({
      lineItemId: "line-1",
      previousProductType: "Roller Shades",
      nextProductType: "Roman Shades",
      updateProductType,
      deleteDesigns: vi.fn(async () => cleanupError),
    });

    await expect(transition).rejects.toBe(cleanupError);
    expect(productTypeWrites).toEqual(["Roman Shades", "Roller Shades"]);
  });

  it("reports both the cleanup and rollback errors when compensation fails", async () => {
    const cleanupError = new Error("design delete failed");
    const rollbackError = new Error("line rollback failed");
    const productTypeWrites: string[] = [];
    const updateProductType = vi.fn(async (productType: string) => {
      productTypeWrites.push(productType);
      return productType === "Roller Shades" ? rollbackError : null;
    });

    const transition = changeLineItemProductTypeWithRollback({
      lineItemId: "line-1",
      previousProductType: "Roller Shades",
      nextProductType: "Roman Shades",
      updateProductType,
      deleteDesigns: vi.fn(async () => cleanupError),
    });

    await expect(transition).rejects.toMatchObject({
      name: "ProductTypeChangeRollbackError",
      cleanupError,
      rollbackError,
      cause: cleanupError,
      message: expect.stringContaining("Rollback to Roller Shades also failed"),
    });
    await expect(transition).rejects.toBeInstanceOf(
      ProductTypeChangeRollbackError,
    );
    expect(productTypeWrites).toEqual(["Roman Shades", "Roller Shades"]);
  });
});
