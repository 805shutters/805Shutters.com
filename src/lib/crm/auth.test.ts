import { describe, expect, it } from "vitest";
import { isReadOnlyCrmMutation } from "@/lib/crm/auth";

describe("CRM auth guards", () => {
  it("allows Ken to read CRM data", () => {
    expect(isReadOnlyCrmMutation("khill31@msn.com", "GET")).toBe(false);
    expect(isReadOnlyCrmMutation("khill31@msn.com", "HEAD")).toBe(false);
  });

  it("blocks Ken from mutating CRM data", () => {
    expect(isReadOnlyCrmMutation("khill31@msn.com", "POST")).toBe(true);
    expect(isReadOnlyCrmMutation("khill31@msn.com", "PATCH")).toBe(true);
    expect(isReadOnlyCrmMutation("khill31@msn.com", "DELETE")).toBe(true);
  });

  it("does not make Mike or Jessica read-only", () => {
    expect(isReadOnlyCrmMutation("805shutters@gmail.com", "POST")).toBe(false);
    expect(isReadOnlyCrmMutation("jessica@805shutters.com", "PATCH")).toBe(false);
  });
});
