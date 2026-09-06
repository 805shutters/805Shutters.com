import { expect, it } from "vitest";
import { normalizeWorkingRanges } from "./working-ranges";
it("unions duplicates and touching ranges while preserving real closed gaps", () => {
  const range = (a: string, b: string) => ({
    start_at: `2035-10-01T${a}:00Z`,
    end_at: `2035-10-01T${b}:00Z`,
  });
  expect(
    normalizeWorkingRanges("2035-10", [
      range("15:00", "16:00"),
      range("15:00", "16:00"),
      range("16:00", "17:00"),
      range("18:00", "19:00"),
    ]),
  ).toEqual([
    {
      start_at: "2035-10-01T15:00:00.000Z",
      end_at: "2035-10-01T17:00:00.000Z",
    },
    {
      start_at: "2035-10-01T18:00:00.000Z",
      end_at: "2035-10-01T19:00:00.000Z",
    },
  ]);
});
it("rejects wrong months, inverted hours and multi-day ranges", () => {
  for (const value of [
    [{ start_at: "bad", end_at: "bad" }],
    [{ start_at: "2035-10-01T15:00Z", end_at: "2035-10-01T14:00Z" }],
    [{ start_at: "2035-10-01T15:00Z", end_at: "2035-10-03T15:00Z" }],
    [{ start_at: "2035-11-01T15:00Z", end_at: "2035-11-01T17:00Z" }],
  ])
    expect(() => normalizeWorkingRanges("2035-10", value)).toThrow();
  expect(normalizeWorkingRanges("2035-10", [])).toEqual([]);
});
