import { describe, expect, it } from "vitest";
import { legacyShareTokenPatch } from "./legacy-share-token";

describe("legacyShareTokenPatch", () => {
  it("passes a real source token through to the CRM mirror", () => {
    expect(legacyShareTokenPatch(" stable-customer-token ")).toEqual({
      share_token: "stable-customer-token",
    });
  });

  it("omits an empty source token so an existing customer link is not overwritten", () => {
    expect(legacyShareTokenPatch(null)).toEqual({});
    expect(legacyShareTokenPatch("   ")).toEqual({});
  });
});
