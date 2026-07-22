import { describe, expect, it } from "vitest";
import {
  getAutoShutterRoutePatch,
  getWoodShutterRoutePatch,
} from "./quoteShutterRouting";

describe("authoritative shutter product routing", () => {
  it("binds automatic Norman and Onyx variants to canonical product/program IDs", () => {
    expect(getAutoShutterRoutePatch("B")).toMatchObject({
      supplier: "Norman",
      productId: "norman_shutters",
      programId: "woodlore",
    });
    expect(getAutoShutterRoutePatch("C")).toMatchObject({
      supplier: "Onyx",
      productId: "onyx_shutters",
      programId: "poly_composite",
    });
  });

  it("changes manufacturer identity immediately and leaves material selection unresolved for wood routes", () => {
    expect(getWoodShutterRoutePatch("Premium Wood")).toMatchObject({
      supplier: "Norman",
      productId: "norman_shutters",
      programId: null,
    });
    expect(getWoodShutterRoutePatch("Standard Wood")).toMatchObject({
      supplier: "Onyx",
      productId: "onyx_shutters",
      programId: null,
    });
  });
});
