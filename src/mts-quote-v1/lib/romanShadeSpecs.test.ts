import { describe, expect, it } from "vitest";
import { normanRomanDealerFabricRows } from "@/lib/quote/norman-roman-dealer-fabrics.generated";
import {
  getEffectiveRomanFabricMaxWidth,
  getEffectiveRomanOrderWidth,
  getRomanShadeSpecWarnings,
} from "./romanShadeSpecs";

function warningMessages(
  overrides: Partial<Parameters<typeof getRomanShadeSpecWarnings>[0]> = {},
) {
  return getRomanShadeSpecWarnings({
    productType: "Roman Shades",
    widthInches: 36,
    heightInches: 60,
    fabric: "F1621 - Dusk Blue | Alma",
    fabricCollection: "Alma",
    fabricColorCode: "F1621",
    fabricColorName: "Dusk Blue",
    foldStyle: "Flat Fold without Seams",
    shadeType: "Single",
    liftSystem: "Cordless",
    mountType: "Outside Mount",
    lining: "Translucent",
    ...overrides,
  }).map((warning) => warning.message);
}

function romanFabric(collection: string, colorCode: string) {
  const row = normanRomanDealerFabricRows.find(
    (fabric) => fabric.collection === collection && fabric.colorCode === colorCode,
  );
  if (!row) throw new Error(`Missing Roman fabric ${collection} ${colorCode}`);
  return row;
}

describe("roman shade manufacturer spec warnings", () => {
  it("warns when a non-joinable fabric exceeds its effective width", () => {
    expect(
      warningMessages({
        widthInches: 100,
        fabricCollection: "Alma",
        fabricColorCode: "F1621",
      }).join(" "),
    ).toContain(
      'Roman fabric specs must be 99.625" wide or less for Alma F1621 with Flat Fold without Seams / Cordless control.',
    );
    expect(
      warningMessages({
        widthInches: 100,
        fabricCollection: "Alma",
        fabricColorCode: "F1621",
      }).join(" "),
    ).toContain("Norman marks this fabric as not joinable.");
  });

  it("accepts that same opening when Common Valance splits it into panels", () => {
    expect(
      warningMessages({
        widthInches: 100,
        shadeType: "Common Valance",
        fabricCollection: "Alma",
        fabricColorCode: "F1621",
      }),
    ).toEqual([]);
    expect(getEffectiveRomanOrderWidth(100, "Common Valance")).toBe(49.9375);
  });

  it("still warns when Common Valance exceeds Norman's total-width cap", () => {
    expect(
      warningMessages({
        widthInches: 145,
        shadeType: "Common Valance",
      }).join(" "),
    ).toContain('Roman Common Valance specs must be 144" wide or less');
  });

  it("applies Roman style/control/mount fabric-width deductions from the dealer form", () => {
    const alma = romanFabric("Alma", "F1621");
    expect(
      getEffectiveRomanFabricMaxWidth({
        fabric: alma,
        foldStyle: "Flat Fold without Seams",
        shadeType: "Single",
        liftSystem: "Cordless",
        mountType: "Outside Mount",
      }),
    ).toBe(99.625);
    expect(
      getEffectiveRomanFabricMaxWidth({
        fabric: alma,
        foldStyle: "Flat Fold without Seams",
        shadeType: "Day & Night",
        liftSystem: "Cordless",
        mountType: "Inside Mount",
      }),
    ).toBe(99.25);

    const sheerElegance = romanFabric("Sheer Elegance", "F1082");
    expect(
      getEffectiveRomanFabricMaxWidth({
        fabric: sheerElegance,
        foldStyle: "Flat Fold with Batten Back",
        shadeType: "Single",
        liftSystem: "Continuous Cord Loop",
        mountType: "Outside Mount",
      }),
    ).toBe(106.5);
  });

  it("warns for seamable and railroad-only fabrics that exceed the fabric width", () => {
    expect(
      warningMessages({
        widthInches: 57,
        heightInches: 50,
        fabric: "F0058 - Seal Brown | Lorraine",
        fabricCollection: "Lorraine",
        fabricColorCode: "F0058",
        fabricColorName: "Seal Brown",
        foldStyle: "Flat Fold with Batten Back",
        liftSystem: "Continuous Cord Loop",
      }).join(" "),
    ).toContain("Norman requires this fabric to be railroaded.");

    const f0031 = warningMessages({
      widthInches: 55,
      heightInches: 37,
      fabric: "F0031 - Black Gingham | Lorraine",
      fabricCollection: "Lorraine",
      fabricColorCode: "F0031",
      fabricColorName: "Black Gingham",
      foldStyle: "Flat Fold with Batten Back",
      liftSystem: "Continuous Cord Loop",
    }).join(" ");
    expect(f0031).toContain("Norman requires this fabric to be railroaded.");
    expect(f0031).toContain('Roman Lorraine F0031 railroaded fabric must be 36" high or less');
  });

  it("warns for Day & Night height-to-width ratio from Norman", () => {
    expect(
      warningMessages({
        widthInches: 24,
        heightInches: 73,
        shadeType: "Day & Night",
        liftSystem: "Continuous Cord Loop",
      }).join(" "),
    ).toContain("height-to-width ratio at 3:1 or less");
  });

  it("warns when a saved fabric is not available for the selected style", () => {
    expect(
      warningMessages({
        fabric: "F1599 - Cottage Linen | Scarlett",
        fabricCollection: "Scarlett",
        fabricColorCode: "F1599",
        fabricColorName: "Cottage Linen",
        foldStyle: "Soft Fold",
        liftSystem: "Continuous Cord Loop",
      }).join(" "),
    ).toContain("Scarlett F1599 is not available with Soft Fold");
  });

  it("does not warn for non-roman products, missing fabric, or missing measurements", () => {
    expect(warningMessages({ productType: "Roller Shades" })).toEqual([]);
    expect(warningMessages({ fabricCollection: null, fabricColorCode: null, fabric: null })).toEqual(
      [],
    );
    expect(warningMessages({ widthInches: 0 })).toEqual([]);
    expect(warningMessages({ heightInches: 0 })).toEqual([]);
  });
});
