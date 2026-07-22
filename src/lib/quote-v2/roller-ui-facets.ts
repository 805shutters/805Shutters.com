/**
 * Lightweight client projection of the usable Roller appendix headers.
 * A server-side regression compares every entry with the generated workbook
 * definitions so these controls cannot drift from the authoritative matrix.
 */

export type RollerUiFacetSelection = {
  application?: string | null;
  couplingArrangement?: string | null;
  componentCount?: number | string | null;
  topTreatment?: string | null;
};

export type RollerUiFacets = {
  sheet: string;
  liftSystems: readonly string[];
  tubeClasses: readonly string[];
  powerConfigurations: readonly string[];
};

const ALL_TUBES = ["All Tubes", '1 3/4" (43mm) Tube', '2" (52mm) Tube'] as const;
const LARGE_TUBES = ['1 3/4" (43mm) Tube', '2" (52mm) Tube'] as const;
const SMART_RELEASE_TUBES_BY_SHEET: Readonly<Record<string, readonly string[]>> = {
  // The Single/Common appendix has distinct SmartRelease profiles for these
  // two tubes. `All Tubes` only labels their shared minimum-size columns and
  // is not itself a complete profile identity.
  "Single(Non-LG360)&Common": LARGE_TUBES,
  // Cassette's SmartRelease profile does not split by tube.
  Cassette: ["All Tubes"],
};
const STANDARD_MOTORS = [
  "Automate ARC Motor",
  "Automate Low Voltage DC Motor",
  "Norman Smart AC Adapter Plug-In 36W",
  "Norman Smart AC Adapter Plug-In 65W & Low Voltage Hard Wire",
  "Norman Smart Rechargeable Battery with Charging Wand & AC Adapter Charger",
  "AutoWand",
] as const;
const DUAL_MOTORS = [
  "Automate ARC Motor",
  "Automate Low Voltage DC Motor",
  "Norman Smart AC Adapter Plug-In 36W",
  "Norman Smart AC Adapter Plug-In 65W & Low Voltage Hard Wire",
  "Norman Smart Rechargeable Battery with AC Adapter Charger",
  "AutoWand",
] as const;
const LARGE_ASSEMBLY_MOTORS = [
  "Norman Smart AC Adapter Plug-In 36W",
  "Norman Smart AC Adapter Plug-In 65W & Low Voltage Hard Wire",
  "Norman Smart Rechargeable Battery with Charging Wand & AC Adapter Charger",
  "AutoWand",
] as const;
const THREE_FOUR_COUPLED_MOTORS = [
  "Norman Smart AC Adapter Plug-In 36W",
  "Norman Smart Rechargeable Battery with Charging Wand & AC Adapter Charger",
  "AutoWand",
] as const;

export const ROLLER_UI_FACETS_BY_SHEET: Readonly<Record<string, RollerUiFacets>> = {
  "Single(Non-LG360)&Common": {
    sheet: "Single(Non-LG360)&Common",
    liftSystems: ["Cordless", "Continuous Cord Loop", "Smart Release", "Motorized"],
    tubeClasses: ALL_TUBES,
    powerConfigurations: STANDARD_MOTORS,
  },
  "LG360&w T-post split & housing": {
    sheet: "LG360&w T-post split & housing",
    liftSystems: ["Cordless", "Continuous Cord Loop", "Motorized"],
    tubeClasses: ALL_TUBES,
    powerConfigurations: STANDARD_MOTORS,
  },
  "LG360 with T-Post (2 ) (Std)": {
    sheet: "LG360 with T-Post (2 ) (Std)",
    liftSystems: ["Continuous Cord Loop", "Motorized"],
    tubeClasses: LARGE_TUBES,
    powerConfigurations: LARGE_ASSEMBLY_MOTORS,
  },
  "LG360 with T-Post (2 ) (Ind)": {
    sheet: "LG360 with T-Post (2 ) (Ind)",
    liftSystems: ["Continuous Cord Loop", "Motorized"],
    tubeClasses: LARGE_TUBES,
    powerConfigurations: LARGE_ASSEMBLY_MOTORS,
  },
  "LG360 with T-Post (3 Shades)": {
    sheet: "LG360 with T-Post (3 Shades)",
    liftSystems: ["Continuous Cord Loop", "Motorized"],
    tubeClasses: LARGE_TUBES,
    powerConfigurations: LARGE_ASSEMBLY_MOTORS,
  },
  "LG360 with T-Post (4 Shades)": {
    sheet: "LG360 with T-Post (4 Shades)",
    liftSystems: ["Continuous Cord Loop", "Motorized"],
    tubeClasses: LARGE_TUBES,
    powerConfigurations: LARGE_ASSEMBLY_MOTORS,
  },
  "Standard Coupled Shade(2)": {
    sheet: "Standard Coupled Shade(2)",
    liftSystems: ["Continuous Cord Loop", "Motorized"],
    tubeClasses: LARGE_TUBES,
    powerConfigurations: STANDARD_MOTORS,
  },
  "Independently Coupled Shade(2)": {
    sheet: "Independently Coupled Shade(2)",
    liftSystems: ["Continuous Cord Loop", "Motorized"],
    tubeClasses: LARGE_TUBES,
    powerConfigurations: STANDARD_MOTORS,
  },
  Dual: {
    sheet: "Dual",
    liftSystems: ["Cordless", "Motorized"],
    tubeClasses: ALL_TUBES,
    powerConfigurations: DUAL_MOTORS,
  },
  Cassette: {
    sheet: "Cassette",
    liftSystems: ["Cordless", "Continuous Cord Loop", "Smart Release", "Motorized"],
    tubeClasses: ALL_TUBES,
    powerConfigurations: DUAL_MOTORS,
  },
  "Coupled Shades(3)": {
    sheet: "Coupled Shades(3)",
    liftSystems: ["Continuous Cord Loop", "Motorized"],
    tubeClasses: LARGE_TUBES,
    powerConfigurations: THREE_FOUR_COUPLED_MOTORS,
  },
  "Coupled Shades(4)": {
    sheet: "Coupled Shades(4)",
    liftSystems: ["Continuous Cord Loop", "Motorized"],
    tubeClasses: LARGE_TUBES,
    powerConfigurations: THREE_FOUR_COUPLED_MOTORS,
  },
};

function normalized(value: string | null | undefined): string {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function rollerUiSheetForSelection(
  selection: RollerUiFacetSelection,
): string | null {
  const application = normalized(selection.application);
  const arrangement = normalized(selection.couplingArrangement);
  const count = Number(selection.componentCount);
  if (normalized(selection.topTreatment) === "cassette") return "Cassette";
  if (application === "dual roller" || application === "dual rollers") return "Dual";
  if (["single", "single shade", "common valance"].includes(application)) {
    return "Single(Non-LG360)&Common";
  }
  if (application === "lightguard 360") return "LG360&w T-post split & housing";
  if (application === "lightguard 360 with t post") {
    if (count === 2 && arrangement.includes("independent")) return "LG360 with T-Post (2 ) (Ind)";
    if (count === 2 && arrangement.includes("standard")) return "LG360 with T-Post (2 ) (Std)";
    if (count === 3) return "LG360 with T-Post (3 Shades)";
    if (count === 4) return "LG360 with T-Post (4 Shades)";
    return null;
  }
  if (application.includes("coupled")) {
    if (count === 2 && (arrangement.includes("independent") || application.includes("independently"))) {
      return "Independently Coupled Shade(2)";
    }
    if (count === 2 && arrangement.includes("standard")) return "Standard Coupled Shade(2)";
    if (count === 3) return "Coupled Shades(3)";
    if (count === 4) return "Coupled Shades(4)";
  }
  return null;
}

export function getRollerV2UiFacets(
  selection: RollerUiFacetSelection,
): RollerUiFacets | null {
  const sheet = rollerUiSheetForSelection(selection);
  return sheet ? ROLLER_UI_FACETS_BY_SHEET[sheet] ?? null : null;
}

export function pruneRollerV2UiSelection(
  selection: RollerUiFacetSelection & {
    liftSystem?: string | null;
    tubeClass?: string | null;
    powerConfiguration?: string | null;
  },
): {
  facets: RollerUiFacets | null;
  liftSystem: string | null;
  tubeClass: string | null;
  powerConfiguration: string | null;
} {
  const baseFacets = getRollerV2UiFacets(selection);
  const keep = (
    value: string | null | undefined,
    allowed: readonly string[] | undefined,
  ) =>
    !value || !baseFacets || allowed?.includes(value) ? value ?? null : null;
  const liftSystem = keep(selection.liftSystem, baseFacets?.liftSystems);
  const smartReleaseTubes =
    liftSystem === "Smart Release" && baseFacets
      ? SMART_RELEASE_TUBES_BY_SHEET[baseFacets.sheet]
      : undefined;
  const facets =
    baseFacets && smartReleaseTubes
      ? { ...baseFacets, tubeClasses: smartReleaseTubes }
      : baseFacets;
  const selectedTube = selection.tubeClass ?? null;
  const tubeClass = smartReleaseTubes
    ? smartReleaseTubes.includes(selectedTube ?? "")
      ? selectedTube
      : smartReleaseTubes[0] ?? null
    : keep(selectedTube, facets?.tubeClasses);
  return {
    facets,
    liftSystem,
    tubeClass,
    powerConfiguration:
      liftSystem === "Motorized"
        ? keep(selection.powerConfiguration, facets?.powerConfigurations)
        : null,
  };
}
