import type {
  SelectionContext,
  SelectionRecord,
  SelectionValue,
  ValidationIssue,
} from "./core";
import { normalizeIdentity } from "./catalog";
import type { CanonicalMotorizationSelection } from "./roller-motor-contract";
import { sourceProvenance } from "./source-manifest";

export const NORMAN_MOTORIZATION_SOURCE_ID =
  "norman-motorization-guide-2026-05" as const;

export type NormanShadeMotorFamily =
  "norman_smart" | "automate_home" | "autowand";

export type NormanHoneycombMotorMode =
  "bottom_up" | "top_down" | "tdbu" | "day_night" | "skylight";

export interface SourceBackedMotorLimits {
  readonly id: string;
  readonly minWidth: number;
  readonly maxWidth: number;
  readonly minHeight: number;
  readonly maxHeight: number;
  readonly maxAreaSqFt?: number;
  readonly sourcePage: number;
}

export type NormanShadeMotorizationResolution =
  | {
      readonly ok: true;
      readonly productId: "honeycomb" | "roman";
      readonly family: NormanShadeMotorFamily;
      readonly powerSource: string;
      readonly mode: NormanHoneycombMotorMode | "roman" | "roman_day_night";
      readonly limits: readonly SourceBackedMotorLimits[];
      readonly canonicalSelections: readonly CanonicalMotorizationSelection[];
      readonly sourcePages: readonly number[];
      readonly includedAccessories: readonly string[];
      /** Non-blocking source-backed derivations produced with this result. */
      readonly issues: readonly ValidationIssue[];
      readonly derivedAdapterWattage?: 36 | 65;
    }
  | {
      readonly ok: false;
      readonly issues: readonly ValidationIssue[];
      /** Present when dimensions resolved but another exact field blocked the contract. */
      readonly limits?: readonly SourceBackedMotorLimits[];
      readonly sourcePages?: readonly number[];
      /** Expected components are preserved so the authoritative adapter can materialize them. */
      readonly canonicalSelections?: readonly CanonicalMotorizationSelection[];
    };

type MotorConfig = Readonly<{
  productId: "honeycomb" | "roman";
  lift: string;
  application: string;
  powerSource: string;
  remoteType: string;
  hubRequired: boolean | null;
  motorPosition: string;
  existingRemoteWorkOrder: string;
  canonicalSelections: readonly CanonicalMotorizationSelection[] | null;
  canonicalSelectionsPresent: boolean;
  dcPowerSupply: string;
}>;

function value(
  context: SelectionContext,
  ...keys: readonly string[]
): SelectionValue | undefined {
  for (const key of keys) {
    const configurationValue = context.configuration[key];
    if (
      configurationValue !== undefined &&
      configurationValue !== null &&
      configurationValue !== ""
    ) {
      return configurationValue;
    }
    const optionValue = context.options[key];
    if (
      optionValue !== undefined &&
      optionValue !== null &&
      optionValue !== ""
    ) {
      return optionValue;
    }
  }
  return undefined;
}

function text(input: SelectionValue | undefined): string {
  return typeof input === "string" ? input.trim() : "";
}

function normalized(input: SelectionValue | undefined): string {
  return normalizeIdentity(text(input));
}

function booleanValue(input: SelectionValue | undefined): boolean | null {
  if (input === true || ["yes", "true", "1"].includes(normalized(input))) {
    return true;
  }
  if (input === false || ["no", "false", "0"].includes(normalized(input))) {
    return false;
  }
  return null;
}

function issue(
  ruleId: string,
  pages: number | readonly number[],
  selectedValues: SelectionRecord,
  explanation: string,
  severity: ValidationIssue["severity"] = "hard_block",
  derivedValues?: SelectionRecord,
): ValidationIssue {
  const location = typeof pages === "number" ? { page: pages } : { pages };
  return {
    severity,
    ruleId,
    source: sourceProvenance(NORMAN_MOTORIZATION_SOURCE_ID, location),
    selectedValues,
    explanation,
    ...(derivedValues ? { derivedValues } : {}),
  };
}

function canonicalSelection(
  groupId: string,
  optionId: string,
  role: CanonicalMotorizationSelection["role"],
  units = 1,
): CanonicalMotorizationSelection {
  return { groupId, optionId, role, units };
}

function parseCanonicalSelections(
  input: SelectionValue | undefined,
): readonly CanonicalMotorizationSelection[] | null {
  if (!Array.isArray(input)) return null;
  const parsed: CanonicalMotorizationSelection[] = [];
  for (const entry of input) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry))
      return null;
    const source = entry as Record<string, SelectionValue>;
    const groupId = text(source.groupId);
    const optionId = text(source.optionId);
    const role = text(source.role) as CanonicalMotorizationSelection["role"];
    const units = Number(source.units);
    if (
      !groupId ||
      !optionId ||
      ![
        "base_motor",
        "controller",
        "hub",
        "sensor",
        "power_supply",
        "accessory",
      ].includes(role) ||
      !Number.isInteger(units) ||
      units < 1
    ) {
      return null;
    }
    parsed.push({ groupId, optionId, role, units });
  }
  return parsed;
}

function motorConfig(
  context: SelectionContext,
  productId: "honeycomb" | "roman",
): MotorConfig {
  const canonicalValue = value(context, "motorization_selections");
  return {
    productId,
    lift: normalized(
      value(context, "honeycomb_operating_system", "lift_system"),
    ),
    application: normalized(
      value(context, "application", "honeycomb_application"),
    ),
    powerSource: normalized(value(context, "motor_type", "power_source")),
    remoteType: normalized(value(context, "remote_type", "motor_remote_type")),
    hubRequired: booleanValue(value(context, "hub_required")),
    motorPosition: normalized(
      value(
        context,
        "motor_position",
        "power_source_location",
        "control_position",
      ),
    ),
    existingRemoteWorkOrder: text(
      value(context, "existing_remote_work_order_number", "existing_remote_wo"),
    ),
    canonicalSelections: parseCanonicalSelections(canonicalValue),
    canonicalSelectionsPresent:
      Object.prototype.hasOwnProperty.call(
        context.configuration,
        "motorization_selections",
      ) ||
      Object.prototype.hasOwnProperty.call(
        context.options,
        "motorization_selections",
      ),
    dcPowerSupply: normalized(
      value(
        context,
        "dc_power_supply",
        "motor_power_supply",
        "low_voltage_power_supply",
      ),
    ),
  };
}

function isMotorized(config: MotorConfig): boolean {
  return (
    config.lift.includes("motor") ||
    config.application.includes("motorized skylight")
  );
}

function familyForPowerSource(
  powerSource: string,
): NormanShadeMotorFamily | null {
  if (powerSource.includes("autowand")) return "autowand";
  if (
    powerSource.includes("automate") ||
    powerSource.includes("external rechargeable battery pack")
  ) {
    return "automate_home";
  }
  if (
    powerSource.includes("charging wand") ||
    powerSource.includes("ac adapter") ||
    powerSource.includes("dc low voltage") ||
    powerSource.includes("rechargeable battery ac charger")
  ) {
    return "norman_smart";
  }
  return null;
}

function honeycombMode(config: MotorConfig): NormanHoneycombMotorMode {
  if (config.application.includes("motorized skylight")) return "skylight";
  if (config.lift.includes("day night")) return "day_night";
  if (config.lift.includes("tdbu")) return "tdbu";
  if (config.lift.includes("top down") || config.lift.endsWith(" td")) {
    return "top_down";
  }
  return "bottom_up";
}

function isWovenHoneycomb(context: SelectionContext): boolean {
  const identity = normalized(
    value(context, "fabric_class", "fabric_collection", "fabric_family"),
  );
  return ["breeze", "windsong", "ashton", "designer ashton"].some((name) =>
    identity.includes(name),
  );
}

function dimensionTargets(context: SelectionContext): readonly number[] {
  const shadeType = normalized(value(context, "shade_type"));
  const panelWidths = value(context, "common_valance_panel_widths");
  if (shadeType.includes("common valance") && Array.isArray(panelWidths)) {
    const parsed = panelWidths
      .map(Number)
      .filter((entry) => Number.isFinite(entry));
    if (parsed.length === 2) return parsed;
  }
  return [context.widthInches];
}

function romanAreaLimit(
  context: SelectionContext,
  upper: number,
  lower: number,
): number {
  const fold = normalized(value(context, "fold_style"));
  return fold.includes("soft fold") ? lower : upper;
}

function controllerSelection(
  family: NormanShadeMotorFamily,
  remoteType: string,
): CanonicalMotorizationSelection | null {
  if (!remoteType) return null;
  if (family === "norman_smart") {
    if (remoteType.includes("smartdial")) {
      return canonicalSelection(
        "smart_motorization",
        "smartdial_g2_remote",
        "controller",
      );
    }
    if (remoteType.includes("basic remote")) {
      return canonicalSelection(
        "smart_motorization",
        "basic_remote_black",
        "controller",
      );
    }
  }
  if (family === "automate_home") {
    if (remoteType.includes("15 channel")) {
      return canonicalSelection(
        "automate_home",
        "15_channel_remote",
        "controller",
      );
    }
    if (
      remoteType.includes("5 channel") ||
      remoteType.includes("wall switch")
    ) {
      return canonicalSelection(
        "automate_home",
        "5_channel_wall_switch",
        "controller",
      );
    }
  }
  return null;
}

function canonicalIdentity(entry: CanonicalMotorizationSelection): string {
  return `${entry.groupId}/${entry.optionId}/${entry.role}/${entry.units}`;
}

function sameCanonicalSelections(
  actual: readonly CanonicalMotorizationSelection[],
  expected: readonly CanonicalMotorizationSelection[],
): boolean {
  const sort = (entries: readonly CanonicalMotorizationSelection[]) =>
    entries.map(canonicalIdentity).sort();
  return JSON.stringify(sort(actual)) === JSON.stringify(sort(expected));
}

function validateControlAndPosition(
  context: SelectionContext,
  config: MotorConfig,
  family: NormanShadeMotorFamily,
  pages: readonly number[],
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const shadeType = normalized(value(context, "shade_type"));
  const isRomanDerivedPosition =
    config.productId === "roman" &&
    (shadeType.includes("day night") || shadeType.includes("common valance"));

  if (!config.motorPosition && !isRomanDerivedPosition) {
    issues.push(
      issue(
        `${config.productId}.motorization.motor_position_required`,
        pages,
        { motor_position: null },
        "Select the documented right or left motor/control position before authoritative pricing.",
      ),
    );
  } else if (
    config.motorPosition &&
    !["left", "right"].includes(config.motorPosition)
  ) {
    issues.push(
      issue(
        `${config.productId}.motorization.motor_position_invalid`,
        pages,
        { motor_position: config.motorPosition },
        "Motor/control position must be exactly Right or Left for a single shade.",
      ),
    );
  }

  if (isRomanDerivedPosition && !config.motorPosition) {
    issues.push(
      issue(
        "roman.motorization.motor_position_derived",
        pages,
        { shade_type: shadeType, motor_position: null },
        "The documented standard paired motor positions are applied.",
        "auto_derive",
        shadeType.includes("day night")
          ? { front_motor_position: "Right", rear_motor_position: "Left" }
          : {
              left_shade_motor_position: "Left",
              right_shade_motor_position: "Right",
            },
      ),
    );
  }

  if (family === "autowand") {
    if (config.remoteType || config.hubRequired === true) {
      issues.push(
        issue(
          `${config.productId}.motorization.autowand_control_incompatible`,
          config.productId === "honeycomb" ? [74, 75, 76] : [74, 78, 79, 80],
          {
            remote_type: config.remoteType || null,
            hub_required: config.hubRequired,
          },
          "AutoWand is a wand-controlled system and cannot be combined with a remote or hub.",
        ),
      );
    }
    return issues;
  }

  if (config.hubRequired === null) {
    issues.push(
      issue(
        `${config.productId}.motorization.hub_selection_required`,
        pages,
        { hub_required: null },
        "Choose whether the compatible motor family requires its hub; omission could remove a priced control component.",
      ),
    );
  }
  if (config.remoteType && !controllerSelection(family, config.remoteType)) {
    issues.push(
      issue(
        `${config.productId}.motorization.controller_family_mismatch`,
        [4, ...pages],
        { motor_family: family, remote_type: config.remoteType },
        "Norman Smart and Automate Home controls are not cross-compatible; select a controller from the chosen motor family.",
      ),
    );
  }
  return issues;
}

function canonicalContractIssues(
  config: MotorConfig,
  expected: readonly CanonicalMotorizationSelection[],
  pages: readonly number[],
): ValidationIssue[] {
  if (
    !config.canonicalSelectionsPresent ||
    config.canonicalSelections === null
  ) {
    return [
      issue(
        `${config.productId}.motorization.canonical_components_required`,
        pages,
        {
          motorization_selections: config.canonicalSelectionsPresent
            ? "malformed"
            : null,
          expected_components: expected.map(canonicalIdentity),
        },
        "Store the exact source-addressable motor, power, controller, and hub components so pricing cannot omit or substitute a required item.",
      ),
    ];
  }
  if (!sameCanonicalSelections(config.canonicalSelections, expected)) {
    return [
      issue(
        `${config.productId}.motorization.canonical_components_mismatch`,
        pages,
        {
          selected_components:
            config.canonicalSelections.map(canonicalIdentity),
          expected_components: expected.map(canonicalIdentity),
        },
        "The canonical priced motor components do not match the documented configuration.",
      ),
    ];
  }
  return [];
}

function dimensionIssues(
  context: SelectionContext,
  limits: readonly SourceBackedMotorLimits[],
  prefix: string,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const widths = dimensionTargets(context);
  const profile = limits[0];
  for (const [index, width] of widths.entries()) {
    const area = (width * context.heightInches) / 144;
    const selectedValues: SelectionRecord = {
      widthInches: width,
      heightInches: context.heightInches,
      areaSqFt: area,
      profileId: profile.id,
      ...(widths.length > 1 ? { commonValancePanel: index + 1 } : {}),
    };
    if (width < profile.minWidth) {
      issues.push(
        issue(
          `${prefix}.${profile.id}.min_width`,
          profile.sourcePage,
          { ...selectedValues, minWidthInches: profile.minWidth },
          `Motorized width is below the documented ${profile.minWidth}-inch minimum.`,
        ),
      );
    }
    if (width > profile.maxWidth) {
      issues.push(
        issue(
          `${prefix}.${profile.id}.max_width`,
          profile.sourcePage,
          { ...selectedValues, maxWidthInches: profile.maxWidth },
          `Motorized width exceeds the documented ${profile.maxWidth}-inch maximum.`,
        ),
      );
    }
    if (context.heightInches < profile.minHeight) {
      issues.push(
        issue(
          `${prefix}.${profile.id}.min_height`,
          profile.sourcePage,
          { ...selectedValues, minHeightInches: profile.minHeight },
          `Motorized height is below the documented ${profile.minHeight}-inch minimum.`,
        ),
      );
    }
    if (context.heightInches > profile.maxHeight) {
      issues.push(
        issue(
          `${prefix}.${profile.id}.max_height`,
          profile.sourcePage,
          { ...selectedValues, maxHeightInches: profile.maxHeight },
          `Motorized height exceeds the documented ${profile.maxHeight}-inch maximum.`,
        ),
      );
    }
    if (profile.maxAreaSqFt !== undefined && area > profile.maxAreaSqFt) {
      issues.push(
        issue(
          `${prefix}.${profile.id}.max_area`,
          profile.sourcePage,
          { ...selectedValues, maxAreaSqFt: profile.maxAreaSqFt },
          `Motorized area exceeds the documented ${profile.maxAreaSqFt}-square-foot maximum.`,
        ),
      );
    }
  }
  return issues;
}

function resolveHoneycomb(
  context: SelectionContext,
  config: MotorConfig,
): NormanShadeMotorizationResolution {
  const issues: ValidationIssue[] = [];
  if (!config.powerSource) {
    return {
      ok: false,
      issues: [
        issue(
          "honeycomb.motorization.power_source_required",
          [4, 9, 61, 75],
          { motor_type: null, lift_system: config.lift },
          "Select the exact Norman Smart, Automate Home, or AutoWand power source before validating a motorized Honeycomb shade.",
        ),
      ],
    };
  }
  const family = familyForPowerSource(config.powerSource);
  if (!family) {
    return {
      ok: false,
      issues: [
        issue(
          "honeycomb.motorization.power_source_unknown",
          [4, 9, 61, 75],
          { motor_type: config.powerSource },
          "The selected Honeycomb motor/power source is not documented in the pinned Motorization Guide.",
        ),
      ],
    };
  }

  const mode = honeycombMode(config);
  const supportedModes: Readonly<
    Record<NormanShadeMotorFamily, readonly NormanHoneycombMotorMode[]>
  > = {
    norman_smart: ["bottom_up", "tdbu", "day_night", "skylight"],
    automate_home: ["bottom_up", "top_down"],
    autowand: ["bottom_up"],
  };
  if (!supportedModes[family].includes(mode)) {
    return {
      ok: false,
      issues: [
        issue(
          "honeycomb.motorization.family_system_incompatible",
          family === "norman_smart"
            ? [4, 7, 9]
            : family === "automate_home"
              ? [4, 61]
              : [74, 75],
          {
            motor_family: family,
            motor_type: config.powerSource,
            lift_system: config.lift,
            application: config.application,
          },
          "The chosen motor family is not documented for this Honeycomb operating system/application.",
        ),
      ],
    };
  }

  const woven = isWovenHoneycomb(context);
  const area = (context.widthInches * context.heightInches) / 144;
  let limits: SourceBackedMotorLimits;
  let derivedAdapterWattage: 36 | 65 | undefined;
  const canonicalSelections: CanonicalMotorizationSelection[] = [];
  const includedAccessories: string[] = [];
  let sourcePages: readonly number[];

  if (family === "norman_smart") {
    sourcePages = [4, 6, 7, 9, 10, 11, 12, 13, 14];
    const rechargeable = config.powerSource.includes("charging wand");
    const acAdapter = config.powerSource.includes("ac adapter");
    const lowVoltage = config.powerSource.includes("dc low voltage");
    const installation = normalized(
      value(context, "installation_method", "bracket_installation"),
    );
    if (rechargeable && installation.includes("side mount")) {
      issues.push(
        issue(
          "honeycomb.motorization.charging_wand.side_mount_incompatible",
          9,
          {
            motor_type: config.powerSource,
            installation_method: installation,
          },
          "Norman Smart rechargeable battery with a charging wand is not available for Side Mount installation.",
        ),
      );
    }
    if (mode === "skylight" && !acAdapter && !lowVoltage) {
      issues.push(
        issue(
          "honeycomb.motorization.skylight_power_incompatible",
          [9, 10],
          { motor_type: config.powerSource, application: config.application },
          "Motorized Skylight is documented only with AC Adapter 36W or DC Low Voltage power.",
        ),
      );
    }
    if (lowVoltage && !config.dcPowerSupply) {
      issues.push(
        issue(
          "honeycomb.motorization.dc_power_supply_required",
          13,
          { dc_power_supply: null },
          "Specify direct building low-voltage wiring or a separately allocated DC distribution panel.",
        ),
      );
    } else if (
      lowVoltage &&
      config.dcPowerSupply.includes("distribution panel")
    ) {
      issues.push(
        issue(
          "honeycomb.motorization.shared_dc_panel_allocation_incomplete",
          13,
          { dc_power_supply: config.dcPowerSupply },
          "A DC distribution panel powers up to 12 motors, but quote-level shared-panel allocation is not yet represented; this branch remains fail-closed instead of charging one panel per line.",
        ),
      );
    }

    const baseOption =
      mode === "skylight"
        ? "single_motor_for_skylights"
        : mode === "tdbu" || mode === "day_night"
          ? "dual_motor_for_honeycomb"
          : "motor";
    canonicalSelections.push(
      canonicalSelection("smart_motorization", baseOption, "base_motor"),
    );
    if (config.powerSource.includes("wireless charging wand")) {
      canonicalSelections.push(
        canonicalSelection(
          "smart_motorization",
          "wireless_charging_wand",
          "power_supply",
        ),
      );
      includedAccessories.push("Wireless wand charger");
    } else if (config.powerSource.includes("wired charging wand")) {
      canonicalSelections.push(
        canonicalSelection(
          "smart_motorization",
          "wired_charging_wand",
          "power_supply",
        ),
      );
      includedAccessories.push("Wired charging connector and extension cable");
    }

    if (mode === "skylight") {
      limits = {
        id: "norman-smart-skylight",
        minWidth: context.heightInches > 72 ? 32 : 29,
        maxWidth: 48,
        minHeight: 10,
        maxHeight: 96,
        sourcePage: 9,
      };
    } else if (mode === "bottom_up") {
      if (woven) {
        limits = {
          id: "norman-smart-woven-bottom-up",
          minWidth: 24,
          maxWidth: 86,
          minHeight: 10,
          maxHeight: 120,
          sourcePage: 9,
        };
      } else {
        limits = {
          id: "norman-smart-bottom-up",
          minWidth: 24,
          maxWidth: 120,
          minHeight: 10,
          maxHeight: 144,
          ...(rechargeable ? { maxAreaSqFt: 90 } : {}),
          sourcePage: 9,
        };
      }
      if (acAdapter) derivedAdapterWattage = area <= 90 ? 36 : 65;
    } else {
      const needs65 = woven
        ? context.heightInches > 86 || area > 50
        : area > 50;
      if (acAdapter) derivedAdapterWattage = needs65 ? 65 : 36;
      const use65 = acAdapter && derivedAdapterWattage === 65;
      const highPower = lowVoltage || use65;
      limits = {
        id: woven
          ? highPower
            ? "norman-smart-woven-dual-high-power"
            : "norman-smart-woven-dual-rechargeable-36w"
          : highPower
            ? "norman-smart-dual-high-power"
            : "norman-smart-dual-rechargeable-36w",
        minWidth: use65 ? 26.5 : 24,
        maxWidth: woven ? 86 : 120,
        minHeight: 10,
        maxHeight: woven ? (highPower ? 110 : 86) : 144,
        ...(!highPower || !woven ? { maxAreaSqFt: highPower ? 80 : 50 } : {}),
        sourcePage: 9,
      };
    }
  } else if (family === "automate_home") {
    sourcePages = [4, 61, 62, 63, 64];
    canonicalSelections.push(
      canonicalSelection(
        "automate_home",
        "motor_rechargeable_battery_pack_or_ac_adapter",
        "base_motor",
      ),
    );
    const topDown = mode === "top_down";
    limits = {
      id: woven
        ? topDown
          ? "automate-woven-top-down"
          : "automate-woven-bottom-up"
        : topDown
          ? "automate-top-down"
          : "automate-bottom-up",
      minWidth: topDown ? (context.heightInches > 72 ? 35 : 31) : 22,
      maxWidth: woven ? 86 : 120,
      minHeight: 10,
      maxHeight: woven ? (topDown ? 86 : 120) : 144,
      ...(topDown || !woven ? { maxAreaSqFt: topDown ? 50 : 80 } : {}),
      sourcePage: 61,
    };
  } else {
    sourcePages = [74, 75, 76, 77];
    canonicalSelections.push(
      canonicalSelection("autowand", "autowand", "base_motor"),
    );
    includedAccessories.push(
      "One charging kit per three AutoWands, minimum one per order",
    );
    limits = {
      id: woven ? "autowand-woven-bottom-up" : "autowand-bottom-up",
      minWidth: 22,
      maxWidth: woven ? 86 : 120,
      minHeight: 10,
      maxHeight: woven ? 120 : 144,
      ...(!woven ? { maxAreaSqFt: 80 } : {}),
      sourcePage: 75,
    };
  }

  const controller = controllerSelection(family, config.remoteType);
  if (controller) canonicalSelections.push(controller);
  if (config.hubRequired === true && family !== "autowand") {
    canonicalSelections.push(
      canonicalSelection(
        family === "norman_smart" ? "smart_motorization" : "automate_home",
        "hub",
        "hub",
      ),
    );
  }

  issues.push(
    ...validateControlAndPosition(context, config, family, sourcePages),
    ...dimensionIssues(context, [limits], "honeycomb.motorization.dimension"),
    ...canonicalContractIssues(config, canonicalSelections, sourcePages),
  );
  if (derivedAdapterWattage) {
    issues.push(
      issue(
        "honeycomb.motorization.ac_adapter_wattage_derived",
        9,
        {
          widthInches: context.widthInches,
          heightInches: context.heightInches,
          motor_type: config.powerSource,
        },
        `The ${derivedAdapterWattage}W AC adapter is derived from the documented size table.`,
        "auto_derive",
        { ac_adapter_wattage: derivedAdapterWattage },
      ),
    );
  }

  if (issues.some((entry) => entry.severity === "hard_block")) {
    return {
      ok: false,
      issues,
      limits: [limits],
      sourcePages,
      canonicalSelections,
    };
  }
  return {
    ok: true,
    productId: "honeycomb",
    family,
    powerSource: config.powerSource,
    mode,
    limits: [limits],
    canonicalSelections,
    sourcePages,
    includedAccessories,
    issues,
    ...(derivedAdapterWattage ? { derivedAdapterWattage } : {}),
  };
}

function resolveRoman(
  context: SelectionContext,
  config: MotorConfig,
): NormanShadeMotorizationResolution {
  if (!config.powerSource) {
    return {
      ok: false,
      issues: [
        issue(
          "roman.motorization.power_source_required",
          [4, 19, 65, 79],
          { motor_type: null },
          "Select the exact Norman Smart, Automate Home, or AutoWand Roman power source.",
        ),
      ],
    };
  }
  const family = familyForPowerSource(config.powerSource);
  if (!family) {
    return {
      ok: false,
      issues: [
        issue(
          "roman.motorization.power_source_unknown",
          [4, 19, 65, 79],
          { motor_type: config.powerSource },
          "The selected Roman motor/power source is not documented in the pinned Motorization Guide.",
        ),
      ],
    };
  }

  const issues: ValidationIssue[] = [];
  const shadeType = normalized(value(context, "shade_type"));
  const mode = shadeType.includes("day night") ? "roman_day_night" : "roman";
  const canonicalSelections: CanonicalMotorizationSelection[] = [];
  const includedAccessories: string[] = [];
  let limits: SourceBackedMotorLimits;
  let sourcePages: readonly number[];
  let derivedAdapterWattage: 36 | 65 | undefined;

  if (shadeType.includes("common valance")) {
    issues.push(
      issue(
        "roman.motorization.common_valance_price_topology_incomplete",
        19,
        {
          shade_type: shadeType,
          common_valance_panel_widths:
            value(context, "common_valance_panel_widths") ?? null,
        },
        "Motorized Common Valance requires two actual panel-grid prices and two motor charges. The current one-line price topology cannot yet prove both components, so this branch remains blocked instead of underpricing it.",
      ),
    );
  }

  if (family === "norman_smart") {
    sourcePages = [4, 18, 19, 20, 21, 22];
    const rechargeable = config.powerSource.includes("rechargeable battery");
    const acAdapter = config.powerSource.includes("ac adapter");
    const lowVoltage = config.powerSource.includes("dc low voltage");
    if (config.powerSource.includes("charging wand")) {
      issues.push(
        issue(
          "roman.motorization.power_source_incompatible",
          4,
          { motor_type: config.powerSource },
          "Rechargeable Battery with Charging Wand is not available for Centerpiece Roman shades.",
        ),
      );
    }
    if (lowVoltage && !config.dcPowerSupply) {
      issues.push(
        issue(
          "roman.motorization.dc_power_supply_required",
          21,
          { dc_power_supply: null },
          "Specify direct building low-voltage wiring or a separately allocated Norman DC distribution panel.",
        ),
      );
    } else if (
      lowVoltage &&
      config.dcPowerSupply.includes("distribution panel")
    ) {
      issues.push(
        issue(
          "roman.motorization.shared_dc_panel_allocation_incomplete",
          21,
          { dc_power_supply: config.dcPowerSupply },
          "A Norman DC panel powers up to 12 motors, but quote-level shared-panel allocation is not yet represented; this branch remains fail-closed.",
        ),
      );
    }
    canonicalSelections.push(
      canonicalSelection("smart_motorization", "motor", "base_motor"),
    );
    const upper = rechargeable ? 38.7 : acAdapter ? 51.7 : 62.3;
    const lower = rechargeable ? 32.7 : acAdapter ? 42 : 53.8;
    const localArea = Math.max(
      ...dimensionTargets(context).map(
        (width) => (width * context.heightInches) / 144,
      ),
    );
    if (acAdapter) {
      const limit36 = romanAreaLimit(context, 51.7, 42);
      derivedAdapterWattage = localArea <= limit36 ? 36 : 65;
    }
    const use65 = acAdapter && derivedAdapterWattage === 65;
    limits = {
      id: rechargeable
        ? "norman-smart-rechargeable"
        : acAdapter
          ? use65
            ? "norman-smart-ac-65w"
            : "norman-smart-ac-36w"
          : "norman-smart-dc-low-voltage",
      minWidth: rechargeable ? 24 : 16,
      maxWidth: 96,
      minHeight: 24,
      maxHeight: 102,
      maxAreaSqFt:
        acAdapter && use65
          ? romanAreaLimit(context, 62.3, 53.8)
          : romanAreaLimit(context, upper, lower),
      sourcePage: 19,
    };
    if (rechargeable) {
      includedAccessories.push(
        "One charging kit per three motors, minimum one per order",
      );
    }
  } else if (family === "automate_home") {
    sourcePages = [4, 65, 69, 70, 71];
    const lowVoltage =
      config.powerSource.includes("12v") ||
      config.powerSource.includes("low voltage");
    canonicalSelections.push(
      canonicalSelection(
        "automate_home",
        lowVoltage ? "low_voltage_dc_motor" : "motor_rechargeable_battery_pack",
        "base_motor",
      ),
    );
    if (lowVoltage) {
      if (!config.dcPowerSupply) {
        issues.push(
          issue(
            "roman.motorization.automate_power_supply_required",
            [65, 70],
            { dc_power_supply: null },
            "Automate 12V DC requires an exact External Battery Pack or DC Power Distribution Panel selection.",
          ),
        );
      } else if (config.dcPowerSupply.includes("external battery")) {
        canonicalSelections.push(
          canonicalSelection(
            "automate_home",
            "external_battery_pack",
            "power_supply",
          ),
        );
        includedAccessories.push("External battery charging kit");
      } else if (config.dcPowerSupply.includes("distribution panel")) {
        issues.push(
          issue(
            "roman.motorization.shared_dc_panel_allocation_incomplete",
            70,
            { dc_power_supply: config.dcPowerSupply },
            "An Automate DC panel powers up to 18 motors, but quote-level shared-panel allocation is not yet represented; this branch remains fail-closed.",
          ),
        );
      } else {
        issues.push(
          issue(
            "roman.motorization.automate_power_supply_unknown",
            70,
            { dc_power_supply: config.dcPowerSupply },
            "The selected Automate 12V power supply is not documented.",
          ),
        );
      }
    } else {
      includedAccessories.push(
        "Charging kit included with the motorized shade",
      );
    }
    limits = {
      id: lowVoltage ? "automate-12v-dc" : "automate-arc-rechargeable",
      minWidth: lowVoltage ? 17 : 26,
      maxWidth: 96,
      minHeight: 24,
      maxHeight: 102,
      maxAreaSqFt: 68,
      sourcePage: 65,
    };
  } else {
    sourcePages = [74, 78, 79, 80];
    canonicalSelections.push(
      canonicalSelection("autowand", "autowand", "base_motor"),
    );
    includedAccessories.push(
      "One charging kit per three AutoWands, minimum one per order",
    );
    limits = {
      id: "autowand",
      minWidth: 20,
      maxWidth: 96,
      minHeight: 24,
      maxHeight: 102,
      maxAreaSqFt: romanAreaLimit(context, 63, 54),
      sourcePage: 79,
    };
  }

  const controller = controllerSelection(family, config.remoteType);
  if (controller) canonicalSelections.push(controller);
  if (config.hubRequired === true && family !== "autowand") {
    canonicalSelections.push(
      canonicalSelection(
        family === "norman_smart" ? "smart_motorization" : "automate_home",
        "hub",
        "hub",
      ),
    );
  }

  issues.push(
    ...validateControlAndPosition(context, config, family, sourcePages),
    ...dimensionIssues(context, [limits], "roman.motorization.dimension"),
    ...canonicalContractIssues(config, canonicalSelections, sourcePages),
  );
  if (derivedAdapterWattage) {
    issues.push(
      issue(
        "roman.motorization.ac_adapter_wattage_derived",
        19,
        {
          widthInches: context.widthInches,
          heightInches: context.heightInches,
          motor_type: config.powerSource,
        },
        `The ${derivedAdapterWattage}W AC adapter is derived from the documented size table.`,
        "auto_derive",
        { ac_adapter_wattage: derivedAdapterWattage },
      ),
    );
  }

  if (issues.some((entry) => entry.severity === "hard_block")) {
    return {
      ok: false,
      issues,
      limits: [limits],
      sourcePages,
      canonicalSelections,
    };
  }
  return {
    ok: true,
    productId: "roman",
    family,
    powerSource: config.powerSource,
    mode,
    limits: [limits],
    canonicalSelections,
    sourcePages,
    includedAccessories,
    issues,
    ...(derivedAdapterWattage ? { derivedAdapterWattage } : {}),
  };
}

export function resolveNormanShadeMotorization(
  context: SelectionContext,
): NormanShadeMotorizationResolution | null {
  if (context.productId !== "honeycomb" && context.productId !== "roman") {
    return null;
  }
  const config = motorConfig(context, context.productId);
  if (!isMotorized(config)) return null;
  return context.productId === "honeycomb"
    ? resolveHoneycomb(context, config)
    : resolveRoman(context, config);
}

export function validateNormanShadeMotorization(
  context: SelectionContext,
): readonly ValidationIssue[] {
  const resolution = resolveNormanShadeMotorization(context);
  if (!resolution) return [];
  return resolution.issues;
}

export function canonicalNormanShadeMotorizationSelectionsFromConfiguration(
  context: SelectionContext,
): readonly CanonicalMotorizationSelection[] | null {
  const resolution = resolveNormanShadeMotorization(context);
  return resolution?.canonicalSelections ?? null;
}

export function motorFamilyForNormanShadeSelection(
  context: SelectionContext,
): NormanShadeMotorFamily | null {
  const resolution = resolveNormanShadeMotorization(context);
  if (resolution?.ok) return resolution.family;
  if (context.productId !== "honeycomb" && context.productId !== "roman") {
    return null;
  }
  return familyForPowerSource(
    normalized(value(context, "motor_type", "power_source")),
  );
}
