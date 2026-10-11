import { describe, it, expect } from "vitest";
import { normalizePhone, matchPhoneCustomer } from "./phone-matching";
describe("805 customer phone matching", () => {
  it("normalizes US punctuation and international numbers without guessing extensions", () => {
    expect(normalizePhone("(805) 555-0100")).toBe("+18055550100");
    expect(normalizePhone("1-805-555-0100")).toBe("+18055550100");
    expect(normalizePhone("+44 20 7946 0958")).toBe("+442079460958");
    expect(normalizePhone("8055550100 ext 2")).toBeNull();
    expect(normalizePhone("anonymous")).toBeNull();
  });
  const customer = {
    id: "a",
    display_name: "Customer A",
    phone: "(805) 555-0100",
  };
  it("links only a unique reliable identity", () => {
    expect(matchPhoneCustomer(["+18055550100"], [customer]).customerId).toBe(
      "a",
    );
    expect(matchPhoneCustomer(["+18055550200"], [customer]).status).toBe(
      "unmatched",
    );
  });
  it("keeps duplicate/shared numbers and conflicting caller/callback identities unlinked", () => {
    expect(
      matchPhoneCustomer(["+18055550100"], [customer, { ...customer, id: "b" }])
        .status,
    ).toBe("ambiguous");
    expect(
      matchPhoneCustomer(
        ["+18055550100", "+18055550200"],
        [customer, { ...customer, id: "b", phone: "8055550200" }],
      ).customerId,
    ).toBeNull();
  });
  it("ignores deleted customers and blocked caller identity", () => {
    expect(
      matchPhoneCustomer([null, "anonymous"], [customer]).customerId,
    ).toBeNull();
    expect(
      matchPhoneCustomer(
        ["+18055550100"],
        [{ ...customer, meta: { deleted_at: "today" } }],
      ).customerId,
    ).toBeNull();
  });
});
