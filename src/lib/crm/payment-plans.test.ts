import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  PAYMENT_PLAN_META_KEY,
  addMonthsClamped,
  buildInstallmentAmounts,
  scheduleDueDates,
  getPaymentPlanMeta,
  hasOpenPaymentPlan,
  createPaymentPlanForJob,
  activatePaymentPlanForJob,
  markInstallmentPaid,
  cancelPaymentPlan,
  runPaymentPlanReminders,
  type CrmPaymentPlanMeta
} from "./payment-plans";

vi.mock("@/lib/notify/twilio", () => ({
  sendSms: vi.fn().mockResolvedValue({ sent: true, sid: "SM1" })
}));
vi.mock("@/lib/crm/backend", () => ({
  recordCrmActivity: vi.fn().mockResolvedValue(undefined)
}));

import { sendSms } from "@/lib/notify/twilio";
const sendSmsMock = vi.mocked(sendSms);

type Row = Record<string, unknown>;

/** Tiny stub covering the exact query shapes payment-plans.ts uses. */
function makeSupabase(job: Row | null, options: { entry?: Row | null; jobs?: Row[] } = {}) {
  const state = { job, payments: [] as Row[], planWrites: [] as Row[] };
  const supabase = {
    from: vi.fn((table: string) => {
      if (table === "crm_jobs") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: state.job, error: null }))
            })),
            not: vi.fn(() => ({
              limit: vi.fn(async () => ({ data: options.jobs ?? (state.job ? [state.job] : []), error: null }))
            }))
          })),
          update: vi.fn((patch: Row) => {
            state.planWrites.push(patch);
            if (state.job) state.job = { ...state.job, ...patch };
            return {
              eq: vi.fn(() => ({
                select: vi.fn(() => ({
                  single: vi.fn(async () => ({ data: state.job, error: null }))
                }))
              }))
            };
          })
        };
      }
      if (table === "crm_quote_bookkeeping_entries") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              limit: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({ data: options.entry ?? null, error: null }))
              }))
            }))
          }))
        };
      }
      if (table === "crm_quote_bookkeeping_payments") {
        return {
          insert: vi.fn(async (row: Row) => {
            state.payments.push(row);
            return { error: null };
          })
        };
      }
      throw new Error(`unexpected table ${table}`);
    })
  };
  return { supabase: supabase as never, state };
}

const actor = { email: "mike@805shutters.com" };

function baseJob(overrides: Row = {}): Row {
  return {
    id: "job-1",
    status: "sold",
    customer_name: "susan milani",
    phone: "8055551234",
    estimated_total: 6000,
    meta: {},
    ...overrides
  };
}

describe("schedule math", () => {
  it("splits totals into cent-safe equal installments", () => {
    expect(buildInstallmentAmounts(1543.75, 6)).toEqual([257.29, 257.29, 257.29, 257.29, 257.29, 257.3]);
    expect(buildInstallmentAmounts(1543.75, 6).reduce((a, b) => a + b, 0)).toBeCloseTo(1543.75, 2);
    expect(buildInstallmentAmounts(100, 1)).toEqual([100]);
  });

  it("adds months with end-of-month clamping", () => {
    expect(addMonthsClamped("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonthsClamped("2026-07-15", 3)).toBe("2026-10-15");
    expect(addMonthsClamped("2026-11-30", 3)).toBe("2027-02-28");
  });

  it("anchors the first payment to the install day", () => {
    expect(scheduleDueDates("2026-07-05", 3)).toEqual(["2026-07-05", "2026-08-05", "2026-09-05"]);
  });
});

describe("createPaymentPlanForJob", () => {
  it("creates a pending plan (no due dates) before install", async () => {
    const { supabase, state } = makeSupabase(baseJob());
    const { plan } = await createPaymentPlanForJob(
      supabase,
      "job-1",
      { financed_total: 3000, installment_count: 6, method: "zelle" },
      actor
    );
    expect(plan.status).toBe("pending_install");
    expect(plan.installments).toHaveLength(6);
    expect(plan.installments.every((i) => i.due_date === null)).toBe(true);
    expect(state.planWrites).toHaveLength(1);
  });

  it("activates immediately when the job is already installed", async () => {
    const { supabase } = makeSupabase(baseJob({ status: "installed" }));
    const { plan } = await createPaymentPlanForJob(
      supabase,
      "job-1",
      { financed_total: 3000, installment_count: 6 },
      actor
    );
    expect(plan.status).toBe("active");
    expect(plan.installments[0].due_date).toBe(new Date().toISOString().slice(0, 10));
  });

  it("rejects a second open plan and bad inputs", async () => {
    const existing: Partial<CrmPaymentPlanMeta> = { status: "active", installments: [] };
    const { supabase } = makeSupabase(baseJob({ meta: { [PAYMENT_PLAN_META_KEY]: existing } }));
    await expect(
      createPaymentPlanForJob(supabase, "job-1", { financed_total: 1000, installment_count: 6 }, actor)
    ).rejects.toThrow(/already has an open payment plan/);

    const { supabase: s2 } = makeSupabase(baseJob());
    await expect(
      createPaymentPlanForJob(s2, "job-1", { financed_total: 0, installment_count: 6 }, actor)
    ).rejects.toThrow(/greater than zero/);
    await expect(
      createPaymentPlanForJob(s2, "job-1", { financed_total: 1000, installment_count: 13 }, actor)
    ).rejects.toThrow(/between 1 and 12/);
  });
});

describe("activatePaymentPlanForJob", () => {
  beforeEach(() => sendSmsMock.mockClear());

  it("anchors due dates to the install date and texts the customer", async () => {
    const pending: Partial<CrmPaymentPlanMeta> = {
      status: "pending_install",
      financed_total: 3000,
      installment_count: 3,
      method: "zelle",
      installments: [1, 2, 3].map((seq) => ({
        seq,
        amount: 1000,
        due_date: null,
        paid_at: null,
        paid_amount: null,
        payment_type: null,
        reminder_sent_at: null,
        overdue_notice_sent_at: null
      }))
    };
    const { supabase, state } = makeSupabase(baseJob({ meta: { [PAYMENT_PLAN_META_KEY]: pending } }));
    const result = await activatePaymentPlanForJob(supabase, "job-1", actor, "2026-07-05");
    expect(result.activated).toBe(true);
    const saved = getPaymentPlanMeta((state.planWrites[0] as { meta: unknown }).meta)!;
    expect(saved.status).toBe("active");
    expect(saved.installments.map((i) => i.due_date)).toEqual(["2026-07-05", "2026-08-05", "2026-09-05"]);
    expect(sendSmsMock).toHaveBeenCalledOnce();
    expect(String(sendSmsMock.mock.calls[0][0].body)).toContain("due today");
  });

  it("does nothing without a pending plan", async () => {
    const { supabase } = makeSupabase(baseJob());
    const result = await activatePaymentPlanForJob(supabase, "job-1", actor);
    expect(result.activated).toBe(false);
    expect(sendSmsMock).not.toHaveBeenCalled();
  });
});

function activePlan(): CrmPaymentPlanMeta {
  return {
    status: "active",
    financed_total: 3000,
    installment_count: 3,
    method: "zelle",
    created_at: "2026-07-01T00:00:00Z",
    created_by: "mike@805shutters.com",
    activated_at: "2026-07-05T00:00:00Z",
    installments: [1, 2, 3].map((seq) => ({
      seq,
      amount: 1000,
      due_date: `2026-0${6 + seq}-05`,
      paid_at: null,
      paid_amount: null,
      payment_type: null,
      reminder_sent_at: null,
      overdue_notice_sent_at: null
    }))
  };
}

describe("markInstallmentPaid", () => {
  it("stamps the installment and mirrors it into the ledger", async () => {
    const { supabase, state } = makeSupabase(baseJob({ meta: { [PAYMENT_PLAN_META_KEY]: activePlan() } }), {
      entry: { id: "entry-1" }
    });
    const { plan } = await markInstallmentPaid(supabase, "job-1", 1, { payment_type: "zelle" }, actor);
    expect(plan.installments[0].paid_at).toBeTruthy();
    expect(plan.status).toBe("active");
    expect(state.payments).toHaveLength(1);
    expect(state.payments[0]).toMatchObject({
      bookkeeping_entry_id: "entry-1",
      payment_label: "Payment plan 1/3",
      payment_type: "zelle",
      amount: 1000
    });
  });

  it("completes the plan when the last installment is paid", async () => {
    const plan = activePlan();
    plan.installments[0].paid_at = "2026-07-05";
    plan.installments[1].paid_at = "2026-08-05";
    const { supabase } = makeSupabase(baseJob({ meta: { [PAYMENT_PLAN_META_KEY]: plan } }));
    const { plan: updated } = await markInstallmentPaid(supabase, "job-1", 3, {}, actor);
    expect(updated.status).toBe("completed");
    expect(updated.completed_at).toBeTruthy();
  });

  it("refuses double payment", async () => {
    const plan = activePlan();
    plan.installments[0].paid_at = "2026-07-05";
    const { supabase } = makeSupabase(baseJob({ meta: { [PAYMENT_PLAN_META_KEY]: plan } }));
    await expect(markInstallmentPaid(supabase, "job-1", 1, {}, actor)).rejects.toThrow(/already marked paid/);
  });
});

describe("cancelPaymentPlan", () => {
  it("cancels an open plan and clears the open flag", async () => {
    const { supabase, state } = makeSupabase(baseJob({ meta: { [PAYMENT_PLAN_META_KEY]: activePlan() } }));
    const { plan } = await cancelPaymentPlan(supabase, "job-1", actor, "customer paid in full");
    expect(plan.status).toBe("canceled");
    expect(plan.notes).toContain("customer paid in full");
    expect(hasOpenPaymentPlan((state.job as Row).meta)).toBe(false);
  });
});

describe("runPaymentPlanReminders", () => {
  beforeEach(() => sendSmsMock.mockClear());

  it("sends an upcoming reminder once and stamps it", async () => {
    const plan = activePlan();
    plan.installments[0].due_date = "2026-07-07"; // 2 days out
    const job = baseJob({ meta: { [PAYMENT_PLAN_META_KEY]: plan } });
    const { supabase, state } = makeSupabase(job, { jobs: [job] });
    const summary = await runPaymentPlanReminders(supabase, new Date("2026-07-05T17:00:00Z"));
    expect(summary).toMatchObject({ plansChecked: 1, remindersSent: 1, overdueNoticesSent: 0 });
    expect(sendSmsMock).toHaveBeenCalledOnce();
    const saved = getPaymentPlanMeta((state.planWrites.at(-1) as { meta: unknown }).meta)!;
    expect(saved.installments[0].reminder_sent_at).toBeTruthy();
  });

  it("sends overdue notices to the customer and the shop", async () => {
    process.env.MIKE_805_SALES_SMS_NUMBER = "8055550000";
    const plan = activePlan();
    plan.installments[0].due_date = "2026-06-25"; // 10 days late
    plan.installments[0].reminder_sent_at = "2026-06-22T00:00:00Z";
    const job = baseJob({ meta: { [PAYMENT_PLAN_META_KEY]: plan } });
    const { supabase } = makeSupabase(job, { jobs: [job] });
    const summary = await runPaymentPlanReminders(supabase, new Date("2026-07-05T17:00:00Z"));
    expect(summary.overdueNoticesSent).toBe(1);
    const bodies = sendSmsMock.mock.calls.map((c) => String(c[0].body));
    expect(bodies.some((b) => b.includes("hasn't come through"))).toBe(true);
    expect(bodies.some((b) => b.includes("OVERDUE"))).toBe(true);
    delete process.env.MIKE_805_SALES_SMS_NUMBER;
  });

  it("skips paid installments and inactive plans", async () => {
    const plan = activePlan();
    plan.installments.forEach((inst) => {
      inst.paid_at = "2026-07-01";
    });
    const job = baseJob({ meta: { [PAYMENT_PLAN_META_KEY]: plan } });
    const { supabase } = makeSupabase(job, { jobs: [job] });
    const summary = await runPaymentPlanReminders(supabase, new Date("2026-07-05T17:00:00Z"));
    expect(summary.remindersSent).toBe(0);
    expect(sendSmsMock).not.toHaveBeenCalled();
  });
});
