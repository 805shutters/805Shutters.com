import { describe, expect, it } from "vitest";
import { payableFixtureRow } from "../../../e2e/fixtures/payables-data";
import { buildOwnerPayablesLedger } from "./owner-payables";
import type { CrmPartnerPaymentHistoryBatch } from "./types";
import { kenPayoffView, payoffSelection } from "./ken-payoff-view";
const row = () => payableFixtureRow({jobStatus:"closed",completedAt:"2026-09-10",jobClosedAt:"2026-09-10"});
const build = () => buildOwnerPayablesLedger({rows:[row()],kenPayments:[],commissionPayments:[],now:"2026-09-20"});
describe("Ken payoff view",()=>{
 it("uses only this monthly ledger and sums each exact job once",()=>{
  const ledger=build(); ledger.kenMonthly!.items.push(ledger.kenMonthly!.items[0]);
  const before=structuredClone(ledger); const view=kenPayoffView([row()],ledger);
  expect(view.ready).toHaveLength(1); expect(view.total).toBe(100); expect(ledger).toEqual(before);
 });
 it("excludes stale unpaid, reopened and shipped jobs even if the monthly response includes them",()=>{
  for(const changed of [{isPaidInFull:false},{jobStatus:"ordered" as const},{completedAt:null,isInstallationComplete:false}]) expect(kenPayoffView([{...row(),...changed}],build()).total).toBe(0);
 });
 it("keeps future dues and fully paid jobs out of the ready ledger",()=>{
  const ledger=build(); ledger.kenMonthly!.items[0].dueDate="2026-11-01";
  expect(kenPayoffView([row()],ledger).ready).toHaveLength(0);
  ledger.kenMonthly!.items[0].dueDate="2026-10-01"; ledger.kenMonthly!.items[0].remainingAmount=0;
  expect(kenPayoffView([row()],ledger).ready).toHaveLength(0);
 });
 it("selects exact jobs and detects partial payment changes before saving",()=>{
  const ledger=build(); const ready=kenPayoffView([row()],ledger).ready; const key=ready[0].item.itemKey;
  const selection=payoffSelection(ready,[key]); expect(selection?.total).toBe(100);
  expect(payoffSelection(ready,["missing"])).toBeNull(); expect(payoffSelection(ready,[])).toBeNull();
  ledger.kenMonthly!.items[0].remainingAmount=40; ledger.kenMonthly!.items[0].paidAmount=60;
  const updated=payoffSelection(kenPayoffView([row()],ledger).ready,[key]);
  expect(updated?.total).toBe(40);expect(updated?.snapshot).not.toBe(selection?.snapshot);
 });
 it("preserves paid batches independently of current eligibility and separates duplicate audit entries",()=>{
  const ledger=build();
  ledger.history=[
   {id:"paid",person:"ken",amount:100,reconciliation:{status:"payment",matchedBatchIds:[],reason:""}},
   {id:"duplicate",person:"ken",amount:100,reconciliation:{status:"confirmed_duplicate",matchedBatchIds:["paid"],reason:"Exact allocation"}},
   {id:"review",person:"ken",amount:25,reconciliation:{status:"review",matchedBatchIds:[],reason:"Missing match"}},
   {id:"owner",person:"mike",amount:200}
  ] as CrmPartnerPaymentHistoryBatch[];
  const before=structuredClone(ledger);const view=kenPayoffView([],ledger);
  expect(view.ready).toHaveLength(0);expect(view.history.map(b=>b.id)).toEqual(["paid"]);
  expect(view.duplicates.map(b=>b.id)).toEqual(["duplicate"]);expect(view.review.map(b=>b.id)).toEqual(["review"]);
  expect(ledger).toEqual(before);
 });

});
