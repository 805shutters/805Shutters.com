import { describe, expect, it } from "vitest";
import {
  ROLLER_V2_POWER_CONFIGURATIONS,
  expectedRollerMotorForPowerConfiguration,
  rollerMotorChargeForPowerConfiguration,
} from "./roller-motor";

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
});
