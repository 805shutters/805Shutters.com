import type {
  SelectionContext,
  SelectionRecord,
  SelectionValue,
  ValidationIssue,
} from "./core";
import { normalizeIdentity } from "./catalog";
import { sourceProvenance, type SourceManifestId } from "./source-manifest";

/**
 * One quote line and its one explicitly selected design. The caller must build
 * this input from the same immutable SelectionContext used for authoritative
 * pricing; alternatives that are not selected do not belong in this list.
 */
export interface QuoteSelectedDesignLine {
  readonly lineId: string;
  readonly selectedDesign: SelectionContext;
}

type RelationshipKind = "roman" | "vertical" | "honeycomb";

interface MatchField {
  readonly key: string;
  readonly label: string;
  readonly aliases?: readonly string[];
}

const ROMAN_SOURCE = {
  sourceId: "norman-roman-guide-2026-05" as SourceManifestId,
  page: 14,
};

const VERTICAL_SOURCE = {
  sourceId: "norman-vertical-blinds-guide-2026-06" as SourceManifestId,
  page: 7,
};

const HONEYCOMB_SOURCE = {
  sourceId: "norman-honeycomb-guide-2026-07" as SourceManifestId,
  page: 15,
};

const ROMAN_MATCH_FIELDS: readonly MatchField[] = [
  { key: "fabric_collection", label: "front fabric collection" },
  { key: "fabric_color_code", label: "front fabric color code" },
  { key: "mount_type", label: "mount type" },
  { key: "shade_type", label: "shade type" },
  { key: "lift_system", label: "operating system" },
  { key: "fold_style", label: "fold style" },
  { key: "lining", label: "lining" },
  { key: "fabric_orientation", label: "fabric orientation" },
  {
    key: "seaming",
    label: "seaming selection",
    aliases: ["fabric_join_acknowledgment"],
  },
] as const;

const VERTICAL_MATCH_FIELDS: readonly MatchField[] = [
  {
    key: "fabric_collection",
    label: "vane collection",
    aliases: ["fabric_group"],
  },
  {
    key: "fabric_color_name",
    label: "vane color",
    aliases: ["vertical_color"],
  },
  { key: "mount_type", label: "mount type" },
  { key: "stack_option", label: "stack configuration" },
] as const;

const HONEYCOMB_MATCH_FIELDS: readonly MatchField[] = [
  { key: "mount_type", label: "mount type" },
  {
    key: "lift_system",
    label: "operating system",
    aliases: ["honeycomb_operating_system"],
  },
  { key: "fabric_collection", label: "fabric collection" },
  { key: "fabric_color_code", label: "exact fabric color code" },
  { key: "shade_height", label: "measured shade height" },
  { key: "cell_size", label: "cell size" },
] as const;

function relationshipKind(context: SelectionContext): RelationshipKind | null {
  const product = normalizeIdentity(context.productId);
  if (product === "roman") return "roman";
  if (product === "synchrony vertical") return "vertical";
  if (product === "honeycomb") return "honeycomb";
  return null;
}

function evidenceValue(
  context: SelectionContext,
  key: string,
  aliases: readonly string[] = [],
): SelectionValue | undefined {
  for (const candidate of [key, ...aliases]) {
    const configurationValue = context.configuration[candidate];
    if (
      configurationValue !== undefined &&
      configurationValue !== null &&
      configurationValue !== ""
    ) {
      return configurationValue;
    }
    const optionValue = context.options[candidate];
    if (optionValue !== undefined && optionValue !== null && optionValue !== "") {
      return optionValue;
    }
  }
  return undefined;
}

function text(value: SelectionValue | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function enabled(value: SelectionValue | undefined): boolean {
  if (value === true) return true;
  return ["yes", "true", "1"].includes(normalizeIdentity(value));
}

function comparable(value: SelectionValue | undefined): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "string") return normalizeIdentity(value) || null;
  if (typeof value === "number" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  return JSON.stringify(value);
}

function selectedValue(value: SelectionValue | undefined): SelectionValue {
  return value === undefined ? null : value;
}

function sourceFor(kind: RelationshipKind) {
  if (kind === "roman") return ROMAN_SOURCE;
  if (kind === "honeycomb") return HONEYCOMB_SOURCE;
  return VERTICAL_SOURCE;
}

function issue(
  kind: RelationshipKind,
  suffix: string,
  selectedValues: SelectionRecord,
  explanation: string,
): ValidationIssue {
  const source = sourceFor(kind);
  return {
    severity: "hard_block",
    ruleId: `${kind}.side_by_side.quote.${suffix}`,
    source: sourceProvenance(source.sourceId, { page: source.page }),
    selectedValues,
    explanation,
  };
}

function baseValues(
  line: QuoteSelectedDesignLine,
  referencedLineId: string | null,
): SelectionRecord {
  return {
    lineId: line.lineId.trim() || null,
    referencedLineId,
    productId: line.selectedDesign.productId,
  };
}

function referenceId(line: QuoteSelectedDesignLine): string {
  return text(
    evidenceValue(line.selectedDesign, "side_by_side_match_line_id", [
      "side_by_side_reference_line_id",
    ]),
  );
}

function sideBySideEnabled(line: QuoteSelectedDesignLine): boolean {
  return enabled(evidenceValue(line.selectedDesign, "side_by_side"));
}

function validateMatchingEvidence(
  kind: RelationshipKind,
  line: QuoteSelectedDesignLine,
  target: QuoteSelectedDesignLine,
  referencedLineId: string,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const fields =
    kind === "roman"
      ? ROMAN_MATCH_FIELDS
      : kind === "honeycomb"
        ? HONEYCOMB_MATCH_FIELDS
        : VERTICAL_MATCH_FIELDS;

  for (const field of fields) {
    const current = evidenceValue(
      line.selectedDesign,
      field.key,
      field.aliases,
    );
    const referenced = evidenceValue(
      target.selectedDesign,
      field.key,
      field.aliases,
    );
    const currentComparable = comparable(current);
    const referencedComparable = comparable(referenced);

    if (currentComparable === null || referencedComparable === null) {
      issues.push(
        issue(
          kind,
          `evidence.${field.key}.required`,
          {
            ...baseValues(line, referencedLineId),
            field: field.key,
            selectedValue: selectedValue(current),
            referencedValue: selectedValue(referenced),
          },
          `Both side-by-side lines must preserve an exact ${field.label} in their selected configuration snapshots.`,
        ),
      );
      continue;
    }

    if (currentComparable !== referencedComparable) {
      issues.push(
        issue(
          kind,
          `match.${field.key}`,
          {
            ...baseValues(line, referencedLineId),
            field: field.key,
            selectedValue: selectedValue(current),
            referencedValue: selectedValue(referenced),
          },
          `The selected ${field.label} must match the referenced side-by-side line exactly.`,
        ),
      );
    }
  }

  if (kind === "vertical") {
    const currentOrientation = evidenceValue(
      line.selectedDesign,
      "side_by_side_wand_orientation",
      ["draw_direction"],
    );
    const referencedOrientation = evidenceValue(
      target.selectedDesign,
      "side_by_side_wand_orientation",
      ["draw_direction"],
    );
    const currentComparable = comparable(currentOrientation);
    const referencedComparable = comparable(referencedOrientation);

    if (currentComparable === null || referencedComparable === null) {
      issues.push(
        issue(
          kind,
          "evidence.wand_orientation.required",
          {
            ...baseValues(line, referencedLineId),
            selectedWandOrientation: selectedValue(currentOrientation),
            referencedWandOrientation: selectedValue(referencedOrientation),
          },
          "Both side-by-side Vertical blinds must preserve an exact wand orientation in their selected configuration snapshots.",
        ),
      );
    } else if (currentComparable !== referencedComparable) {
      issues.push(
        issue(
          kind,
          "match.wand_orientation",
          {
            ...baseValues(line, referencedLineId),
            selectedWandOrientation: selectedValue(currentOrientation),
            referencedWandOrientation: selectedValue(referencedOrientation),
          },
          "Side-by-side Vertical blinds must use the same exact wand orientation.",
        ),
      );
    }

    const currentPosition = evidenceValue(
      line.selectedDesign,
      "side_by_side_position",
    );
    const referencedPosition = evidenceValue(
      target.selectedDesign,
      "side_by_side_position",
    );
    const currentPositionNormalized = comparable(currentPosition);
    const referencedPositionNormalized = comparable(referencedPosition);
    const positions = new Set([
      currentPositionNormalized,
      referencedPositionNormalized,
    ]);

    if (
      currentPositionNormalized === null ||
      referencedPositionNormalized === null
    ) {
      issues.push(
        issue(
          kind,
          "evidence.position.required",
          {
            ...baseValues(line, referencedLineId),
            selectedPosition: selectedValue(currentPosition),
            referencedPosition: selectedValue(referencedPosition),
          },
          "Both side-by-side Vertical blinds must preserve whether they are the left or right blind.",
        ),
      );
    } else if (!positions.has("left blind") || !positions.has("right blind")) {
      issues.push(
        issue(
          kind,
          "match.position_pair",
          {
            ...baseValues(line, referencedLineId),
            selectedPosition: selectedValue(currentPosition),
            referencedPosition: selectedValue(referencedPosition),
          },
          "A Vertical side-by-side pair must contain exactly one Left Blind and one Right Blind selection.",
        ),
      );
    }
  }

  if (kind === "honeycomb") {
    const currentPosition = evidenceValue(
      line.selectedDesign,
      "side_by_side_position",
    );
    const referencedPosition = evidenceValue(
      target.selectedDesign,
      "side_by_side_position",
    );
    const currentPositionNormalized = comparable(currentPosition);
    const referencedPositionNormalized = comparable(referencedPosition);
    const positions = new Set([
      currentPositionNormalized,
      referencedPositionNormalized,
    ]);

    if (
      currentPositionNormalized === null ||
      referencedPositionNormalized === null
    ) {
      issues.push(
        issue(
          kind,
          "evidence.position.required",
          {
            ...baseValues(line, referencedLineId),
            selectedPosition: selectedValue(currentPosition),
            referencedPosition: selectedValue(referencedPosition),
          },
          "Both side-by-side Honeycomb shades must preserve whether they are the left or right shade.",
        ),
      );
    } else if (!positions.has("left shade") || !positions.has("right shade")) {
      issues.push(
        issue(
          kind,
          "match.position_pair",
          {
            ...baseValues(line, referencedLineId),
            selectedPosition: selectedValue(currentPosition),
            referencedPosition: selectedValue(referencedPosition),
          },
          "A Honeycomb side-by-side pair must contain exactly one Left Shade and one Right Shade selection.",
        ),
      );
    }
  }

  return issues;
}

/**
 * Validate restrictions that can only be proven with the complete quote.
 *
 * Integration point: run this after building the selected design
 * SelectionContext for every line and before save, authoritative repricing,
 * or send authorization. Merge the returned issues into the same issue list
 * used by the line-level validator; every issue is a hard block.
 */
export function validateQuoteSelectionRelationships(
  lines: readonly QuoteSelectedDesignLine[],
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const linesById = new Map<string, QuoteSelectedDesignLine[]>();

  for (const line of lines) {
    const lineId = line.lineId.trim();
    if (!lineId) continue;
    const matches = linesById.get(lineId) ?? [];
    matches.push(line);
    linesById.set(lineId, matches);
  }

  const relevantLines = lines.filter(
    (line) => relationshipKind(line.selectedDesign) !== null,
  );
  const inboundReferences = new Map<string, QuoteSelectedDesignLine[]>();
  for (const line of relevantLines) {
    if (!sideBySideEnabled(line)) continue;
    const targetId = referenceId(line);
    if (!targetId) continue;
    const inbound = inboundReferences.get(targetId) ?? [];
    inbound.push(line);
    inboundReferences.set(targetId, inbound);
  }

  for (const line of relevantLines) {
    const kind = relationshipKind(line.selectedDesign);
    if (!kind) continue;

    const lineId = line.lineId.trim();
    const referencedLineId = referenceId(line);
    const isSideBySide = sideBySideEnabled(line);

    if (!isSideBySide) {
      if (referencedLineId) {
        issues.push(
          issue(
            kind,
            "reference_without_selection",
            baseValues(line, referencedLineId),
            "A stale side-by-side line reference remains even though this selected design is not marked side-by-side.",
          ),
        );
      }
      continue;
    }

    if (!lineId) {
      issues.push(
        issue(
          kind,
          "line_id.required",
          baseValues(line, referencedLineId || null),
          "A stable quote line ID is required before a side-by-side relationship can be validated.",
        ),
      );
      continue;
    }

    if ((linesById.get(lineId)?.length ?? 0) > 1) {
      issues.push(
        issue(
          kind,
          "line_id.ambiguous",
          {
            ...baseValues(line, referencedLineId || null),
            duplicateCount: linesById.get(lineId)?.length ?? 0,
          },
          "The side-by-side source line ID is duplicated in this quote and cannot identify one immutable selected design.",
        ),
      );
    }

    if (!referencedLineId) {
      issues.push(
        issue(
          kind,
          "reference.required",
          baseValues(line, null),
          "Select the exact quote line this side-by-side design must match.",
        ),
      );
      continue;
    }

    if (referencedLineId === lineId) {
      issues.push(
        issue(
          kind,
          "reference.self",
          baseValues(line, referencedLineId),
          "A side-by-side design cannot reference its own quote line.",
        ),
      );
      continue;
    }

    const targetMatches = linesById.get(referencedLineId) ?? [];
    if (targetMatches.length === 0) {
      issues.push(
        issue(
          kind,
          "reference.missing",
          baseValues(line, referencedLineId),
          "The referenced side-by-side quote line does not exist in the selected quote snapshot.",
        ),
      );
      continue;
    }
    if (targetMatches.length > 1) {
      issues.push(
        issue(
          kind,
          "reference.ambiguous",
          {
            ...baseValues(line, referencedLineId),
            matchingLineCount: targetMatches.length,
          },
          "The referenced side-by-side quote line ID is duplicated and does not identify one selected design.",
        ),
      );
      continue;
    }

    const inbound = inboundReferences.get(referencedLineId) ?? [];
    if (inbound.length > 1) {
      issues.push(
        issue(
          kind,
          "reference.ambiguous",
          {
            ...baseValues(line, referencedLineId),
            referencingLineIds: inbound.map((entry) => entry.lineId.trim()),
          },
          "More than one selected line references the same side-by-side partner, so the intended pair is ambiguous.",
        ),
      );
      continue;
    }

    const target = targetMatches[0];
    const targetKind = relationshipKind(target.selectedDesign);
    if (targetKind !== kind) {
      issues.push(
        issue(
          kind,
          "product.mismatch",
          {
            ...baseValues(line, referencedLineId),
            referencedProductId: target.selectedDesign.productId,
          },
          "A side-by-side design may reference only the same manufacturer product.",
        ),
      );
      continue;
    }

    const targetReferenceId = referenceId(target);
    if (!sideBySideEnabled(target) || targetReferenceId !== lineId) {
      issues.push(
        issue(
          kind,
          "reference.not_reciprocal",
          {
            ...baseValues(line, referencedLineId),
            referencedSideBySide: sideBySideEnabled(target),
            referencedLineReference: targetReferenceId || null,
          },
          "The referenced line must be marked side-by-side and reference this line back, preserving one unambiguous pair.",
        ),
      );
      continue;
    }

    issues.push(
      ...validateMatchingEvidence(kind, line, target, referencedLineId),
    );
  }

  return issues;
}
