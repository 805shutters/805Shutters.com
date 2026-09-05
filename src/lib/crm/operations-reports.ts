import {
  groupQuoteOpportunities,
  reportableQuote,
  acceptedOpportunityQuote as accepted,
} from "./quote-opportunities";
import type { CrmDashboardData, CrmActivitySnapshot, CrmQuote } from "./types";
import {
  buildJobTrackingView,
  type JobTrackingViewItem,
} from "./job-tracking-view";
import { deriveFulfillment, emptyFulfillment } from "./fulfillment";
import { getPaymentPlanMeta } from "./payment-plan-shared";

import { businessDate } from "./business-date";
export { businessDate } from "./business-date";
const days = (from: string, to: string) =>
  Math.floor((Date.parse(to) - Date.parse(from)) / 86400000);
const money = (n: number) => Math.round(n * 100) / 100;
export type ReportRecord = {
  id: string;
  jobId: string | null;
  quoteId: string | null;
  name: string;
  date: string | null;
  dateBasis: string;
  amount: number | null;
  status: string;
  reason: string;
  flags: string[];
  href: string;
  owner?: string;
  due?: string | null;
  waitingDays?: number | null;
  details?: string[];
};
export type OperationalReport = {
  id: string;
  title: string;
  unit: string;
  definition: string;
  dateBasis: string;
  records: ReportRecord[];
  value: number | null;
  format: "money" | "count" | "percent";
  status: "complete" | "incomplete" | "unavailable";
  notes: string[];
  jobCount: number;
};
export type ReportOptions = { from: string; through: string; asOf: string };
export function buildOperationsReports(
  data: CrmDashboardData,
  options: ReportOptions,
  activity?: CrmActivitySnapshot | null,
): OperationalReport[] {
  // Explicit test metadata/source markers and labeled fixture names are report exclusions,
  // not business-record deletions. Exact IDs carry the exclusion to linked ledgers.
  const markedTest = (meta: Record<string, unknown> | null | undefined, source?: string | null, name?: string | null) =>
    Boolean(meta?.is_test || meta?.test_mode || /\b(test|testing|dummy|sample|placeholder|fake|codex|e2e)\b/i.test(`${source || ""} ${name || ""}`));
  const excludedJobs = new Set(data.jobs.filter(j=>markedTest(j.meta,j.source,j.customer_name)).map(j=>j.id));
  const excludedQuotes = new Set(data.quotes.filter(q=>excludedJobs.has(q.job_id)||markedTest(q.meta,null,q.customer_name)).map(q=>q.id));
  const excluded = (jobId: string | null, quoteId: string | null) => Boolean(jobId && excludedJobs.has(jobId) || quoteId && excludedQuotes.has(quoteId));
  data = {...data,
    jobs:data.jobs.filter(j=>!excludedJobs.has(j.id)),
    quotes:data.quotes.filter(q=>!excludedQuotes.has(q.id)),
    bookkeepingRows:data.bookkeepingRows.filter(r=>!excluded(r.jobId,r.quoteId)&&!markedTest(r.meta,null,r.customerName)),
    bookkeepingPayments:data.bookkeepingPayments.filter(p=>!excluded(p.job_id,p.quote_id)),
    bookkeepingCredits:data.bookkeepingCredits.filter(c=>!excluded(null,c.to_quote_id)),
    ownedActions:data.ownedActions?.filter(a=>!excluded(a.job_id,a.quote_id)),
    customerFiles:data.customerFiles.map(f=>({...f,
      jobs:f.jobs.filter(j=>!excludedJobs.has(j.id)),
      quotes:f.quotes.filter(q=>!excludedQuotes.has(q.id)),
      bookkeepingRows:f.bookkeepingRows.filter(r=>!excluded(r.jobId,r.quoteId)&&!markedTest(r.meta,null,r.customerName)),
    })),
  };
  const today = businessDate(options.asOf)!;
  const inPeriod = (date: string | null) =>
    Boolean(
      date && date >= options.from && date <= options.through && date <= today,
    );
  const quotes = data.quotes.filter(reportableQuote);
  const jobs = new Map(data.jobs.map((j) => [j.id, j]));
  const items = buildJobTrackingView({
    jobs: data.jobs,
    quotes,
    rows: data.bookkeepingRows,
    files: data.customerFiles,
    installerOutcomes: data.installerOutcomes,
    sourceHealth: data.sourceHealth,
    fulfillment: data.fulfillment,
    ownedActions: data.ownedActions,
    orderCogsEmails: data.orderCogsEmails,
    installationInvoiceEmails: data.installationInvoiceEmails,
  });
  const sold = items.filter((i) => i.progress.commercial === "accepted");
  const href = (q: string | null, j: string | null) =>
    q
      ? `/crm/quote/${encodeURIComponent(q)}`
      : `/crm/?view=tracking${j ? "&jobId=" + encodeURIComponent(j) : ""}`;
  const quoteRecord = (q: CrmQuote): ReportRecord => ({
    id: q.id,
    jobId: q.job_id,
    quoteId: q.id,
    name:
      jobs.get(q.job_id)?.customer_name ||
      q.customer_name ||
      q.quote_number ||
      q.id,
    date: businessDate(q.sent_at),
    dateBasis: "Sent date",
    amount: Number(q.quote_total),
    status: q.status,
    reason: "Exact quote version",
    flags: [],
    href: href(q.id, q.job_id),
  });
  const itemRecord = (i: JobTrackingViewItem): ReportRecord => ({
    id: i.id,
    jobId: i.progress.identity.jobId,
    quoteId: i.progress.identity.quoteId,
    name: i.customerName,
    date: businessDate(i.soldDate),
    dateBasis: "Sold date with source provenance",
    amount: i.total,
    status: i.stageId,
    reason: i.nextAction,
    flags: [...i.progress.conflicts],
    href: href(i.progress.identity.quoteId, i.progress.identity.jobId),
    details: i.progress.evidence.map(
      (e) =>
        `${e.source}: ${e.id} · ${businessDate(e.occurredAt) || "date unknown"}`,
    ),
  });
  const reports: OperationalReport[] = [];
  const add = (
    id: string,
    title: string,
    unit: string,
    definition: string,
    dateBasis: string,
    records: ReportRecord[],
    format: OperationalReport["format"] = "count",
    required: string[] = [],
    notes: string[] = [],
    value?: number | null,
  ) => {
    const failures = (data.sourceHealth || []).filter(
      (s) =>
        s.state !== "complete" &&
        required.some((r) => s.source.toLowerCase().includes(r.toLowerCase())),
    );
    const missing = records.some(
      (r) => r.flags.length > 0 || (format === "money" && r.amount === null),
    );
    const unavailable = failures.length > 0;
    const report: OperationalReport = {
      id,
      title,
      unit,
      definition,
      dateBasis,
      records,
      format,
      value: unavailable
        ? null
        : value !== undefined
          ? value
          : format === "money"
            ? money(records.reduce((n, r) => n + (r.amount || 0), 0))
            : records.length,
      status: unavailable ? "unavailable" : missing ? "incomplete" : "complete",
      notes: [
        ...notes,
        ...failures.map((f) => f.message || `${f.source} unavailable`),
      ],
      jobCount: new Set(records.flatMap((r) => (r.jobId ? [r.jobId] : [])))
        .size,
    };
    reports.push(report);
    return report;
  };
  const { groups, review } = groupQuoteOpportunities(quotes);
  const groupingReview: ReportRecord[] = review.map((q) => ({
    ...quoteRecord(q),
    flags: [
      "Opportunity grouping missing; excluded from pipeline and conversion",
    ],
    status: "needs grouping",
  }));
  const offered: ReportRecord[] = [],
    cohort: ReportRecord[] = [];
  for (const [key, versions] of groups) {
    const sent = versions
      .filter(
        (q) => businessDate(q.sent_at) && businessDate(q.sent_at)! <= today,
      )
      .sort(
        (a, b) =>
          (a.sent_at || "").localeCompare(b.sent_at || "") ||
          a.id.localeCompare(b.id),
      );
    if (!sent.length) continue;
    const first = businessDate(sent[0].sent_at)!,
      latest = sent[sent.length - 1];
    const won = versions.filter(
      (q) =>
        accepted(q) &&
        (!businessDate(q.signed_at || q.sold_at || q.approved_at) ||
          businessDate(q.signed_at || q.sold_at || q.approved_at)! <= today),
    );
    const lost = ["lost", "declined", "archived", "canceled"].includes(
      latest.status,
    );
    const outcome = won.length ? "accepted" : lost ? "lost" : "open";
    if (inPeriod(first))
      cohort.push({
        ...quoteRecord(latest),
        id: key,
        date: first,
        dateBasis: "First sent date; acceptance through report as-of",
        status: outcome,
        reason: `${versions.length} version(s); ${outcome}`,
        flags: [
          ...(won.some(
            (q) => !businessDate(q.signed_at || q.sold_at || q.approved_at),
          )
            ? ["Legacy acceptance date missing"]
            : []),
          ...(days(first, today) < 30 ? ["Cohort younger than 30 days"] : []),
        ],
      });
    if (!won.length && !lost && inPeriod(businessDate(latest.sent_at)))
      offered.push({
        ...quoteRecord(latest),
        id: key,
        reason: "Latest active offered version in this opportunity",
      });
  }
  add(
    "pipeline",
    "Quoted pipeline",
    "opportunity",
    "Latest active sent version per stable opportunity; drafts and purchased alternatives excluded.",
    "Latest sent date",
    offered,
    "money",
    [],
    [`${groupingReview.length} quote versions need grouping review.`],
  );
  add(
    "conversion",
    "Quote conversion",
    "opportunity",
    "Accepted opportunities / all eligible sent opportunities; unresolved opportunities remain in the denominator.",
    "First sent date cohort; outcomes through as-of",
    cohort,
    "percent",
    [],
    [
      `${cohort.filter((r) => r.status === "accepted").length} accepted · ${cohort.filter((r) => r.status === "open").length} open · ${cohort.filter((r) => r.status === "lost").length} lost.`,
      `${groupingReview.length} versions excluded pending grouping.`,
    ],
    cohort.length
      ? (100 * cohort.filter((r) => r.status === "accepted").length) /
          cohort.length
      : null,
  );
  add(
    "grouping",
    "Quote grouping review",
    "quote version",
    "Multiple quotes without an explicit opportunity group need review; names are never deduplication keys.",
    "Sent date, including missing dates",
    groupingReview,
  );
  const booked = sold
    .filter((i) => inPeriod(businessDate(i.soldDate)))
    .map((i) => ({
      ...itemRecord(i),
      status: i.signatureRecorded
        ? "documented acceptance"
        : "legacy/manual sale",
      reason: i.signatureRecorded
        ? "Purchased scope; authoritative bookkeeping amount"
        : "Documented ledger sale; signed evidence needs verification",
      flags: i.signatureRecorded
        ? []
        : ["Legacy/manual sale shown separately from signed scope"],
    }));
  add(
    "booked",
    "Booked sales",
    "accepted order",
    "Canonical ledger sale value counted once; signed scope and documented legacy/manual sales are separate groups. Credits and cancellations remain separate.",
    "Accepted / sold business date",
    booked,
    "money",
    [],
    [
      "Approved changes remain in the authoritative quote/ledger value; this projection does not change pricing.",
    ],
  );
  add(
    "missing-dates",
    "Sales with unknown date",
    "accepted order",
    "Retained for review; excluded from date-based booked sales and run rate.",
    "Unknown sold date",
    sold
      .filter((i) => !businessDate(i.soldDate))
      .map((i) => ({ ...itemRecord(i), flags: ["Sold date missing"] })),
    "money",
  );
  const invoices = add(
    "invoiced",
    "Invoiced",
    "customer invoice",
    "Issued customer invoices and adjustments only. Quotes, payment links and installer invoices are not customer invoices.",
    "Invoice issue date",
    [],
    "money",
    [],
    ["No verified customer-invoice ledger is connected."],
    null,
  );
  invoices.status = "unavailable";
  const paymentRecords: ReportRecord[] = [],
    refunds: ReportRecord[] = [];
  const seenPayments = new Set<string>();
  for (const p of data.bookkeepingPayments) {
    if (seenPayments.has(p.id)) continue;
    seenPayments.add(p.id);
    const d = businessDate(p.paid_at);
    if (d && !inPeriod(d)) continue;
    const amount = Number(p.amount),
      flags = [
        ...(!d ? ["Receipt date missing; excluded from period amount"] : []),
        ...(!p.external_id
          ? ["Manual receipt; provider reconciliation not established"]
          : []),
      ];
    const rec: ReportRecord = {
      id: p.id,
      jobId: p.job_id,
      quoteId: p.quote_id,
      name: jobs.get(p.job_id || "")?.customer_name || p.payment_label,
      date: d,
      dateBasis: "Actual receipt date; entry time retained below",
      amount: d ? amount : null,
      status: amount < 0 ? "refund" : "receipt",
      reason: p.external_id
        ? `${p.external_source || "Provider"} ${p.external_id}`
        : "Recorded payment ledger entry",
      flags,
      href: href(p.quote_id, p.job_id),
      details: [
        `Entered ${p.created_at}`,
        `Payment ID ${p.id}`,
        `Method ${p.payment_type}`,
      ],
    };
    (amount < 0 ? refunds : paymentRecords).push(rec);
  }
  add(
    "collected",
    "Collected receipts",
    "payment",
    "Positive recorded receipts; requests, links, promises and credits excluded. Missing receipt dates do not contribute to period totals.",
    "Actual receipt date",
    paymentRecords,
    "money",
    [],
    ["Manual entries remain explicitly unreconciled."],
  );
  add(
    "refunds",
    "Recorded refunds",
    "payment",
    "Negative recorded payment entries, separately from credits. Provider refunds absent from this ledger remain unverified.",
    "Actual receipt/refund date",
    refunds,
    "money",
  );
  add(
    "net-collected",
    "Net collected",
    "payment",
    "Recorded receipts plus recorded negative refund entries.",
    "Actual receipt/refund date",
    [...paymentRecords, ...refunds],
    "money",
  );
  add(
    "credits",
    "Applied credits",
    "credit",
    "Credit transfers and adjustments, counted once by credit ID; excluded from collected cash.",
    "Credit business date",
    [...new Map(data.bookkeepingCredits.map((c) => [c.id, c])).values()]
      .filter((c) => inPeriod(businessDate(c.credit_date)))
      .map((c) => ({
        id: c.id,
        jobId: null,
        quoteId: c.to_quote_id,
        name: c.note || "Credit",
        date: businessDate(c.credit_date),
        dateBasis: "Credit date",
        amount: c.amount,
        status: "credit",
        reason: `From ${c.from_quote_id || c.from_bookkeeping_entry_id || "unknown"} to ${c.to_quote_id || c.to_bookkeeping_entry_id || "unknown"}`,
        flags: [],
        href: href(c.to_quote_id, null),
      })),
    "money",
  );
  const active = sold.filter((i) => i.progress.active);
  add(
    "backlog",
    "Backlog by stage",
    "accepted order",
    "Active accepted orders, including prepaid unfinished work; parent jobs counted separately.",
    "Current snapshot",
    active.map(itemRecord),
    "count",
    ["installer outcomes", "service visits", "product quantities"],
  );
  const aging = active.map((i) => {
    const record = itemRecord(i);
    // Use the evidence for this stage only, never generic updated_at or an earlier unrelated event.
    const entered =
      i.stageId === "ordered"
        ? businessDate(i.orderedAt)
        : i.stageId === "balance_needed"
          ? businessDate(
              i.progress.evidence.find((e) => e.source.includes("installer"))
                ?.occurredAt,
            )
          : null;
    const holds = (data.fulfillment?.lines || [])
      .filter((l) => l.quote_id === record.quoteId && l.hold_since)
      .map(
        (l) =>
          `${l.vendor_name}: hold since ${businessDate(l.hold_since)} · ${l.hold_reason}`,
      );
    return {
      ...record,
      date: entered,
      dateBasis: "Recorded transition evidence for current stage",
      amount: null,
      waitingDays: entered ? days(entered, today) : null,
      flags: entered ? [] : ["Stage entry history unknown"],
      details: [...(record.details || []), ...holds],
      reason: entered
        ? `${days(entered, today)} gross calendar days in stage`
        : "Unknown-history cohort",
    };
  });
  add(
    "aging",
    "Stage aging",
    "accepted order",
    "Gross elapsed calendar days from actual stage evidence; hold intervals shown separately, never inferred from updated_at.",
    "Actual transition date",
    aging,
    "count",
    [],
    activity?.warnings || [],
  );
  const physical = data.fulfillment || emptyFulfillment;
  const vendorRows: ReportRecord[] = [];
  for (const i of active) {
    const f = deriveFulfillment(
      physical,
      i.progress.identity.quoteId || "",
      today,
    );
    if (
      !f.hasEvidence &&
      ["ordered", "shipped", "partially_received", "received"].includes(
        i.progress.product,
      )
    )
      vendorRows.push({
        ...itemRecord(i),
        id: `legacy-order:${i.id}`,
        date: null,
        dateBasis: "Confirmed vendor promise unavailable",
        amount: null,
        status: "date_missing",
        reason: `${i.vendor || "Vendor unknown"} · ${i.orderReference || "Order reference unknown"} · purchased quantities need verification`,
        flags: ["Physical quantities and confirmed promise are not registered"],
        details: [...(itemRecord(i).details || [])],
      });
    for (const r of [...f.delayed, ...f.missingPromises]) {
      const changes = (activity?.activityEvents || []).filter(
        (e) =>
          e.entity_id === r.line.id &&
          e.action === "fulfillment_line" &&
          e.before_data?.promised_on !== e.after_data?.promised_on,
      );
      vendorRows.push({
        ...itemRecord(i),
        id: r.line.id,
        date: r.line.promised_on,
        dateBasis: "Latest vendor promised receipt date",
        amount: null,
        status: r.delay,
        reason: `${r.line.vendor_name} · ${r.line.vendor_order_ref || "Reference missing"} · ${r.remaining} units remain`,
        flags: r.delay === "date_missing" ? ["Confirmed promise missing"] : [],
        details: [
          `Original promise: ${r.line.original_promised_on || "unknown"}`,
          `Recorded promise changes: ${activity ? changes.length : "history unavailable"}`,
          `Hold: ${r.line.hold_reason || "none recorded"}`,
        ],
      });
    }
  }
  add(
    "vendor-delays",
    "Vendor delays / dates missing",
    "order/opening evidence record",
    "Unreceived quantities past the latest confirmed promise, plus missing-promise records. Holds remain visible.",
    "Promised receipt date",
    vendorRows,
    "count",
    ["product quantities", "shipment and receipt evidence"],
  );
  const ready = active.filter(
    (i) =>
      deriveFulfillment(physical, i.progress.identity.quoteId || "", today)
        .complete &&
      i.signatureRecorded &&
      ["Measured", "Not needed"].includes(i.measureStatus) &&
      i.progress.service === "none_known" &&
      !i.progress.blockers.length &&
      i.progress.installation !== "complete",
  );
  add(
    "ready",
    "Ready to schedule",
    "accepted order",
    "Verified purchased quantities physically received, signed scope, required measure satisfied, no blocking issue or deposit prerequisite.",
    "Current snapshot",
    ready.map((i) => ({
      ...itemRecord(i),
      reason: "All shared prerequisites satisfied",
      flags: [],
    })),
    "count",
    [
      "purchased scope",
      "product quantities",
      "shipment and receipt evidence",
      "measure forms",
      "installer outcomes",
      "service visits",
    ],
    [
      "Historical receipt labels without purchased quantities require verification.",
    ],
  );
  const jobOrderCounts = new Map<string, number>();
  sold.forEach((i) => {
    if (i.progress.identity.jobId)
      jobOrderCounts.set(
        i.progress.identity.jobId,
        (jobOrderCounts.get(i.progress.identity.jobId) || 0) + 1,
      );
  });
  const balances = sold
    .filter(
      (i) =>
        i.balanceOutstanding !== null && Math.abs(i.balanceOutstanding) > 0.005,
    )
    .flatMap<ReportRecord>((i) => {
      const rec = itemRecord(i),
        plan = getPaymentPlanMeta(i.job?.meta);
      const exactPlan =
        rec.jobId &&
        jobOrderCounts.get(rec.jobId) === 1 &&
        plan?.status === "active"
          ? plan
          : null;
      const unpaid = exactPlan?.installments.filter((p) => !p.paid_at) || [];
      const reconciles =
        exactPlan &&
        Math.abs(
          unpaid.reduce(
            (s, p) => s + Math.max(0, p.amount - (p.paid_amount || 0)),
            0,
          ) - (i.balanceOutstanding || 0),
        ) < 0.01;
      if (reconciles)
        return unpaid.map((p) => {
          const due = businessDate(p.due_date),
            status = due
              ? due < today
                ? "overdue"
                : due === today
                  ? "due today"
                  : "future"
              : "due date unknown";
          return {
            ...rec,
            id: `${rec.id}:installment:${p.seq}`,
            date: due,
            dateBasis: "Explicit reconciled payment schedule",
            amount: money(Math.max(0, p.amount - (p.paid_amount || 0))),
            status,
            reason: `Installment ${p.seq}: ${status}`,
            flags: due ? [] : ["Due date missing"],
          };
        });
      const status =
        (i.balanceOutstanding || 0) < 0
          ? "overpaid / refund review"
          : "due date unknown";
      return [
        {
          ...rec,
          date: null,
          dateBasis: "Contract terms require verification",
          amount: i.balanceOutstanding,
          status,
          reason: status,
          flags: [
            status === "due date unknown"
              ? "Due terms or exact schedule allocation need verification"
              : "Review overpayment before refund",
          ],
        },
      ];
    });
  add(
    "receivables",
    "Receivables",
    "payment obligation",
    "Contract ledger obligations minus receipts and applicable credits. Due classification requires an exact reconciled schedule.",
    "Contract due date; unknown terms separate",
    balances.filter(r => (r.amount || 0) > 0),
    "money",
    [],
    [
      "A job-only plan is not allocated across multiple orders. Dispute status is unavailable unless explicitly recorded; no absence-of-dispute claim is made.",
    ],
  );
  add("overpayments", "Overpayments / refund review", "payment obligation",
    "Negative contract balances shown separately from positive receivables; review before any refund.",
    "Current ledger snapshot", balances.filter(r => (r.amount || 0) < 0), "money");
  add(
    "documents",
    "Missing evidence / blockers",
    "accepted order",
    "Evidence needed for the next action, using the shared progress rules and optional-measure branch.",
    "Current snapshot",
    active
      .filter((i) => i.progress.blockers.length)
      .map((i) => ({
        ...itemRecord(i),
        reason: i.progress.blockers.join(" · "),
        flags: i.progress.blockers,
      })),
    "count",
    ["measure forms", "installer outcomes"],
  );
  add(
    "cancellations",
    "Cancellation obligations",
    "accepted order",
    "Original sale history is retained. Cancelled vendor scope does not prove customer cancellation, credit, refund or resolved obligations.",
    "Current snapshot",
    sold
      .filter(
        (i) =>
          ["lost", "archived"].includes(i.progress.recordedStage || "") ||
          physical.lines.some(
            (l) =>
              l.quote_id === i.progress.identity.quoteId &&
              l.state === "canceled",
          ),
      )
      .map((i) => ({
        ...itemRecord(i),
        status: "cancellation review",
        flags: [
          ...i.progress.blockers,
          "Verify cancelled scope, vendor commitments and financial obligations",
        ],
      })),
    "count",
    ["product quantities"],
  );
  const services = active
    .filter(
      (i) =>
        i.progress.service === "open" || i.progress.installation === "partial",
    )
    .map((i) => ({
      ...itemRecord(i),
      reason: "Unresolved field report, service action or visit",
      flags: i.progress.blockers,
      details: [
        ...(itemRecord(i).details || []),
        ...physical.visits
          .filter((v) => v.quote_id === i.progress.identity.quoteId)
          .map(
            (v) =>
              `${v.owner} · ${v.outcome} · original visit ${v.original_visit_id || "first visit"} · report ${v.installer_form_id || "none"}/${v.report_revision || "unknown"} · ${v.reason}`,
          ),
      ],
    }));
  add(
    "service",
    "Service / remakes",
    "accepted order",
    "Orders with unresolved installer issues or return/service visits; expense alone never proves service state.",
    "Issue/visit opening evidence",
    services,
    "count",
    ["installer outcomes", "service visits", "owned actions"],
  );
  const margin = sold
    .filter((i) => inPeriod(businessDate(i.soldDate)))
    .map((i) => {
      const r = i.row,
        rec = itemRecord(i);
      const missing =
        !r ||
        r.cogs <= 0 ||
        r.isMissingInstallerInvoice ||
        !r.installationInvoiceDocumentId;
      return {
        ...rec,
        amount: null,
        status: missing
          ? "cost evidence incomplete"
          : "recorded cost view; reconciliation unverified",
        reason:
          "Estimated, recorded direct costs and partner allocation are separate; no reconciled margin is asserted.",
        flags: [
          ...(missing ? ["Materials or installation evidence missing"] : []),
          "Complete fee/remake reconciliation is not established",
        ],
        details: [
          `Sale ${r?.total ?? "unknown"}`,
          `Recorded materials ${r?.cogs ?? "unknown"}`,
          `Matched installation ${r?.installationInvoiceAmount ?? "unknown"}`,
          `Additional expenses ${r?.expensesTotal ?? "unknown"}`,
          `Remake expenses ${r?.remakeTotal ?? "unknown"}`,
          `Estimated quote labor ${i.quote?.labor_cost ?? "unknown"}`,
          `Estimated quote margin before other direct costs ${i.quote ? money(i.quote.quote_total - i.quote.materials_cost - i.quote.labor_cost) : "unavailable"}`,
          `Installation invoice evidence: ${r?.installationInvoiceDocumentId || "missing"} ${r?.installationInvoiceNumber || ""}`,
          `Vendor cost evidence: ${i.orderEmails.map((e) => e.id).join(", ") || "none matched"}`,

          `Existing projected partner allocation ${r?.mikeProfit ?? "unavailable"}`,
          `Recorded direct-cost difference ${r ? money(r.total - r.cogs - r.installationInvoiceAmount - r.expensesTotal - r.remakeTotal) : "unknown"}`,
          `Expense evidence: ${r?.expenses.map((e) => `${e.id} ${e.category} ${e.amount} ${e.incurred_on || "date unknown"}`).join("; ") || "none"}`,
        ],
      };
    });
  const m = add(
    "margin",
    "Job margin evidence",
    "accepted order",
    "Separate estimated costs, recorded direct-cost difference and existing commission/partner allocation. Missing sources prevent a final profitability claim.",
    "Sold-date cohort; cost incurred dates retained",
    margin,
    "count",
    [
      "job expenses",
      "installation invoices",
      "order emails",
      "Ken payments",
      "Ken allocations",
      "commission payments",
      "commission allocations",
    ],
  );
  m.notes.push(
    "Open each record for every recorded cost category. No payout policy changed.",
  );
  const actions: ReportRecord[] = (data.ownedActions || [])
    .filter((a) => ["open", "blocked"].includes(a.status))
    .map((a) => ({
      id: a.id,
      jobId: a.job_id,
      quoteId: a.quote_id,
      name: jobs.get(a.job_id || "")?.customer_name || a.title,
      date: businessDate(a.waiting_since),
      dateBasis: "Action waiting-since date",
      amount: null,
      status: a.status,
      reason: a.blocker || a.title,
      owner: a.owner || "Unassigned",
      due: a.due_on,
      waitingDays: businessDate(a.waiting_since)
        ? days(businessDate(a.waiting_since)!, today)
        : null,
      flags: a.owner ? [] : ["Unassigned"],
      href: href(a.quote_id, a.job_id),
      details: [a.title, a.order_reference || "Order reference not recorded"],
    }));
  for (const i of active)
    if (
      !actions.some(
        (a) =>
          (a.quoteId && a.quoteId === i.progress.identity.quoteId) ||
          (a.jobId === i.progress.identity.jobId &&
            jobOrderCounts.get(a.jobId || "") === 1),
      )
    )
      actions.push({
        ...itemRecord(i),
        amount: null,
        date: null,
        dateBasis: "Legacy action; waiting history unknown",
        owner: "Unassigned",
        due: null,
        waitingDays: null,
        flags: ["No owned action recorded"],
        details: i.progress.blockers,
      });
  actions.sort(
    (a, b) =>
      Number(["blocked","attention"].includes(b.status) || (!!b.due && b.due < today)) -
        Number(["blocked","attention"].includes(a.status) || (!!a.due && a.due < today)) ||
      (a.due || "9999").localeCompare(b.due || "9999"),
  );
  add(
    "actions",
    "Daily action queue",
    "action",
    "Blocked and overdue actions first; legacy prerequisites remain visibly unassigned until an action is created.",
    "Due date and actual waiting-since date",
    actions,
    "count",
    ["owned actions"],
  );
  reports.forEach(r => r.notes.push(`Explicit test exclusions: ${excludedJobs.size} jobs, ${excludedQuotes.size} linked quotes. Business records remain unchanged.`));
  return reports;
}
