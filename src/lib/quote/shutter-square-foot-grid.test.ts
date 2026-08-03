import { describe, expect, it } from "vitest";
import { createShutterSquareFootGrid } from "./shutter-square-foot-grid";

describe("independent shutter square-foot grids", () => {
  const woodlore = createShutterSquareFootGrid({
    manufacturer: "Norman",
    productId: "norman_shutters",
    programId: "woodlore",
    minimumBillableSquareFeet: 8,
    retailRatePerSquareFoot: 35,
    wholesaleRatePerSquareFoot: 13.1,
  });

  const onyxBasswood = createShutterSquareFootGrid({
    manufacturer: "Onyx",
    productId: "onyx_shutters",
    programId: "painted_basswood",
    minimumBillableSquareFeet: 8,
    retailRatePerSquareFoot: 35,
    wholesaleRatePerSquareFoot: 13.5,
  });

  it("selects the 8 sqft minimum row", () => {
    expect(woodlore.select(24, 24)).toEqual({
      actualSquareFeet: 4,
      row: {
        squareFeet: 8,
        retailPrice: 280,
        wholesalePrice: 104.8,
      },
    });
  });

  it("keeps an exact whole-square-foot measurement on that row", () => {
    expect(woodlore.select(36, 48)).toMatchObject({
      actualSquareFeet: 12,
      row: { squareFeet: 12, retailPrice: 420, wholesalePrice: 157.2 },
    });
  });

  it("always rounds a fractional measurement up to the next row", () => {
    expect(woodlore.select(30, 60)).toMatchObject({
      actualSquareFeet: 12.5,
      row: { squareFeet: 13, retailPrice: 455, wholesalePrice: 170.3 },
    });
  });

  it("keeps equal retail rates independent when wholesale differs", () => {
    expect(woodlore.row(13)).toEqual({
      squareFeet: 13,
      retailPrice: 455,
      wholesalePrice: 170.3,
    });
    expect(onyxBasswood.row(13)).toEqual({
      squareFeet: 13,
      retailPrice: 455,
      wholesalePrice: 175.5,
    });
    expect(woodlore.definition.programId).not.toBe(
      onyxBasswood.definition.programId,
    );
  });

  it("preserves a blocked wholesale cell instead of inventing a cost", () => {
    const unsupportedExample = createShutterSquareFootGrid({
      manufacturer: "Test Manufacturer",
      productId: "unsupported_test_product",
      programId: "unsupported_test_program",
      minimumBillableSquareFeet: 8,
      retailRatePerSquareFoot: 31,
      wholesaleRatePerSquareFoot: null,
    });
    expect(unsupportedExample.row(13)).toEqual({
      squareFeet: 13,
      retailPrice: 403,
      wholesalePrice: null,
    });
  });
});
