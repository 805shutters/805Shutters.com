import { describe, it, expect } from "vitest";
import { deriveJobProgress, type InstallerOutcomeEvidence } from "./job-progress";
import type { CrmJob, CrmQuote } from "./types";
const base = { isSale: true, installedAt: null, orderedAt: null, balanceOutstanding: 0, depositOutstanding: 0, signedAt: "2026-09-01", signatureRecorded: true, unambiguousJob: true, quote: { id: "q1", job_id: "j1", status: "sold" } as CrmQuote };
const report = (outcome: string, extra: Partial<InstallerOutcomeEvidence> = {}): InstallerOutcomeEvidence => ({ id: "f1", quote_id: "q1", job_id: "j1", status: "completed", signed_at: "2026-09-02T12:00:00Z", issues: [], meta: { workflow: { outcome, updatedAt: "2026-09-02T12:00:00Z" } }, ...extra });
describe("shared evidence-derived progress", () => {
  it("keeps fully prepaid work active before ordering", () => { expect(deriveJobProgress(base)).toMatchObject({ active: true, payment: "settled", product: "unprepared", installation: "unverified", stage: "need_to_order" }); });
  it("routes a sold record with no payment authority to evidence review", () => { expect(deriveJobProgress({ ...base, balanceOutstanding: null, depositOutstanding: null })).toMatchObject({ active: true, payment: "unknown", stage: "attention" }); });
  it("never infers receipt from ordering or payment", () => { expect(deriveJobProgress({ ...base, orderedAt: "2026-09-02" }).product).toBe("ordered"); });
  it("latest partial report defeats an older completed date", () => {
    const result = deriveJobProgress({ ...base, installedAt: "2026-08-01", installerOutcomes: [report("partially_completed")], recordedStage: "complete" });
    expect(result).toMatchObject({ active: true, installation: "partial", stage: "attention" }); expect(result.conflicts).not.toHaveLength(0);
  });
  it("completed report with an issue remains open for service", () => { expect(deriveJobProgress({ ...base, installerOutcomes: [report("completed", { issues: [{ lineId: "line1", notInstalled: false, details: "Damaged tilt rod" }] })] })).toMatchObject({ active: true, installation: "complete", service: "open", stage: "attention" }); });
  it("completed unpaid work enters the same balance queue", () => { expect(deriveJobProgress({ ...base, balanceOutstanding: 500, installerOutcomes: [report("completed")] }).stage).toBe("balance_needed"); });
  it("an exact sibling quote and ambiguous job-only report cannot complete this order", () => { expect(deriveJobProgress({ ...base, unambiguousJob: false, installerOutcomes: [report("completed", { quote_id: "q2" }), report("completed", { quote_id: null })] }).installation).toBe("unverified"); });
  it("newer revision controls the outcome independently of array order", () => { expect(deriveJobProgress({ ...base, installerOutcomes: [report("completed", { id: "older", updated_at: "2026-09-01", meta: {} }), report("incomplete")] }).installation).toBe("partial"); });
  it("missing sources prevent clean closure and stay visible", () => { expect(deriveJobProgress({ ...base, installerOutcomes: [report("completed")], sourceHealth: [{ source: "installer outcomes", state: "unavailable", loadedAt: "2026-09-04" }] })).toMatchObject({ active: true, stage: "attention", confidence: "needs_verification" }); });
  it("respects required and no-measure branches", () => {
    expect(deriveJobProgress({ ...base, job: { id: "j1", meta: { measure_needed: { status: "needed" } } } as unknown as CrmJob }).stage).toBe("need_measure");
    expect(deriveJobProgress({ ...base, job: { id: "j1", meta: { measure_needed: { status: "not_needed" } } } as unknown as CrmJob }).stage).toBe("need_to_order");
  });
  it("a payment request does not satisfy the deposit", () => { expect(deriveJobProgress({ ...base, balanceOutstanding: 1000, depositOutstanding: 500 }).stage).toBe("sold_need_deposit"); });
});
