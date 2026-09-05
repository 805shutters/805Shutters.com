import { expect, it } from "vitest";
import { buildOperationsReports, businessDate } from "./operations-reports";
import { buildDashboardData } from "./backend";
import type { CrmJob, CrmQuote, CrmBookkeepingPayment } from "./types";
const stamp = "2026-09-04T20:00:00Z";
const opts = { from: "2026-08-01", through: "2026-09-04", asOf: stamp };
const job = (id: string) =>
  ({
    id,
    customer_name: "Repeat customer",
    status: "sold",
    meta: {},
    created_at: stamp,
    updated_at: stamp,
  }) as CrmJob;
const quote = (id: string, job_id = id, extra: Partial<CrmQuote> = {}) =>
  ({
    id,
    job_id,
    status: "sent",
    quote_total: 1000,
    materials_cost: 200,
    deposit_required: 500,
    balance_due: 1000,
    created_at: stamp,
    updated_at: stamp,
    sent_at: "2026-08-01T18:00:00Z",
    meta: {},
    ...extra,
  }) as CrmQuote;
const dashboard = (
  quotes: CrmQuote[],
  payments: CrmBookkeepingPayment[] = [],
) =>
  buildDashboardData({
    jobs: [...new Set(quotes.map((q) => q.job_id))].map(job),
    quotes,
    payments,
    events: [],
    customers: [],
    products: [],
    contracts: [],
    entries: [],
    credits: [],
    expenses: [],
    installationInvoiceEmails: [],
    kenPayments: [],
    openingBalance: 0,
    payoffTarget: 500000,
  });
it("uses Pacific dates without shifting date-only receipts", () => {
  expect(businessDate("2026-09-05T02:00:00Z")).toBe("2026-09-04");
  expect(businessDate("2026-09-05")).toBe("2026-09-05");
  expect(businessDate("2026-02-30")).toBeNull();
});
it("counts a repeat customer new opportunity independently and only latest offered version", () => {
  const data = dashboard([
    quote("old", "house", {
      quote_group_id: "old",
      status: "sold",
      signed_at: "2026-06-01T18:00:00Z",
      sent_at: "2026-05-01T18:00:00Z",
    }),
    quote("v1", "house", { quote_group_id: "new" }),
    quote("v2", "house", {
      quote_group_id: "new",
      quote_total: 2400,
      sent_at: "2026-08-10T18:00:00Z",
    }),
  ]);
  const reports = buildOperationsReports(data, opts);
  expect(reports.find((r) => r.id === "conversion")).toMatchObject({
    value: 0,
    records: [{ status: "open" }],
  });
  expect(reports.find((r) => r.id === "pipeline")).toMatchObject({
    value: 2400,
    records: [{ quoteId: "v2" }],
  });
});
it("holds ambiguous grouping and missing dates out of date-based totals", () => {
  const data = dashboard([
    quote("a", "same"),
    quote("b", "same"),
    quote("sold", "sold", {
      status: "sold",
      signed_at: null,
      sold_at: null,
      sent_at: null,
    }),
  ]);
  const reports = buildOperationsReports(data, opts);
  expect(reports.find((r) => r.id === "grouping")?.records).toHaveLength(2);
  expect(reports.find((r) => r.id === "pipeline")?.value).toBe(0);
  expect(reports.find((r) => r.id === "missing-dates")?.records).toHaveLength(
    1,
  );
});
it("keeps requests out, deduplicates ledger receipts and separates refunds and unknown receipt dates", () => {
  const q = quote("q", "j", {
    status: "sold",
    sold_at: stamp,
    signed_at: stamp,
  });
  const p = {
    id: "p",
    job_id: "j",
    quote_id: "q",
    amount: 500,
    paid_at: "2026-09-04",
    created_at: stamp,
    payment_label: "Receipt",
    source: "crm_quote",
    payment_type: "cash",
  } as CrmBookkeepingPayment;
  const reports = buildOperationsReports(
    dashboard(
      [q],
      [
        p,
        p,
        { ...p, id: "refund", amount: -50 },
        { ...p, id: "unknown", paid_at: null, amount: 99 },
      ],
    ),
    opts,
  );
  expect(reports.find((r) => r.id === "collected")).toMatchObject({
    value: 500,
    status: "incomplete",
  });
  expect(reports.find((r) => r.id === "refunds")?.value).toBe(-50);
  expect(reports.find((r) => r.id === "net-collected")?.value).toBe(450);
  expect(reports.find((r) => r.id === "invoiced")).toMatchObject({
    value: null,
    status: "unavailable",
  });
});
it("allocates only an exact reconciled schedule and does not call future installments overdue", () => {
  const data = dashboard([
    quote("q", "j", { status: "sold", sold_at: stamp, signed_at: stamp }),
  ]);
  data.jobs[0].meta = {
    payment_plan: {
      status: "active",
      installments: [
        { seq: 1, amount: 400, due_date: "2026-09-01", paid_at: null },
        { seq: 2, amount: 600, due_date: "2026-10-01", paid_at: null },
      ],
    },
  };
  let rows = buildOperationsReports(data, opts).find(
    (r) => r.id === "receivables",
  )!.records;
  expect(rows.map((r) => [r.status, r.amount])).toEqual([
    ["overdue", 400],
    ["future", 600],
  ]);
  data.jobs[0].meta.payment_plan = {
    status: "active",
    installments: [{ seq: 1, amount: 999, due_date: "2026-09-01" }],
  };
  rows = buildOperationsReports(data, opts).find(
    (r) => r.id === "receivables",
  )!.records;
  expect(rows).toMatchObject([{ status: "due date unknown", amount: 1000 }]);
});
it("makes source-dependent totals unavailable, with contributing evidence retained", () => {
  const data = dashboard([
    quote("q", "j", { status: "sold", sold_at: stamp, signed_at: stamp }),
  ]);
  data.sourceHealth = [
    { source: "job expenses", state: "unavailable", loadedAt: stamp },
  ];
  const r = buildOperationsReports(data, opts).find((r) => r.id === "margin")!;
  expect(r.status).toBe("unavailable");
  expect(r.value).toBeNull();
  expect(r.records).toHaveLength(1);
});
it("reconciles every additive report to its unique contributing records on a larger fixture", () => {
  const data = dashboard(
    Array.from({ length: 1000 }, (_, n) =>
      quote(
        `q${n}`,
        `j${n}`,
        n % 2 ? { status: "sold", sold_at: stamp, signed_at: stamp } : {},
      ),
    ),
  );
  const start = performance.now();
  const reports = buildOperationsReports(data, opts);
  const elapsed = performance.now() - start;
  for (const report of reports) {
    expect(new Set(report.records.map((r) => r.id)).size).toBe(
      report.records.length,
    );
    if (report.value !== null && report.format === "money")
      expect(report.value).toBeCloseTo(
        report.records.reduce((s, r) => s + (r.amount || 0), 0),
        2,
      );
  }
  expect(elapsed).toBeLessThan(5000);
  console.info(
    `Operational reports: 1000 opportunities / ${reports.length} reports in ${Math.round(elapsed)}ms`,
  );
});
it("excludes explicitly labeled test jobs and linked ledger records without changing stored data", () => {
  const data=dashboard([quote("real","real",{status:"sold",sold_at:stamp,signed_at:stamp}),quote("fixture","fixture",{status:"sold",sold_at:stamp,signed_at:stamp})], [{id:"fixture-receipt",payment_label:"Receipt",source:"crm_quote",created_at:stamp,job_id:"fixture",quote_id:"fixture",amount:100,paid_at:"2026-09-04"} as CrmBookkeepingPayment]);
  data.jobs.find(j=>j.id==="fixture")!.customer_name="CODEX INSTALLER FLOW TEST __INSTALLER_FLOW_LIVE_TEST__";
  const reports=buildOperationsReports(data,opts);
  expect(reports.flatMap(r=>r.records).filter(r=>r.jobId==="fixture"||r.quoteId==="fixture")).toEqual([]);
  expect(reports.find(r=>r.id==="collected")?.value).toBe(0);
  expect(data.jobs).toHaveLength(2);
  expect(data.bookkeepingPayments).toHaveLength(1);
});
it("shows overpaid balances separately without reducing another customer's receivable",()=>{
  const data=dashboard([quote("due","due",{status:"sold",sold_at:stamp,signed_at:stamp}),quote("over","over",{status:"sold",sold_at:stamp,signed_at:stamp})], [{id:"over-receipt",payment_label:"Receipt",source:"crm_quote",created_at:stamp,job_id:"over",quote_id:"over",amount:1200,paid_at:"2026-09-04",payment_type:"cash"} as CrmBookkeepingPayment]);
  const reports=buildOperationsReports(data,opts);
  expect(reports.find(r=>r.id==="receivables")?.value).toBe(1000);
  expect(reports.find(r=>r.id==="overpayments")?.value).toBe(-200);
});
