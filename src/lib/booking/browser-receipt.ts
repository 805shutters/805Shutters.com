// Hand details across a client navigation only. No address, customer details,
// booking identifiers or conversion flags are accepted from the URL.
export const bookingThankYouPath = "/booking-thank-you/";
export type BookingReceipt = {
  variant: "standard" | "commercial";
  date: string;
  time: string;
  dateLabel: string;
  timeLabel: string;
  address: string;
  followUpRequested: boolean;
};
let pending: { receipt: BookingReceipt; until: number } | null = null;
export function handOffBooking(
  result: { eventId?: unknown; leadId?: unknown },
  receipt: BookingReceipt,
) {
  if (
    typeof result.eventId !== "string" ||
    !result.eventId ||
    result.eventId !== result.leadId
  ) {
    throw new Error(
      "The booking could not be verified. Please call 805 Shutters before trying again.",
    );
  }
  pending = { receipt, until: Date.now() + 60_000 };
  return result.eventId;
}
export function takeBookingReceipt() {
  const saved = pending;
  pending = null;
  return saved && saved.until > Date.now() ? saved.receipt : null;
}
