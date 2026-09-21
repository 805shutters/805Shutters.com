import { describe, expect, it } from "vitest";
import { activeQuoteLines, isActiveQuoteLine } from "./active-lines";

describe("active quote lines", () => {
  it("keeps live lines and drops archived priced lines", () => {
    const lines = [
      { id: "live", archived_at: null },
      { id: "missing" },
      { id: "priced", archived_at: "2026-09-21T18:00:00.000Z" },
    ];

    expect(lines.map(isActiveQuoteLine)).toEqual([true, true, false]);
    expect(activeQuoteLines(lines).map((line) => line.id)).toEqual([
      "live",
      "missing",
    ]);
  });
});
