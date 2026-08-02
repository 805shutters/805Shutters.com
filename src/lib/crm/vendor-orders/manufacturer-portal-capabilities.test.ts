import { describe, expect, it } from "vitest";
import { manufacturerPortalCapability } from "./manufacturer-portal-capabilities";

describe("manufacturer portal capabilities", () => {
  it("permits only the verified submitted-measure Norman Roller adapter", () => {
    expect(manufacturerPortalCapability({
      manufacturer: "Norman",
      routingKeys: ["norman:roller"],
      sourceKind: "submitted_technical_measure",
    }).automaticEntry).toBe(true);
    expect(manufacturerPortalCapability({
      manufacturer: "Norman",
      routingKeys: ["norman:honeycomb"],
      sourceKind: "submitted_technical_measure",
    }).automaticEntry).toBe(false);
    expect(manufacturerPortalCapability({
      manufacturer: "Norman",
      routingKeys: ["norman:roller"],
      sourceKind: "signed_contract",
    }).automaticEntry).toBe(false);
  });

  it("permits exactly routed Onyx tasks and blocks mixed routes", () => {
    expect(manufacturerPortalCapability({
      manufacturer: "Onyx",
      routingKeys: ["onyx:vinyl", "onyx:painted_basswood"],
    }).automaticEntry).toBe(true);
    expect(manufacturerPortalCapability({
      manufacturer: "Onyx",
      routingKeys: ["onyx:onyx_us_made_vinyl"],
    }).automaticEntry).toBe(false);
    expect(manufacturerPortalCapability({
      manufacturer: "Onyx",
      routingKeys: ["onyx:vinyl", "norman:roller"],
    }).automaticEntry).toBe(false);
  });

  it.each(["Polar", "Unknown"])("fails closed for %s", (manufacturer) => {
    const capability = manufacturerPortalCapability({
      manufacturer,
      routingKeys: [`${manufacturer.toLowerCase()}:product`],
      sourceKind: "submitted_technical_measure",
    });
    expect(capability.automaticEntry).toBe(false);
    expect(capability.reviewBoundary).toBe("saved_draft_only");
  });

  it("marks every mapped Lotus route ready for packet preparation only", () => {
    expect(manufacturerPortalCapability({
      manufacturer: "Lotus",
      routingKeys: ["lotus:lotus_roller_shades"],
      sourceKind: "submitted_technical_measure",
    })).toMatchObject({ automaticEntry: false, documentPreparation: true });
  });

  it("fails closed when exact routing is absent", () => {
    expect(manufacturerPortalCapability({ manufacturer: "Onyx", routingKeys: [] }).automaticEntry).toBe(false);
  });
});
