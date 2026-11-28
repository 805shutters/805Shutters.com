import type { CalendarQuoteStatus, CrmCalendarEvent } from "@/lib/crm/types";

export type CalendarEventSalePresentation = {
  tone: "sold" | "unsold" | null;
  bannerLabel: "SOLD" | "SENT" | "UNSENT" | null;
  quoteStatus: CalendarQuoteStatus | null;
};

const neutralCalendarSalePresentation: CalendarEventSalePresentation = {
  tone: null,
  bannerLabel: null,
  quoteStatus: null
};

const soldLifecycleJobStatuses = new Set(["sold", "ordered", "installed", "invoiced", "closed"]);

// Quote statuses that jobStatusForQuote already projects to sold or later.
// `closed` is a bookkeeping live_status, not a crm_quotes status.
const soldQuoteStatuses = new Set([
  "sold",
  "approved",
  "ordered",
  "received",
  "installed",
  "invoiced",
  "paid",
  "closed"
]);

export type CalendarQuoteRow = {
  id: string;
  status?: string | null;
  live_status?: string | null;
  sent_at?: string | null;
  signed_at?: string | null;
  deleted_at?: unknown;
  meta?: unknown;
};

export type CalendarQuoteStatusInput = {
  eventType?: string | null;
  eventStatus?: string | null;
  jobStatus?: string | null;
  quoteSignedAt?: string | null;
  contractSignedAt?: string | null;
  quotes?: CalendarQuoteRow[];
  /**
   * crm_quotes ids that have a sales_quote_v2_delivery_attempts row with state
   * 'sent'. Null means that evidence was not loaded, so an otherwise unsent
   * quote is left unlabeled instead of claimed as UNSENT.
   */
  sentDeliveryQuoteIds?: ReadonlySet<string> | readonly string[] | null;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

/**
 * A live crm_quotes row is one that has not been soft-deleted.
 * crm_quotes has no deleted_at column and no void status (see
 * crm_quotes_status_check). Deletes are tombstones on meta.deleted_at and
 * meta.bookkeeping_deleted_at. Calendar reads may also project deleted_at.
 */
export function isLiveCalendarQuote(quote: CalendarQuoteRow): boolean {
  const meta = record(quote.meta);
  return !quote.deleted_at && !meta.deleted_at && !meta.bookkeeping_deleted_at;
}

function sentDeliveryIds(ids: CalendarQuoteStatusInput["sentDeliveryQuoteIds"]): Set<string> | null {
  if (ids == null) return null;
  const values = Array.isArray(ids) ? ids : [...ids];
  return new Set(values.map(String));
}

function quoteMarkedSold(quote: CalendarQuoteRow): boolean {
  return soldQuoteStatuses.has(String(quote.status || "").toLowerCase())
    || soldQuoteStatuses.has(String(quote.live_status || "").toLowerCase())
    || Boolean(quote.signed_at);
}

export function calendarQuoteStatus(input: CalendarQuoteStatusInput): CalendarQuoteStatus | null {
  if (input.eventType === "block" || input.eventStatus === "canceled") return null;

  const liveQuotes = (input.quotes || []).filter(isLiveCalendarQuote);
  const deliveryIds = sentDeliveryIds(input.sentDeliveryQuoteIds);
  const sold = Boolean(input.contractSignedAt)
    || Boolean(input.quoteSignedAt)
    || soldLifecycleJobStatuses.has(String(input.jobStatus || "").toLowerCase())
    || liveQuotes.some(quoteMarkedSold);
  if (sold) return "sold";
  if (!liveQuotes.length) return null;

  const sent = liveQuotes.some((quote) => Boolean(quote.sent_at) || Boolean(deliveryIds?.has(quote.id)));
  if (sent) return "sent";
  // Without delivery-attempt evidence, a missing sent_at is not proof of UNSENT.
  if (!deliveryIds) return null;
  return "unsent";
}

function quoteStatusFromEvent(event: Pick<
  CrmCalendarEvent,
  "job_status" | "quote_sent_at" | "quote_signed_at" | "customer_contract_signed_at" | "quoteStatus"
>): CalendarQuoteStatus | null {
  if (event.quoteStatus !== undefined) return event.quoteStatus;
  return calendarQuoteStatus({
    jobStatus: event.job_status,
    quoteSignedAt: event.quote_signed_at,
    contractSignedAt: event.customer_contract_signed_at,
    quotes: event.quote_sent_at || event.quote_signed_at
      ? [{ id: "linked-quote", sent_at: event.quote_sent_at, signed_at: event.quote_signed_at }]
      : [],
    sentDeliveryQuoteIds: []
  });
}

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
    | "quoteStatus"
  >,
  now: Date = new Date()
): CalendarEventSalePresentation {
  if (event.event_type === "block" || event.status === "canceled") {
    return neutralCalendarSalePresentation;
  }

  const quoteStatus = quoteStatusFromEvent(event);
  if (quoteStatus === "sold") return { tone: "sold", bannerLabel: "SOLD", quoteStatus };
  // A sent quote keeps the follow-up color after the appointment, and still
  // shows SENT. Future appointments stay in the normal card color.
  if (quoteStatus === "sent" && new Date(event.end_at) <= now) {
    return { tone: "unsold", bannerLabel: "SENT", quoteStatus };
  }
  if (quoteStatus === "sent") return { tone: null, bannerLabel: "SENT", quoteStatus };
  if (quoteStatus === "unsent") return { tone: null, bannerLabel: "UNSENT", quoteStatus };
  return neutralCalendarSalePresentation;
}
