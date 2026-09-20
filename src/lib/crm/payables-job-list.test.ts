import { describe, expect, it } from "vitest";
import { payableFixtureRow } from "../../../e2e/fixtures/payables-data";
import { isPayablesLedgerJob } from "./owner-payables";

const ready = () => payableFixtureRow({ jobStatus: "closed", completedAt: "2026-09-10", jobClosedAt: "2026-09-10" });
describe("Payables job list eligibility", () => {
  it("includes qualifying paid-and-closed jobs, including jobs with payments already recorded", () => {
    expect(isPayablesLedgerJob(ready())).toBe(true);
  });
  it.each(["sold", "ordered", "installed", "invoiced", "lost"] as const)("excludes a paid job whose recorded status is %s", jobStatus => {
    expect(isPayablesLedgerJob({ ...ready(), jobStatus, status: "closed", liveStatus: "closed" })).toBe(false);
  });
  it("excludes unpaid closed jobs and newly sold pending jobs", () => {
    expect(isPayablesLedgerJob({ ...ready(), isPaidInFull: false, balance: 500 })).toBe(false);
    expect(isPayablesLedgerJob({ ...ready(), jobStatus: "sold", isPaidInFull: false })).toBe(false);
  });
  it("does not infer closure when the linked job's recorded status is missing", () => {
    expect(isPayablesLedgerJob({ ...ready(), jobStatus: null })).toBe(false);
    expect(isPayablesLedgerJob({ ...ready(), jobStatus: null, jobId: null })).toBe(true);
  });
  it("excludes incomplete and manually held jobs", () => {
    expect(isPayablesLedgerJob({ ...ready(), isInstallationComplete: false, completedAt: null })).toBe(false);
    for (const field of ["ownerPayableReadiness", "kenPayableReadiness"]) {
      expect(isPayablesLedgerJob({ ...ready(), meta: { [field]: { ready: false, reason: "Still open", updatedAt: "2026-09-19" } } })).toBe(false);
    }
  });
  it("never lets a readiness override admit an unpaid or reopened job", () => {
    const meta={ownerPayableReadiness:{ready:true,reason:"Manual correction",updatedAt:"2026-09-19"}};
    expect(isPayablesLedgerJob({...ready(),meta,isPaidInFull:false})).toBe(false);
    expect(isPayablesLedgerJob({...ready(),meta,jobStatus:"ordered"})).toBe(false);
  });
  it("filters without mutating financial or historical records", () => {
    const rows=[ready(),{...ready(),id:"open",jobStatus:"ordered" as const}];
    const before=structuredClone(rows);
    expect(rows.filter(isPayablesLedgerJob).map(row=>row.id)).toEqual([rows[0].id]);
    expect(rows).toEqual(before);
  });
});
