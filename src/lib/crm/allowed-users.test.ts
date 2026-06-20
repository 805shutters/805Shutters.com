import { describe, expect, it } from "vitest";
import { allowedCrmEmails, isAllowedCrmEmail } from "@/lib/crm/allowed-users";

describe("CRM allowed users", () => {
  it("limits CRM access to the three approved users", () => {
    expect([...allowedCrmEmails]).toEqual(["805shutters@gmail.com", "jessica@805shutters.com", "khill31@msn.com"]);
  });

  it("does not allow legacy mailbox or domain-wide access", () => {
    expect(isAllowedCrmEmail("805@805shutters.com")).toBe(false);
    expect(isAllowedCrmEmail("hello@805shutters.com")).toBe(false);
    expect(isAllowedCrmEmail("anyone@805shutters.com")).toBe(false);
  });

  it("normalizes email case and whitespace", () => {
    expect(isAllowedCrmEmail("  KHILL31@MSN.COM ")).toBe(true);
  });
});
