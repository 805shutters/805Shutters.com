import { normalizeIdentity } from "./catalog";

/**
 * Binds the appendix operating-system choice to the exact priced motor line in
 * the July Retail Guide. This prevents validating one motor while charging a
 * different (or cheaper) motor option.
 */
export type RollerMotorCharge = Readonly<{
  displayName: string;
  groupId: string;
  optionId: string;
}>;

const AUTOMATE_ARC: RollerMotorCharge = {
  displayName: "Motor (Rechargeable Battery Pack)",
  groupId: "automate_home",
  optionId: "motor_rechargeable_battery_pack",
};
const AUTOMATE_LOW_VOLTAGE: RollerMotorCharge = {
  displayName: "Low Voltage DC Motor",
  groupId: "automate_home",
  optionId: "low_voltage_dc_motor",
};
const NORMAN_SMART: RollerMotorCharge = {
  displayName: "Motor",
  groupId: "smart_motorization",
  optionId: "motor",
};
const AUTOWAND: RollerMotorCharge = {
  displayName: "Autowand",
  groupId: "autowand",
  optionId: "autowand",
};

const ROLLER_MOTOR_BY_POWER = new Map<string, RollerMotorCharge>([
  ["automate arc motor", AUTOMATE_ARC],
  ["automate low voltage dc motor", AUTOMATE_LOW_VOLTAGE],
  ["norman smart ac adapter plug in 36w", NORMAN_SMART],
  [
    "norman smart ac adapter plug in 65w low voltage hard wire",
    NORMAN_SMART,
  ],
  [
    "norman smart rechargeable battery with charging wand ac adapter charger",
    NORMAN_SMART,
  ],
  [
    "norman smart rechargeable battery with ac adapter charger",
    NORMAN_SMART,
  ],
  ["autowand", AUTOWAND],
]);

export function rollerMotorChargeForPowerConfiguration(
  powerConfiguration: unknown,
): RollerMotorCharge | null {
  return ROLLER_MOTOR_BY_POWER.get(normalizeIdentity(powerConfiguration)) ?? null;
}

export function expectedRollerMotorForPowerConfiguration(
  powerConfiguration: unknown,
): string | null {
  return rollerMotorChargeForPowerConfiguration(powerConfiguration)?.displayName ?? null;
}

export const ROLLER_V2_POWER_CONFIGURATIONS = Object.freeze([
  "Automate ARC Motor",
  "Automate Low Voltage DC Motor",
  "Norman Smart AC Adapter Plug-In 36W",
  "Norman Smart AC Adapter Plug-In 65W & Low Voltage Hard Wire",
  "Norman Smart Rechargeable Battery with Charging Wand & AC Adapter Charger",
  "Norman Smart Rechargeable Battery with AC Adapter Charger",
  "AutoWand",
] as const);
