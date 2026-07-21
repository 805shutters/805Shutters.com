import { describe, expect, it } from "vitest";
import type { SalesQuoteDesign } from "@mts/types/quote";
import {
  manufacturerStampTone,
  resolveManufacturerStamp,
} from "./manufacturerStamp";

function design(
  supplier: string | null,
  options: Record<string, unknown> = {},
): Partial<SalesQuoteDesign> {
  return { supplier, options_json: options };
}

describe("quote-line manufacturer stamps", () => {
  it.each([
    ["roller", "Norman", "norman"],
    ["polar_interior_roller", "Polar", "polar"],
    ["lotus_roller_shades", "Lotus", "lotus"],
    ["onyx_shutters", "Onyx", "onyx"],
  ] as const)(
    "resolves %s from the selected catalog product",
    (productId, label, tone) => {
      expect(
        resolveManufacturerStamp(
          design("Stale supplier", { quote_lab_product_id: productId }),
        ),
      ).toEqual({ label, tone });
    },
  );

  it("uses the persisted supplier as the future-manufacturer contract", () => {
    expect(
      resolveManufacturerStamp(
        design("Future Shade Company", { catalog_product_id: "future_screen" }),
      ),
    ).toEqual({ label: "Future Shade Company", tone: "generic" });
  });

  it("falls back to explicit catalog manufacturer evidence", () => {
    expect(
      resolveManufacturerStamp(
        design(null, {
          catalog_product_id: "future_screen",
          catalog_manufacturer: "Acme Solar",
        }),
      ),
    ).toEqual({ label: "Acme Solar", tone: "generic" });
  });

  it("prefers explicit catalog evidence to a stale supplier for future products", () => {
    expect(
      resolveManufacturerStamp(
        design("Wrong Legacy Supplier", {
          catalog_product_id: "future_screen",
          catalog_manufacturer: "Future Shade Company",
        }),
      ),
    ).toEqual({ label: "Future Shade Company", tone: "generic" });
  });

  it("does not confuse a motorization brand with the product manufacturer", () => {
    expect(
      resolveManufacturerStamp(design(null, { brand: "Automate Home" })),
    ).toBeNull();
  });

  it("does not let a fabric catalog override the selected manufacturer", () => {
    expect(
      resolveManufacturerStamp(
        design(null, {
          catalog_product_id: "future_polar_screen",
          catalog_manufacturer: "Polar",
          fabric_product_id: "roller",
        }),
      ),
    ).toEqual({ label: "Polar", tone: "polar" });
  });

  it("canonicalizes current manufacturer aliases", () => {
    expect(resolveManufacturerStamp(design("Norman Window Fashions"))).toEqual({
      label: "Norman",
      tone: "norman",
    });
    expect(resolveManufacturerStamp(design("Polar Shades"))).toEqual({
      label: "Polar",
      tone: "polar",
    });
    expect(manufacturerStampTone("MTS Shutters")).toBe("mts");
  });

  it("does not invent a manufacturer when no evidence is stored", () => {
    expect(resolveManufacturerStamp(design(null))).toBeNull();
    expect(resolveManufacturerStamp(undefined)).toBeNull();
  });
});
