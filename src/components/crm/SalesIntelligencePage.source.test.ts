import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./SalesIntelligencePage.tsx", import.meta.url), "utf8");

describe("SalesIntelligencePage date controls", () => {
  it("labels and applies rolling trailing presets, including 30 and 60 days", () => {
    expect(source).toContain("trailingCalendarDayRange(30)");
    expect(source).toContain("[7, 30, 60, 90]");
    expect(source).toContain("Trailing {days} days");
    expect(source).toContain("Rolling trailing 30-day ledger by default, ending today.");
  });

  it("keeps adjustable inclusive From and Through controls", () => {
    expect(source).toContain("Adjust From and Through for a custom inclusive range.");
    expect(source).toContain("<label>From<input type=\"date\"");
    expect(source).toContain("<label>Through<input type=\"date\"");
    expect(source).toContain("onChange={(event) => setRange((current) => ({ ...current, start: event.target.value }))}");
    expect(source).toContain("onChange={(event) => setRange((current) => ({ ...current, end: event.target.value }))}");
  });
});
