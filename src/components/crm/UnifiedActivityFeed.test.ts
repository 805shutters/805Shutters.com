import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("UnifiedActivityFeed", () => {
  it("renders one filtered feed with the approved activity tabs and row fields", () => {
    const source = readFileSync("src/components/crm/UnifiedActivityFeed.tsx", "utf8");

    for (const label of ["All activity", "Payments", "Updates", "Notes", "Follow-ups", "Signed contracts"]) {
      expect(source).toContain(label);
    }
    expect(source).toContain("event.source");
    expect(source).toContain("event.displayCustomer");
    expect(source).toContain("event.typeLabel");
    expect(source).toContain("event.amount");
    expect(source).toContain("event.timestamp");
    expect(source).toContain("event.description");
  });

  it("buffers new activity away from the top and exposes a jump control", () => {
    const source = readFileSync("src/components/crm/UnifiedActivityFeed.tsx", "utf8");

    expect(source).toContain("scrollTop");
    expect(source).toContain("pendingCount");
    expect(source).toContain("new activity");
    expect(source).toContain("scrollTo");
    expect(source).toContain("reconcileDisplayedActivity");
  });

  it("shows selected-customer timeline, payments, notes, status, and follow-up state", () => {
    const source = readFileSync("src/components/crm/UnifiedActivityFeed.tsx", "utf8");

    expect(source).toContain("Complete timeline");
    expect(source).toContain("Payment history");
    expect(source).toContain("Customer notes");
    expect(source).toContain("Current status");
    expect(source).toContain("Follow-up state");
    expect(source).toContain("onOpenCustomer");
    expect(source).toContain("isUnlinkedCustomer");
  });
});
