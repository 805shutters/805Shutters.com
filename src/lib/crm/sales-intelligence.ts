import type { CrmCalendarEvent, CrmJob, CrmQuote } from "@/lib/crm/types";
import { getLeadSourceFromRecord } from "@/lib/lead-source";

export type SalesIntelligenceRange = { start: string; end: string };

export type SalesLeadDetail = {
  job: CrmJob;
  source: string;
  owner: string;
  quote: CrmQuote | null;
  outcome: "Won" | "Lost" | "Open";
  revenue: number;
  lastActivityAt: string;
  nextActionState: "Overdue" | "Due soon" | "Scheduled" | "Missing" | "Complete";
};

export type SalesIntelligenceReport = {
  leads: SalesLeadDetail[];
  priorLeadCount: number;
  totals: {
    leads: number;
    attributed: number;
    scheduled: number;
    quoted: number;
    won: number;
    lost: number;
    open: number;
    revenue: number;
    pipeline: number;
    overdue: number;
    missingFollowUp: number;
  };
  sources: Array<{
    source: string;
    leads: number;
    scheduled: number;
    quoted: number;
    won: number;
    lost: number;
    revenue: number;
    pipeline: number;
  }>;
  reps: Array<{
    owner: string;
    leads: number;
    scheduled: number;
    quoted: number;
    won: number;
    lost: number;
    revenue: number;
    overdue: number;
    missingFollowUp: number;
  }>;
};

const completeStatuses = new Set(["installed", "invoiced", "closed"]);
const soldStatuses = new Set(["sold", "ordered", "installed", "invoiced", "closed"]);
const quotedStatuses = new Set(["quoted", ...soldStatuses]);
const scheduledStatuses = new Set(["scheduled", ...quotedStatuses]);
const quoteWonStatuses = new Set(["sold", "approved", "ordered", "received", "installed", "invoiced", "paid"]);

function dateValue(value?: string | null) {
  const parsed = value ? new Date(value).getTime() : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

function endOfDay(value: string) {
  return new Date(`${value}T23:59:59.999`).getTime();
}

function startOfDay(value: string) {
  return new Date(`${value}T00:00:00.000`).getTime();
}

function inRange(value: string | null | undefined, range: SalesIntelligenceRange) {
  const time = dateValue(value);
  return time >= startOfDay(range.start) && time <= endOfDay(range.end);
}

function latestQuote(jobId: string, quotes: CrmQuote[]) {
  return quotes
    .filter((quote) => quote.job_id === jobId && quote.status !== "archived")
    .sort((left, right) => dateValue(right.updated_at) - dateValue(left.updated_at))[0] || null;
}

function jobOutcome(job: CrmJob, quote: CrmQuote | null): SalesLeadDetail["outcome"] {
  if (job.status === "lost" || quote?.status === "lost") return "Lost";
  if (soldStatuses.has(job.status) || (quote && quoteWonStatuses.has(quote.status))) return "Won";
  return "Open";
}

function followUpState(job: CrmJob, now: Date): SalesLeadDetail["nextActionState"] {
  if (completeStatuses.has(job.status) || job.status === "lost") return "Complete";
  if (!job.next_action || !job.next_action_due) return "Missing";
  const due = dateValue(job.next_action_due);
  if (due < new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) return "Overdue";
  if (due <= now.getTime() + 3 * 86_400_000) return "Due soon";
  return "Scheduled";
}

function lastActivity(job: CrmJob, quote: CrmQuote | null, events: CrmCalendarEvent[]) {
  const eventTimes = events.filter((event) => event.job_id === job.id).map((event) => dateValue(event.updated_at));
  return new Date(Math.max(dateValue(job.updated_at), dateValue(quote?.updated_at), ...eventTimes)).toISOString();
}

export function buildSalesIntelligenceReport(
  jobs: CrmJob[],
  quotes: CrmQuote[],
  events: CrmCalendarEvent[],
  range: SalesIntelligenceRange,
  now = new Date()
): SalesIntelligenceReport {
  const rangeStart = startOfDay(range.start);
  const rangeEnd = endOfDay(range.end);
  const duration = Math.max(86_400_000, rangeEnd - rangeStart + 1);
  const priorRange = {
    start: new Date(rangeStart - duration).toISOString().slice(0, 10),
    end: new Date(rangeStart - 1).toISOString().slice(0, 10)
  };
  const cohort = jobs.filter((job) => inRange(job.created_at, range));
  const priorLeadCount = jobs.filter((job) => inRange(job.created_at, priorRange)).length;

  const leads = cohort
    .map((job): SalesLeadDetail => {
      const quote = latestQuote(job.id, quotes);
      const outcome = jobOutcome(job, quote);
      return {
        job,
        quote,
        source: getLeadSourceFromRecord(job) || "Unknown",
        owner: job.sales_owner?.trim() || "Unassigned",
        outcome,
        revenue: outcome === "Won" ? Number(quote?.quote_total || job.quote_total || job.estimated_total || 0) : 0,
        lastActivityAt: lastActivity(job, quote, events),
        nextActionState: followUpState(job, now)
      };
    })
    .sort((left, right) => dateValue(right.job.created_at) - dateValue(left.job.created_at));

  const group = (key: "source" | "owner") => {
    const grouped = new Map<string, SalesLeadDetail[]>();
    for (const lead of leads) {
      const label = lead[key];
      grouped.set(label, [...(grouped.get(label) || []), lead]);
    }
    return Array.from(grouped.entries()).map(([label, items]) => ({
      label,
      items,
      leads: items.length,
      scheduled: items.filter((item) => scheduledStatuses.has(item.job.status) || Boolean(item.job.appointment_start)).length,
      quoted: items.filter((item) => quotedStatuses.has(item.job.status) || Boolean(item.quote)).length,
      won: items.filter((item) => item.outcome === "Won").length,
      lost: items.filter((item) => item.outcome === "Lost").length,
      revenue: items.reduce((sum, item) => sum + item.revenue, 0),
      pipeline: items.filter((item) => item.outcome === "Open").reduce((sum, item) => sum + Number(item.quote?.quote_total || item.job.estimated_total || 0), 0),
      overdue: items.filter((item) => item.nextActionState === "Overdue").length,
      missingFollowUp: items.filter((item) => item.nextActionState === "Missing").length
    }));
  };

  const sourceGroups = group("source");
  const repGroups = group("owner");
  const won = leads.filter((item) => item.outcome === "Won").length;
  const lost = leads.filter((item) => item.outcome === "Lost").length;

  return {
    leads,
    priorLeadCount,
    totals: {
      leads: leads.length,
      attributed: leads.filter((item) => item.source !== "Unknown").length,
      scheduled: leads.filter((item) => scheduledStatuses.has(item.job.status) || Boolean(item.job.appointment_start)).length,
      quoted: leads.filter((item) => quotedStatuses.has(item.job.status) || Boolean(item.quote)).length,
      won,
      lost,
      open: leads.length - won - lost,
      revenue: leads.reduce((sum, item) => sum + item.revenue, 0),
      pipeline: leads.filter((item) => item.outcome === "Open").reduce((sum, item) => sum + Number(item.quote?.quote_total || item.job.estimated_total || 0), 0),
      overdue: leads.filter((item) => item.nextActionState === "Overdue").length,
      missingFollowUp: leads.filter((item) => item.nextActionState === "Missing").length
    },
    sources: sourceGroups
      .map(({ label, overdue: _overdue, missingFollowUp: _missing, items: _items, ...values }) => ({ source: label, ...values }))
      .sort((left, right) => right.leads - left.leads || left.source.localeCompare(right.source)),
    reps: repGroups
      .map(({ label, pipeline: _pipeline, items: _items, ...values }) => ({ owner: label, ...values }))
      .sort((left, right) => right.revenue - left.revenue || left.owner.localeCompare(right.owner))
  };
}
