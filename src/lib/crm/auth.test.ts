import { describe, expect, it } from "vitest";
import { isKenCrmRequestAllowed, isReadOnlyCrmMutation } from "@/lib/crm/auth";

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


describe("Ken payoff-only access", () => {
  it("allows only session and payoff reads", () => {
    for (const path of ["/api/crm/session", "/api/crm/ken-payoff", "/api/crm/ken-payoff/"]) {
      expect(isKenCrmRequestAllowed(" KHILL31@MSN.COM ", "GET", path)).toBe(true);
      expect(isKenCrmRequestAllowed("khill31@msn.com", "HEAD", path)).toBe(true);
      for (const method of ["POST", "PUT", "PATCH", "DELETE", "OPTIONS"]) {
        expect(isKenCrmRequestAllowed("khill31@msn.com", method, path)).toBe(false);
      }
    }
  });
  it("denies unrelated CRM endpoints, including direct URL attempts", () => {
    for (const path of ["/api/crm/jobs", "/api/crm/quotes", "/api/crm/calendar", "/api/crm/customers/123", "/api/crm/settings", "/api/crm/payments", "/api/crm/ken-payoff/other"]) {
      expect(isKenCrmRequestAllowed("khill31@msn.com", "GET", path)).toBe(false);
    }
  });
  it("preserves Mike and Jessica access", () => {
    for (const email of ["805shutters@gmail.com", "jessica@805shutters.com"]) {
      expect(isKenCrmRequestAllowed(email, "GET", "/api/crm/jobs")).toBe(true);
      expect(isKenCrmRequestAllowed(email, "POST", "/api/crm/quotes")).toBe(true);
    }
  });
});
