import { describe, it, expect } from "vitest";
import { VENMO_HANDLE, ZELLE_DESTINATION, venmoProfileUrl } from "./payment-options";

describe("payment options", () => {
  it("exposes a Venmo handle and a Zelle destination", () => {
    expect(VENMO_HANDLE.length).toBeGreaterThan(0);
    expect(ZELLE_DESTINATION.length).toBeGreaterThan(0);
  });

  it("the Venmo profile URL (what the QR encodes) ends with the handle", () => {
    expect(venmoProfileUrl()).toBe(`https://venmo.com/${VENMO_HANDLE}`);
  });
});
