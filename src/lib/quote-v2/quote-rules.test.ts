import { describe, expect, it } from "vitest";
import type { SelectionContext, SelectionRecord } from "./core";
import {
  validateQuoteSelectionRelationships,
  type QuoteSelectedDesignLine,
} from "./quote-rules";

const romanConfiguration: SelectionRecord = {
  side_by_side: true,
  mount_type: "Inside Mount",
  shade_type: "Single",
  lift_system: "Cordless",
  fold_style: "Flat Fold with Seams",
  fabric_collection: "Alma",
  fabric_color_code: "F1621",
  lining: "Translucent",
  fabric_orientation: "Standard / Non-Railroaded",
  seaming: "Vertical Seams",
};

const verticalConfiguration: SelectionRecord = {
  side_by_side: true,
  mount_type: "Inside Mount",
  fabric_collection: "Classic",
  fabric_color_name: "Pure White",
  stack_option: "Stack Left",
  draw_direction: "Left Draw",
  side_by_side_wand_orientation: "Left Draw",
};

const honeycombConfiguration: SelectionRecord = {
  side_by_side: true,
  mount_type: "Inside Mount",
  lift_system: "SmartRise Cordless",
  honeycomb_operating_system: "SmartRise Cordless",
  fabric_collection: "Solitude",
  fabric_color_code: "C1001",
  shade_height: 60,
  cell_size: '3/4" Single Cell',
};

function context(
  productId: string,
  configuration: SelectionRecord,
): SelectionContext {
  return {
    manufacturerId: "norman",
    productId,
    programId: "test-program",
    catalogVersion: "test-catalog",
    catalogAsOf: "2026-07-20",
    widthInches: 36,
    heightInches: 60,
    quantity: 1,
    configuration,
    options: {},
  };
}

function line(
  lineId: string,
  productId: string,
  configuration: SelectionRecord,
): QuoteSelectedDesignLine {
  return {
    lineId,
    selectedDesign: context(productId, configuration),
  };
}

function romanPair(
  firstOverrides: SelectionRecord = {},
  secondOverrides: SelectionRecord = {},
): QuoteSelectedDesignLine[] {
  return [
    line("roman-a", "roman", {
      ...romanConfiguration,
      side_by_side_match_line_id: "roman-b",
      ...firstOverrides,
    }),
    line("roman-b", "roman", {
      ...romanConfiguration,
      side_by_side_match_line_id: "roman-a",
      ...secondOverrides,
    }),
  ];
}

function verticalPair(
  firstOverrides: SelectionRecord = {},
  secondOverrides: SelectionRecord = {},
): QuoteSelectedDesignLine[] {
  return [
    line("vertical-a", "synchrony_vertical", {
      ...verticalConfiguration,
      side_by_side_position: "Left Blind",
      side_by_side_match_line_id: "vertical-b",
      ...firstOverrides,
    }),
    line("vertical-b", "synchrony_vertical", {
      ...verticalConfiguration,
      side_by_side_position: "Right Blind",
      side_by_side_match_line_id: "vertical-a",
      ...secondOverrides,
    }),
  ];
}

function honeycombPair(
  firstOverrides: SelectionRecord = {},
  secondOverrides: SelectionRecord = {},
): QuoteSelectedDesignLine[] {
  return [
    line("honeycomb-a", "honeycomb", {
      ...honeycombConfiguration,
      side_by_side_position: "Left Shade",
      side_by_side_match_line_id: "honeycomb-b",
      ...firstOverrides,
    }),
    line("honeycomb-b", "honeycomb", {
      ...honeycombConfiguration,
      side_by_side_position: "Right Shade",
      side_by_side_match_line_id: "honeycomb-a",
      ...secondOverrides,
    }),
  ];
}

function ruleIds(lines: readonly QuoteSelectedDesignLine[]): string[] {
  return validateQuoteSelectionRelationships(lines).map(
    (entry) => entry.ruleId,
  );
}

describe("Quote V2 cross-line side-by-side rules", () => {
  it("accepts a reciprocal Roman pair with identical immutable production evidence", () => {
    expect(validateQuoteSelectionRelationships(romanPair())).toEqual([]);
  });

  it("rejects missing, self, and nonexistent Roman references", () => {
    expect(
      ruleIds([
        line("roman-a", "roman", {
          ...romanConfiguration,
          side_by_side_match_line_id: null,
        }),
      ]),
    ).toContain("roman.side_by_side.quote.reference.required");

    expect(
      ruleIds([
        line("roman-a", "roman", {
          ...romanConfiguration,
          side_by_side_match_line_id: "roman-a",
        }),
      ]),
    ).toContain("roman.side_by_side.quote.reference.self");

    expect(
      ruleIds([
        line("roman-a", "roman", {
          ...romanConfiguration,
          side_by_side_match_line_id: "not-on-quote",
        }),
      ]),
    ).toContain("roman.side_by_side.quote.reference.missing");
  });

  it("rejects duplicate IDs, many-to-one pairs, and stale non-side-by-side references", () => {
    const duplicateTarget = [
      line("roman-a", "roman", {
        ...romanConfiguration,
        side_by_side_match_line_id: "roman-b",
      }),
      line("roman-b", "roman", {
        ...romanConfiguration,
        side_by_side_match_line_id: "roman-a",
      }),
      line("roman-b", "roman", {
        ...romanConfiguration,
        side_by_side_match_line_id: "roman-a",
      }),
    ];
    expect(ruleIds(duplicateTarget)).toContain(
      "roman.side_by_side.quote.reference.ambiguous",
    );

    const manyToOne = [
      ...romanPair(),
      line("roman-c", "roman", {
        ...romanConfiguration,
        side_by_side_match_line_id: "roman-b",
      }),
    ];
    expect(ruleIds(manyToOne)).toContain(
      "roman.side_by_side.quote.reference.ambiguous",
    );

    expect(
      ruleIds([
        line("roman-a", "roman", {
          ...romanConfiguration,
          side_by_side: false,
          side_by_side_match_line_id: "roman-b",
        }),
      ]),
    ).toContain("roman.side_by_side.quote.reference_without_selection");
  });

  it("requires the referenced Roman line to be the same product and reciprocal", () => {
    const wrongProduct = romanPair();
    wrongProduct[1] = line("roman-b", "synchrony_vertical", {
      ...verticalConfiguration,
      side_by_side_position: "Right Blind",
      side_by_side_match_line_id: "roman-a",
    });
    expect(ruleIds(wrongProduct)).toContain(
      "roman.side_by_side.quote.product.mismatch",
    );

    const nonreciprocal = romanPair();
    nonreciprocal[1] = line("roman-b", "roman", {
      ...romanConfiguration,
      side_by_side_match_line_id: "roman-c",
    });
    expect(ruleIds(nonreciprocal)).toContain(
      "roman.side_by_side.quote.reference.not_reciprocal",
    );
  });

  it("blocks Roman fabric, orientation, seaming, and production-configuration mismatches", () => {
    const ids = ruleIds(
      romanPair(
        {},
        {
          fabric_color_code: "F1622",
          fabric_orientation: "Railroaded",
          seaming: "Horizontal Seams",
          lift_system: "Continuous Cord Loop",
        },
      ),
    );
    expect(ids).toEqual(
      expect.arrayContaining([
        "roman.side_by_side.quote.match.fabric_color_code",
        "roman.side_by_side.quote.match.fabric_orientation",
        "roman.side_by_side.quote.match.seaming",
        "roman.side_by_side.quote.match.lift_system",
      ]),
    );
  });

  it("fails closed when Roman immutable evidence is absent and includes pinned provenance", () => {
    const issues = validateQuoteSelectionRelationships(
      romanPair({ seaming: null }, { seaming: null }),
    );
    const missing = issues.find(
      (entry) =>
        entry.ruleId === "roman.side_by_side.quote.evidence.seaming.required",
    );
    expect(missing).toMatchObject({
      severity: "hard_block",
      source: {
        sourceId: "norman-roman-guide-2026-05",
        fileName: "Roman Shade Guide.pdf",
        revision: "May 2026",
        page: 14,
      },
      selectedValues: {
        lineId: "roman-a",
        referencedLineId: "roman-b",
        field: "seaming",
      },
    });
    expect(missing?.source.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("accepts an exact reciprocal Synchrony Vertical pair", () => {
    expect(validateQuoteSelectionRelationships(verticalPair())).toEqual([]);
  });

  it("requires matching Vertical fabric, configuration, and exact wand orientation", () => {
    const ids = ruleIds(
      verticalPair(
        {},
        {
          fabric_color_name: "Silk White",
          mount_type: "Outside Mount",
          stack_option: "Stack Right",
          draw_direction: "Right Draw",
          side_by_side_wand_orientation: "Right Draw",
        },
      ),
    );
    expect(ids).toEqual(
      expect.arrayContaining([
        "vertical.side_by_side.quote.match.fabric_color_name",
        "vertical.side_by_side.quote.match.mount_type",
        "vertical.side_by_side.quote.match.stack_option",
        "vertical.side_by_side.quote.match.wand_orientation",
      ]),
    );
  });

  it("requires explicit opposite Vertical positions and wand evidence", () => {
    const ids = ruleIds(
      verticalPair(
        { side_by_side_wand_orientation: null, draw_direction: null },
        {
          side_by_side_position: "Left Blind",
          side_by_side_wand_orientation: null,
          draw_direction: null,
        },
      ),
    );
    expect(ids).toEqual(
      expect.arrayContaining([
        "vertical.side_by_side.quote.evidence.wand_orientation.required",
        "vertical.side_by_side.quote.match.position_pair",
      ]),
    );
  });

  it("accepts a reciprocal Honeycomb pair only when exact manufacturer evidence matches", () => {
    expect(validateQuoteSelectionRelationships(honeycombPair())).toEqual([]);

    const issues = validateQuoteSelectionRelationships(
      honeycombPair(
        {},
        {
          fabric_color_code: "C1002",
          shade_height: 61,
          side_by_side_position: "Left Shade",
        },
      ),
    );
    expect(issues.map((entry) => entry.ruleId)).toEqual(
      expect.arrayContaining([
        "honeycomb.side_by_side.quote.match.fabric_color_code",
        "honeycomb.side_by_side.quote.match.shade_height",
        "honeycomb.side_by_side.quote.match.position_pair",
      ]),
    );
    expect(issues[0]?.source).toMatchObject({
      sourceId: "norman-honeycomb-guide-2026-07",
      fileName: "Honeycomb Shade Guide (1).pdf",
      revision: "July 2026",
      page: 15,
    });
  });

  it("ignores products outside the Roman, Honeycomb, and Synchrony Vertical relationship scope", () => {
    expect(
      validateQuoteSelectionRelationships([
        line("roller-a", "roller", {
          side_by_side: true,
          side_by_side_match_line_id: "roller-a",
        }),
      ]),
    ).toEqual([]);
  });
});
