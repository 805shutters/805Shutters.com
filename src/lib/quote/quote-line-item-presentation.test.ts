import { describe, expect, it } from "vitest";
import { quoteSpecificationGroups } from "./quote-line-item-presentation";

describe("quote line item specifications", () => {
  it("groups selections without dropping unknown options or notes", () => {
    const groups = quoteSpecificationGroups("", [
      "Fabric: C4420T - Natural Tan RD", "Fabric Color: C4420T - Natural Tan RD",
      "Rail Color: Default", "Light Control: Room Darkening", "Lift System: Cordless TDBU",
      "Mount Type: Outside Mount", 'Cell Size: 3/8" Single Cell', "Shade Type: Single",
      "Special bracket: Customer-selected extended bracket", "Notes: Keep existing trim",
    ]);
    expect(groups.map((g) => g.title)).toEqual(["Fabric & finish", "Operation", "Construction", "Additional details"]);
    const details = groups.flatMap((g) => g.details);
    expect(details.filter((d) => d.value === "C4420T - Natural Tan RD")).toHaveLength(1);
    expect(details).toContainEqual({ label: "Special bracket", value: "Customer-selected extended bracket" });
    expect(details).toContainEqual({ label: "Notes", value: "Keep existing trim" });
    expect(details).toHaveLength(9);
  });

  it("keeps different fabric and color selections and manufacturer privacy", () => {
    const details = quoteSpecificationGroups("", ["Fabric: Linen", "Fabric Color: Natural Tan", "Manufacturer: Norman", "pricing grid width: 40"])
      .flatMap((g) => g.details);
    expect(details).toEqual([{ label: "Fabric", value: "Linen" }, { label: "Fabric Color", value: "Natural Tan" }]);
  });

  it("removes the temporary-shade detail only when the included footer can represent it", () => {
    const selected = quoteSpecificationGroups("", ["Complementary temporary paper shade: Free"]);
    expect(selected).toEqual([]);
    const conflicting = quoteSpecificationGroups("", ["Temporary Shade: Yes", "Temporary Shade: No"]);
    expect(conflicting.flatMap((g) => g.details)).toContainEqual({ label: "Temporary Shade", value: "Yes" });
  });
});
