import { STATUS_ORDER } from "@mts/lib/quoteStatus";
import type { QuoteStatus } from "@mts/types/quote";
import type { StatsFilter } from "@mts/components/crm/quote-builder/QuoteStatsBar";

export type CalendarAppointmentForStats = {
  id: string;
  quote_id: string | null;
  appointment_date: string | null;
  status: string | null;
};

export type QuoteStatsSource = {
  id: string;
  sourceQuoteId?: string | null;
  status?: string | null;
  live_status?: string | null;
  appointment_date?: string | null;
  sent_at?: string | null;
  approved_at?: string | null;
  sold_at?: string | null;
  signed_at?: string | null;
  ordered_at?: string | null;
  received_at?: string | null;
  installed_at?: string | null;
  archived_at?: string | null;
  customer_signature?: string | null;
};

export function getQuoteStatsStatus(quote: QuoteStatsSource): QuoteStatus {
  const rawStatus = `${quote.live_status || quote.status || ""}`.toLowerCase();

  if (rawStatus === "archived" || rawStatus === "lost" || quote.archived_at) return "archived";
  if (
    rawStatus === "installed" ||
    rawStatus === "invoiced" ||
    rawStatus === "paid" ||
    rawStatus === "closed" ||
    quote.installed_at
  ) {
    return "installed";
  }
  if (rawStatus === "received" || quote.received_at) return "received";
  if (rawStatus === "ordered" || quote.ordered_at) return "ordered";
  if (
    rawStatus === "sold" ||
    rawStatus === "approved" ||
    quote.signed_at ||
    quote.sold_at ||
    quote.approved_at ||
    quote.customer_signature
  ) {
    return "sold";
  }
  if (rawStatus === "sent" || quote.sent_at) return "sent";
  return "draft";
}

function quoteMatchesCalendarQuoteId(
  quote: QuoteStatsSource,
  calendarQuoteIds: Set<string>
): boolean {
  return (
    calendarQuoteIds.has(quote.id) ||
    Boolean(quote.sourceQuoteId && calendarQuoteIds.has(quote.sourceQuoteId))
  );
}

function isActiveCalendarAppointment(appointment: CalendarAppointmentForStats): boolean {
  return Boolean(appointment.appointment_date) && appointment.status !== "cancelled";
}

function appointmentMatchesDateFilter(
  appointment: CalendarAppointmentForStats,
  filter: StatsFilter,
  today: string
): boolean {
  if (!isActiveCalendarAppointment(appointment)) return false;

  if (filter === "today") {
    return appointment.appointment_date === today;
  }

  if (filter === "upcoming") {
    return Boolean(appointment.appointment_date && appointment.appointment_date >= today);
  }

  return false;
}

export function filterQuotesForStatsTile<T extends QuoteStatsSource>(
  quotes: T[],
  filter: StatsFilter,
  calendarAppointments: CalendarAppointmentForStats[] = []
): T[] {
  const today = new Date().toISOString().split("T")[0];
  const matchingCalendarQuoteIds = new Set(
    calendarAppointments
      .filter((appointment) => appointmentMatchesDateFilter(appointment, filter, today))
      .map((appointment) => appointment.quote_id)
      .filter((quoteId): quoteId is string => Boolean(quoteId))
  );

  switch (filter) {
    case "today":
      return quotes.filter(
        (q) =>
          (q.appointment_date === today ||
            quoteMatchesCalendarQuoteId(q, matchingCalendarQuoteIds)) &&
          getQuoteStatsStatus(q) !== "archived"
      );
    case "upcoming":
      return quotes.filter(
        (q) => {
          const status = getQuoteStatsStatus(q);
          return (
            (quoteMatchesCalendarQuoteId(q, matchingCalendarQuoteIds) ||
              (q.appointment_date &&
                q.appointment_date >= today &&
                status !== "sold" &&
                status !== "installed")) &&
            status !== "archived"
          );
        }
      );
    case "all":
      return quotes;
    default:
      if (STATUS_ORDER.includes(filter as QuoteStatus)) {
        return quotes.filter((q) => getQuoteStatsStatus(q) === filter);
      }
      return quotes;
  }
}

export function filterCalendarAppointmentsForStatsTile<T extends CalendarAppointmentForStats>(
  appointments: T[],
  filter: StatsFilter,
  visibleQuoteIds: Set<string>
): T[] {
  if (filter !== "today" && filter !== "upcoming") return [];

  const today = new Date().toISOString().split("T")[0];
  return appointments.filter(
    (appointment) =>
      appointmentMatchesDateFilter(appointment, filter, today) &&
      (!appointment.quote_id || !visibleQuoteIds.has(appointment.quote_id))
  );
}
