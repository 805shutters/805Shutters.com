import { describe, expect, it } from "vitest";
import { collectCrmPages } from "./pagination";

describe("complete CRM pagination", () => {
  it("does not silently omit older jobs or ledger payments after former caps", async () => {
    const records = Array.from({ length: 1251 }, (_, id) => ({ id }));
    const offsets: number[] = [];
    const result = await collectCrmPages(async (from, to) => {
      offsets.push(from);
      return { data: records.slice(from, to + 1), error: null };
    });
    expect(result.data).toEqual(records);
    expect(offsets).toEqual([0, 500, 1000, 1251]);
  });
  it("continues when the server returns a smaller nonempty page", async () => {
    const result = await collectCrmPages(async (from) => ({ data: [1, 2, 3, 4, 5].slice(from, from + 2), error: null }));
    expect(result.data).toEqual([1, 2, 3, 4, 5]);
  });
  it("fails closed instead of calculating balances from a partial payment ledger", async () => {
    const result = await collectCrmPages(async (from) => from
      ? { data: null, error: { message: "payment page unavailable" } }
      : { data: [1, 2], error: null });
    expect(result).toEqual({ data: null, error: { message: "payment page unavailable" } });
  });
});
