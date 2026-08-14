import type { CrmCalendarEvent } from "@/lib/crm/types";

export type CalendarEventSalePresentation = {
  tone: "sold" | "unsold" | null;
  bannerLabel: "SOLD" | null;
};

const neutralCalendarSalePresentation: CalendarEventSalePresentation = {
  tone: null,
  bannerLabel: null
};

const soldLifecycleJobStatuses = new Set(["sold", "ordered", "installed", "invoiced", "closed"]);

export function calendarEventSalePresentation(
  event: Pick<
    CrmCalendarEvent,
    | "event_type"
    | "status"
    | "end_at"
    | "job_status"
    | "quote_sent_at"
    | "quote_signed_at"
    | "customer_contract_signed_at"
  >,
  now: Date = new Date()
): CalendarEventSalePresentation {
  if (event.event_type === "block" || event.status === "canceled") {
    return neutralCalendarSalePresentation;
  }

  // A linked job stays sold after advancing to ordered/installed/etc. This is
  // also the durable fallback for signed sales_quotes records, whose signature
  // timestamp is not stored on the legacy crm_quotes row used by the calendar.
  if (
    event.customer_contract_signed_at ||
    event.quote_signed_at ||
    soldLifecycleJobStatuses.has(event.job_status || "")
  ) {
    return { tone: "sold", bannerLabel: "SOLD" };
  }

  if (event.quote_sent_at && new Date(event.end_at) <= now) {
    return { tone: "unsold", bannerLabel: null };
  }

  return neutralCalendarSalePresentation;
}
