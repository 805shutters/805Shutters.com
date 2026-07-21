import { describe, expect, it } from "vitest";
import {
  ROLLER_V2_POWER_CONFIGURATIONS,
  expectedRollerMotorForPowerConfiguration,
  rollerMotorChargeForPowerConfiguration,
} from "./roller-motor";
import {
  resolveRollerMotorizationContract,
  rollerBaseMotorUnitsForConfiguration,
} from "./roller-motor-contract";

describe("Roller motor and power binding", () => {
  it("maps every documented power configuration to one exact catalog charge", () => {
    for (const power of ROLLER_V2_POWER_CONFIGURATIONS) {
      const charge = rollerMotorChargeForPowerConfiguration(power);
      expect(charge, power).not.toBeNull();
      expect(charge?.displayName).toBe(
        expectedRollerMotorForPowerConfiguration(power),
      );
      expect(charge?.groupId).toBeTruthy();
      expect(charge?.optionId).toBeTruthy();
    }
  });

  it("does not guess an unknown power configuration", () => {
    expect(rollerMotorChargeForPowerConfiguration("Mystery Motor")).toBeNull();
  });

  it.each([
    ["Coupled Shades", "Standard Coupled", 2, 1],
    ["Independently Operated Coupled Shades", "Independently Operated", 2, 2],
    ["Coupled Shades", "Standard Coupled", 3, 2],
    ["Coupled Shades", "Standard Coupled", 4, 2],
    ["LightGuard 360 with T-Post", "Standard Coupled", 2, 1],
    ["LightGuard 360 with T-Post", "Independently Operated", 2, 2],
    ["LightGuard 360 with T-Post", "Standard Coupled", 3, 2],
    ["LightGuard 360 with T-Post", "Standard Coupled", 4, 2],
  ])(
    "derives %s / %s / %i as %i source-backed motor drive groups",
    (application, couplingArrangement, componentCount, expected) => {
      expect(
        rollerBaseMotorUnitsForConfiguration({
          application,
          couplingArrangement,
          componentCount,
        }),
      ).toBe(expected);
    },
  );

  it("rejects canonical coupled motor units that do not match drive topology", () => {
    const result = resolveRollerMotorizationContract({
      liftSystem: "Motorized",
      powerConfiguration: "Norman Smart AC Adapter Plug-In 36W",
      application: "Coupled Shades",
      couplingArrangement: "Standard Coupled",
      componentCount: 3,
      canonicalSelectionsPresent: true,
      canonicalSelections: [
        {
          groupId: "smart_motorization",
          optionId: "motor",
          role: "base_motor",
          units: 1,
        },
      ],
    });
    expect(result.issues.map((entry) => entry.ruleId)).toContain(
      "roller.motorization.base_units_mismatch",
    );
  });

  it("fails closed for the unresolved plain LightGuard 360 motor subtype", () => {
    const result = resolveRollerMotorizationContract({
      liftSystem: "Motorized",
      powerConfiguration: "Norman Smart AC Adapter Plug-In 36W",
      application: "LightGuard 360",
      couplingArrangement: null,
      componentCount: null,
      canonicalSelectionsPresent: true,
      canonicalSelections: [
        {
          groupId: "smart_motorization",
          optionId: "motor",
          role: "base_motor",
          units: 1,
        },
      ],
    });
    expect(result.issues.map((entry) => entry.ruleId)).toEqual(
      expect.arrayContaining([
        "roller.motorization.lightguard_application_ambiguous",
        "roller.motorization.drive_units_unresolved",
      ]),
    );
  });
});
