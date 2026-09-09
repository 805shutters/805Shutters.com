/** Production bookings must not silently depend on an opt-in deployment flag. */
export function isBookingDeliveryEnabled() {
  const override = process.env.BOOKING_DELIVERY_ENABLED?.trim();
  if (override) return override === "true";
  return process.env.VERCEL_ENV === "production";
}
