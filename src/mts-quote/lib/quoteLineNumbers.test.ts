import { describe, expect, it } from "vitest";
import { activeQuoteLines } from "@/lib/quote-v2/active-lines";
import { buildLineNumberRanges } from "./quoteLineNumbers";

/**
 * Quote 805-0367 / b3218ff1-d425-4d3a-a707-c0cce0aa08e7.
 * Office quantity 2 makes line item 5 render as display #6.
 * That line is the second Bedroom 2 shutter, not the Living Room roller.
 */
const quote8050367Lines = [
  { id: "472bc255-e1c1-4a2b-a561-428d445ea2a0", room_name: "Bedroom 1", product_type: "Roman Shades", quantity: 1, sort_order: 0, archived_at: null },
  { id: "8d0cf4fb-bab7-4d9a-a122-f6a5c2f1fec7", room_name: "Dining Room", product_type: "Shutters", quantity: 1, sort_order: 1, archived_at: null },
  { id: "ea73d852-1ba5-4b3b-870f-e573983414b1", room_name: "Office", product_type: "Shutters", quantity: 2, sort_order: 2, archived_at: null },
  { id: "0214bc59-08f7-40dc-9942-2f47f4147790", room_name: "Bedroom 2", product_type: "Shutters", quantity: 1, sort_order: 3, archived_at: null },
  { id: "89961b21-111b-4136-9830-3bdadbb680b3", room_name: "Bedroom 2", product_type: "Shutters", quantity: 1, sort_order: 4, archived_at: "2026-09-21T19:00:08.279Z" },
  { id: "976e6a79-3048-4e54-913f-682ee001d540", room_name: "Living Room", product_type: "Roller Shades", quantity: 1, sort_order: 5, archived_at: null },
];

describe("805-0367 builder display numbers", () => {
  it("selects the Bedroom 2 shutter that renders as #6", () => {
    const ordered = [...quote8050367Lines].sort((a, b) => a.sort_order - b.sort_order);
    const ranges = buildLineNumberRanges(ordered);
    const bedroomShutters = ordered.filter(
      (line) => line.room_name === "Bedroom 2" && line.product_type === "Shutters",
    );
    const displaySix = bedroomShutters.find((line) => ranges.get(line.id)?.label === "#6");

    expect(displaySix?.id).toBe("89961b21-111b-4136-9830-3bdadbb680b3");
    expect(ranges.get("0214bc59-08f7-40dc-9942-2f47f4147790")?.label).toBe("#5");
    expect(ranges.get("976e6a79-3048-4e54-913f-682ee001d540")?.label).toBe("#7");
    expect(displaySix?.room_name).toBe("Bedroom 2");
    expect(displaySix?.product_type).toBe("Shutters");
  });

  it("drops that archived shutter from the lines the builder renders", () => {
    const ordered = [...quote8050367Lines].sort((a, b) => a.sort_order - b.sort_order);
    const rendered = activeQuoteLines(ordered);
    const ranges = buildLineNumberRanges(rendered);

    expect(rendered.map((line) => line.id)).not.toContain("89961b21-111b-4136-9830-3bdadbb680b3");
    expect(ranges.has("89961b21-111b-4136-9830-3bdadbb680b3")).toBe(false);
    expect(ranges.get("0214bc59-08f7-40dc-9942-2f47f4147790")?.label).toBe("#5");
    expect(ranges.get("976e6a79-3048-4e54-913f-682ee001d540")?.label).toBe("#6");
  });
});
