import { describe, expect, it } from "vitest";
import { projectAcceptedQuote } from "./acceptedQuoteProjection";
import type { AcceptedQuoteSelection } from "@mts/types/quote";
import { acceptanceFixture } from "./acceptedQuoteProjection.test-fixtures";


describe("accepted native quote display projection", () => {
  it("retains a selected free line alongside a positive accepted contract", () => {
    const { lines, quote, selection } = acceptanceFixture();
    Object.assign(selection.lineQuantities[1], { selectedQuantity: 1, remainingQuantity: 0, originalTotal: 0 });
    selection.selectedLineIds.push("kitchen"); selection.originalTotal = 300.02;
    const result = projectAcceptedQuote(quote, lines);
    expect(result.error).toBeNull(); expect(result.lineItems.map((line) => line.id)).toEqual(["living", "kitchen"]);
    expect(result.lineTotals.get("kitchen")).toBe(0); expect(result.acceptedTotal).toBe(100.01);
  });
  it("clones partial quantities, excludes unaccepted lines, and leaves cached sources immutable", () => {
    const { lines, quote } = acceptanceFixture();
    const before = JSON.stringify({ lines, quote });
    lines.forEach(Object.freeze); Object.freeze(lines);
    const result = projectAcceptedQuote(quote, lines);
    expect(result.error).toBeNull(); expect(result.lineItems).toEqual([{ ...lines[0], quantity: 1 }]);
    expect(result.lineItems[0]).not.toBe(lines[0]); expect(result.lineTotals.get("living")).toBe(100.01);
    expect(result.acceptedTotal).toBe(100.01); expect(JSON.stringify({ lines, quote })).toBe(before);
  });
  it("preserves exact physical-slot cent allocation instead of reapplying a full once fee", () => {
    const { lines, quote, selection } = acceptanceFixture();
    selection.selectedLineIds = ["living#3"];
    selection.acceptedTotal = 100; selection.lineQuantities[0].acceptedTotal = 100;
    const result = projectAcceptedQuote(quote, lines);
    expect(result.error).toBeNull(); expect(result.lineTotals.get("living")).toBe(100);
  });
  it.each([false, undefined])("leaves historical backend=%s rows unchanged", (backend) => {
    const { lines, quote } = acceptanceFixture(); quote.quote_v2_backend = backend;
    expect(projectAcceptedQuote(quote, lines).lineItems).toBe(lines);
    expect(projectAcceptedQuote(quote, lines).accepted).toBe(false);
  });
  it("leaves an unaccepted native draft unchanged", () => {
    const { lines, quote } = acceptanceFixture(); delete quote.quote_v2_accepted_selection;
    expect(projectAcceptedQuote(quote, lines).lineItems).toBe(lines);
  });
  it.each([
    (s: AcceptedQuoteSelection) => { s.lineQuantities.pop(); },
    (s: AcceptedQuoteSelection) => { s.lineQuantities[0].lineItemId = "unknown"; },
    (s: AcceptedQuoteSelection) => { s.lineQuantities[0].selectedQuantity = 2; },
    (s: AcceptedQuoteSelection) => { s.selectedLineIds = ["living#4"]; },
    (s: AcceptedQuoteSelection) => { s.selectedLineIds = ["living#1", "living#1"]; },
    (s: AcceptedQuoteSelection) => { s.lineQuantities[0].acceptedTotal = 100.02; s.acceptedTotal = 100.02; },
    (s: AcceptedQuoteSelection) => { s.acceptedTotal = 999; },
  ])("fails closed for inconsistent acceptance mapping %#", (corrupt) => {
    const { lines, quote, selection } = acceptanceFixture(); corrupt(selection);
    const result = projectAcceptedQuote(quote, lines);
    expect(result.error).toContain("could not be verified"); expect(result.lineItems).toEqual([]); expect(result.acceptedTotal).toBeNull();
  });
});
