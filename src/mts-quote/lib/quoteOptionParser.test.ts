import { describe, expect, it } from "vitest";
import { ROLLER_VALANCES } from "./quoteConstants";
import { parseQuoteOptionText } from "./quoteOptionParser";

describe("MTS roller shade valance options", () => {
  it("shows the Norman Soluna roller valance options in dropdown order", () => {
    expect(ROLLER_VALANCES).toEqual([
      "No Valance",
      "Square Fascia*",
      "Plain Curved Fascia*",
      "Curved Fascia with Fabric*",
      '3 1/2" Fabric Valance*',
      '4 1/2" Fabric Valance*',
      '6" Fabric Valance*',
      '8" Fabric Valance*',
      '4 1/2" Modern Wood Valance*',
      "Cassette*",
    ]);
  });

  it("maps legacy roller valance text onto the current Norman options", () => {
    expect(parseQuoteOptionText("Roller Shades", "standard cassette").patch.valance).toBe(
      "Cassette*"
    );
    expect(parseQuoteOptionText("Roller Shades", "premium wood valance").patch.valance).toBe(
      '4 1/2" Modern Wood Valance*'
    );
    expect(parseQuoteOptionText("Roller Shades", "no valance open roll").patch.valance).toBe(
      "No Valance"
    );
  });

  it("parses current Norman roller valance text", () => {
    expect(parseQuoteOptionText("Roller Shades", "plain curved fascia").patch.valance).toBe(
      "Plain Curved Fascia*"
    );
    expect(parseQuoteOptionText("Roller Shades", "8 inch fabric valance").patch.valance).toBe(
      '8" Fabric Valance*'
    );
  });
});
