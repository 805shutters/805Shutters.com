import type { CrmJob, CrmQuote } from "@/lib/crm/types";

const activeQuoteStatuses = new Set(["draft", "sent", "approved", "sold", "ordered", "received", "installed", "invoiced", "paid"]);
const leadStatuses = new Set(["new", "follow_up"]);

export type QuoteWorkspaceBuckets = {
  leadsToSchedule: CrmJob[];
  upcomingConsultations: CrmJob[];
  consultationsNeedingQuote: CrmJob[];
  activeQuotes: CrmQuote[];
  quoteByJobId: Map<string, CrmQuote>;
};

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function compareAppointment(a: CrmJob, b: CrmJob): number {
  return (a.appointment_start || "").localeCompare(b.appointment_start || "");
}

function compareLead(a: CrmJob, b: CrmJob): number {
  const due = (a.next_action_due || "9999-12-31").localeCompare(b.next_action_due || "9999-12-31");
  if (due !== 0) return due;
  return (b.created_at || "").localeCompare(a.created_at || "");
}

export function buildQuoteWorkspaceBuckets(
  jobs: CrmJob[],
  quotes: CrmQuote[],
  now = new Date(),
): QuoteWorkspaceBuckets {
  const todayStart = startOfLocalDay(now);
  const activeQuotes = quotes.filter((quote) => activeQuoteStatuses.has(quote.status));
  const quoteByJobId = new Map<string, CrmQuote>();

  for (const quote of activeQuotes) {
    if (!quote.job_id || quoteByJobId.has(quote.job_id)) continue;
    quoteByJobId.set(quote.job_id, quote);
  }

  const leadsToSchedule: CrmJob[] = [];
  const upcomingConsultations: CrmJob[] = [];
  const consultationsNeedingQuote: CrmJob[] = [];

  for (const job of jobs) {
    if (quoteByJobId.has(job.id) || job.status === "lost" || job.status === "closed") continue;

    if (leadStatuses.has(job.status)) {
      leadsToSchedule.push(job);
      continue;
    }

    if (job.status !== "scheduled") continue;
    const appointment = parseDate(job.appointment_start);
    if (!appointment) continue;

    if (appointment >= todayStart) {
      upcomingConsultations.push(job);
    } else {
      consultationsNeedingQuote.push(job);
    }
  }

  return {
    leadsToSchedule: leadsToSchedule.sort(compareLead),
    upcomingConsultations: upcomingConsultations.sort(compareAppointment),
    consultationsNeedingQuote: consultationsNeedingQuote.sort(compareAppointment),
    activeQuotes,
    quoteByJobId,
  };
}
