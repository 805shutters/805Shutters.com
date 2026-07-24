export const calendarAppointmentDurationOptions = [30, 60, 90, 120, 150, 180, 240] as const;

export function calendarAppointmentDurationMinutes(value: FormDataEntryValue | null, fallback: number) {
  const minutes = Number(value);
  return Number.isInteger(minutes) && minutes >= 30 && minutes <= 480 ? minutes : fallback;
}

export function calendarAppointmentDurationLabel(minutes: number) {
  if (minutes < 60) return `${minutes} minutes`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (!remainingMinutes) return `${hours} ${hours === 1 ? "hour" : "hours"}`;
  return `${hours} ${hours === 1 ? "hour" : "hours"} ${remainingMinutes} minutes`;
}

export function calendarAppointmentDurationChoices(currentMinutes: number) {
  return Array.from(new Set([...calendarAppointmentDurationOptions, currentMinutes]))
    .filter((minutes) => minutes >= 30 && minutes <= 480)
    .sort((left, right) => left - right);
}
