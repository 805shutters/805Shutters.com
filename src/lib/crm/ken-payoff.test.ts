import { describe, expect, it } from "vitest";
import { payableFixtureRow } from "../../../e2e/fixtures/payables-data";
import { buildOwnerPayablesLedger } from "./owner-payables";
import { kenPayoffResponse } from "./ken-payoff";
import type { CrmDashboardData } from "./types";
it("projects the actual Payoff screen without disclosing the full bookkeeping record", () => {
  const row = payableFixtureRow({jobStatus:"closed",completedAt:"2026-09-10",jobClosedAt:"2026-09-10"});
  const ledger = buildOwnerPayablesLedger({rows:[row],kenPayments:[],commissionPayments:[],now:"2026-09-20"});
  const data = {bookkeepingRows:[row],ownerPayablesLedger:ledger,customers:[{email:"private@example.com"}]} as unknown as CrmDashboardData;
  const response = kenPayoffResponse(data);
  expect(response.view.total).toBe(100);
  expect(response.view.ready).toHaveLength(1);
  expect(response.view.ready[0].row).toEqual({jobClosedAt:"2026-09-10"});
  expect(Object.keys(response)).toEqual(["target","view"]);
  expect(JSON.stringify(response)).not.toMatch(/private@example|cogs|mikeProfit|advertisingReserve|createdByEmail/);
});
