import { beforeEach, afterEach, it, expect, vi } from "vitest";
import type { PaymentPlan } from "./in-house-plan-model";
const state = vi.hoisted(() => ({
  plan: null as unknown as PaymentPlan,
  tables: {} as Record<string, Record<string, any>[]>,
  optout: false,
  changed: false,
}));
vi.mock("./in-house-plans", async (original) => ({
  ...(await original<typeof import("./in-house-plans")>()),
  withPlanLease: async (_db: unknown, _id: string, fn: any) =>
    fn(state.plan, "test-lease"),
  synchronizePlan: async () => state.plan,
  loadPlanSnapshot: async () =>
    state.changed
      ? { ...state.plan.current, totalCents: 9999 }
      : state.plan.current,
  planRows: async (_db: unknown, table: string, key: string, id: string) =>
    (state.tables[table] || []).filter((x) => x[key] === id),
}));
vi.mock("./in-house-plan-delivery", async (original) => ({
  ...(await original<typeof import("./in-house-plan-delivery")>()),
  emailDeliveryStatus: async () => ({ status: "accepted" }),
}));
vi.mock("./square-payment-requests", () => ({ trackSquarePaymentRequest: vi.fn(async () => {}) }));
import {
  installmentLink,
  processPaymentPlan,
  type PlanProviders,
} from "./in-house-plan-processor";
function dbMock() {
  return {
    from: (table: string) => {
      let mode = "select",
        values: any,
        ignore = false;
      const filters: ((x: any) => boolean)[] = [];
      const q: any = {
        select: () => q,
        eq: (k: string, v: any) => {
          filters.push((x) => x[k] === v);
          return q;
        },
        in: (k: string, v: any[]) => {
          filters.push((x) => v.includes(x[k]));
          return q;
        },
        neq: (k: string, v: any) => {
          filters.push((x) => x[k] !== v);
          return q;
        },
        order: () => q,
        range: () => q,
        limit: () => q,
        update: (v: any) => {
          mode = "update";
          values = v;
          return q;
        },
        insert: (v: any) => { mode = "insert"; values = v; return q; },
        upsert: (v: any, opts: any) => {
          mode = "upsert";
          values = v;
          ignore = opts.ignoreDuplicates;
          return q;
        },
        single: () => run(true),
        maybeSingle: () => run(true),
        then: (resolve: any) => run().then(resolve),
      };
      async function run(single = false) {
        const rows = (state.tables[table] ||= table.includes("preferences")
          ? [
              {
                do_not_contact: state.optout,
                email_normalized: "synthetic@example.invalid",
                phone_e164: "+18055550100",
              },
            ]
          : table === "crm_jobs"
            ? [{ id: "job", meta: {} }]
            : []);
        if (mode === "insert") rows.push(values);
        if (mode === "upsert") {
          if (
            !ignore ||
            !rows.some(
              (x) =>
                x.plan_id === values.plan_id &&
                x.event_key === values.event_key &&
                x.channel === values.channel,
            )
          )
            rows.push({
              status: "pending",
              attempts: 0,
              created_at: new Date().toISOString(),
              ...values,
            });
        }
        const result = rows.filter((x) => filters.every((f) => f(x)));
        if (mode === "update") result.forEach((x) => Object.assign(x, values));
        return { data: single ? result[0] || null : result, error: null };
      }
      return q;
    },
  } as never;
}
function io(outcome = "accepted"): PlanProviders {
  return {
    createLink: vi.fn(),
    retireLink: vi.fn(),
    deliver: vi.fn(async () => ({
      status: outcome as "accepted",
      providerId: "test-provider",
    })),
  };
}
beforeEach(() => {
  vi.stubEnv("MIKE_805_SALES_SMS_NUMBER", "+18055550101");
  state.optout = false;
  state.changed = false;
  const current = {
    target: { quoteId: "quote" },
    jobId: "job",
    customerName: "Synthetic",
    quoteNumber: "LOCAL",
    email: "synthetic@example.invalid",
    phone: "+18055550100",
    acceptedDate: "2026-01-31",
    totalCents: 9000,
    depositCents: 3000,
    outstandingCents: 6000,
    paidCents: 3000,
    depositOutstandingCents: 0,
    creditFingerprint: "[]",
    payments: [
      {
        id: "deposit-receipt",
        cents: 3000,
        label: "Deposit",
        paidAt: "2026-01-31",
        method: "check",
      },
    ],
  };
  state.plan = {
    id: "plan",
    quote_id: "quote",
    bookkeeping_entry_id: null,
    status: "active",
    principal_cents: 9000,
    baseline: current,
    current,
    anchor_date: "2026-01-31",
    review_reason: null,
    approved_by: "signed-contract",
    approved_at: "2026-01-31",
    updated_at: "2026-01-31",
    installments: [1, 2, 3].map((n) => ({
      id: `i${n}`,
      plan_id: "plan",
      number: n,
      amount_cents: 3000,
      paid_cents: n === 1 ? 3000 : 0,
      due_date: ["2026-01-31", "2026-02-28", "2026-03-31"][n - 1],
    })),
  };
  state.tables = {
    crm_in_house_plan_links: [2, 3].map((n) => ({
      id: `link${n}`,
      plan_id: "plan",
      installment_id: `i${n}`,
      amount_cents: 3000,
      status: "active",
      square_link_id: `provider-link${n}`,
      url: `https://square.example.test/payment${n}`,
    })),
  };
});
afterEach(() => vi.unstubAllEnvs());
it("sends separate channels three days before and on the due day, deduplicating repeated runs", async () => {
  const provider = io(),
    db = dbMock();
  await processPaymentPlan(
    db,
    "plan",
    new Date("2026-02-25T17:00Z"),
    provider,
    { send: true },
  );
  expect(provider.deliver).toHaveBeenCalledTimes(2);
  expect(vi.mocked(provider.deliver).mock.calls[0][0].text).toContain(
    "payment 2 of 3",
  );
  expect(vi.mocked(provider.deliver).mock.calls[1][0].text).toContain(
    "Reply STOP",
  );
  await processPaymentPlan(
    db,
    "plan",
    new Date("2026-02-25T18:00Z"),
    provider,
    { send: true },
  );
  expect(provider.deliver).toHaveBeenCalledTimes(2);
  await processPaymentPlan(
    db,
    "plan",
    new Date("2026-02-28T17:00Z"),
    provider,
    { send: true },
  );
  expect(provider.deliver).toHaveBeenCalledTimes(4);
  expect(
    state.tables.crm_in_house_plan_notifications.map((n) => n.event_key),
  ).toEqual(["before:i2", "before:i2", "due:i2", "due:i2"]);
});
it("never retries uncertain acceptance automatically", async () => {
  const provider = io("unknown"),
    db = dbMock();
  for (let n = 0; n < 2; n++)
    await processPaymentPlan(
      db,
      "plan",
      new Date("2026-02-28T17:00Z"),
      provider,
      { send: true },
    );
  expect(provider.deliver).toHaveBeenCalledTimes(2);
  expect(
    state.tables.crm_in_house_plan_notifications.every(
      (n) => n.status === "unknown",
    ),
  ).toBe(true);
});
it("respects both channel opt-outs and records skips for staff", async () => {
  state.optout = true;
  const provider = io();
  await processPaymentPlan(
    dbMock(),
    "plan",
    new Date("2026-02-28T17:00Z"),
    provider,
    { send: true },
  );
  expect(provider.deliver).not.toHaveBeenCalled();
  expect(
    state.tables.crm_in_house_plan_notifications.map((n) => n.status),
  ).toEqual(["skipped", "skipped"]);
});
it("sends no customer follow-up after due day and repeats staff alerts weekly", async () => {
  const provider = io(),
    db = dbMock();
  for (const day of ["2026-03-01", "2026-03-02", "2026-03-08"])
    await processPaymentPlan(db, "plan", new Date(`${day}T17:00Z`), provider, {
      send: true,
    });
  expect(provider.deliver).toHaveBeenCalledTimes(2);
  expect(
    vi
      .mocked(provider.deliver)
      .mock.calls.every(([m]) => m.channel === "owner"),
  ).toBe(true);
});
it("collects only during LA business hours and on active unpaid installments", async () => {
  const provider = io(),
    db = dbMock();
  await processPaymentPlan(
    db,
    "plan",
    new Date("2026-02-28T16:00Z"),
    provider,
    { send: true },
  );
  state.plan.status = "paused";
  await processPaymentPlan(
    db,
    "plan",
    new Date("2026-02-28T17:00Z"),
    provider,
    { send: true },
  );
  state.plan.status = "active";
  state.plan.installments[1].paid_cents = 3000;
  state.plan.current = {
    ...state.plan.current,
    paidCents: 6000,
    outstandingCents: 3000,
    payments: [
      ...state.plan.current.payments,
      {
        id: "month2-receipt",
        cents: 3000,
        label: "Payment",
        paidAt: "2026-02-25",
        method: "check",
      },
    ],
  };
  await processPaymentPlan(
    db,
    "plan",
    new Date("2026-02-28T17:00Z"),
    provider,
    { send: true },
  );
  expect(provider.deliver).not.toHaveBeenCalled();
});
it("rechecks the receipt ledger before the second channel", async () => {
  const provider = io();
  vi.mocked(provider.deliver).mockImplementation(async () => {
    state.changed = true;
    return { status: "accepted", providerId: "test" };
  });
  await processPaymentPlan(
    dbMock(),
    "plan",
    new Date("2026-02-28T17:00Z"),
    provider,
    { send: true },
  );
  expect(provider.deliver).toHaveBeenCalledTimes(1);
});

it("creates checkout for the exact unpaid deposit with stable provider identity, including retry recovery", async () => {
  state.plan.status="waiting_deposit";
  const installment={...state.plan.installments[0], amount_cents:3333, paid_cents:1000};
  state.plan.installments[0]=installment;
  state.tables.crm_in_house_plan_links=[];
  const provider=io(),db=dbMock();
  vi.mocked(provider.createLink).mockResolvedValue({id:"square-id",orderId:"square-order",url:"https://square.example.test/deposit"});
  expect(await installmentLink(db,state.plan,installment,provider)).toBe("https://square.example.test/deposit");
  const saved=state.tables.crm_in_house_plan_links[0];
  expect(provider.createLink).toHaveBeenCalledWith(expect.objectContaining({amountCents:2333,paymentType:"deposit",quoteId:"quote",jobId:"job",inHousePlanId:"plan",inHouseInstallmentId:"i1",idempotencyKey:saved.id}));
  await installmentLink(db,state.plan,installment,provider);
  expect(provider.createLink).toHaveBeenCalledTimes(1);
  expect(saved.square_order_id).toBe("square-order");
});
