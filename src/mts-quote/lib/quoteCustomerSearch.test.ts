import { describe, expect, it } from "vitest";
import type { CrmCustomer } from "@/lib/crm/types";
import { matchingQuoteCustomers } from "./quoteCustomerSearch";

function customer(id: string, name: string, phone: string | null = null): CrmCustomer {
  return {
    id, display_name: name, normalized_name: name.toLowerCase(), phone,
    email: null, address: null, city: null, source: "crm",
    created_at: "2026-09-06", updated_at: "2026-09-06", first_sold_date: null,
    latest_sold_date: null, latest_status: null, lifetime_value: 0, open_balance: 0, notes: null,
  };
}

const customers = [
  customer("1", "Alice Smith", "805-555-0101"),
  customer("2", "Bob Jones"),
  customer("3", "Alice Smith", "805-555-0103"),
];

describe("New Quote customer search", () => {
  it("suggests customers from the first character", () => {
    expect(matchingQuoteCustomers(customers, "s").map((row) => row.id)).toEqual(["1", "2", "3"]);
  });

  it("matches a partial surname regardless of case or surrounding whitespace", () => {
    expect(matchingQuoteCustomers(customers, "  sMiT  ").map((row) => row.id)).toEqual(["1", "3"]);
  });

  it("retains distinct customer records and their contact details even with identical names", () => {
    expect(matchingQuoteCustomers(customers, "Alice").map((row) => row.phone)).toEqual([
      "805-555-0101", "805-555-0103",
    ]);
  });

  it("does not suggest anything for empty input, an empty list, or an unknown name", () => {
    expect(matchingQuoteCustomers(customers, "   ")).toEqual([]);
    expect(matchingQuoteCustomers([], "smith")).toEqual([]);
    expect(matchingQuoteCustomers(customers, "unknown")).toEqual([]);
  });

  it("limits broad searches to eight matches without changing the source list", () => {
    const many = Array.from({ length: 12 }, (_, i) => customer(String(i), `Customer ${i}`));
    expect(matchingQuoteCustomers(many, "customer")).toEqual(many.slice(0, 8));
    expect(many).toHaveLength(12);
  });
});
