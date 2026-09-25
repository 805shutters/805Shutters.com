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

function productIsShutter(productId: string) {
  return productId.toLowerCase().includes("shutter");
}

function detailAnswered(details: Record<string, unknown>, keys: string[]) {
  return keys.some((key) => answered(details[key]));
}

function validFieldDimension(value: number | null) {
  return value !== null
    && Math.floor(value) >= 10
    && Math.floor(value) <= 125
    && Number.isInteger(value * 8);
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

    if (!values.room.trim() || values.room === "Window") {
      issues.push({
        ...base,
        field: "room",
        label: "Room",
        instruction: "Choose the room name.",
      });
    }
    if (values.room === "Custom" && !answered(values.details.field_measure_custom_room)) {
      issues.push({ ...base, field: "field_measure_custom_room", label: "Custom room", instruction: "Enter the custom room name." });
    }
    if (values.room === "Bedroom" && !["1", "2", "3", "4", "5"].includes(String(values.details.field_measure_bedroom || ""))) {
      issues.push({ ...base, field: "field_measure_bedroom", label: "Bedroom number", instruction: "Choose bedroom 1 through 5." });
    }
    if (!values.opening_label.trim()) {
      issues.push({
        ...base,
        field: "opening_label",
        label: "Opening",
        instruction: "Choose the opening letter.",
      });
    }

    if (!validFieldDimension(values.width_in)) {
      issues.push({
        ...base,
        field: "width_in",
        label: "Width",
        instruction: "Choose a width from 10 to 125 inches in eighths.",
      });
    } else if (!values.width_confirmed) {
      issues.push({
        ...base,
        field: "width_confirmed",
        label: "Width confirmation",
        instruction: "Confirm the measured width.",
      });
    }
    if (!validFieldDimension(values.height_in)) {
      issues.push({
        ...base,
        field: "height_in",
        label: "Height",
        instruction: "Choose a height from 10 to 125 inches in eighths.",
      });
    } else if (!values.height_confirmed) {
      issues.push({
        ...base,
        field: "height_confirmed",
        label: "Height confirmation",
        instruction: "Confirm the measured height.",
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
    if (productIsShutter(values.product_id)) {
      if (!detailAnswered(values.details, ["measurement_basis", "measurement_type", "measure_type", "size_type"])) {
        issues.push({
          ...base,
          field: "measurement_basis",
          label: "Measurement type",
          instruction: "Choose window size or frame-to-frame.",
        });
      }
      if (!detailAnswered(values.details, ["frame_sides"])) {
        issues.push({
          ...base,
          field: "frame_sides",
          label: "Frame",
          instruction: "Choose the shutter frame.",
        });
      }
    } else if (
      !detailAnswered(values.details, ["mount_type", "mount"])
      && !line.measure_schema?.fields.some((field) => ["mount_type", "mount"].includes(field.key))
    ) {
      issues.push({
        ...base,
        field: "mount_type",
        label: "Mount",
        instruction: "Choose inside or outside mount.",
      });
    }
    // Onyx uses the dedicated shutter editor, not the generic packet fields.
    // The packet schema's `required` list includes derived dimensions, nullable
    // positions and order-only flags. Those are validated separately before
    // manufacturer ordering; they must not block submitting a field measure.
    const onyxShutter = productIsShutter(values.product_id)
      && line.measure_schema?.manufacturer.toLowerCase() === "onyx";
    if (onyxShutter) {
      const fields = [
        ["frame_type", "Frame type", ["frame_type", "frame_style"]],
        ["panel_config", "Folding direction", ["panel_config", "panel_configuration", "folding_direction"]],
        ["tilt_type", "Tilt type", ["tilt_type", "tilt", "tilt_rod"]],
        ["material", "Material", ["material", "material_type"]],
        ["color", "Color", ["color"]],
        ["louver_size", "Louver size", ["louver_size", "louver_size_inches", "louver"]],
        ["hinge_color", "Hinge color", ["hinge_color"]],
        ["shutter_type", "Shutter type", ["shutter_type", "onyx_order_type"]],
      ] as const;
      for (const [field, label, aliases] of fields) {
        if (detailAnswered(values.details, [...aliases]) || (field === "material" && answered(values.fabric))) continue;
        issues.push({ ...base, field, label, instruction: `Select ${label}.` });
      }
      for (const [location, height, label] of [
        ["split_tilt_location", "split_tilt_height", "Split tilt height"],
        ["divider_rail_location", "divider_rail_height", "Divider rail height"],
      ] as const) {
        if (values.details[location] === "Custom" && !answered(values.details[height])) {
          issues.push({ ...base, field: height, label, instruction: `Enter ${label}.` });
        }
      }
    }
    for (const field of onyxShutter ? [] : line.measure_schema?.fields.filter((item) => item.required) || []) {
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
