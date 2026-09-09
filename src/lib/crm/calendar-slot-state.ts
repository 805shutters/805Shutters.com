/** A failed lookup is unknown availability, never a confirmed closed slot. */
export function calendarSlotState({
  booked, past, loading, failed, available, canOverride,
}: {
  booked: boolean;
  past: boolean;
  loading: boolean;
  failed: boolean;
  available: boolean;
  canOverride: boolean;
}) {
  if (booked) return { label: "Booked", selectable: false, overridable: false };
  if (past) return { label: "Past", selectable: false, overridable: false };
  if (loading) return { label: "Checking", selectable: false, overridable: false };
  if (failed) return { label: "Unavailable", selectable: false, overridable: false };
  return {
    label: available ? "Available" : "Unavailable",
    selectable: available || canOverride,
    overridable: !available && canOverride,
  };
}
