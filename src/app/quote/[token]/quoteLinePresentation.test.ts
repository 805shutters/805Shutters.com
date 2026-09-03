import { describe, expect, it } from "vitest";
import { quoteProductDetails } from "./quoteLinePresentation";

describe("quoteProductDetails", () => {
  it("turns saved honeycomb metadata into one customer-facing row per category", () => {
    const details = quoteProductDetails("C4305T - Morning Blush RD | Room Darkening", [
      "Mount Type: Inside Mount",
      "Shade Type: Single",
      "Lift System: SmartRise Cordless",
      "Fabric: C4305T - Morning Blush RD | Room Darkening",
      'Cell Size: 3/4" Single Cell',
      "Light Control: Room Darkening",
      "Fabric Color Id: honeycomb:color:room-darkening:c4305t:morning-blush-rd:89",
      "Discount Percent: 10",
      "Fabric Color Code: C4305T",
      "Fabric Color Name: Morning Blush RD",
      "Fabric Color Type: Room Darkening",
      "Fabric Color Collection: Room Darkening",
      "Fabric Product Id: honeycomb",
      "Fabric Program Id: honeycomb_3_8in_cordless_single_and_3_4in_single",
      "Fabric Surcharge Id: room_darkening",
    ]);

    expect(details).toEqual([
      { label: "Mount Type", value: "Inside Mount" },
      { label: "Shade Type", value: "Single" },
      { label: "Lift System", value: "Cordless" },
      { label: "Fabric", value: "C4305T - Morning Blush RD" },
      { label: "Cell Size", value: '3/4" Single Cell' },
      { label: "Light Control", value: "Room Darkening" },
    ]);
  });

  it("keeps distinct selections that happen to share the same value", () => {
    expect(quoteProductDetails("", ["Hard Surface Install: Yes", "Requires Takedown: Yes"])).toEqual([
      { label: "Hard Surface Install", value: "Yes" },
      { label: "Requires Takedown", value: "Yes" },
    ]);
  });

  it("uses color metadata only when no readable fabric selection exists", () => {
    expect(quoteProductDetails("", ["Fabric Color Code: 7021", "Fabric Color Name: Antique Lace"])).toEqual([
      { label: "Color", value: "7021 — Antique Lace" },
    ]);
  });

  it("removes catalog and quote-lab implementation metadata", () => {
    expect(quoteProductDetails("", [
      "Supplier: Onyx",
      "Catalog Product Id: onyx_shutters",
      "Catalog Manufacturer: Onyx",
      "Catalog Product Type: Shutters",
      "Quote Lab Product Id: onyx_shutters",
      "Control Type: Hidden Tiltrod",
      "Control Side: Left",
      "Requires Takedown: false",
    ])).toEqual([
      { label: "Control Type", value: "Hidden Tiltrod" },
      { label: "Control Side", value: "Left" },
    ]);
  });
});
