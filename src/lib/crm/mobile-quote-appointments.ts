export type MobileQuoteAppointmentTab = "today" | "scheduled";

const losAngelesDateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});

export function mobileQuoteLosAngelesDate(offset = 0, now = new Date()) {
  const parts = losAngelesDateFormatter.formatToParts(now);
  const part = (name: Intl.DateTimeFormatPartTypes) => Number(parts.find((item) => item.type === name)?.value);
  const date = new Date(Date.UTC(part("year"), part("month") - 1, part("day") + offset, 12));
  return date.toISOString().slice(0, 10);
}

export function buildMobileQuoteAppointmentQuery(tab: MobileQuoteAppointmentTab, now = new Date()) {
  const start = mobileQuoteLosAngelesDate(tab === "today" ? 0 : 1, now);
  const end = mobileQuoteLosAngelesDate(tab === "today" ? 1 : 15, now);
  const query = new URLSearchParams({
    event_type: "sales_consult",
    start,
    end,
    scope: "all"
  });

  return `/api/crm/mobile/appointments?${query.toString()}`;
}
