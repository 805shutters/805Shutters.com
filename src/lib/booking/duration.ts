export const bookingSlotDurationMinutes = 60;

export function bookingDurationForWindowCount(windowCount: number | string | null | undefined) {
  const count = Number(windowCount || 0);
  if (!Number.isFinite(count) || count <= 0) return bookingSlotDurationMinutes;

  const normalizedWindowCount = Math.ceil(count);
  if (normalizedWindowCount <= 5) return bookingSlotDurationMinutes;
  if (normalizedWindowCount <= 20) return bookingSlotDurationMinutes * 2;
  return bookingSlotDurationMinutes * 3;
}

export function bookingDurationLabelForWindowCount(windowCount: number | string | null | undefined) {
  const count = Number(windowCount || 0);
  if (!Number.isFinite(count) || count <= 0) return "";

  const hours = bookingDurationForWindowCount(count) / bookingSlotDurationMinutes;
  return `${hours} hour${hours === 1 ? "" : "s"}`;
}
