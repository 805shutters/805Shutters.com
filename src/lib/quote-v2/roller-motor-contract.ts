import { catalog } from "@/lib/quote/catalog";
import type { SelectionRecord, ValidationIssue } from "./core";
import { normalizeIdentity } from "./catalog";
import {
  rollerMotorChargeForPowerConfiguration,
  type RollerMotorCharge,
} from "./roller-motor";
import { sourceProvenance } from "./source-manifest";

export const ROLLER_MOTORIZATION_SELECTIONS_KEY =
  "motorization_selections" as const;

export const CANONICAL_MOTORIZATION_ROLES = [
  "base_motor",
  "controller",
  "hub",
  "sensor",
  "power_supply",
  "accessory",
] as const;

export type CanonicalMotorizationRole =
  (typeof CANONICAL_MOTORIZATION_ROLES)[number];

/**
 * Canonical, source-addressable motor component stored with the design.
 *
 * `groupId` is deliberately mandatory. Norman reuses option ids and names
 * across incompatible motor families, so an option name by itself is not an
 * authoritative identity.
 */
export type CanonicalMotorizationSelection = Readonly<{
  groupId: string;
  optionId: string;
  role: CanonicalMotorizationRole;
  units: number;
}>;

export type RollerMotorizationContractResult = Readonly<{
  source: "canonical" | "legacy";
  selections: readonly CanonicalMotorizationSelection[];
  issues: readonly ValidationIssue[];
}>;

export type RollerMotorizationContractInput = Readonly<{
  liftSystem: unknown;
  powerConfiguration: unknown;
  application?: unknown;
  couplingArrangement?: unknown;
  componentCount?: unknown;
  canonicalSelections: unknown;
  canonicalSelectionsPresent: boolean;
  legacyMotorType?: unknown;
  legacyRemoteType?: unknown;
  legacyHubRequired?: unknown;
}>;

const ROLLER_MOTORIZATION_GROUPS = new Set([
  "automate_home",
  "autowand",
  "smart_motorization",
]);

const BASE_MOTOR_IDENTITIES = new Set([
  "automate_home/motor_rechargeable_battery_pack",
  "automate_home/low_voltage_dc_motor",
  "smart_motorization/motor",
  "autowand/autowand",
]);

function issue(
  ruleId: string,
  selectedValues: SelectionRecord,
  explanation: string,
): ValidationIssue {
  return {
    severity: "hard_block",
    ruleId,
    source: sourceProvenance("norman-retail-guide-2026-07", {
      pages: [7, 8, 28],
    }),
    selectedValues,
    explanation,
  };
}

function driveTopologyIssue(
  ruleId: string,
  selectedValues: SelectionRecord,
  explanation: string,
): ValidationIssue {
  return {
    severity: "hard_block",
    ruleId,
    source: sourceProvenance("norman-roller-guide-2026-07", {
      pages: [25, 26, 27, 31, 32, 33, 51, 52, 53, 54],
    }),
    selectedValues,
    explanation,
  };
}

function populatedString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizedKey(groupId: string, optionId: string): string {
  return `${groupId}/${optionId}`;
}

function isMotorized(liftSystem: unknown): boolean {
  return normalizeIdentity(liftSystem).includes("motor");
}

/**
 * Source-backed motor drive groups for Roller assemblies. A standard coupled
 * pair shares one drive; independent pairs and every 3/4-shade topology have
 * two drive groups. Dual Roller's x2 motor charge remains a documented pricing
 * rule in the lower-level catalog engine, so its canonical input unit stays 1.
 */
export function rollerBaseMotorUnitsForConfiguration(input: {
  application: unknown;
  couplingArrangement: unknown;
  componentCount: unknown;
}): number | null {
  const application = normalizeIdentity(input.application);
  const arrangement = normalizeIdentity(input.couplingArrangement);
  const count = Number(input.componentCount);

  if (
    ["single", "single shade", "common valance", "dual roller", "dual rollers"].includes(
      application,
    )
  ) {
    return 1;
  }
  if (application === "lightguard 360") return null;
  if (
    application === "lightguard 360 with t post" ||
    application.includes("coupled")
  ) {
    if (count === 2) {
      return arrangement.includes("independent") ||
        application.includes("independently")
        ? 2
        : arrangement.includes("standard")
          ? 1
          : null;
    }
    if (count === 3 || count === 4) return 2;
    return null;
  }
  return null;
}

function optionFor(groupId: string, optionId: string) {
  return catalog.motorization[groupId]?.options.find(
    (option) => option.id === optionId,
  );
}

function isRollerOptionAvailable(groupId: string, optionId: string): boolean {
  const option = optionFor(groupId, optionId);
  if (!option || option.price == null) return false;
  if (option.priceByProduct && "roller" in option.priceByProduct) {
    return option.priceByProduct.roller != null;
  }
  return true;
}

function roleForLegacyOption(
  groupId: string,
  optionId: string,
  optionName: string,
): CanonicalMotorizationRole {
  if (BASE_MOTOR_IDENTITIES.has(normalizedKey(groupId, optionId))) {
    return "base_motor";
  }
  if (optionId === "hub") return "hub";
  const identity = normalizeIdentity(`${optionId} ${optionName}`);
  if (identity.includes("sensor") || identity.includes("smartsense")) {
    return "sensor";
  }
  if (
    identity.includes("remote") ||
    identity.includes("wall switch") ||
    identity.includes("repeater")
  ) {
    return "controller";
  }
  if (
    identity.includes("battery") ||
    identity.includes("adapter") ||
    identity.includes("charging") ||
    identity.includes("power") ||
    identity.includes("harness") ||
    identity.includes("cable") ||
    identity.includes("solar")
  ) {
    return "power_supply";
  }
  return "accessory";
}

function selectedValue(value: unknown): string | number | boolean | null {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    value === null
  ) {
    return value;
  }
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

function parseCanonicalSelections(
  raw: unknown,
): {
  selections: CanonicalMotorizationSelection[];
  issues: ValidationIssue[];
} {
  if (!Array.isArray(raw)) {
    return {
      selections: [],
      issues: [
        issue(
          "roller.motorization.canonical_shape",
          { motorization_selections: selectedValue(raw) },
          "Canonical Roller motorization selections must be an array of exact catalog identities.",
        ),
      ],
    };
  }

  const selections: CanonicalMotorizationSelection[] = [];
  const issues: ValidationIssue[] = [];
  const seen = new Set<string>();

  raw.forEach((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      issues.push(
        issue(
          "roller.motorization.canonical_entry",
          { motorization_selection_index: index },
          "Every canonical Roller motorization selection must be an object with groupId, optionId, role, and units.",
        ),
      );
      return;
    }
    const source = entry as Record<string, unknown>;
    const groupId = populatedString(source.groupId);
    const optionId = populatedString(source.optionId);
    const role = populatedString(source.role);
    const units = source.units;
    if (
      !groupId ||
      !optionId ||
      !role ||
      !CANONICAL_MOTORIZATION_ROLES.includes(
        role as CanonicalMotorizationRole,
      ) ||
      !Number.isInteger(units) ||
      Number(units) < 1
    ) {
      issues.push(
        issue(
          "roller.motorization.canonical_entry",
          {
            motorization_selection_index: index,
            groupId: groupId ?? null,
            optionId: optionId ?? null,
            role: role ?? null,
            units: typeof units === "number" ? units : null,
          },
          "Every canonical Roller motorization selection requires an allowed role and a positive whole-number unit count.",
        ),
      );
      return;
    }

    const identity = normalizedKey(groupId, optionId);
    if (seen.has(identity)) {
      issues.push(
        issue(
          "roller.motorization.canonical_duplicate",
          { groupId, optionId },
          "A canonical Roller motorization component may appear only once; use its units field for quantity.",
        ),
      );
      return;
    }
    seen.add(identity);

    if (!ROLLER_MOTORIZATION_GROUPS.has(groupId)) {
      issues.push(
        issue(
          "roller.motorization.group_unknown",
          { groupId, optionId },
          "The selected motorization group is not authorized for Norman Roller shades.",
        ),
      );
      return;
    }
    const option = optionFor(groupId, optionId);
    if (!option) {
      issues.push(
        issue(
          "roller.motorization.option_unknown",
          { groupId, optionId },
          "The selected canonical Roller motorization option does not exist in the pinned catalog.",
        ),
      );
      return;
    }
    if (!isRollerOptionAvailable(groupId, optionId)) {
      issues.push(
        issue(
          "roller.motorization.option_unavailable",
          { groupId, optionId },
          "The pinned catalog marks this motorization option unavailable for Roller shades.",
        ),
      );
      return;
    }

    const baseMotor = BASE_MOTOR_IDENTITIES.has(identity);
    if (
      (baseMotor && role !== "base_motor") ||
      (!baseMotor && role === "base_motor") ||
      (optionId === "hub" && role !== "hub") ||
      (optionId !== "hub" && role === "hub")
    ) {
      issues.push(
        issue(
          "roller.motorization.role_mismatch",
          { groupId, optionId, role },
          "The canonical motorization role does not match the selected catalog component.",
        ),
      );
      return;
    }

    selections.push({
      groupId,
      optionId,
      role: role as CanonicalMotorizationRole,
      units: Number(units),
    });
  });

  return { selections, issues };
}

function validateConfigurationBinding(
  liftSystem: unknown,
  powerConfiguration: unknown,
  application: unknown,
  couplingArrangement: unknown,
  componentCount: unknown,
  selections: readonly CanonicalMotorizationSelection[],
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const motorized = isMotorized(liftSystem);
  if (!motorized) {
    if (selections.length > 0) {
      issues.push(
        issue(
          "roller.motorization.not_allowed",
          { lift_system: selectedValue(liftSystem) },
          "Motorization components cannot remain selected when the Roller operating system is not motorized.",
        ),
      );
    }
    return issues;
  }

  const expected = rollerMotorChargeForPowerConfiguration(powerConfiguration);
  const normalizedApplication = normalizeIdentity(application);
  if (normalizedApplication === "lightguard 360") {
    issues.push(
      driveTopologyIssue(
        "roller.motorization.lightguard_application_ambiguous",
        { roller_application: selectedValue(application) },
        "Motorized LightGuard 360 must distinguish a single housing from the two-shade split-housing application before motor quantity can be authorized.",
      ),
    );
  }
  const baseMotors = selections.filter((selection) => selection.role === "base_motor");
  if (baseMotors.length !== 1) {
    issues.push(
      issue(
        "roller.motorization.base_required",
        {
          roller_power_configuration: selectedValue(powerConfiguration),
          base_motor_count: baseMotors.length,
        },
        "A motorized Roller configuration requires exactly one canonical base-motor selection.",
      ),
    );
    return issues;
  }
  if (!expected) return issues;

  const base = baseMotors[0];
  const expectedBaseUnits = rollerBaseMotorUnitsForConfiguration({
    application,
    couplingArrangement,
    componentCount,
  });
  if (expectedBaseUnits === null) {
    issues.push(
      driveTopologyIssue(
        "roller.motorization.drive_units_unresolved",
        {
          roller_application: selectedValue(application),
          coupling_arrangement: selectedValue(couplingArrangement),
          roller_coupling_count: selectedValue(componentCount),
        },
        "The Roller assembly topology does not identify an exact source-backed motor drive-group count.",
      ),
    );
  } else if (base.units !== expectedBaseUnits) {
    issues.push(
      driveTopologyIssue(
        "roller.motorization.base_units_mismatch",
        {
          roller_application: selectedValue(application),
          coupling_arrangement: selectedValue(couplingArrangement),
          roller_coupling_count: selectedValue(componentCount),
          selectedMotorUnits: base.units,
          expectedMotorUnits: expectedBaseUnits,
        },
        "The canonical Roller base-motor quantity does not match the documented coupled drive topology.",
      ),
    );
  }
  if (
    base.groupId !== expected.groupId ||
    base.optionId !== expected.optionId
  ) {
    issues.push(
      issue(
        "roller.motorization.power_motor_mismatch",
        {
          roller_power_configuration: selectedValue(powerConfiguration),
          selectedGroupId: base.groupId,
          selectedOptionId: base.optionId,
          expectedGroupId: expected.groupId,
          expectedOptionId: expected.optionId,
        },
        "The canonical Roller base motor does not match the documented power configuration.",
      ),
    );
  }

  for (const selection of selections) {
    if (selection.groupId !== expected.groupId) {
      issues.push(
        issue(
          "roller.motorization.family_mismatch",
          {
            roller_power_configuration: selectedValue(powerConfiguration),
            baseMotorGroupId: expected.groupId,
            selectedGroupId: selection.groupId,
            selectedOptionId: selection.optionId,
          },
          "All Roller motor, power, and control components must belong to the selected motor family.",
        ),
      );
    }
  }

  return issues;
}

function legacyMatches(value: string) {
  const wanted = normalizeIdentity(value);
  return [...ROLLER_MOTORIZATION_GROUPS].flatMap((groupId) => {
    const group = catalog.motorization[groupId];
    if (!group) return [];
    return group.options.flatMap((option) => {
      if (!isRollerOptionAvailable(groupId, option.id)) return [];
      return normalizeIdentity(option.id) === wanted ||
        normalizeIdentity(option.name) === wanted
        ? [{ groupId, option }]
        : [];
    });
  });
}

function legacyBoolean(value: unknown): boolean | null {
  if (value === undefined || value === null || value === "") return false;
  if (value === true || normalizeIdentity(value) === "yes") return true;
  if (value === false || normalizeIdentity(value) === "no") return false;
  return null;
}

function baseSelection(
  expected: RollerMotorCharge,
  units: number,
): CanonicalMotorizationSelection {
  return {
    groupId: expected.groupId,
    optionId: expected.optionId,
    role: "base_motor",
    units,
  };
}

function resolveLegacySelections(
  input: RollerMotorizationContractInput,
): RollerMotorizationContractResult {
  const issues: ValidationIssue[] = [];
  const selections: CanonicalMotorizationSelection[] = [];
  const motorType = populatedString(input.legacyMotorType);
  const remoteType = populatedString(input.legacyRemoteType);
  const hubRequired = legacyBoolean(input.legacyHubRequired);
  const motorized = isMotorized(input.liftSystem);

  if (!motorized) {
    if (motorType || remoteType || hubRequired === true) {
      issues.push(
        issue(
          "roller.motorization.legacy_stale_selection",
          {
            lift_system: selectedValue(input.liftSystem),
            motor_type: motorType,
            remote_type: remoteType,
            hub_required: hubRequired,
          },
          "Legacy motorization values must be cleared before a non-motorized Roller design can be priced.",
        ),
      );
    }
    if (hubRequired === null) {
      issues.push(
        issue(
          "roller.motorization.legacy_hub_invalid",
          { hub_required: selectedValue(input.legacyHubRequired) },
          "The legacy Hub Required value is not a supported yes/no selection.",
        ),
      );
    }
    return { source: "legacy", selections, issues };
  }

  const expected = rollerMotorChargeForPowerConfiguration(
    input.powerConfiguration,
  );
  const expectedBaseUnits = rollerBaseMotorUnitsForConfiguration({
    application: input.application,
    couplingArrangement: input.couplingArrangement,
    componentCount: input.componentCount,
  });
  if (expected && motorType) {
    const motorIdentity = normalizeIdentity(motorType);
    if (
      motorIdentity === normalizeIdentity(expected.displayName) ||
      motorIdentity === normalizeIdentity(expected.optionId)
    ) {
      selections.push(baseSelection(expected, expectedBaseUnits ?? 1));
    } else {
      issues.push(
        issue(
          "roller.motorization.legacy_motor_mismatch",
          {
            roller_power_configuration: selectedValue(
              input.powerConfiguration,
            ),
            motor_type: motorType,
            expectedMotor: expected.displayName,
          },
          "The legacy Roller motor value does not match the selected power configuration.",
        ),
      );
    }
  } else if (expected && !motorType) {
    issues.push(
      issue(
        "roller.motorization.legacy_motor_required",
        {
          roller_power_configuration: selectedValue(input.powerConfiguration),
          motor_type: null,
        },
        "Select the exact Roller motor required by the power configuration.",
      ),
    );
  }

  if (remoteType) {
    const matches = legacyMatches(remoteType);
    if (matches.length === 0) {
      issues.push(
        issue(
          "roller.motorization.legacy_option_unknown",
          { remote_type: remoteType },
          "The populated legacy Roller motor or accessory value does not match an exact source-backed catalog option.",
        ),
      );
    } else if (matches.length > 1) {
      issues.push(
        issue(
          "roller.motorization.legacy_option_ambiguous",
          {
            remote_type: remoteType,
            matchingCatalogOptions: matches.map(
              (match) => `${match.groupId}/${match.option.id}`,
            ),
          },
          "This legacy Roller option name exists in more than one motor family. Select a canonical group and option instead of guessing.",
        ),
      );
    } else {
      const [{ groupId, option }] = matches;
      selections.push({
        groupId,
        optionId: option.id,
        role: roleForLegacyOption(groupId, option.id, option.name),
        units: 1,
      });
    }
  }

  if (hubRequired === null) {
    issues.push(
      issue(
        "roller.motorization.legacy_hub_invalid",
        { hub_required: selectedValue(input.legacyHubRequired) },
        "The legacy Hub Required value is not a supported yes/no selection.",
      ),
    );
  } else if (hubRequired) {
    if (!expected || expected.groupId === "autowand") {
      issues.push(
        issue(
          "roller.motorization.legacy_hub_unsupported",
          {
            roller_power_configuration: selectedValue(
              input.powerConfiguration,
            ),
            hub_required: true,
          },
          "The selected Roller motor family does not have an exact source-backed hub mapping.",
        ),
      );
    } else {
      selections.push({
        groupId: expected.groupId,
        optionId: "hub",
        role: "hub",
        units: 1,
      });
    }
  }

  const deduped = new Map<string, CanonicalMotorizationSelection>();
  for (const selection of selections) {
    const key = normalizedKey(selection.groupId, selection.optionId);
    if (deduped.has(key)) {
      issues.push(
        issue(
          "roller.motorization.legacy_duplicate",
          { groupId: selection.groupId, optionId: selection.optionId },
          "The legacy Roller fields resolve to the same motorization component more than once.",
        ),
      );
      continue;
    }
    deduped.set(key, selection);
  }

  const resolved = [...deduped.values()];
  issues.push(
    ...validateConfigurationBinding(
      input.liftSystem,
      input.powerConfiguration,
      input.application,
      input.couplingArrangement,
      input.componentCount,
      resolved,
    ),
  );
  return { source: "legacy", selections: resolved, issues };
}

/**
 * Resolve the exact Roller motor BOM. Once the canonical array is present it
 * is authoritative; stale legacy UI strings are intentionally ignored.
 */
export function resolveRollerMotorizationContract(
  input: RollerMotorizationContractInput,
): RollerMotorizationContractResult {
  if (!input.canonicalSelectionsPresent) {
    return resolveLegacySelections(input);
  }

  const parsed = parseCanonicalSelections(input.canonicalSelections);
  return {
    source: "canonical",
    selections: parsed.selections,
    issues: [
      ...parsed.issues,
      ...validateConfigurationBinding(
        input.liftSystem,
        input.powerConfiguration,
        input.application,
        input.couplingArrangement,
        input.componentCount,
        parsed.selections,
      ),
    ],
  };
}

export function canonicalMotorizationPriceSelections(
  selections: readonly CanonicalMotorizationSelection[],
): Array<{ groupId: string; optionId: string; units: number }> {
  return selections.map(({ groupId, optionId, units }) => ({
    groupId,
    optionId,
    units,
  }));
}

export function canonicalMotorizationSelectionsFromConfiguration(
  configuration: SelectionRecord,
): RollerMotorizationContractResult | null {
  if (!(ROLLER_MOTORIZATION_SELECTIONS_KEY in configuration)) return null;
  return resolveRollerMotorizationContract({
    liftSystem: configuration.lift_system,
    powerConfiguration: configuration.roller_power_configuration,
    application: configuration.roller_application,
    couplingArrangement: configuration.coupling_arrangement,
    componentCount:
      configuration.roller_coupling_count ??
      configuration.coupled_shade_count ??
      configuration.lightguard_360_shade_count,
    canonicalSelections: configuration[ROLLER_MOTORIZATION_SELECTIONS_KEY],
    canonicalSelectionsPresent: true,
  });
}
