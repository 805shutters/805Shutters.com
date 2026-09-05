const pacificFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Los_Angeles",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
export function businessDate(value: string | null | undefined): string | null {
  if (!value || !Number.isFinite(Date.parse(value))) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value))
    return new Date(value).toISOString().slice(0, 10) === value ? value : null;
  return pacificFormatter.format(new Date(value));
}
