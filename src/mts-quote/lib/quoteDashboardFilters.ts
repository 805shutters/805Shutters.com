import { STATUS_ORDER } from "@mts/lib/quoteStatus";
import type { QuoteStatus, SalesQuote } from "@mts/types/quote";
import type { StatsFilter } from "@mts/components/crm/quote-builder/QuoteStatsBar";

export type CalendarAppointmentForStats = {
  id: string;
  quote_id: string | null;
  appointment_date: string | null;
  status: string | null;
};

export function getQuoteStatsStatus(
  quote: Pick<SalesQuote, "status" | "signed_at" | "customer_signature">
): QuoteStatus {
  if ((quote.status === "draft" || quote.status === "sent") && (quote.signed_at || quote.customer_signature)) {
    return "sold";
  }
  return quote.status;
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

export function filterQuotesForStatsTile(
  quotes: SalesQuote[],
  filter: StatsFilter,
  calendarAppointments: CalendarAppointmentForStats[] = []
): SalesQuote[] {
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
          (q.appointment_date === today || matchingCalendarQuoteIds.has(q.id)) &&
          q.status !== "archived"
      );
    case "upcoming":
      return quotes.filter(
        (q) => {
          const status = getQuoteStatsStatus(q);
          return (
            (matchingCalendarQuoteIds.has(q.id) ||
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
