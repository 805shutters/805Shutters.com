import { describe, expect, it } from "vitest";
import { loadAllSalesQuotes, searchQuotes } from "./quoteSearch";

const quotes = [
  { id: "draft", status: "draft", quote_number: "805-1201", customer_name: "Avery Sample", customer_phone: "+1 (805) 555-0142", customer_email: "avery@example.com", customer_address: "42 Harbor Lane, Ventura" },
  { id: "sold", status: "sold", quote_number: "805-1202", customer_name: "Jordan Sample", customer_phone: "8055550173", customer_email: "jordan@example.com", customer_address: "12 Hill Road, Camarillo" },
  { id: "archived", status: "archived", quote_number: "805-0003", customer_name: "Avery Sample", customer_phone: null, customer_email: null, customer_address: null },
  { id: "missing", status: "installed", quote_number: null, customer_name: null },
];

describe("quote search", () => {
  it.each([
    ["1201", ["draft"]],
    ["  AVERY  ", ["draft", "archived"]],
    ["Harbor ventURA", ["draft"]],
    ["JORDAN@EXAMPLE", ["sold"]],
    ["8055550142", ["draft"]],
    ["(805) 555-0173", ["sold"]],
    ["555.0142", ["draft"]],
    ["Sample Camarillo", ["sold"]],
    ["Avery    Sample", ["draft", "archived"]],
    ["not-a-customer", []],
    ["unrelated0142", []],
    ["()", []],
  ])("matches %s across quote fields and statuses", (query, ids) => {
    expect(searchQuotes(quotes, query).map((quote) => quote.id)).toEqual(ids);
  });

  it("restores all quotes in their original order for an empty search", () => {
    expect(searchQuotes(quotes, " \n ")).toBe(quotes);
  });

  it("retains distinct alternative quotes and does not mutate records", () => {
    const before = structuredClone(quotes);
    expect(searchQuotes(quotes, "sample").map((quote) => quote.id)).toEqual(["draft", "sold", "archived"]);
    expect(quotes).toEqual(before);
  });

  it("falls back when deleted_at is unavailable, pages to exhaustion, and removes deleted rows", async () => {
    const records = Array.from({ length: 1202 }, (_, index) => ({
      id: String(index),
      quote_number: `805-${index}`,
      customer_name: index === 1201 ? "Historical Customer" : "Recent Customer",
      deleted_at: index === 700 ? "2026-09-01T00:00:00.000Z" : null,
    }));
    const calls: Array<{ from: number; to: number; excludeDeleted: boolean }> = [];

    const result = await loadAllSalesQuotes(async (from, to, excludeDeleted) => {
      calls.push({ from, to, excludeDeleted });
      if (excludeDeleted) {
        return {
          data: null,
          error: { code: "42703", message: "column sales_quotes.deleted_at does not exist" },
        };
      }
      const serverCappedTo = Math.min(to, from + 299);
      return { data: records.slice(from, serverCappedTo + 1), error: null };
    });

    expect(result.error).toBeNull();
    expect(result.data).toHaveLength(1201);
    expect(result.data?.some((quote) => quote.id === "700")).toBe(false);
    expect(searchQuotes(result.data || [], "historical")).toEqual([records[1201]]);
    expect(calls).toEqual([
      { from: 0, to: 499, excludeDeleted: true },
      { from: 0, to: 499, excludeDeleted: false },
      { from: 300, to: 799, excludeDeleted: false },
      { from: 600, to: 1099, excludeDeleted: false },
      { from: 900, to: 1399, excludeDeleted: false },
      { from: 1200, to: 1699, excludeDeleted: false },
      { from: 1202, to: 1701, excludeDeleted: false },
    ]);
  });

  it("fails closed when a later page cannot be loaded", async () => {
    const result = await loadAllSalesQuotes(async (from) => {
      if (from === 0) {
        return { data: Array.from({ length: 500 }, (_, id) => ({ id, deleted_at: null })), error: null };
      }
      return { data: null, error: { message: "network unavailable" } };
    });

    expect(result).toEqual({ data: null, error: { message: "network unavailable" } });
  });
});
