import type { CrmCalendarEvent } from "@/lib/crm/types";

export type CalendarEventSalePresentation = {
  tone: "sold" | "unsold" | null;
  bannerLabel: "SOLD" | null;
};

const neutralCalendarSalePresentation: CalendarEventSalePresentation = {
  tone: null,
  bannerLabel: null
};

export function calendarEventSalePresentation(
  event: Pick<
    CrmCalendarEvent,
    "event_type" | "status" | "end_at" | "quote_sent_at" | "quote_signed_at" | "customer_contract_signed_at"
  >,
  now: Date = new Date()
): CalendarEventSalePresentation {
  if (event.event_type === "block" || event.status === "canceled") {
    return neutralCalendarSalePresentation;
  }

  if (event.customer_contract_signed_at || event.quote_signed_at) {
    return { tone: "sold", bannerLabel: "SOLD" };
  }

  if (event.quote_sent_at && new Date(event.end_at) <= now) {
    return { tone: "unsold", bannerLabel: null };
  }

  return neutralCalendarSalePresentation;
}
