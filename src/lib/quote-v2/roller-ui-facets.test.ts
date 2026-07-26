import { describe, expect, it } from "vitest";
import { normanRollerV2Source } from "./generated/norman-roller-v2.generated";
import {
  ROLLER_UI_FACETS_BY_SHEET,
  pruneRollerV2UiSelection,
  rollerUiSheetForSelection,
} from "./roller-ui-facets";

const nonMotorSystems = new Map([
  ["SmartRelease", "Smart Release"],
  ["Cordloop", "Continuous Cord Loop"],
  ["Cordless", "Cordless"],
]);

describe("Roller V2 client facets", () => {
  it("is an exact lightweight projection of all 12 usable appendix header families", () => {
    const assignedDefinitionIds = new Set(
      normanRollerV2Source.profileAssignments.map(
        (assignment) => assignment.profileDefinitionId,
      ),
    );
    expect(Object.keys(ROLLER_UI_FACETS_BY_SHEET)).toHaveLength(12);
    for (const [sheet, facets] of Object.entries(ROLLER_UI_FACETS_BY_SHEET)) {
      const definitions = normanRollerV2Source.profileDefinitions.filter(
        (definition) =>
          definition.sheet === sheet &&
          definition.usable &&
          assignedDefinitionIds.has(definition.id),
      );
      const expectedLifts = new Set<string>();
      const expectedTubes = new Set<string>();
      const expectedPower = new Set<string>();
      for (const definition of definitions) {
        const nonMotor = nonMotorSystems.get(definition.operatingSystem ?? "");
        expectedLifts.add(nonMotor ?? "Motorized");
        expectedTubes.add(definition.tube ?? "All Tubes");
        if (!nonMotor && definition.operatingSystem) {
          expectedPower.add(definition.operatingSystem);
        }
      }
      expect(new Set(facets.liftSystems), `${sheet} lifts`).toEqual(expectedLifts);
      expect(new Set(facets.tubeClasses), `${sheet} tubes`).toEqual(expectedTubes);
      expect(new Set(facets.powerConfigurations), `${sheet} power`).toEqual(expectedPower);
    }
  });

  it("routes both two-shade LightGuard arrangements and all count variants", () => {
    expect(
      rollerUiSheetForSelection({
        application: "LightGuard 360 with T-Post",
        componentCount: 2,
        couplingArrangement: "Standard Coupled",
      }),
    ).toBe("LG360 with T-Post (2 ) (Std)");
    expect(
      rollerUiSheetForSelection({
        application: "LightGuard 360 with T-Post",
        componentCount: 2,
        couplingArrangement: "Independently Operated",
      }),
    ).toBe("LG360 with T-Post (2 ) (Ind)");
    expect(
      rollerUiSheetForSelection({
        application: "LightGuard 360 with T-Post",
        componentCount: 2,
      }),
    ).toBeNull();
  });

  it("clears known-impossible coupled selections as soon as the matrix route is known", () => {
    expect(
      pruneRollerV2UiSelection({
        application: "Coupled Shades",
        componentCount: 3,
        liftSystem: "Cordless",
        tubeClass: "All Tubes",
        powerConfiguration: "Automate ARC Motor",
      }),
    ).toMatchObject({
      liftSystem: null,
      tubeClass: null,
      powerConfiguration: null,
      facets: { sheet: "Coupled Shades(3)" },
    });
  });

  it("derives the documented Smart Release tube and removes stale All Tubes", () => {
    const pruned = pruneRollerV2UiSelection({
      application: "Single Shade",
      topTreatment: "No Top Treatment",
      liftSystem: "Smart Release",
      tubeClass: "All Tubes",
      powerConfiguration: "Automate ARC Motor",
    });

    expect(pruned).toMatchObject({
      liftSystem: "Smart Release",
      tubeClass: '1 3/4" (43mm) Tube',
      powerConfiguration: null,
      facets: {
        sheet: "Single(Non-LG360)&Common",
        tubeClasses: ['1 3/4" (43mm) Tube', '2" (52mm) Tube'],
      },
    });

    const sourceTubes = normanRollerV2Source.profileDefinitions
      .filter(
        (definition) =>
          definition.sheet === "Single(Non-LG360)&Common" &&
          definition.operatingSystem === "SmartRelease" &&
          definition.usable,
      )
      .map((definition) => definition.tube ?? "All Tubes");
    expect(new Set(pruned.facets?.tubeClasses)).toEqual(new Set(sourceTubes));
  });

  it("preserves a valid Smart Release tube and reconciles it when Cassette changes the matrix", () => {
    expect(
      pruneRollerV2UiSelection({
        application: "Single Shade",
        topTreatment: "No Top Treatment",
        liftSystem: "Smart Release",
        tubeClass: '2" (52mm) Tube',
      }),
    ).toMatchObject({
      tubeClass: '2" (52mm) Tube',
    });

    expect(
      pruneRollerV2UiSelection({
        application: "Single Shade",
        topTreatment: "Cassette",
        liftSystem: "Smart Release",
        tubeClass: '2" (52mm) Tube',
      }),
    ).toMatchObject({
      tubeClass: "All Tubes",
      facets: {
        sheet: "Cassette",
        tubeClasses: ["All Tubes"],
      },
    });
  });
});
