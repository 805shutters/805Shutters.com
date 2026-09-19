import { describe, it, expect } from "vitest";
import { payableFixtureRow } from "../../../e2e/fixtures/payables-data";
import { buildOwnerPayablesLedger } from "./owner-payables";
import { eligibleBeforeCutoff, kenPayableReadiness, nextKenDueDate } from "./ken-monthly-ledger";
import type { CrmKenPayment } from "./types";
const now = "2026-09-18T19:00:00Z";
const row = (id = "one", total = 1000) => payableFixtureRow({ id, jobId: `job-${id}`, total, jobClosedAt: "2026-09-10T20:00:00Z", completedAt: "2026-09-10T19:00:00Z", payments: [{ ...payableFixtureRow().payments[0], amount: total, paid_at: "2026-09-09" }] });
function payment(id: string, amount: number, item = "one", extra: Partial<CrmKenPayment> = {}): CrmKenPayment {
  return { id, amount, created_at: now, updated_at: now, paid_on: "2026-09-01", period_month: null, note: "Payment", created_by_email: null, meta: { selectedItemAllocations: [{ item_key: `ken:manual:${item}`, bookkeeping_entry_id: item, source: "manual", amount }] }, ...extra };
}
const ledger = (rows = [row()], kenPayments: CrmKenPayment[] = []) => buildOwnerPayablesLedger({ rows, kenPayments, commissionPayments: [], now });
describe("Ken reconciled monthly ledger", () => {
  it("reconciles the three payments and $3,778 checkbox entries including Elizabeth exactly once", () => {
    const july = [134.3,523,250,270.4,211.3,250,105.4,77.5,308,32.5,348,385,48.3,771];
    const makeBatch = (id: string, date: string, amounts: number[], start: number) => payment(id, Math.round(amounts.reduce((a,b) => a+b,0)*100)/100, "unused", { paid_on: date, meta: { selectedItemAllocations: amounts.map((amount,i) => ({ item_key: `ken:manual:job-${start+i}`, bookkeeping_entry_id: `job-${start+i}`, source: "manual", amount })) } });
    const aug = [63.3,5391.14];
    const payments = [makeBatch("july", "2026-07-04", july,0),makeBatch("aug", "2026-08-02",aug,14),makeBatch("sept","2026-09-01",[4160.53],16), ...[...july,63.3].map((amount,i) => payment(`marker-${i}`, amount, `job-${i}`, { note: "Manual paid checkbox reconciliation for customer" }))];
    const rows = [...july,...aug,4160.53].map((amount,i) => row(`job-${i}`,Math.round(amount*1000)/100));
    const source = structuredClone({rows,payments});
    const result = ledger(rows,payments);
    expect(result.kenMonthly).toMatchObject({ recordedTotal:13329.67,excludedDuplicates:3778,dueDate:"2026-10-01" });
    expect(result.kenBuyout).toMatchObject({ totalPaid:13329.67,remainingBalance:486670.33,paymentCount:3 });
    expect(result.history.filter(b=>b.reconciliation?.status === "confirmed_duplicate")).toHaveLength(15);
    expect(result.people.ken.items.reduce((sum,item)=>sum+item.paidAmount,0)).toBeCloseTo(13329.67);
    expect({rows,payments}).toEqual(source);
    expect(ledger(JSON.parse(JSON.stringify(rows)),JSON.parse(JSON.stringify(payments)))).toEqual(result);
  });
  it("never uses old checkbox balances to pay newer jobs", () => {
    const result = ledger([row("old"),row("new")], [payment("batch",100,"old"),payment("marker",100,"old",{note:"Manual paid checkbox reconciliation for old"})]);
    expect(result.people.ken.items.find(i=>i.itemKey.endsWith(":new"))).toMatchObject({paidAmount:0,remainingAmount:100});
    expect(result.people.ken.owed).toBe(100);
  });
  it("does not reconcile by customer name, amount alone, or an ambiguous allocation", () => {
    const marker=payment("marker",100,"other",{note:"Manual paid checkbox reconciliation for same name"});
    expect(ledger([row()], [payment("batch",100),marker]).history.find(b=>b.id==="marker")?.reconciliation?.status).toBe("review");
    const duplicate=payment("marker",100,"one",{note:marker.note});
    expect(ledger([row()], [payment("batch",100),payment("second",100),duplicate]).history.find(b=>b.id==="marker")?.reconciliation?.status).toBe("review");
  });
  it("preserves partial allocations, carries the remainder, and freezes paid batches", () => {
    const source=payment("partial",40);
    const before=structuredClone(source);
    const result=ledger([row(),row("new")],[source]);
    expect(result.people.ken.items[0]).toMatchObject({paidAmount:40,remainingAmount:60,paymentState:"partial"});
    expect(result.kenMonthly?.total).toBe(160);
    expect(result.history[0].allocations).toHaveLength(1);
    expect(source).toEqual(before);
  });
  it("requires paid, complete and closed, and flags missing dates without inventing them", () => {
    for (const patch of [{isPaidInFull:false},{isInstallationComplete:false,completedAt:null},{jobStatus:"installed" as const}]) expect(ledger([{...row(),...patch}]).people.ken.items).toHaveLength(0);
    const result=ledger([{...row(),jobClosedAt:null}]);
    expect(result.kenMonthly?.items).toHaveLength(0);
    expect(result.kenMonthly?.review[0].reason).toMatch(/Missing/);
  });
  it("assigns completion after September payment to October and uses Pacific month boundaries", () => {
    expect(ledger().kenMonthly?.items[0].dueDate).toBe("2026-10-01");
    expect(nextKenDueDate("2026-10-01T01:00:00Z")).toBe("2026-10-01");
    expect(nextKenDueDate("2026-10-01T08:00:00Z")).toBe("2026-11-01");
    expect(nextKenDueDate("2026-12-31")).toBe("2027-01-01");
  });
  it("handles same-day cutoffs strictly and flags date-only ordering as unsafe", () => {
    expect(eligibleBeforeCutoff("2026-09-01T16:00:00Z","2026-09-01T17:00:00Z")).toBe(true);
    expect(eligibleBeforeCutoff("2026-09-01T17:00:00Z","2026-09-01T17:00:00Z")).toBe(false);
    expect(eligibleBeforeCutoff("2026-09-01T18:00:00Z","2026-09-01T17:00:00Z")).toBe(false);
    expect(eligibleBeforeCutoff("2026-09-01","2026-09-01T17:00:00Z")).toBe(false);
    expect(eligibleBeforeCutoff("2026-08-31","2026-09-01")).toBe(true);
  });
  it("keeps the first-of-month ledger due today until a payment is recorded", () => {
    const input={rows:[row()],kenPayments:[],commissionPayments:[],now:"2026-10-01T15:00:00Z"};
    expect(buildOwnerPayablesLedger(input).kenMonthly?.dueDate).toBe("2026-10-01");
    expect(buildOwnerPayablesLedger({...input,kenPayments:[payment("oct",40,"one",{paid_on:"2026-10-01"})]}).kenMonthly?.dueDate).toBe("2026-11-01");
  });
  it("manual readiness needs a reason and time, is scoped to Ken, and does not record cash", () => {
    const pending={...row(),isPaidInFull:false,meta:{kenPayableReadiness:{ready:true,reason:"Verified closed and paid",updatedAt:now}}};
    expect(kenPayableReadiness(pending).ready).toBe(true);
    const result=ledger([pending]);
    expect(result.people.ken.owed).toBe(100);
    expect(result.kenBuyout.totalPaid).toBe(0);
    expect(result.people.mike.earned).toBe(0);
    expect(kenPayableReadiness({...pending,meta:{kenPayableReadiness:{ready:true}}}).ready).toBe(false);
  });
  it("retains a historical paid allocation when a job is reopened", () => {
    const result=ledger([{...row(),jobStatus:"sold"}], [payment("batch",40)]);
    expect(result.people.ken.items[0]).toMatchObject({paidAmount:40,remainingAmount:0});
    expect(result.kenMonthly?.items).toHaveLength(0);
  });
});
