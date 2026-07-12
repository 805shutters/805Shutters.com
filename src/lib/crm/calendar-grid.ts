export type CalendarTimelineRowRange = {
  firstRow: number;
  lastRow: number;
};

export function calendarTimelineRowRange(
  eventStart: Date,
  eventEnd: Date,
  slotStarts: Date[]
): CalendarTimelineRowRange | null {
  if (!slotStarts.length || eventEnd <= eventStart) return null;

  const defaultRowDuration = slotStarts.length > 1
    ? slotStarts[1].getTime() - slotStarts[0].getTime()
    : 30 * 60 * 1000;
  const overlappingRows = slotStarts
    .map((slotStart, index) => {
      const nextSlotStart = slotStarts[index + 1];
      const slotEnd = nextSlotStart ?? new Date(slotStart.getTime() + defaultRowDuration);
      return eventStart < slotEnd && eventEnd > slotStart ? index : -1;
    })
    .filter((index) => index >= 0);

  if (!overlappingRows.length) return null;

  return {
    firstRow: Math.min(...overlappingRows),
    lastRow: Math.max(...overlappingRows)
  };
}
