import type { TechnicalMeasureForm } from "@/lib/crm/technical-measures";

export type TechnicalMeasureCompletionIssue = {
  lineId: string;
  lineIndex: number;
  lineNumber: number;
  room: string;
  field: string;
  label: string;
  instruction: string;
};

function answered(value: unknown) {
  if (typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  return String(value ?? "").trim().length > 0;
}

export function technicalMeasureCompletionIssues(
  form: Pick<TechnicalMeasureForm, "lines">,
): TechnicalMeasureCompletionIssue[] {
  return form.lines.flatMap((line, lineIndex) => {
    const values = line.current_values;
    const base = {
      lineId: line.id,
      lineIndex,
      lineNumber: lineIndex + 1,
      room: values.room || "Window",
    };
    const issues: TechnicalMeasureCompletionIssue[] = [];

    if (!values.width_in) {
      issues.push({
        ...base,
        field: "width_in",
        label: "Width",
        instruction: "Select a width.",
      });
    }
    if (!values.height_in) {
      issues.push({
        ...base,
        field: "height_in",
        label: "Height",
        instruction: "Select a height.",
      });
    }
    if (!line.measure_schema) {
      issues.push({
        ...base,
        field: "product_program",
        label: "Product / Program",
        instruction: "Choose the exact manufacturer product/program.",
      });
    }
    for (const field of line.measure_schema?.fields.filter((item) => item.required) || []) {
      if (answered(values.details[field.key])) continue;
      issues.push({
        ...base,
        field: field.key,
        label: field.label,
        instruction: `Select ${field.label}.`,
      });
    }
    return issues;
  });
}

export function compactTechnicalMeasureCompletionSummary(
  issues: TechnicalMeasureCompletionIssue[],
) {
  const first = issues[0];
  if (!first) return "";
  const labels = Array.from(new Set(
    issues
      .filter((issue) => issue.lineId === first.lineId)
      .map((issue) => issue.label),
  ));
  const otherLines = new Set(
    issues
      .filter((issue) => issue.lineId !== first.lineId)
      .map((issue) => issue.lineId),
  ).size;
  return `Line ${first.lineNumber} (${first.room}): complete ${labels.join(", ")}.${
    otherLines ? ` ${otherLines} other line${otherLines === 1 ? "" : "s"} also need attention.` : ""
  }`;
}
