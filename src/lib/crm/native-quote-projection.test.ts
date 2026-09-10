import { describe, expect, it } from "vitest";
import { expandPublicQuoteLine, projectNativeFrozenLine } from "./public-quote";
import type { PublicQuoteLine } from "./public-quote";
const line = { id: "line", quantity: 3, lineTotal: 120, priceReady: true, designOptions: [{ lineTotal: 120, priceReady: true }] } as PublicQuoteLine;
describe("native frozen retail projection", () => {
 it("uses the immutable line total including once charges and splits exact cents", () => {
  const frozen = projectNativeFrozenLine({ meta: { native_delivery_id: "native", native_frozen_line_totals: { line: { quantity: 3, total: 100.01 } } } }, line, line);
  expect(expandPublicQuoteLine(frozen).map(item => item.lineTotal)).toEqual([33.34, 33.34, 33.33]);
  expect(expandPublicQuoteLine(frozen).map(item => item.designOptions[0].lineTotal)).toEqual([33.34, 33.34, 33.33]);
 });
 it("fails closed for a missing or mismatched frozen quantity", () => {
  for (const record of [{}, { quantity: 2, total: 100 }, { quantity: 3, total: -1 }]) {
   const result = projectNativeFrozenLine({ meta: { native_delivery_id: "native", native_frozen_line_totals: { line: record } } }, line, line);
   expect(result.priceReady).toBe(false); expect(result.lineTotal).toBe(0);
  }
 });
 it("preserves historical projection exactly", () => {
  expect(projectNativeFrozenLine({ meta: { mts_quote_id: "historical" } }, line, line)).toBe(line);
 });
});
