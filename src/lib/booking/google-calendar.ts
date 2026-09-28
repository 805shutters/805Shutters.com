import { bookingEndIso, zonedTimeToUtc } from "./availability";
import { brandIdentity } from "@/lib/brand-identity";

function calendarTimestamp(iso: string) {
  return iso.replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

/** Customer-owned calendar copy of a confirmed one-hour Pacific appointment. */
export function googleCalendarUrl(date: string, time: string, address: string) {
  const start = calendarTimestamp(zonedTimeToUtc(date, time).toISOString());
  const end = calendarTimestamp(bookingEndIso(date, time));
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: "805 Shutters consultation with Jessica",
    dates: `${start}/${end}`,
    stz: "America/Los_Angeles",
    etz: "America/Los_Angeles",
    location: address,
    details: `Free in-home window treatment consultation with Jessica, your 805 Shutters design consultant.\n\nExplore light control, privacy, insulation, and material choices for your home.\n\nQuestions or changes? Call ${brandIdentity.phone}.`,
  });
  return `https://calendar.google.com/calendar/r/eventedit?${params}`;
}
