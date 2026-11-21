import { describe, expect, it } from "vitest";
import {
  orderEntryGuideSha256,
  quoteButtonProduct,
  quoteButtonProducts,
} from "@/lib/crm/quote-button-catalog";

describe("quote button catalog", () => {
  it("keeps the order-entry guide and fills button defaults the seed left blank", () => {
    expect(orderEntryGuideSha256().startsWith("2b54653e")).toBe(true);
    expect(quoteButtonProducts()).toHaveLength(43);
    const roller = quoteButtonProduct("Norman", "roller");
    expect(roller?.productName).toBe("Soluna Roller Shades");
    expect(roller?.fields.find((field) => field.key === "room_location")?.choices.map((choice) => choice.value)).toContain("Office");
    expect(roller?.fields.find((field) => field.key === "quantity")).toMatchObject({ control: "quantity", defaultValue: "1" });
    expect(roller?.fields.find((field) => field.key === "ordered_width")).toMatchObject({ control: "dimension", step: "1/8" });
    expect(roller?.fields.find((field) => field.key === "mount_type")?.choices.map((choice) => choice.value)).toEqual(["Inside Mount", "Outside Mount"]);
    expect(roller?.fields.find((field) => field.key === "pattern_style")?.pending).toBe(true);
    expect(roller?.fields.find((field) => field.key === "collection")?.dependsOn).toContain("ordered_width");
  });

  it("accepts a later choice list for a field that was still pending", () => {
    const roller = quoteButtonProduct("Norman", "roller", [{
      manufacturer: "Norman",
      category: "roller",
      fields: [{ key: "pattern_style", choices: [{ value: "Solar", label: "Solar" }] }],
    }]);
    expect(roller?.fields.find((field) => field.key === "pattern_style")).toMatchObject({
      control: "buttons",
      pending: false,
      choices: [{ value: "Solar", label: "Solar" }],
    });
  });
});
