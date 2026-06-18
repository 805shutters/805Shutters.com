import { describe, expect, it } from "vitest";
import { getHeaderScrollClassState } from "./HeaderScrollState";

describe("getHeaderScrollClassState", () => {
  it("keeps the header visible at the top of the home page", () => {
    expect(getHeaderScrollClassState(0, 0)).toEqual({
      isSolid: false,
      shouldHide: false
    });
  });

  it("hides the header on the first downward scroll away from the top", () => {
    expect(getHeaderScrollClassState(60, 0)).toEqual({
      isSolid: true,
      shouldHide: true
    });
  });

  it("reveals the solid header when the visitor scrolls back up", () => {
    expect(getHeaderScrollClassState(140, 180)).toEqual({
      isSolid: true,
      shouldHide: false
    });
  });
});
