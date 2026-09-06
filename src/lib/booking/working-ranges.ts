import { losAngelesDateString } from "./availability";
/** Validate and union published ranges, without extending across a closed gap. */
export function normalizeWorkingRanges(
  month: string,
  value: unknown,
): Array<{ start_at: string; end_at: string }> {
  if (
    !/^20\d{2}-(0[1-9]|1[0-2])$/.test(month) ||
    !Array.isArray(value) ||
    value.length > 124
  )
    throw new Error("Choose a valid month and at most 124 working ranges.");
  const ranges = value
    .map((item: unknown) => {
      const row = item as Record<string, unknown>;
      const start =
        typeof row?.start_at === "string" ? Date.parse(row.start_at) : NaN;
      const end =
        typeof row?.end_at === "string" ? Date.parse(row.end_at) : NaN;
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start)
        throw new Error(
          "Each working range must have a valid start and a later end.",
        );
      const day = losAngelesDateString(new Date(start));
      if (
        !day.startsWith(month) ||
        day !== losAngelesDateString(new Date(end - 1))
      )
        throw new Error(
          "Each working range must stay within one day of the selected month.",
        );
      return { start, end, day };
    })
    .sort((a, b) => a.start - b.start);
  const merged: typeof ranges = [];
  for (const range of ranges) {
    const prior = merged.at(-1);
    if (prior && prior.day === range.day && range.start <= prior.end)
      prior.end = Math.max(prior.end, range.end);
    else merged.push({ ...range });
  }
  return merged.map((r) => ({
    start_at: new Date(r.start).toISOString(),
    end_at: new Date(r.end).toISOString(),
  }));
}
