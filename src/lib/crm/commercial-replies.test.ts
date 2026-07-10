import { describe, expect, it } from "vitest";
import { isCommercialOptOut } from "@/lib/crm/commercial-replies";

describe("commercial reply sync", () => {
  it("recognizes common business opt-out language", () => {
    expect(isCommercialOptOut("Please unsubscribe me from future emails.")).toBe(true);
    expect(isCommercialOptOut("Remove me, thank you.")).toBe(true);
    expect(isCommercialOptOut("We would like to schedule a site walk.")).toBe(false);
  });
});
