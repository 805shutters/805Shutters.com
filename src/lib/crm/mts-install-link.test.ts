import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CrmAuthError } from "@/lib/crm/auth";
import {
  attachMtsInstallLinks,
  jobMetaWithoutMtsInstallLink,
  MtsInstallLinkError,
  validateMtsInstallLinkInput,
} from "@/lib/crm/mts-install-link";
import { upsertJobMtsInstallLink } from "@/lib/crm/mts-install-link-server";

const jobId = "11111111-1111-4111-8111-111111111111";

function summary(overrides: Record<string, unknown> = {}) {
  return {
    mts_job_id: "mts-job-18",
    mts_job_number: "MTS-88",
    scheduled_install_date: "2026-12-02",
    install_status: "scheduled",
    verified_completion_date: null,
    open_issues: "Latch is loose",
    charge_amount: 450,
    charge_basis: "estimated",
    record_references: {
      mts_job_ref: "MTS-88",
      mts_invoice_number: "INV-19",
      bill_805_ref: "BILL-3",
      contract_number: "805-1044",
      work_order: "WO-19",
      purchase_order: "PO-7",
    },
    match_basis: "contract_number",
    match_status: "verified",
    ...overrides,
  };
}

describe("MTS install link validation", () => {
  it("keeps the allowed summary and normalizes issues", () => {
    const saved = validateMtsInstallLinkInput(summary());
    expect(saved).toMatchObject({
      mts_job_id: "mts-job-18",
      mts_job_number: "MTS-88",
      scheduled_install_date: "2026-12-02",
      install_status: "scheduled",
      verified_completion_date: null,
      open_issues: ["Latch is loose"],
      charge_amount: 450,
      charge_basis: "estimated",
      match_basis: "contract_number",
      match_status: "verified",
    });
    expect(saved.record_references).toEqual({
      mts_job_ref: "MTS-88",
      mts_invoice_number: "INV-19",
      bill_805_ref: "BILL-3",
      contract_number: "805-1044",
      work_order: "WO-19",
      purchase_order: "PO-7",
    });
    expect(saved).not.toHaveProperty("last_verified_at");
    expect(saved).not.toHaveProperty("verified_by");
  });

  it.each(["estimated", "invoiced"] as const)("accepts charge basis %s when an amount is set", (charge_basis) => {
    expect(validateMtsInstallLinkInput(summary({ charge_basis, charge_amount: 0 })).charge_basis).toBe(charge_basis);
  });

  it("requires charge_basis estimated or invoiced when an amount is set", () => {
    expect(() => validateMtsInstallLinkInput(summary({ charge_basis: undefined }))).toThrow(MtsInstallLinkError);
    expect(() => validateMtsInstallLinkInput(summary({ charge_basis: undefined }))).toThrow(/estimated or invoiced/);
    expect(() => validateMtsInstallLinkInput(summary({ charge_basis: "payroll" }))).toThrow(/estimated or invoiced/);
    expect(() => validateMtsInstallLinkInput(summary({ charge_amount: null, charge_basis: "estimated" }))).toThrow(/requires an install charge amount/);
  });

  it.each([
    "customer_phone",
    "customer_name",
    "customer_email",
    "installer_pay",
    "contractor_pay",
    "payroll",
    "labor_cost",
    "verified_by",
    "last_verified_at",
  ])("rejects %s", (field) => {
    expect(() => validateMtsInstallLinkInput(summary({ [field]: "secret" }))).toThrow(
      new MtsInstallLinkError(`MTS install link field is not allowed: ${field}`)
    );
  });

  it("rejects a customer phone hidden in record references", () => {
    expect(() => validateMtsInstallLinkInput(summary({
      record_references: { contract_number: "805-1044", customer_phone: "8055550100" },
    }))).toThrow(/customer_phone/);
  });

  it("attaches one parsed link per job and strips the summary from job meta", () => {
    const [job] = attachMtsInstallLinks(
      [{ id: jobId, customer_name: "Ada" }],
      [{
        job_id: jobId,
        ...validateMtsInstallLinkInput(summary()),
        customer_phone: "8055550199",
        installer_pay: 80,
        last_verified_at: "2026-11-15T20:00:00.000Z",
        verified_by: "805 Financial",
      }]
    );
    expect(job.mts_install_link?.mts_job_number).toBe("MTS-88");
    expect(job.mts_install_link).not.toHaveProperty("customer_phone");
    expect(job.mts_install_link).not.toHaveProperty("installer_pay");
    expect(attachMtsInstallLinks([{ id: "other" }], [])[0].mts_install_link).toBeNull();
    expect(jobMetaWithoutMtsInstallLink({
      mts_install_link: { customer_phone: "8055550199" },
      lead_source: "referral",
    })).toEqual({ lead_source: "referral" });
  });

  it("is an upsert per job and stamps the verifier instead of accepting one", async () => {
    const rows = new Map<string, Record<string, unknown>>();
    const calls: Array<Record<string, unknown>> = [];
    const supabase = {
      rpc: async (fn: string, args: Record<string, unknown>) => {
        calls.push({ fn, ...args });
        const payload = args.p_payload as Record<string, unknown>;
        const row = {
          job_id: args.p_job_id,
          ...payload,
          last_verified_at: "2026-11-15T20:00:00.000Z",
          verified_by: args.p_actor,
        };
        rows.set(String(args.p_job_id), row);
        return { data: row, error: null };
      },
    };
    const first = await upsertJobMtsInstallLink(supabase as never, jobId, summary(), { email: "805 Financial", userId: null });
    const second = await upsertJobMtsInstallLink(supabase as never, jobId, summary({
      install_status: "complete",
      verified_completion_date: "2026-12-09",
      charge_amount: 500,
      charge_basis: "invoiced",
    }), { email: "805 Financial" });
    expect(rows.size).toBe(1);
    expect(calls.map((call) => call.fn)).toEqual(["crm_upsert_job_mts_install_link", "crm_upsert_job_mts_install_link"]);
    expect(calls.every((call) => call.p_job_id === jobId)).toBe(true);
    expect(calls[1].p_payload).not.toHaveProperty("verified_by");
    expect(first.charge_basis).toBe("estimated");
    expect(second).toMatchObject({
      job_id: jobId,
      install_status: "complete",
      verified_completion_date: "2026-12-09",
      charge_amount: 500,
      charge_basis: "invoiced",
      verified_by: "805 Financial",
    });
  });

  it("does not call the database when the payload has a forbidden field", async () => {
    const rpc = () => Promise.reject(new Error("should not write"));
    await expect(upsertJobMtsInstallLink({ rpc } as never, jobId, summary({ installer_pay: 80 }), { email: "805 Financial" }))
      .rejects.toBeInstanceOf(CrmAuthError);
  });
});

describe("MTS install link migration", () => {
  const sql = readFileSync("supabase/migrations/20261115040000_crm_job_mts_install_links.sql", "utf8");

  it("is additive and does not change crm_jobs", () => {
    expect(sql).toMatch(/create table public\.crm_job_mts_install_links/i);
    expect(sql).not.toMatch(/\bdrop\s+(table|column)\b/i);
    expect(sql).not.toMatch(/\brename\s+(to|column)\b/i);
    expect(sql).not.toMatch(/\balter\s+column\b/i);
    expect(sql).not.toMatch(/alter\s+table\s+public\.crm_jobs/i);
    expect(sql).not.toMatch(/\bupdate\s+public\.crm_jobs\b/i);
    expect(sql).not.toMatch(/\binsert\s+into\s+public\.crm_jobs\b/i);
  });
});
