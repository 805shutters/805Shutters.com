import { describe, expect, it } from "vitest";
import {
  NORMAN_ROLLER_V2_INGESTED_WORKBOOK_SHA256,
  NORMAN_ROLLER_V2_ORIGINAL_WORKBOOK_SHA256,
  normanRollerV2Source,
} from "./norman-roller-v2.generated";

const REQUIRED_LIMIT_METRICS = ["minWidth", "minHeight", "maxWidth", "maxHeight"];

describe("Norman Roller V2 generated source", () => {
  it("pins both source artifacts and keeps the August release inactive until its effective date", () => {
    expect(NORMAN_ROLLER_V2_INGESTED_WORKBOOK_SHA256).toBe(
      "f076f92a2f9f5032c78c48487afb86464b8197d567822efd7d8dbb79dd18e253",
    );
    expect(NORMAN_ROLLER_V2_ORIGINAL_WORKBOOK_SHA256).toBe(
      "ba286767b6c4d760bf480434312678f6c35b229e9763ddd6fcda9f7cd18b9cc3",
    );
    expect(normanRollerV2Source.metadata).toMatchObject({
      revisionDate: "2026-07-08",
      effectiveFrom: "2026-08-01",
      releaseStatus: "future",
      releaseStatusEvaluatedOn: "2026-07-20",
      activationPolicy: "inactive before effectiveFrom; active on or after effectiveFrom",
      sourceRef: { sheet: "Revision Log", row: 42, range: "A42:C42" },
    });
  });

  it("reconciles every catalog, row, and numeric-cell acceptance count", () => {
    expect(normanRollerV2Source.metadata.counts).toEqual({
      collections: 73,
      colors: 350,
      offerings: 373,
      fabricCodes: 89,
      dimensionSheets: 12,
      dimensionColumns: 594,
      rawLimitRows: 937,
      quarantinedLimitRows: 1,
      activeLimitRows: 936,
      rawNumericCells: 46_372,
      quarantinedNumericCells: 40,
      activeNumericCells: 46_332,
      profileDefinitions: 149,
      usableProfileDefinitions: 144,
      unusableProfileDefinitions: 5,
      limitProfiles: 3_319,
      profileAssignments: 11_232,
    });
    expect(normanRollerV2Source.metadata.regionOfferingCounts).toEqual({
      all_regions: 327,
      other_regions: 23,
      ca_ma: 23,
    });
    expect(
      [...normanRollerV2Source.limitRows, ...normanRollerV2Source.quarantinedLimitRows].reduce(
        (sum, row) => sum + row.numericCellCount,
        0,
      ),
    ).toBe(46_372);
  });

  it("pins the twelve source sheets independently so a shifted or dropped block cannot hide in the grand total", () => {
    expect(
      normanRollerV2Source.dimensionSheets.map((sheet) => [
        sheet.name,
        sheet.rawRowCount,
        sheet.columns.length,
        sheet.rawNumericCellCount,
      ]),
    ).toEqual([
      ["Single(Non-LG360)&Common", 78, 62, 4_836],
      ["LG360&w T-post split & housing", 78, 58, 4_524],
      ["LG360 with T-Post (2 ) (Std)", 79, 40, 3_160],
      ["LG360 with T-Post (2 ) (Ind)", 78, 40, 3_120],
      ["LG360 with T-Post (3 Shades)", 78, 50, 3_900],
      ["LG360 with T-Post (4 Shades)", 78, 40, 3_120],
      ["Standard Coupled Shade(2)", 78, 56, 4_368],
      ["Independently Coupled Shade(2)", 78, 51, 3_978],
      ["Dual", 78, 48, 3_744],
      ["Cassette", 78, 59, 4_602],
      ["Coupled Shades(3)", 78, 50, 3_900],
      ["Coupled Shades(4)", 78, 40, 3_120],
    ]);
  });

  it("includes the three valid rows without item numbers and excludes merged category dividers", () => {
    const unnumberedRows = normanRollerV2Source.limitRows.filter(
      (row) =>
        row.sheet === "LG360 with T-Post (4 Shades)" && [18, 20, 22].includes(row.sourceRow),
    );

    expect(unnumberedRows).toHaveLength(3);
    expect(unnumberedRows.map((row) => [row.sourceRow, row.itemNumber, row.sourceFabricLabel])).toEqual([
      [18, null, "AB0667/AB0667-A"],
      [20, null, "AB0443"],
      [22, null, "AB0448"],
    ]);
    expect(unnumberedRows.every((row) => row.numericCellCount === 40)).toBe(true);
    expect(normanRollerV2Source.metadata.inclusionRule).toContain(
      "an item number in column A is not required",
    );
    expect(
      normanRollerV2Source.limitRows.some((row) => row.sourceFabricLabel === "ROOM DARKENING"),
    ).toBe(false);
  });

  it("quarantines only the 40-cell AA0384 orphan and never assigns it a usable profile", () => {
    expect(normanRollerV2Source.quarantinedLimitRows).toEqual([
      expect.objectContaining({
        id: "roller-sheet-03-row-90",
        sheet: "LG360 with T-Post (2 ) (Std)",
        sourceRow: 90,
        sourceCellRange: "D90:AQ90",
        sourceFabricLabel: "AA0384",
        sourceFabricTokens: ["AA0384"],
        fabricCodes: [],
        numericCellCount: 40,
        quarantineReason: "fabric_code_not_in_fabric_code_list",
      }),
    ]);
    expect(
      normanRollerV2Source.profileAssignments.some(
        (assignment) => assignment.limitRowId === "roller-sheet-03-row-90",
      ),
    ).toBe(false);
  });

  it("retains the future release's exact fabric, color, region, and source-cell identities", () => {
    expect(normanRollerV2Source.offerings.filter((row) => row.colorCode === "F0407")).toEqual([
      expect.objectContaining({
        fabricCode: "AB0462-B",
        collection: "NA820 (3%)",
        colorName: "Oyster/Pewter",
        regionScope: "all_regions",
        effectiveFrom: "2026-08-01",
        sourceRef: expect.objectContaining({ row: 358, range: "B358:F358", colorCodeCell: "D358" }),
      }),
    ]);
    expect(normanRollerV2Source.offerings.filter((row) => row.colorCode === "F1536")).toEqual([
      expect.objectContaining({
        fabricCode: "AB0668-A",
        collection: "Clarissa",
        colorName: "Coffee Bean",
        sourceColorName: "\u3000Coffee Bean",
        effectiveFrom: "2026-08-01",
        sourceRef: expect.objectContaining({ row: 141, colorNameCell: "E141" }),
      }),
    ]);
    expect(
      normanRollerV2Source.offerings.some(
        (row) => row.colorCode === "F0407" && row.fabricCode === "AB0462-A",
      ),
    ).toBe(false);

    const mergedCollectionRow = normanRollerV2Source.limitRows.find(
      (row) => row.sheet === "LG360 with T-Post (4 Shades)" && row.sourceRow === 37,
    );
    expect(mergedCollectionRow).toMatchObject({
      sourceFabricLabel: "AB0629",
      collection: "Clarissa",
      sourceCollection: "Clarissa",
      sourceCollectionCell: "C36",
    });
  });

  it("expands merged limit headers while retaining every contributing header anchor", () => {
    const sheet = normanRollerV2Source.dimensionSheets.find(
      (candidate) => candidate.name === "Single(Non-LG360)&Common",
    );
    const column = sheet?.columns.find((candidate) => candidate.sourceColumn === "D");

    expect(column).toMatchObject({
      orientation: "NORMAL FABRIC ORIENTATION",
      operatingSystem: "SmartRelease",
      application: "no top treatment /Square Fascia / Curved Fascia / Fabric Valance / Wood Valance",
      tube: "all tubes",
      metric: "minWidth",
      sourceMetric: "min width",
      unit: "inch",
      sourceUnit: "inch",
    });
    expect(column?.sourceHeaderCells.map((cell) => cell.sourceCell)).toEqual([
      "D1",
      "D2",
      "D3",
      "D4",
      "D5",
      "D6",
      "D7",
    ]);
  });

  it("fails closed on all five documented source defects instead of inventing limits", () => {
    const unusable = normanRollerV2Source.profileDefinitions.filter((definition) => !definition.usable);
    expect(unusable).toHaveLength(5);

    expect(unusable).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "roller-definition-023",
          sheet: "LG360&w T-post split & housing",
          operatingSystem: "Automate Low Voltage DC Motor",
          tube: '1 3/4" (43mm) Tube',
          missingRequiredMetrics: [],
          invalidRequiredUnits: [{ metric: "maxHeight", sourceColumn: "Z", sourceUnit: "mm" }],
        }),
        expect.objectContaining({
          id: "roller-definition-134",
          sheet: "Coupled Shades(3)",
          operatingSystem: "Norman Smart AC Adapter Plug-In 65W & Low Voltage Hard Wire",
          missingRequiredMetrics: ["minWidth"],
        }),
        expect.objectContaining({
          id: "roller-definition-135",
          sheet: "Coupled Shades(3)",
          operatingSystem: "Norman Smart AC Adapter Plug-In 65W & Low Voltage Hard Wire",
          missingRequiredMetrics: ["minWidth"],
        }),
        expect.objectContaining({
          id: "roller-definition-144",
          sheet: "Coupled Shades(4)",
          operatingSystem: "Norman Smart AC Adapter Plug-In 65W & Low Voltage Hard Wire",
          missingRequiredMetrics: ["minWidth"],
        }),
        expect.objectContaining({
          id: "roller-definition-145",
          sheet: "Coupled Shades(4)",
          operatingSystem: "Norman Smart AC Adapter Plug-In 65W & Low Voltage Hard Wire",
          missingRequiredMetrics: ["minWidth"],
        }),
      ]),
    );

    const unusableIds = new Set(unusable.map((definition) => definition.id));
    expect(
      normanRollerV2Source.profileAssignments.some((assignment) =>
        unusableIds.has(assignment.profileDefinitionId),
      ),
    ).toBe(false);
    for (const definition of normanRollerV2Source.profileDefinitions.filter(
      (candidate) => candidate.usable,
    )) {
      expect(Object.keys(definition.sourceColumnsByMetric)).toEqual(
        expect.arrayContaining(REQUIRED_LIMIT_METRICS),
      );
      for (const metric of REQUIRED_LIMIT_METRICS) {
        expect(definition.sourceUnitsByMetric[metric]).toBe("inch");
      }
    }
  });

  it("links a normalized profile back to its exact row and source cells", () => {
    const assignment = normanRollerV2Source.profileAssignments.find(
      (candidate) =>
        candidate.limitRowId === "roller-sheet-01-row-9" &&
        candidate.profileDefinitionId === "roller-definition-001",
    );
    expect(assignment).toEqual({
      limitRowId: "roller-sheet-01-row-9",
      profileDefinitionId: "roller-definition-001",
      profileId: "roller-profile-0001",
      fabricCodes: ["AB0639"],
      sourceCells: {
        minWidth: "D9",
        minHeight: "E9",
        maxWidth: "F9",
        maxHeight: "G9",
      },
    });
    expect(
      normanRollerV2Source.limitProfiles.find(
        (profile) => profile.id === assignment?.profileId,
      ),
    ).toEqual({
      id: "roller-profile-0001",
      definitionId: "roller-definition-001",
      limits: { minWidth: 12, minHeight: 12, maxWidth: 96, maxHeight: 144 },
      units: { minWidth: "inch", minHeight: "inch", maxWidth: "inch", maxHeight: "inch" },
    });
  });

  it("never activates a limit row whose fabric code is absent from the catalog", () => {
    const knownFabricCodes = new Set(
      normanRollerV2Source.offerings.map((offering) => offering.fabricCode),
    );
    expect(
      normanRollerV2Source.limitRows.every(
        (row) => row.fabricCodes.length > 0 && row.fabricCodes.every((code) => knownFabricCodes.has(code)),
      ),
    ).toBe(true);
  });
});
