import {
  CrmBookkeepingRow,
  CrmJob,
  CrmOrderSystemSummary,
  CrmOrderTracker,
  CrmOrderTrackerLane,
  CrmQuote,
  CrmSalesOpportunity,
  CrmSalesSystemSummary
} from "@/lib/crm/types";

const DAY_MS = 1000 * 60 * 60 * 24;
const salesOpenStatuses = new Set(["new", "follow_up", "scheduled", "quoted"]);
const orderActiveStatuses = new Set(["sold", "approved", "ordered", "received", "installed", "invoiced", "paid"]);

export function buildSalesOpportunities(jobs: CrmJob[]): CrmSalesOpportunity[] {
  return jobs
    .filter((job) => salesOpenStatuses.has(job.status))
    .map((job) => {
      const dueBucket = getDueBucket(job.next_action_due);
      const blockers = getSalesBlockers(job);
      const value = Number(job.quote_total || job.estimated_total) || 0;
      const score = scoreOpportunity(job, dueBucket, blockers, value);

      return {
        id: job.id,
        customerName: job.customer_name,
        phone: job.phone,
        city: job.city,
        productInterest: job.product_interest,
        owner: job.sales_owner || "Unassigned",
        status: job.status,
        priority: job.priority,
        value,
        ageDays: ageDays(job.created_at),
        nextAction: job.next_action || nextSalesAction(job),
        dueDate: job.next_action_due,
        dueBucket,
        score,
        signal: buildSalesSignal(job, dueBucket, blockers, value),
        blockers
      };
    })
    .sort((a, b) => b.score - a.score);
}

export function summarizeSalesSystem(opportunities: CrmSalesOpportunity[]): CrmSalesSystemSummary {
  return {
    opportunities: opportunities.length,
    hot: opportunities.filter((item) => item.score >= 80).length,
    overdue: opportunities.filter((item) => item.dueBucket === "overdue").length,
    today: opportunities.filter((item) => item.dueBucket === "today").length,
    quoteNeeded: opportunities.filter((item) => item.status === "scheduled" || item.status === "quoted").length,
    unscheduled: opportunities.filter((item) => item.blockers.includes("No appointment")).length,
    pipelineValue: roundCents(opportunities.reduce((total, item) => total + item.value, 0))
  };
}

export function buildOrderTrackers({
  rows,
  jobs,
  quotes
}: {
  rows: CrmBookkeepingRow[];
  jobs: CrmJob[];
  quotes: CrmQuote[];
}): CrmOrderTracker[] {
  const jobById = new Map(jobs.map((job) => [job.id, job]));
  const quoteById = new Map(quotes.map((quote) => [quote.id, quote]));

  return rows
    .filter((row) => isOrderRow(row))
    .map((row) => {
      const job = row.jobId ? jobById.get(row.jobId) || null : null;
      const quote = row.quoteId ? quoteById.get(row.quoteId) || null : null;
      const blockers = getOrderBlockers(row);
      const lane = getOrderLane(row, blockers);
      const stageDate = getOrderStageDate(row, quote);
      const urgency = getOrderUrgency(row, lane, blockers, stageDate);

      return {
        id: row.id,
        quoteId: row.quoteId,
        jobId: row.jobId,
        customerName: row.customerName,
        quoteNumber: row.quoteNumber,
        status: row.status,
        lane,
        laneLabel: laneLabel(lane),
        urgency,
        ageDays: ageDays(stageDate || row.soldDate),
        stageDate: stageDate || row.soldDate,
        productInterest: job?.product_interest || null,
        salesOwner: row.salesOwner,
        total: row.total,
        paidTotal: row.paidTotal,
        balance: row.balance,
        cogs: row.cogs,
        mikeProfit: row.mikeShare,
        jessicaCommissionOwed: row.jessicaShareOwed,
        manufacturerName: row.manufacturerName,
        manufacturerOrderRef: row.manufacturerOrderRef,
        manufacturerOrderUrl: row.manufacturerOrderUrl,
        manufacturerDocumentUrl: row.manufacturerDocumentUrl,
        nextAction: nextOrderAction(row, lane, blockers),
        blockers
      };
    })
    .sort((a, b) => orderSortRank(b) - orderSortRank(a));
}

export function summarizeOrderSystem(trackers: CrmOrderTracker[]): CrmOrderSystemSummary {
  return {
    openOrders: trackers.filter((item) => item.lane !== "complete").length,
    readyToOrder: trackers.filter((item) => item.lane === "ready_to_order").length,
    awaitingProduct: trackers.filter((item) => item.lane === "awaiting_product").length,
    readyToInstall: trackers.filter((item) => item.lane === "ready_to_install").length,
    installedCollect: trackers.filter((item) => item.lane === "installed_collect").length,
    financialReview: trackers.filter((item) => item.lane === "financial_review").length,
    complete: trackers.filter((item) => item.lane === "complete").length,
    orderValue: roundCents(trackers.reduce((total, item) => total + item.total, 0)),
    balanceAtRisk: roundCents(trackers.reduce((total, item) => total + item.balance, 0))
  };
}

function getDueBucket(value: string | null | undefined): CrmSalesOpportunity["dueBucket"] {
  if (!value) return "unscheduled";
  const today = new Date();
  const due = new Date(`${value}T00:00:00`);
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diff = Math.round((due.getTime() - todayStart.getTime()) / DAY_MS);
  if (diff < 0) return "overdue";
  if (diff === 0) return "today";
  return "upcoming";
}

function getSalesBlockers(job: CrmJob) {
  const blockers: string[] = [];
  if (!job.appointment_start && (job.status === "new" || job.status === "follow_up")) blockers.push("No appointment");
  if (!job.estimated_total && !job.quote_total) blockers.push("No value");
  if (!job.sales_owner || job.sales_owner === "Unassigned") blockers.push("No owner");
  if (!job.next_action_due) blockers.push("No due date");
  return blockers;
}

function scoreOpportunity(
  job: CrmJob,
  dueBucket: CrmSalesOpportunity["dueBucket"],
  blockers: string[],
  value: number
) {
  let score = 30;
  if (job.priority === "urgent") score += 30;
  if (job.priority === "high") score += 20;
  if (dueBucket === "overdue") score += 25;
  if (dueBucket === "today") score += 20;
  if (job.status === "scheduled") score += 18;
  if (job.status === "quoted") score += 22;
  if (value >= 5000) score += 14;
  if (value >= 10000) score += 8;
  score -= blockers.length * 5;
  return Math.max(0, Math.min(score, 100));
}

function nextSalesAction(job: CrmJob) {
  if (job.status === "new") return "Qualify lead and book measure";
  if (job.status === "follow_up") return "Follow up and secure appointment";
  if (job.status === "scheduled") return "Complete consult and build quote";
  if (job.status === "quoted") return "Close quote and collect deposit";
  return "Move customer to next sales stage";
}

function buildSalesSignal(
  job: CrmJob,
  dueBucket: CrmSalesOpportunity["dueBucket"],
  blockers: string[],
  value: number
) {
  if (dueBucket === "overdue") return "Follow-up is overdue";
  if (dueBucket === "today") return "Touch today";
  if (job.status === "quoted") return "Quote needs close";
  if (job.status === "scheduled") return "Consult is booked";
  if (blockers.includes("No appointment")) return "Needs appointment";
  if (value >= 10000) return "High-value project";
  return "Active opportunity";
}

function isOrderRow(row: CrmBookkeepingRow) {
  return orderActiveStatuses.has(String(row.status)) || Boolean(row.manufacturerOrderRef || row.manufacturerName);
}

function getOrderBlockers(row: CrmBookkeepingRow) {
  const blockers: string[] = [];
  const status = String(row.status);
  if ((status === "sold" || status === "approved") && !row.manufacturerOrderRef) blockers.push("Order not placed");
  if ((status === "ordered" || status === "received") && row.cogs <= 0) blockers.push("COGS missing");
  if (row.balance > 0) blockers.push("Open balance");
  if (status === "installed" && !row.isInstallationComplete) blockers.push("Install invoice not matched");
  if (row.jessicaShareOwed > 0) blockers.push("Commission owed");
  return blockers;
}

function getOrderLane(row: CrmBookkeepingRow, blockers: string[]): CrmOrderTrackerLane {
  const status = String(row.status);
  if ((status === "sold" || status === "approved") && !row.manufacturerOrderRef) return "ready_to_order";
  if (status === "ordered" || ((status === "sold" || status === "approved") && row.manufacturerOrderRef)) {
    return "awaiting_product";
  }
  if (status === "received") return "ready_to_install";
  if ((status === "installed" || status === "invoiced") && row.balance > 0) return "installed_collect";
  if (blockers.some((blocker) => blocker === "COGS missing" || blocker === "Commission owed" || blocker === "Install invoice not matched")) {
    return "financial_review";
  }
  return "complete";
}

function getOrderStageDate(row: CrmBookkeepingRow, quote: CrmQuote | null) {
  const status = String(row.status);
  if (status === "installed") return quote?.installed_at || row.soldDate;
  if (status === "received") return quote?.received_at || quote?.ordered_at || row.soldDate;
  if (status === "ordered") return quote?.ordered_at || row.soldDate;
  return quote?.sold_at || row.soldDate;
}

function getOrderUrgency(
  row: CrmBookkeepingRow,
  lane: CrmOrderTrackerLane,
  blockers: string[],
  stageDate: string | null
): CrmOrderTracker["urgency"] {
  if (lane === "complete") return "complete";
  const age = ageDays(stageDate || row.soldDate);
  if (lane === "ready_to_order" || lane === "ready_to_install") return "urgent";
  if (row.balance >= Math.max(row.depositDue, 1)) return "urgent";
  if (blockers.length || age >= 21) return "warning";
  return "normal";
}

function nextOrderAction(row: CrmBookkeepingRow, lane: CrmOrderTrackerLane, blockers: string[]) {
  if (lane === "ready_to_order") return "Enter manufacturer order and attach order proof";
  if (lane === "awaiting_product") return "Track vendor lead time and mark received when product lands";
  if (lane === "ready_to_install") return "Schedule installation and collect remaining balance";
  if (lane === "installed_collect") return "Collect balance and move to invoice/paid";
  if (lane === "financial_review") return blockers[0] || "Clean up bookkeeping";
  return "No open order action";
}

function laneLabel(lane: CrmOrderTrackerLane) {
  return {
    ready_to_order: "Ready To Order",
    awaiting_product: "Awaiting Product",
    ready_to_install: "Ready To Install",
    installed_collect: "Installed / Collect",
    financial_review: "Financial Review",
    complete: "Complete"
  }[lane];
}

function orderSortRank(item: CrmOrderTracker) {
  const urgency = { complete: 0, normal: 1, warning: 2, urgent: 3 }[item.urgency];
  const lane = {
    complete: 0,
    financial_review: 1,
    installed_collect: 2,
    awaiting_product: 3,
    ready_to_install: 4,
    ready_to_order: 5
  }[item.lane];
  return urgency * 1000 + lane * 100 + item.ageDays;
}

function ageDays(value: string | null | undefined) {
  if (!value) return 0;
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return 0;
  return Math.max(0, Math.floor((Date.now() - time) / DAY_MS));
}

function roundCents(value: number) {
  return Math.round(value * 100) / 100;
}
