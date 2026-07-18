import { describe, expect, it } from "vitest";
import {
  getMiniBlindAutomaticSurcharges,
  getMiniBlindDefaultLightControl,
  getMiniBlindFinishFromColor,
  getMiniBlindLightControlOptions,
  getMiniBlindSpecWarnings,
  isMiniBlindSizeWithinLimits,
} from "./miniBlindOptions";

describe("Norman CityLights mini blind options", () => {
  it("restricts light-control choices to the selected slat size", () => {
    expect(getMiniBlindLightControlOptions('1/2"')).toEqual(["Regular Route Holes"]);
    expect(getMiniBlindLightControlOptions('1"')).toEqual(["Regular Route Holes", "Privacy"]);
    expect(getMiniBlindLightControlOptions('2"')).toEqual(["SmartPrivacy"]);
    expect(getMiniBlindDefaultLightControl('2"')).toBe("SmartPrivacy");
  });

  it("derives finishes from Norman color names", () => {
    expect(getMiniBlindFinishFromColor("Silver Perforated")).toBe("Perforated");
    expect(getMiniBlindFinishFromColor("Metallic Bronze")).toBe("Metallic");
    expect(getMiniBlindFinishFromColor("Champagne (textured)")).toBe("Textured");
    expect(getMiniBlindFinishFromColor("Pure White")).toBe("Standard");
  });

  it("applies the verified CityLights percentage and fixed add-ons without double charging", () => {
    expect(
      getMiniBlindAutomaticSurcharges({
        slat_size: '2"',
        slat_finish: "Textured",
        light_control: "SmartPrivacy",
        side_mount_bracket: "Yes",
        shim: true,
      })
    ).toMatchObject([
      { name: '2" Slats (SmartPrivacy Included)', type: "percentage", value: 20 },
      { name: 'Side Mount Bracket (2" only)', type: "fixed", value: 25 },
      { name: "Shim", type: "fixed", value: 7 },
    ]);

    expect(
      getMiniBlindAutomaticSurcharges({
        slat_size: '1"',
        slat_finish: "Metallic",
        light_control: "Privacy",
      })
    ).toMatchObject([
      { name: "Metallic Slats", type: "percentage", value: 10 },
      { name: "Privacy", type: "percentage", value: 10 },
    ]);
  });

  it("enforces Norman's slat-specific CityLights dimensions", () => {
    expect(isMiniBlindSizeWithinLimits(78, 96, '1"')).toBe(true);
    expect(isMiniBlindSizeWithinLimits(78.01, 96, '1"')).toBe(false);
    expect(isMiniBlindSizeWithinLimits(78.01, 96, '1/2"')).toBe(false);
    expect(isMiniBlindSizeWithinLimits(96, 96, '2"')).toBe(true);
    expect(isMiniBlindSizeWithinLimits(96, 96, null)).toBe(false);

    expect(
      getMiniBlindSpecWarnings({
        productType: "Mini Blinds",
        widthInches: 80,
        heightInches: 97,
        slatSize: '1"',
      })
    ).toEqual([
      {
        id: "mini-blind-max-width",
        message: 'Norman CityLights 1" slats must be 78" wide or less. This opening is 80" wide.',
      },
      {
        id: "mini-blind-max-height",
        message: 'Norman CityLights mini blinds must be 96" high or less. This opening is 97" high.',
      },
    ]);

    expect(
      getMiniBlindSpecWarnings({
        productType: "Mini Blinds",
        widthInches: 96,
        heightInches: 90,
        slatSize: '2"',
      })
    ).toEqual([
      {
        id: "mini-blind-na-cell",
        message:
          'Norman CityLights is not available at the catalog size required for this 96" x 90" opening.',
      },
    ]);
  });
});
