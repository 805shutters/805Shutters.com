import type { SelectionRecord } from "./core";

const number = (value: unknown): number | null => value !== null && value !== undefined && String(value).trim() !== "" && Number.isFinite(Number(value)) ? Number(value) : null;
export const AT_GAPS_LAYOUT = "At Gaps Between Shades";
export const isAtGapsLayout = (value: unknown) => String(value ?? "").trim().toLowerCase() === AT_GAPS_LAYOUT.toLowerCase();

/** Coordinates are measured from the finished valance's left end, not assumed centered in a gap. */
export function valanceGapPlacement(prefix: "smartfold" | "perfectsheer", c: SelectionRecord, common: SelectionRecord | null, finishedWidth: number, orderSpan: number) {
  if (!isAtGapsLayout(c[`${prefix}_keystone_layout`])) return null;
  const widths = Array.isArray(common?.orderedWidths) ? common.orderedWidths.map(number) : [];
  const gaps = Array.isArray(common?.gaps) ? common.gaps.map(number) : [];
  const membersValid = widths.length >= 2 && widths.every(w => w !== null && w > 0) && gaps.length === widths.length && gaps.every(g => g !== null && g >= 0);
  const explicitOffset = number(c[`${prefix}_splice_span_offset`]);
  const offset = explicitOffset ?? (Math.abs(finishedWidth - orderSpan) < 1e-8 ? 0 : null);
  const issues: string[] = [];
  if (!membersValid) issues.push("Select the complete common-valance group before placing joints at its gaps.");
  if (c[`${prefix}_splice_span_offset`] != null && explicitOffset === null) issues.push("The measured first-shade offset must be a finite number.");
  if (offset === null) issues.push("Measure the first shade's left edge from the finished valance's left end when their widths differ; do not assume the valance is centered.");
  const intervals: Array<{start: number | null; end: number | null; gap: number | null}> = [];
  const positions: number[] = [];
  let cursor = offset ?? NaN;
  if (membersValid) for (let i = 0; i < widths.length - 1; i++) {
    cursor += widths[i]!;
    const start = cursor, gap = gaps[i]!, end = start + gap;
    intervals.push({start: Number.isFinite(start) ? start : null, end: Number.isFinite(end) ? end : null, gap});
    const requested = number(c[`${prefix}_keystone_location_${i + 1}`]);
    const rawPosition = c[`${prefix}_keystone_location_${i + 1}`];
    if (rawPosition != null && rawPosition !== "" && requested === null) issues.push(`Joint ${i + 1} must be a finite measured position.`);
    const position = gap === 0 ? start : requested ?? NaN;
    if (gap > 0 && requested === null) issues.push(`Measure joint ${i + 1} from the valance's left end within the gap after shade ${i + 1}.`);
    if (Number.isFinite(start) && (gap > 0 && requested !== null && (requested < start || requested > end) || gap === 0 && requested !== null && Math.abs(requested - start) > 1e-8)) issues.push(`Joint ${i + 1} must fall at the measured boundary/gap after shade ${i + 1}.`);
    positions.push(position); cursor = end;
  }
  if (positions.some(p => Number.isFinite(p) && (p <= 0 || p >= finishedWidth))) issues.push("Every splice must fall strictly inside the finished valance width.");
  return {jointCount: membersValid ? widths.length - 1 : 0, positions, issues,
    record: {version: 1, layout: AT_GAPS_LAYOUT, coordinateBasis: "finished_valance_left_end", shadeSpanOffset: offset, intervals, jointPositions: positions.map(p => Number.isFinite(p) ? p : null)} as SelectionRecord};
}
