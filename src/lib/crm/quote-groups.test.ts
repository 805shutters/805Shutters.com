import { describe, it, expect } from "vitest";
import { nextLabel } from "./quote-groups";

describe("nextLabel", () => {
  it("starts at A", () => {
    expect(nextLabel([])).toBe("A");
  });
  it("returns the first free letter", () => {
    expect(nextLabel(["A"])).toBe("B");
    expect(nextLabel(["A", "B", "C"])).toBe("D");
    expect(nextLabel(["A", "C"])).toBe("B");
  });
  it("is case-insensitive and ignores blanks", () => {
    expect(nextLabel(["a", null, "", "B"])).toBe("C");
  });
  it("falls back past the letters", () => {
    expect(nextLabel(["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"])).toBe("Option 11");
  });
});
