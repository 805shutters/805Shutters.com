import { BookingError } from "./scheduling";

const overrideKeys = [
  "manual_override",
  "manualOverride",
  "p_manual_override",
  "override_by",
  "overrideBy",
  "override_reason",
  "overrideReason",
] as const;

export function publicPayloadCarriesOverride(payload: object) {
  return overrideKeys.some((key) =>
    Object.prototype.hasOwnProperty.call(payload, key),
  );
}

export function explicitManualOverride(payload: {
  manual_override?: unknown;
  override_by?: unknown;
  override_reason?: unknown;
}) {
  if (payload.manual_override !== true) {
    throw new BookingError(
      403,
      "This appointment stays blocked unless manual_override is explicitly true.",
    );
  }
  const overrideBy =
    typeof payload.override_by === "string" ? payload.override_by.trim() : "";
  const overrideReason =
    typeof payload.override_reason === "string"
      ? payload.override_reason.trim()
      : "";
  if (!overrideBy || !overrideReason) {
    throw new BookingError(
      400,
      "Manual override requires who authorized it and why.",
    );
  }
  return { overrideBy, overrideReason };
}

export function failManualBooking(error: { message?: string } | null): never {
  const message = error?.message || "";
  if (message.includes("BOOKING_OVERRIDE")) {
    throw new BookingError(
      400,
      "Manual override requires an explicit flag plus a non-blank who and why.",
    );
  }
  if (message.includes("BOOKING_CONFLICT")) {
    throw new BookingError(409, "That time overlaps another appointment.");
  }
  if (message.includes("BOOKING_FULL")) {
    throw new BookingError(409, "That day already has four appointments.");
  }
  if (message.includes("BOOKING_CLOSED")) {
    throw new BookingError(409, "Jessica has not published that time.");
  }
  if (message.includes("BOOKING_DUPLICATE")) {
    throw new BookingError(
      409,
      "This customer already booked a consultation within the last 24 hours.",
    );
  }
  const code = message.match(/BOOKING_[A-Z_]+/)?.[0];
  throw new BookingError(
    409,
    code
      ? `Booking protection ${code} still applies.`
      : "Calendar changed or this time is outside the remaining booking rules. Reload and choose a published open time.",
  );
}
