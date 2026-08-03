import type {
  ProductRuleStatus,
  SelectionContext,
  SelectionRecord,
  SelectionValue,
  ValidationIssue,
  ValidationSeverity,
} from "./core";
import {
  QUOTE_V2_PRODUCT_STATUS,
  expectedHoneycombProgramId,
  findHoneycombColor,
  findRomanFrontColor,
  findRomanRearColor,
  getRomanRearMaxWidth,
  findRollerColor,
  findSynchronyVerticalColor,
  isRecognizedQuoteV2Catalog,
  normalizeIdentity,
} from "./catalog";
import { sourceProvenance, type SourceManifestId } from "./source-manifest";
import { validateRollerMatrix } from "./roller-matrix";
import { expectedRollerMotorForPowerConfiguration } from "./roller-motor";
import { canonicalMotorizationSelectionsFromConfiguration } from "./roller-motor-contract";
import { normanHoneycombV2Source } from "./generated/norman-honeycomb-v2.generated";
import { validateHoneycombMatrix } from "./honeycomb-matrix";
import { validateOnyxShutterRestrictions } from "./onyx-rules";
import { resolveNormanShutterWindowSizePricing } from "./norman-shutter-pricing-size";
import { validateNormanShadeMotorization } from "./norman-shade-motorization";
import { lotusFauxWoodProgramProfile } from "./lotus-faux-wood";
import { catalog as pricingCatalog, getProduct } from "@/lib/quote/catalog";

type RuleSource = {
  sourceId: SourceManifestId;
  page?: number;
  pages?: readonly number[];
  sheet?: string;
  range?: string;
};

const HONEYCOMB_GUIDE: RuleSource = {
  sourceId: "norman-honeycomb-guide-2026-07",
};
const HONEYCOMB_COLORS: RuleSource = {
  sourceId: "norman-honeycomb-color-coordination-2026-07",
  sheet: "Fabric List",
};
const ROLLER_GUIDE: RuleSource = {
  sourceId: "norman-roller-guide-2026-07",
};
const ROLLER_LIMITS: RuleSource = {
  sourceId: "norman-roller-minmax-appendix-2026-08",
};
const ROMAN_GUIDE: RuleSource = {
  sourceId: "norman-roman-guide-2026-05",
};
const VERTICAL_GUIDE: RuleSource = {
  sourceId: "norman-vertical-blinds-guide-2026-06",
};
const POLAR_DEALER_BOOK: RuleSource = {
  sourceId: "polar-shades-dealer-book-current-2026-07-18",
};
const LOTUS_WEST_A26: RuleSource = {
  sourceId: "lotus-west-a26-v1",
};
const NORMAN_SHUTTER_FRAME_PRICING: RuleSource = {
  sourceId: "norman-shutter-frame-pricing-2026-05",
  pages: [1, 2, 3],
};

function programMatchesGroup(programId: string | null, priceGroup: string): boolean {
  const groupNumber = priceGroup.match(/(\d+)/)?.[1];
  return Boolean(groupNumber && normalizeIdentity(programId).endsWith(`pg${groupNumber}`));
}

function issue(
  severity: ValidationSeverity,
  ruleId: string,
  source: RuleSource,
  selectedValues: SelectionRecord,
  explanation: string,
  derivedValues?: SelectionRecord,
): ValidationIssue {
  const { sourceId, ...location } = source;
  return {
    severity,
    ruleId,
    source: sourceProvenance(sourceId, location),
    selectedValues,
    explanation,
    ...(derivedValues ? { derivedValues } : {}),
  };
}

function configValue(context: SelectionContext, ...keys: string[]): SelectionValue | undefined {
  for (const key of keys) {
    const value = context.configuration[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

function optionValue(context: SelectionContext, ...keys: string[]): SelectionValue | undefined {
  for (const key of keys) {
    const value = context.options[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

function text(value: SelectionValue | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalized(value: SelectionValue | undefined): string {
  return normalizeIdentity(text(value));
}

function yes(value: SelectionValue | undefined): boolean {
  return value === true || ["yes", "true", "1"].includes(normalized(value));
}

function finiteNumber(value: SelectionValue | undefined): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function values(context: SelectionContext, keys: string[]): SelectionRecord {
  return Object.fromEntries(
    keys.map((key) => [key, context.configuration[key] ?? context.options[key] ?? null]),
  );
}

function numericArray(value: SelectionValue | undefined): number[] | null {
  if (!Array.isArray(value)) return null;
  const parsed = value.map((entry) => finiteNumber(entry));
  return parsed.some((entry) => entry === null)
    ? null
    : (parsed as number[]);
}

function requireText(
  context: SelectionContext,
  issues: ValidationIssue[],
  rulePrefix: string,
  fields: ReadonlyArray<{ key: string; label: string }>,
  source: RuleSource,
): void {
  for (const field of fields) {
    if (text(configValue(context, field.key))) continue;
    issues.push(
      issue(
        "hard_block",
        `${rulePrefix}.required.${field.key}`,
        source,
        { [field.key]: null },
        `${field.label} is required before this configuration can be priced or sent.`,
      ),
    );
  }
}

function validateCommon(context: SelectionContext): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (
    !isRecognizedQuoteV2Catalog(
      context.productId,
      context.catalogAsOf,
      context.catalogVersion,
    )
  ) {
    issues.push(
      issue(
        "hard_block",
        "common.catalog.unrecognized_version",
        { sourceId: "norman-retail-guide-2026-07" },
        {
          productId: context.productId,
          catalogAsOf: context.catalogAsOf,
          catalogVersion: context.catalogVersion,
        },
        "The requested catalog identity is not the server-selected catalog for this product and effective date.",
      ),
    );
  }
  if (!Number.isFinite(context.widthInches) || context.widthInches <= 0) {
    issues.push(
      issue(
        "hard_block",
        "common.dimension.width.positive",
        { sourceId: "norman-retail-guide-2026-07" },
        { widthInches: context.widthInches },
        "Width must be a positive documented measurement.",
      ),
    );
  }
  if (!Number.isFinite(context.heightInches) || context.heightInches <= 0) {
    issues.push(
      issue(
        "hard_block",
        "common.dimension.height.positive",
        { sourceId: "norman-retail-guide-2026-07" },
        { heightInches: context.heightInches },
        "Height must be a positive documented measurement.",
      ),
    );
  }
  if (!Number.isInteger(context.quantity) || context.quantity < 1) {
    issues.push(
      issue(
        "hard_block",
        "common.quantity.positive_integer",
        { sourceId: "norman-retail-guide-2026-07" },
        { quantity: context.quantity },
        "Quantity must be a positive whole number.",
      ),
    );
  }
  if (!context.programId) {
    issues.push(
      issue(
        "hard_block",
        "common.program.required",
        { sourceId: "norman-retail-guide-2026-07" },
        { programId: null },
        "An exact catalog price program is required; V2 never falls back to the first or cheapest grid.",
      ),
    );
  }
  const hasSchedulePercent = Object.prototype.hasOwnProperty.call(
    context.options,
    "schedule_discount_percent",
  );
  const rawSchedulePercent = context.options.schedule_discount_percent;
  const schedulePercent = finiteNumber(rawSchedulePercent);
  if (
    hasSchedulePercent &&
    (schedulePercent === null || ![28.5, 30].includes(schedulePercent))
  ) {
    issues.push(
      issue(
        "hard_block",
        "common.dealer_program.unsupported",
        { sourceId: "norman-retail-guide-2026-07", page: 4 },
        {
          schedule_discount_percent:
            rawSchedulePercent === undefined ? null : rawSchedulePercent,
        },
        "A supplied dealer schedule must be the exact documented 30 or 28.5 selection. Only a truly absent value defaults to standard.",
      ),
    );
  }
  return issues;
}

/**
 * The only current Polar portal/list-price conflict is proven for three exact
 * Elite configurations. Keep the quarantine as narrow as the evidence: do not
 * infer that every Group 4 size or fabric has the same portal/book mismatch.
 */
function validatePolarElitePortalConflict(
  context: SelectionContext,
): ValidationIssue[] {
  if (context.programId !== "group_4" || context.heightInches !== 67) return [];

  const widthIsObserved = [88, 92, 85.5].includes(context.widthInches);
  const fabric = normalized(
    configValue(context, "fabric_collection", "fabric", "material"),
  );
  const operation = normalized(
    configValue(context, "operating_system", "lift_system", "operation"),
  );
  const track = normalized(
    configValue(
      context,
      "polar_exterior_guide_type",
      "track_type",
      "guides",
      "guide_type",
    ),
  );
  const polarMotorization =
    context.configuration.polar_exterior_motorization_selections;
  const noPolarMotorSelected =
    !Array.isArray(polarMotorization) || polarMotorization.length === 0;
  const selectedSurcharges = polarSelectedSurchargeIds(context);
  const standardTrackSelected =
    (track.includes("standard") &&
      (track.includes("nonzipper") || track.includes("track"))) ||
    (track === "track" &&
      !selectedSurcharges.some((id) => id.startsWith("vortex_")));
  const exactObservedConfiguration =
    widthIsObserved &&
    fabric.replaceAll(" ", "").includes("suntex90") &&
    (operation.includes("manual") ||
      operation.includes("gearcrank") ||
      noPolarMotorSelected) &&
    standardTrackSelected;

  if (!exactObservedConfiguration) return [];

  return [
    issue(
      "hard_block",
      "polar.elite.portal_book_price_conflict",
      { ...POLAR_DEALER_BOOK, page: 97 },
      {
        widthInches: context.widthInches,
        heightInches: context.heightInches,
        programId: context.programId,
        fabric: text(configValue(context, "fabric_collection", "fabric", "material")),
        operation: text(
          configValue(context, "operating_system", "lift_system", "operation"),
        ),
        track_type: text(
          configValue(context, "track_type", "guides", "guide_type"),
        ),
      },
      "The exact saved Polar portal quote lists this Elite selection at $905 per unit, while the pinned dealer book produces $961; the option stays quarantined until Polar resolves the source conflict.",
    ),
  ];
}

const POLAR_EXTERIOR_PRODUCTS = new Set([
  "polar_elite_patio",
  "polar_titan_patio",
  "polar_mega_exterior",
]);

function polarSelectedSurchargeIds(context: SelectionContext): string[] {
  const selected = context.options.surcharges;
  if (!Array.isArray(selected)) return [];
  return selected.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const id = (entry as Record<string, SelectionValue>).id;
    return typeof id === "string" ? [id] : [];
  });
}

function polarSelectedSurcharges(
  context: SelectionContext,
): Array<{ id: string; units: number }> {
  const selected = context.options.surcharges;
  if (!Array.isArray(selected)) return [];
  return selected.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const record = entry as Record<string, SelectionValue>;
    if (typeof record.id !== "string") return [];
    const rawUnits = record.units ?? record.quantity;
    const units =
      typeof rawUnits === "number" && Number.isFinite(rawUnits)
        ? rawUnits
        : typeof rawUnits === "string" && rawUnits.trim()
          ? Number(rawUnits)
          : 1;
    return [{ id: record.id, units }];
  });
}

function polarCanonicalSelections(
  context: SelectionContext,
  key: string,
): Array<{ groupId: string; optionId: string }> | null {
  const raw = context.configuration[key];
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) return null;
  const parsed = raw.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const record = entry as Record<string, SelectionValue>;
    return typeof record.groupId === "string" &&
      typeof record.optionId === "string"
      ? [{ groupId: record.groupId, optionId: record.optionId }]
      : [];
  });
  return parsed.length === raw.length ? parsed : null;
}

function validatePolarDraperyConfiguration(
  context: SelectionContext,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const source = { ...POLAR_DEALER_BOOK, pages: [74, 75, 76, 77] };
  const programId = context.programId ?? "";
  if (!/^(pinch_(split|side)_(white|bronze)|ripple_(white|bronze)_(overlap|butt)_(80|100|120)_(split|side))$/.test(programId)) {
    issues.push(issue("hard_block", "polar.drapery.program.required", source, { programId }, "Select one exact published drapery track program."));
  }
  const color = programId.includes("_bronze") ? "bronze" : programId.includes("_white") ? "white" : "";
  const draw = programId.endsWith("_split") || programId.includes("_split_") ? "split" : programId.endsWith("_side") || programId.includes("_side_") ? "side" : "";
  const selected = polarSelectedSurcharges(context);
  const bracketIds = new Set([
    "bracket_one_touch",
    "bracket_swivel",
    "bracket_adjustable_white",
    "bracket_adjustable_bronze",
    "bracket_double_white",
    "bracket_double_bronze",
  ]);
  const brackets = selected.filter((entry) => bracketIds.has(entry.id));
  const requiredBracketCount =
    context.widthInches <= 96
      ? 3
      : 3 + Math.ceil((context.widthInches - 96) / 36);
  if (
    brackets.length !== 1 ||
    !Number.isInteger(brackets[0]?.units) ||
    brackets[0]?.units !== requiredBracketCount
  ) {
    issues.push(issue("hard_block", "polar.drapery.brackets.exact_quantity", { ...POLAR_DEALER_BOOK, page: 74 }, { bracketSelections: brackets, requiredBracketCount }, `Select exactly one published bracket type at the source-required quantity of ${requiredBracketCount}.`));
  }
  if (
    brackets.some((entry) =>
      entry.id.includes("bronze") ? color !== "bronze" :
        entry.id.includes("white") ? color !== "white" : false,
    )
  ) {
    issues.push(issue("hard_block", "polar.drapery.brackets.color_mismatch", { ...POLAR_DEALER_BOOK, page: 74 }, { programId, bracketSelections: brackets }, "The selected wall bracket finish must match the published white or bronze track program."));
  }
  const selectedIds = new Set(selected.map((entry) => entry.id));
  if ((selectedIds.has("silent_master_side") && draw !== "side") || (selectedIds.has("silent_master_split") && draw !== "split")) {
    issues.push(issue("hard_block", "polar.drapery.silent_master.draw_mismatch", { ...POLAR_DEALER_BOOK, page: 74 }, { programId, selectedSurchargeIds: [...selectedIds] }, "The Silent Master carrier must match Side Opening or Split Draw."));
  }
  if (selectedIds.has("custom_bend") && !selectedIds.has("curved_packaging")) {
    issues.push(issue("hard_block", "polar.drapery.curve.packaging_required", { ...POLAR_DEALER_BOOK, page: 74 }, { selectedSurchargeIds: [...selectedIds] }, "A custom curved track requires the separately published curved-track packaging charge."));
  }
  const canonical = polarCanonicalSelections(context, "polar_drapery_motorization_selections");
  const group = pricingCatalog.motorization.polar_drapery_motors;
  const options = canonical?.flatMap((selection) =>
    selection.groupId === "polar_drapery_motors"
      ? group?.options.filter((option) => option.id === selection.optionId) ?? []
      : [],
  ) ?? [];
  if (canonical === null || options.length !== canonical.length) {
    issues.push(issue("hard_block", "polar.drapery.motorization.unknown", { ...POLAR_DEALER_BOOK, page: 77 }, { polar_drapery_motorization_selections: canonical }, "Every drapery motor and component must be an exact priced page-77 item."));
  }
  const motors = options.filter((option) => option.role === "motor");
  if (motors.length !== 1) {
    issues.push(issue("hard_block", "polar.drapery.motor.exactly_one", { ...POLAR_DEALER_BOOK, page: 77 }, { selectedMotorIds: motors.map((option) => option.id) }, "Motorized Drapery Track requires exactly one published motor."));
  }
  if (motors[0]?.id.startsWith("irismo_") && context.widthInches > 396) {
    issues.push(issue("hard_block", "polar.drapery.irismo.max_width", { ...POLAR_DEALER_BOOK, pages: [74, 77] }, { widthInches: context.widthInches, motorId: motors[0].id }, "Irismo track length is limited to 396 inches."));
  }
  const optionIds = new Set(options.map((option) => option.id));
  const irismo35Modules = ["irismo_35_rs485_module", "irismo_35_z_wave_module", "irismo_35_zigbee_module", "irismo_sdn_enclosure", "irismo_z_wave_enclosure", "irismo_zigbee_enclosure"];
  if (irismo35Modules.some((id) => optionIds.has(id)) && motors[0]?.id !== "irismo_35_minidc_dct") {
    issues.push(issue("hard_block", "polar.drapery.irismo35.module_mismatch", { ...POLAR_DEALER_BOOK, page: 77 }, { motorId: motors[0]?.id ?? null, selectedOptionIds: [...optionIds] }, "Irismo 35 DCT modules/enclosures require the published Irismo 35 Mini DC DCT motor."));
  }
  if (optionIds.has("glydea_rs485_module") && !motors[0]?.id.startsWith("glydea_")) {
    issues.push(issue("hard_block", "polar.drapery.glydea.module_mismatch", { ...POLAR_DEALER_BOOK, page: 77 }, { motorId: motors[0]?.id ?? null }, "The Glydea RS485 module requires a Glydea ULTRA motor."));
  }
  if ((optionIds.has("irismo_45_charger") || optionIds.has("irismo_45_battery")) && motors[0]?.id !== "irismo_45_wirefree_rts") {
    issues.push(issue("hard_block", "polar.drapery.irismo45.accessory_mismatch", { ...POLAR_DEALER_BOOK, page: 77 }, { motorId: motors[0]?.id ?? null }, "Irismo 45 battery items require the Irismo 45 WireFree RTS motor."));
  }
  return issues;
}

const POLAR_AWNING_PRODUCTS = new Set([
  "polar_awning_premium_pro",
  "polar_awning_premium_plus",
  "polar_awning_premium",
  "polar_awning_select",
  "polar_awning_drop_arm",
]);

function validatePolarAwningConfiguration(
  context: SelectionContext,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const productPage: Record<string, number> = {
    polar_awning_premium_pro: 165,
    polar_awning_premium_plus: 167,
    polar_awning_premium: 169,
    polar_awning_select: 171,
    polar_awning_drop_arm: 178,
  };
  const page = productPage[context.productId];
  const source = { ...POLAR_DEALER_BOOK, pages: [page, 173, 176, 177] };
  const frameColor = normalized(configValue(context, "polar_awning_frame_color", "frame_color"));
  if (!["white", "sandstone", "ebony", "brown"].includes(frameColor)) {
    issues.push(issue("hard_block", "polar.awning.frame_color.required", { ...POLAR_DEALER_BOOK, page }, { frameColor: frameColor || null }, "Select a published Polar frame color: White, Sandstone, Ebony, or Brown."));
  }
  const selected = polarSelectedSurcharges(context);
  const selectedIds = new Set(selected.map((entry) => entry.id));
  if (selectedIds.has("custom_frame_color")) {
    issues.push(issue("hard_block", "polar.awning.custom_frame.unpriced", { ...POLAR_DEALER_BOOK, page }, { custom_frame_color: true }, "Custom frame color is published without an amount and remains Manual quoting only."));
  }
  const motorIds = new Set([
    "somfy_sunea_cmo_535", "somfy_sunea_cmo_550",
    "alpha_remote_cmo_50", "somfy_orea_550", "somfy_altus_510",
    "somfy_altus_535", "somfy_altus_550", "alpha_remote_cassette_50",
    "alpha_remote_50", "somfy_std_535", "somfy_std_550", "alpha_manual_50",
  ]);
  const motors = selected.filter((entry) => motorIds.has(entry.id));
  const operation = normalized(configValue(context, "polar_awning_operation", "operation"));
  const motorizedOnly = ["polar_awning_premium_pro", "polar_awning_premium"].includes(context.productId);
  if (!["manual", "motorized"].includes(operation) || (motorizedOnly && operation !== "motorized")) {
    issues.push(issue("hard_block", "polar.awning.operation.required", { ...POLAR_DEALER_BOOK, page }, { operation: operation || null }, motorizedOnly ? "This awning is published as motorized; select Motorized." : "Select the published Manual or Motorized operation."));
  }
  if ((operation === "motorized" && motors.length !== 1) || (operation === "manual" && motors.length !== 0)) {
    issues.push(issue("hard_block", "polar.awning.motor.selection", { ...POLAR_DEALER_BOOK, page }, { operation, motorIds: motors.map((entry) => entry.id) }, "Motorized awnings require exactly one compatible published motor; manual awnings cannot include a motor."));
  }
  const product = getProduct(context.productId);
  if (motors.some((entry) => !product?.surcharges.some((surcharge) => surcharge.id === entry.id && surcharge.value != null))) {
    issues.push(issue("hard_block", "polar.awning.motor.product_mismatch", { ...POLAR_DEALER_BOOK, page }, { motorIds: motors.map((entry) => entry.id) }, "The selected motor is not published for this exact awning model."));
  }
  const motorId = motors[0]?.id ?? "";
  const technology =
    motorId.includes("sunea_cmo") ? "cmo" :
      motorId.startsWith("alpha_") ? "alpha" :
        motorId.includes("std_") ? "standard" :
          motorId ? "rts" : "";
  const canonical = polarCanonicalSelections(context, "polar_awning_motorization_selections");
  const group = pricingCatalog.motorization.polar_awning_controls;
  const controls = canonical?.flatMap((selection) =>
    selection.groupId === "polar_awning_controls"
      ? group?.options.filter((option) => option.id === selection.optionId) ?? []
      : [],
  ) ?? [];
  if (canonical === null || controls.length !== canonical.length) {
    issues.push(issue("hard_block", "polar.awning.control.unknown", { ...POLAR_DEALER_BOOK, page: 173 }, { polar_awning_motorization_selections: canonical }, "Every awning control, sensor, or cable must be an exact page-173 item."));
  }
  const incompatible = controls.filter(
    (option) =>
      option.compatibleTechnologies?.length &&
      !option.compatibleTechnologies.includes(technology as never),
  );
  if (incompatible.length > 0 || (operation === "manual" && controls.length > 0)) {
    issues.push(issue("hard_block", "polar.awning.control.motor_mismatch", { ...POLAR_DEALER_BOOK, page: 173 }, { motorId: motorId || null, incompatibleOptionIds: incompatible.map((option) => option.id) }, "Awning controls, sensors, and cables must match the selected motor family."));
  }
  if (
    motorId.includes("sunea_cmo") &&
    controls.filter((option) => option.id.startsWith("awning_cmo_fast_")).length !== 1
  ) {
    issues.push(issue("hard_block", "polar.awning.cmo.cable_required", { ...POLAR_DEALER_BOOK, pages: [page, 173] }, { motorId, selectedOptionIds: controls.map((option) => option.id) }, "A Sunea CMO motor requires exactly one published CMO fast connector cable."));
  }
  const dropValanceAllowed = ["polar_awning_premium", "polar_awning_select"].includes(context.productId);
  if (selectedIds.has("drop_valance") && (!dropValanceAllowed || context.widthInches > 240 || context.heightInches > 141)) {
    issues.push(issue("hard_block", "polar.awning.drop_valance.compatibility", { ...POLAR_DEALER_BOOK, page: 177 }, { productId: context.productId, widthInches: context.widthInches, projectionInches: context.heightInches }, "Drop Valance is limited to Premium or Select, 240 inches wide, and 141 inches projection."));
  }
  if ((selectedIds.has("premium_fabric") || selectedIds.has("drop_valance_motor")) && !selectedIds.has("drop_valance")) {
    issues.push(issue("hard_block", "polar.awning.drop_valance.option_requires_base", { ...POLAR_DEALER_BOOK, page: 177 }, { selectedSurchargeIds: [...selectedIds] }, "Premium fabric or Drop Valance motorization requires the published Drop Valance base option."));
  }
  if ([...selectedIds].some((id) => id.startsWith("led_arm_") || id === "led_motor_package")) {
    issues.push(issue("hard_block", "polar.awning.led.arm_count_review", { ...POLAR_DEALER_BOOK, pages: [166, 168, 170, 172, 176] }, { selectedSurchargeIds: [...selectedIds] }, "LED arms are priced per arm, but the exact model/size arm-count matrix is not yet safely encoded; this option remains Manual quoting only."));
  }
  return issues;
}

function validatePolarExteriorConfiguration(
  context: SelectionContext,
): ValidationIssue[] {
  if (!POLAR_EXTERIOR_PRODUCTS.has(context.productId)) return [];
  const issues: ValidationIssue[] = [];
  const guide = text(
    configValue(context, "polar_exterior_guide_type"),
  ).trim().toLowerCase();
  const guideSource =
    context.productId === "polar_elite_patio"
      ? { ...POLAR_DEALER_BOOK, pages: [90, 94, 96] }
      : context.productId === "polar_titan_patio"
        ? { ...POLAR_DEALER_BOOK, pages: [114, 118, 120] }
        : { ...POLAR_DEALER_BOOK, pages: [141, 145, 147] };
  if (!["cable_guide", "track", "rod"].includes(guide)) {
    issues.push(
      issue(
        "hard_block",
        "polar.exterior.guide.required",
        guideSource,
        { polar_exterior_guide_type: guide || null },
        "Select the exact Polar exterior configuration: Cable Guide, Track, or Rod.",
      ),
    );
    return issues;
  }

  if (guide === "rod" && context.heightInches > 120) {
    issues.push(
      issue(
        "hard_block",
        "polar.exterior.rod.maximum_height",
        context.productId === "polar_elite_patio"
          ? { ...POLAR_DEALER_BOOK, page: 91 }
          : context.productId === "polar_titan_patio"
            ? { ...POLAR_DEALER_BOOK, page: 120 }
            : { ...POLAR_DEALER_BOOK, page: 147 },
        {
          polar_exterior_guide_type: guide,
          heightInches: context.heightInches,
          maximumHeightInches: 120,
        },
        "Polar Rod configuration is limited to a maximum 120-inch shade height.",
      ),
    );
  }
  if (context.productId === "polar_mega_exterior" && guide === "rod") {
    issues.push(
      issue(
        "hard_block",
        "polar.mega.rod.not_published",
        { ...POLAR_DEALER_BOOK, page: 141 },
        { polar_exterior_guide_type: guide },
        "The Mega product description publishes ZipRite Track, Side Channel, and Cable Guide, but not Rod. Rod requires manufacturer review.",
      ),
    );
  }

  const surchargeIds = polarSelectedSurchargeIds(context);
  const trackOnlySurcharges = surchargeIds.filter(
    (id) => id.startsWith("vortex_") || id === "u_channel",
  );
  if (trackOnlySurcharges.length > 0 && guide !== "track") {
    issues.push(
      issue(
        "hard_block",
        "polar.exterior.track_option.guide_mismatch",
        guideSource,
        {
          polar_exterior_guide_type: guide,
          trackOnlySurcharges,
        },
        "Vortex and U-channel adders apply only to a Track configuration.",
      ),
    );
  }

  const rawMotorization =
    context.configuration.polar_exterior_motorization_selections;
  const motorization = Array.isArray(rawMotorization)
    ? rawMotorization.flatMap((entry) => {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
        const selected = entry as Record<string, SelectionValue>;
        return typeof selected.groupId === "string" &&
          typeof selected.optionId === "string"
          ? [{ groupId: selected.groupId, optionId: selected.optionId }]
          : [];
      })
    : [];
  if (
    rawMotorization !== undefined &&
    (!Array.isArray(rawMotorization) ||
      motorization.length !== rawMotorization.length)
  ) {
    issues.push(
      issue(
        "hard_block",
        "polar.exterior.motorization.invalid_selection",
        guideSource,
        { polar_exterior_motorization_selections: rawMotorization ?? null },
        "A saved Polar motor/control selection is malformed and must be reselected.",
      ),
    );
  }
  const selectedMotorIds = motorization
    .map((selection) => selection.optionId)
    .filter((optionId) => optionId.includes("motor"));
  if (selectedMotorIds.length > 1) {
    issues.push(
      issue(
        "hard_block",
        "polar.exterior.motor.multiple_selected",
        guideSource,
        { selectedMotorIds },
        "Select exactly one Polar motor. Multiple motor charges on one shade are not a valid published configuration.",
      ),
    );
  }
  if (
    context.productId === "polar_mega_exterior" &&
    (selectedMotorIds.length === 0 ||
      !selectedMotorIds[0]?.includes("525"))
  ) {
    issues.push(
      issue(
        "hard_block",
        "polar.mega.motor.required",
        { ...POLAR_DEALER_BOOK, pages: [141, 147] },
        { selectedMotorIds },
        "Mega Exterior is published as motorized-only with a 525 motor. Select one source-priced 525 motor before pricing.",
      ),
    );
  }
  const vortexSelected = surchargeIds.some((id) => id.startsWith("vortex_"));
  if (vortexSelected) {
    const compatibleVortexMotor = selectedMotorIds.some((id) => {
      if (context.productId === "polar_mega_exterior") return id.includes("525");
      if (context.productId === "polar_elite_patio") return id.includes("510");
      return id.includes("510") || id.includes("525");
    });
    if (!compatibleVortexMotor) {
      issues.push(
        issue(
          "hard_block",
          "polar.exterior.vortex.minimum_motor",
          context.productId === "polar_elite_patio"
            ? { ...POLAR_DEALER_BOOK, pages: [96, 97] }
            : context.productId === "polar_titan_patio"
              ? { ...POLAR_DEALER_BOOK, pages: [120, 121] }
              : { ...POLAR_DEALER_BOOK, page: 147 },
          { productId: context.productId, selectedMotorIds },
          context.productId === "polar_mega_exterior"
            ? "Mega Vortex requires the published 525 motor."
            : context.productId === "polar_elite_patio"
              ? "Elite Vortex requires the published 510 motor."
              : "Titan Vortex requires at least the published 510 motor.",
        ),
      );
    }
  }
  if (motorization.length > 0 && selectedMotorIds.length === 0) {
    issues.push(
      issue(
        "hard_block",
        "polar.exterior.controls.require_motor",
        guideSource,
        { polar_exterior_motorization_selections: motorization },
        "A control or accessory cannot be priced without a source-priced motor selection.",
      ),
    );
  }
  const rtsControls = motorization
    .map((selection) => selection.optionId)
    .filter(
      (optionId) =>
        !optionId.includes("motor") &&
        (optionId.includes("_rts_") ||
          optionId.startsWith("telis_") ||
          optionId.startsWith("decoflex_") ||
          optionId.startsWith("situo_") ||
          optionId.startsWith("smoove_") ||
          optionId.startsWith("tahoma_")),
    );
  const selectedMotorIsRts = selectedMotorIds.some(
    (optionId) =>
      optionId.includes("altus") ||
      optionId.includes("_rts_") ||
      optionId.includes("maestria"),
  );
  if (rtsControls.length > 0 && !selectedMotorIsRts) {
    issues.push(
      issue(
        "hard_block",
        "polar.exterior.rts_control.motor_mismatch",
        guideSource,
        { selectedMotorIds, rtsControls },
        "RTS remotes and controls require a published RTS/Altus/Maestria motor selection.",
      ),
    );
  }
  return issues;
}

function polarInteriorMotorization(
  context: SelectionContext,
): Array<{ groupId: string; optionId: string }> | null {
  const raw =
    context.configuration.polar_interior_motorization_selections;
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) return null;
  const parsed = raw.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const selection = entry as Record<string, SelectionValue>;
    return typeof selection.groupId === "string" &&
      typeof selection.optionId === "string"
      ? [{ groupId: selection.groupId, optionId: selection.optionId }]
      : [];
  });
  return parsed.length === raw.length ? parsed : null;
}

function validatePolarInteriorConfiguration(
  context: SelectionContext,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const source = { ...POLAR_DEALER_BOOK, pages: [20, 22, 23, 24, 25, 26, 40, 41, 42, 43, 47, 48, 50, 51] };
  const product = getProduct("polar_interior_roller");
  const fabricName = text(
    configValue(context, "fabric_collection", "fabric"),
  );
  const fabric = product?.fabricMetadata?.find(
    (candidate) =>
      normalizeIdentity(candidate.name) === normalizeIdentity(fabricName),
  );
  if (!fabric) {
    issues.push(
      issue(
        "hard_block",
        "polar.interior.fabric.required",
        { ...POLAR_DEALER_BOOK, pages: [22, 23, 24, 25] },
        { fabric_collection: fabricName || null },
        "Select an exact fabric style published in the Polar Interior Fabric List.",
      ),
    );
  } else {
    const routedProgram = product?.fabricRouting?.[fabric.name] ?? null;
    if (context.programId !== routedProgram) {
      issues.push(
        issue(
          "hard_block",
          "polar.interior.fabric.program_mismatch",
          { ...POLAR_DEALER_BOOK, pages: [22, 23, 24, 25] },
          {
            fabric_collection: fabric.name,
            programId: context.programId,
            expectedProgramId: routedProgram,
          },
          "The selected Polar fabric must use its published price group.",
        ),
      );
    }
    const orientation = text(
      configValue(
        context,
        "polar_interior_fabric_orientation",
        "fabric_orientation",
      ),
    ).toLowerCase();
    if (!["standard", "railroaded"].includes(orientation)) {
      issues.push(
        issue(
          "hard_block",
          "polar.interior.fabric.orientation_required",
          { ...POLAR_DEALER_BOOK, pages: [22, 23, 24, 25] },
          { polar_interior_fabric_orientation: orientation || null },
          "Select Standard or Railroaded fabric orientation.",
        ),
      );
    } else if (
      orientation === "standard" &&
      fabric.rollWidthInches != null &&
      context.widthInches > fabric.rollWidthInches
    ) {
      issues.push(
        issue(
          "hard_block",
          "polar.interior.fabric.standard_roll_width",
          { ...POLAR_DEALER_BOOK, page: fabric.sourcePage },
          {
            fabric_collection: fabric.name,
            widthInches: context.widthInches,
            rollWidthInches: fabric.rollWidthInches,
          },
          "This width exceeds the selected fabric's published roll width. Choose a source-permitted railroaded orientation or request manual review.",
        ),
      );
    } else if (orientation === "railroaded") {
      if (!fabric.railroadAllowed) {
        issues.push(
          issue(
            "hard_block",
            "polar.interior.fabric.railroad_not_allowed",
            { ...POLAR_DEALER_BOOK, page: fabric.sourcePage },
            { fabric_collection: fabric.name, railroadAllowed: false },
            "The selected Polar fabric is published as not railroadable.",
          ),
        );
      }
      if (
        fabric.rollWidthInches != null &&
        context.heightInches > fabric.rollWidthInches
      ) {
        issues.push(
          issue(
            "hard_block",
            "polar.interior.fabric.railroad_roll_width",
            { ...POLAR_DEALER_BOOK, page: fabric.sourcePage },
            {
              heightInches: context.heightInches,
              rollWidthInches: fabric.rollWidthInches,
            },
            "The shade height exceeds the fabric roll width when railroaded.",
          ),
        );
      }
      if (
        fabric.maxRailroadLengthInches != null &&
        context.widthInches > fabric.maxRailroadLengthInches
      ) {
        issues.push(
          issue(
            "hard_block",
            "polar.interior.fabric.railroad_length",
            { ...POLAR_DEALER_BOOK, page: fabric.sourcePage },
            {
              widthInches: context.widthInches,
              maxRailroadLengthInches: fabric.maxRailroadLengthInches,
            },
            "The shade width exceeds the published maximum railroaded length without a seam; seam pricing is not automated.",
          ),
        );
      }
    }
  }

  const liftSystem = text(configValue(context, "lift_system")).toLowerCase();
  const allowedLiftSystems = [
    "manual_clutch",
    "cordless_coulisse",
    "cordless_zero_gravity",
    "motorized",
  ];
  if (!allowedLiftSystems.includes(liftSystem)) {
    issues.push(
      issue(
        "hard_block",
        "polar.interior.lift_system.required",
        { ...POLAR_DEALER_BOOK, pages: [20, 26, 42, 43, 47, 50, 51] },
        { lift_system: liftSystem || null },
        "Select Manual clutch, Coulisse cordless, Zero Gravity cordless, or Motorized.",
      ),
    );
  }

  const motorization = polarInteriorMotorization(context);
  if (motorization === null) {
    issues.push(
      issue(
        "hard_block",
        "polar.interior.motorization.invalid_selection",
        source,
        {
          polar_interior_motorization_selections:
            context.configuration.polar_interior_motorization_selections ?? null,
        },
        "A saved Interior motor/control selection is malformed and must be reselected.",
      ),
    );
  } else {
    const group = pricingCatalog.motorization.polar_interior_motors;
    const selectedOptions = motorization.flatMap((selection) => {
      if (selection.groupId !== "polar_interior_motors") return [];
      const selected = group?.options.find(
        (candidate) => candidate.id === selection.optionId,
      );
      return selected ? [selected] : [];
    });
    if (selectedOptions.length !== motorization.length) {
      issues.push(
        issue(
          "hard_block",
          "polar.interior.motorization.unknown_selection",
          source,
          { polar_interior_motorization_selections: motorization },
          "Every motor, control, power supply, cable, or accessory must be an exact priced item from the current Polar book.",
        ),
      );
    }
    const motors = selectedOptions.filter((option) => option.role === "motor");
    if (liftSystem === "motorized" && motors.length !== 1) {
      issues.push(
        issue(
          "hard_block",
          "polar.interior.motor.exactly_one_required",
          source,
          { lift_system: liftSystem, selectedMotorCount: motors.length },
          "A motorized Interior Roller requires exactly one published motor.",
        ),
      );
    }
    if (liftSystem !== "motorized" && selectedOptions.length > 0) {
      issues.push(
        issue(
          "hard_block",
          "polar.interior.motor.manual_conflict",
          source,
          { lift_system: liftSystem, selectedOptionIds: selectedOptions.map((option) => option.id) },
          "Motor, control, power, and motor-accessory selections require the Motorized lift system.",
        ),
      );
    }
    if (motors.length === 1) {
      const motor = motors[0];
      for (const [field, selectedValue, boundary] of [
        ["minimum_width", context.widthInches, motor.minWidth],
        ["maximum_width", context.widthInches, motor.maxWidth],
        ["minimum_height", context.heightInches, motor.minHeight],
        ["maximum_height", context.heightInches, motor.maxHeight],
      ] as const) {
        if (
          boundary != null &&
          ((field.startsWith("minimum") && selectedValue < boundary) ||
            (field.startsWith("maximum") && selectedValue > boundary))
        ) {
          issues.push(
            issue(
              "hard_block",
              `polar.interior.motor.${field}`,
              { ...POLAR_DEALER_BOOK, page: motor.sourcePages?.[0] ?? 42 },
              { optionId: motor.id, selectedValue, boundary },
              `The selected motor violates its published ${field.replaceAll("_", " ")}.`,
            ),
          );
        }
      }
      for (const selected of selectedOptions.filter(
        (option) => option.id !== motor.id,
      )) {
        if (
          selected.compatibleTechnologies?.length &&
          motor.technology &&
          !selected.compatibleTechnologies.includes(motor.technology)
        ) {
          issues.push(
            issue(
              "hard_block",
              "polar.interior.motorization.technology_mismatch",
              { ...POLAR_DEALER_BOOK, page: selected.sourcePages?.[0] ?? 40 },
              {
                motorTechnology: motor.technology,
                optionId: selected.id,
                compatibleTechnologies: selected.compatibleTechnologies,
              },
              "The selected control, power, cable, or accessory is not published for this motor technology.",
            ),
          );
        }
      }
      const selectedIds = new Set(selectedOptions.map((option) => option.id));
      for (const requiredId of motor.requiredOptionIds ?? []) {
        if (!selectedIds.has(requiredId)) {
          issues.push(
            issue(
              "hard_block",
              "polar.interior.motorization.required_component",
              { ...POLAR_DEALER_BOOK, page: motor.sourcePages?.[0] ?? 50 },
              { motorId: motor.id, requiredOptionId: requiredId },
              "The selected motor requires the separately published charging extension cable.",
            ),
          );
        }
      }
    }
  }

  const surchargeIds = polarSelectedSurchargeIds(context);
  const topTreatments = surchargeIds.filter((id) =>
    /^(fascia_|head_pocket_|hang_strip$|interior_cassette$)/.test(id),
  );
  if (topTreatments.length > 1) {
    issues.push(
      issue(
        "hard_block",
        "polar.interior.top_treatment.multiple",
        { ...POLAR_DEALER_BOOK, page: 26 },
        { topTreatments },
        "Select no more than one published fascia, head pocket, hang strip, or cassette.",
      ),
    );
  }
  const complexAssemblies = surchargeIds.filter(
    (id) => id.startsWith("coupler_") || id.startsWith("duo_"),
  );
  if (complexAssemblies.length > 0) {
    issues.push(
      issue(
        "hard_block",
        "polar.interior.multi_band.component_pricing_required",
        { ...POLAR_DEALER_BOOK, page: 26 },
        { complexAssemblies },
        "Coupled and Duo shades require each shade/band to be dimension-priced separately before the bracket adder; this line must be reviewed manually.",
      ),
    );
  }
  if (context.widthInches >= 120 && surchargeIds.includes("spring_assist")) {
    issues.push(
      issue(
        "hard_block",
        "polar.interior.spring_assist.included",
        { ...POLAR_DEALER_BOOK, page: 26 },
        { widthInches: context.widthInches, spring_assist: true },
        "Spring assist is included at 120 inches and wider; remove the separate adder.",
      ),
    );
  }
  const ralSelections = surchargeIds.filter((id) => id.startsWith("ral_"));
  if (ralSelections.length > 0) {
    issues.push(
      issue(
        "hard_block",
        "polar.interior.ral.approved_color_chart_required",
        { ...POLAR_DEALER_BOOK, page: 53 },
        { ralSelections },
        "The dealer book publishes RAL adders but states that colors outside a separate RAL Powder Coating Color Chart incur additional charges. That approved-color chart is not in the supplied source, so RAL selections require manual source verification.",
      ),
    );
  }
  const requiredLiftSurcharge =
    liftSystem === "cordless_coulisse"
      ? "cordless_coulisse"
      : liftSystem === "cordless_zero_gravity"
        ? "cordless_zero_gravity"
        : null;
  if (requiredLiftSurcharge && !surchargeIds.includes(requiredLiftSurcharge)) {
    issues.push(
      issue(
        "hard_block",
        "polar.interior.lift_system.missing_adder",
        { ...POLAR_DEALER_BOOK, page: 26 },
        { lift_system: liftSystem, requiredSurchargeId: requiredLiftSurcharge },
        "The selected cordless lift requires its exact published price adder.",
      ),
    );
  }
  return issues;
}

function validateRoller(context: SelectionContext): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  requireText(
    context,
    issues,
    "roller",
    [
      { key: "mount_type", label: "Mount type" },
      { key: "roller_application", label: "Roller application" },
      { key: "lift_system", label: "Operating system" },
      { key: "fabric_collection", label: "Fabric collection" },
      { key: "fabric_color_code", label: "Exact fabric color" },
      { key: "roller_top_treatment", label: "Top treatment" },
      { key: "roller_tube", label: "Roller tube" },
    ],
    { ...ROLLER_GUIDE, pages: [7, 8, 9] },
  );

  if (context.catalogAsOf < "2026-08-01") {
    issues.push(
      issue(
        "hard_block",
        "roller.appendix.effective_date",
        { ...ROLLER_LIMITS, sheet: "Revision Log" },
        { catalogAsOf: context.catalogAsOf },
        "The selected Roller MinMax appendix is future-dated and cannot be production-active before August 1, 2026. Use an injected preview date only in the protected test environment.",
      ),
    );
  }

  const collection = text(configValue(context, "fabric_collection"));
  const colorCode = text(configValue(context, "fabric_color_code"));
  const fabric = findRollerColor(collection, colorCode);
  if (collection && colorCode && !fabric) {
    issues.push(
      issue(
        "hard_block",
        "roller.fabric.unknown_identity",
        { ...ROLLER_LIMITS, sheet: "Fabric Code List" },
        { fabric_collection: collection, fabric_color_code: colorCode },
        "This collection and color-code identity is not active in the pinned Roller catalog.",
      ),
    );
  }
  if (fabric && context.programId !== fabric.programId) {
    issues.push(
      issue(
        "hard_block",
        "roller.program.fabric_mismatch",
        { sourceId: "norman-retail-guide-2026-07", page: 14 },
        {
          fabric_collection: collection,
          fabric_color_code: colorCode,
          selectedProgramId: context.programId,
          expectedProgramId: fabric.programId,
        },
        "The selected Roller price program does not match the exact catalog fabric/color price group.",
      ),
    );
  }

  const application = normalized(configValue(context, "roller_application", "shade_type"));
  const coupledCount = finiteNumber(configValue(context, "roller_coupling_count", "coupled_shade_count"));
  if ((application.includes("coupled") || application.includes("t post")) && ![2, 3, 4].includes(coupledCount ?? 0)) {
    issues.push(
      issue(
        "hard_block",
        "roller.application.component_count",
        { ...ROLLER_LIMITS, sheet: "Revision Log" },
        { roller_application: application, roller_coupling_count: coupledCount },
        "Coupled and T-post applications require the exact physical shade count (2, 3, or 4).",
      ),
    );
  }

  const lift = normalized(configValue(context, "lift_system"));
  const canonicalMotorization =
    canonicalMotorizationSelectionsFromConfiguration(context.configuration);
  const selectedLegacyMotor = text(
    configValue(context, "motor_type", "roller_motor"),
  );
  if (lift.includes("motor") && !selectedLegacyMotor && !canonicalMotorization) {
    issues.push(
      issue(
        "hard_block",
        "roller.motor.required",
        { ...ROLLER_GUIDE, pages: [40, 41] },
        { lift_system: lift, motor_type: null },
        "Motorized Roller shades require an exact motor and power configuration.",
      ),
    );
  }
  if (lift.includes("motor") && !canonicalMotorization) {
    issues.push(
      issue(
        "hard_block",
        "roller.motorization.canonical_required",
        { sourceId: "norman-retail-guide-2026-07", pages: [7, 8, 28] },
        { motorization_selections: null },
        "Motorized Roller shades require canonical group, option, role, and unit identities before authoritative pricing.",
      ),
    );
  } else if (canonicalMotorization) {
    issues.push(...canonicalMotorization.issues);
  }
  if (lift.includes("motor") && !text(configValue(context, "roller_power_configuration"))) {
    issues.push(
      issue(
        "hard_block",
        "roller.motor.power.required",
        { ...ROLLER_GUIDE, pages: [40, 41] },
        { roller_power_configuration: null },
        "Select the documented Roller power configuration before pricing.",
      ),
    );
  }
  if (lift.includes("motor")) {
    const powerConfiguration = text(
      configValue(context, "roller_power_configuration"),
    );
    const selectedMotor = selectedLegacyMotor;
    const expectedMotor = expectedRollerMotorForPowerConfiguration(powerConfiguration);
    if (powerConfiguration && !expectedMotor) {
      issues.push(
        issue(
          "hard_block",
          "roller.motor.power.unsupported",
          { ...ROLLER_GUIDE, pages: [40, 41] },
          { roller_power_configuration: powerConfiguration },
          "The selected Roller power configuration does not have an exact source-backed motor charge mapping.",
        ),
      );
    } else if (
      !canonicalMotorization &&
      expectedMotor &&
      normalizeIdentity(selectedMotor) !== normalizeIdentity(expectedMotor)
    ) {
      issues.push(
        issue(
          "hard_block",
          "roller.motor.price_configuration_mismatch",
          { sourceId: "norman-retail-guide-2026-07", page: 28 },
          {
            roller_power_configuration: powerConfiguration,
            selectedMotor: selectedMotor || null,
            expectedMotor,
          },
          "The priced Roller motor must match the motor required by the validated power configuration.",
        ),
      );
    }
  }

  issues.push(...validateRollerMatrix(context));

  return issues;
}

function validateRoman(context: SelectionContext): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  requireText(
    context,
    issues,
    "roman",
    [
      { key: "mount_type", label: "Mount type" },
      { key: "shade_type", label: "Shade type" },
      { key: "lift_system", label: "Control type" },
      { key: "fold_style", label: "Shade style" },
      { key: "fabric_collection", label: "Front fabric collection" },
      { key: "fabric_color_code", label: "Exact front fabric color" },
      { key: "lining", label: "Lining" },
      { key: "fabric_orientation", label: "Fabric orientation" },
      { key: "seaming", label: "Seaming" },
    ],
    { ...ROMAN_GUIDE, pages: [9, 10, 11] },
  );

  const collection = text(configValue(context, "fabric_collection", "roman_fabric_category"));
  const colorCode = text(configValue(context, "fabric_color_code"));
  const fabric = findRomanFrontColor(collection, colorCode);
  if (collection && colorCode && !fabric) {
    issues.push(
      issue(
        "hard_block",
        "roman.front_fabric.unknown_identity",
        { ...ROMAN_GUIDE, pages: [24, 25, 26, 27, 28, 29, 30, 31, 32, 33] },
        { fabric_collection: collection, fabric_color_code: colorCode },
        "The exact front collection and color code is not active in the pinned Roman catalog.",
      ),
    );
  }
  if (fabric && !programMatchesGroup(context.programId, fabric.priceGroup)) {
    issues.push(
      issue(
        "hard_block",
        "roman.program.fabric_mismatch",
        { sourceId: "norman-retail-guide-2026-07", page: 24 },
        {
          fabric_collection: collection,
          fabric_color_code: colorCode,
          selectedProgramId: context.programId,
          expectedPriceGroup: fabric.priceGroup,
        },
        "The selected Roman price program does not match the July price group for this exact fabric/color.",
      ),
    );
  }
  if (colorCode.toUpperCase() === "F1090") {
    issues.push(
      issue(
        "hard_block",
        "roman.fabric.f1090.quarantined",
        { ...ROMAN_GUIDE, page: 26 },
        { fabric_collection: collection, fabric_color_code: colorCode },
        "Caroline F1090 is quarantined because the guide and dealer catalog disagree on style eligibility.",
      ),
    );
  }

  const shadeType = normalized(configValue(context, "shade_type"));
  const lift = normalized(configValue(context, "lift_system"));
  const motorized = lift.includes("motor");

  const isDayNight = shadeType === "day night";
  const isCommonValance = shadeType === "common valance";
  const area = (context.widthInches * context.heightInches) / 144;
  let minWidth = 12;
  let maxWidth = 96;
  let minHeight = 24;
  let maxHeight = motorized ? 102 : 96;
  let maxArea = 52;
  if (lift === "cordless") {
    minWidth = 20;
    maxArea = 40;
  } else if (lift.includes("continuous") || lift.includes("cord loop")) {
    const headrail = normalized(configValue(context, "headrail_size"));
    if (!headrail) {
      issues.push(
        issue(
          "hard_block",
          "roman.continuous_loop.headrail_required",
          { ...ROMAN_GUIDE, pages: [11, 12] },
          { lift_system: text(configValue(context, "lift_system")), headrail_size: null },
          "Continuous Cord Loop requires the exact 1 1/2-inch or 2-inch headrail before its width limit can be validated.",
        ),
      );
    }
    maxWidth = headrail.includes("1.5") || headrail.includes("1 1 2") ? 50 : 96;
    maxArea = context.widthInches <= 50 ? 33 : 64;
  } else if (lift.includes("smartrelease") || lift.includes("smart release")) {
    maxArea = 52;
  }

  if (!motorized) {
    if (context.widthInches < minWidth || context.widthInches > maxWidth) {
      issues.push(
        issue(
          "hard_block",
          "roman.dimension.width",
          { ...ROMAN_GUIDE, pages: [11, 12] },
          { widthInches: context.widthInches, minWidthInches: minWidth, maxWidthInches: maxWidth, lift_system: lift },
          `Roman width must be between ${minWidth} and ${maxWidth} inches for the selected control/headrail configuration.`,
        ),
      );
    }
    if (context.heightInches < minHeight || context.heightInches > maxHeight) {
      issues.push(
        issue(
          "hard_block",
          "roman.dimension.height",
          { ...ROMAN_GUIDE, pages: [11, 12] },
          { heightInches: context.heightInches, minHeightInches: minHeight, maxHeightInches: maxHeight, lift_system: lift },
          `Roman height must be between ${minHeight} and ${maxHeight} inches for the selected control.`,
        ),
      );
    }
    if (area > maxArea) {
      issues.push(
        issue(
          "hard_block",
          "roman.dimension.area",
          { ...ROMAN_GUIDE, pages: [11, 12] },
          { areaSqft: area, maxAreaSqft: maxArea, lift_system: lift },
          `Roman area exceeds the ${maxArea}-square-foot limit for this configuration.`,
        ),
      );
    }
  }

  if (isDayNight) {
    const rearCollection = text(configValue(context, "rear_fabric_collection"));
    const rearCode = text(configValue(context, "rear_fabric_color_code"));
    if (!rearCollection || !rearCode) {
      issues.push(
        issue(
          "hard_block",
          "roman.day_night.rear_exact_color_required",
          { ...ROMAN_GUIDE, pages: [34, 35, 36, 37, 38, 39, 40, 41] },
          { rear_fabric_collection: rearCollection || null, rear_fabric_color_code: rearCode || null },
          "Day & Night requires the exact rear Roller collection and color, not only a fabric family.",
        ),
      );
    } else if (!findRomanRearColor(rearCollection, rearCode)) {
      issues.push(
        issue(
          "hard_block",
          "roman.day_night.rear_color_ineligible",
          { ...ROMAN_GUIDE, pages: [34, 35, 36, 37, 38, 39, 40, 41] },
          { rear_fabric_collection: rearCollection, rear_fabric_color_code: rearCode },
          "The selected rear color is excluded from Roman Day & Night use.",
        ),
      );
    } else {
      const rearMaxWidth = getRomanRearMaxWidth(rearCollection, rearCode);
      if (rearMaxWidth !== null && context.widthInches > rearMaxWidth) {
        issues.push(
          issue(
            "hard_block",
            "roman.day_night.rear_fabric.max_width",
            { ...ROMAN_GUIDE, pages: [34, 35, 36, 37, 38, 39, 40, 41] },
            {
              rear_fabric_collection: rearCollection,
              rear_fabric_color_code: rearCode,
              widthInches: context.widthInches,
              maxWidthInches: rearMaxWidth,
            },
            `The selected rear Roller fabric cannot exceed ${rearMaxWidth} inches wide in a Roman Day & Night shade.`,
          ),
        );
      }
    }
    if (context.heightInches / context.widthInches > 3) {
      issues.push(
        issue(
          "hard_block",
          "roman.day_night.max_ratio",
          { ...ROMAN_GUIDE, page: 12 },
          { widthInches: context.widthInches, heightInches: context.heightInches, maxHeightToWidthRatio: 3 },
          "Roman Day & Night height-to-width ratio cannot exceed 3:1.",
        ),
      );
    }
  }

  const fold = normalized(configValue(context, "fold_style"));
  const orientation = normalized(configValue(context, "fabric_orientation"));
  const seaming = normalized(configValue(context, "seaming"));
  const isRailroaded =
    orientation.includes("railroad") && !orientation.includes("non railroad");
  if (isRailroaded && seaming.includes("vertical")) {
    issues.push(
      issue(
        "hard_block",
        "roman.seaming.orientation_conflict",
        { ...ROMAN_GUIDE, page: 12 },
        { fabric_orientation: orientation, seaming },
        "A railroaded Roman fabric can use no seams or horizontal seams, not vertical seams.",
      ),
    );
  }
  if (!isRailroaded && seaming.includes("horizontal")) {
    issues.push(
      issue(
        "hard_block",
        "roman.seaming.orientation_conflict",
        { ...ROMAN_GUIDE, page: 12 },
        { fabric_orientation: orientation, seaming },
        "A standard non-railroaded Roman fabric can use no seams or vertical seams, not horizontal seams.",
      ),
    );
  }
  if (
    isRailroaded &&
    !fold.includes("batten back") &&
    !fold.includes("soft fold") &&
    colorCode.toUpperCase() !== "F1082" &&
    colorCode.toUpperCase() !== "F1083"
  ) {
    issues.push(
      issue(
        "hard_block",
        "roman.railroad.style_exclusion",
        { ...ROMAN_GUIDE, page: 12 },
        { fabric_orientation: orientation, fold_style: fold, fabric_color_code: colorCode },
        "Railroading is limited to Flat Fold with Batten Back and Soft Fold, except the documented AC0401 Sheer Elegance colors.",
      ),
    );
  }
  if (
    fabric &&
    fold &&
    !fabric.styles.some((style) => normalizeIdentity(style) === fold)
  ) {
    issues.push(
      issue(
        "hard_block",
        "roman.fabric.style_ineligible",
        { ...ROMAN_GUIDE, pages: [7, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33] },
        { fabric_collection: collection, fabric_color_code: colorCode, fold_style: fold },
        "The selected exact front fabric is not offered in this Roman shade style.",
      ),
    );
  }
  if ((isDayNight || isCommonValance) && (fold.includes("edge banded") || fold.includes("ribbon banded"))) {
    issues.push(
      issue(
        "hard_block",
        "roman.banding.configuration_exclusion",
        { ...ROMAN_GUIDE, page: 10 },
        { shade_type: shadeType, fold_style: fold },
        "Edge and Ribbon Banded styles are not offered for Day & Night or Common Valance configurations.",
      ),
    );
  }
  if ((fold.includes("edge banded") || fold.includes("ribbon banded")) && !text(configValue(context, "banding_color"))) {
    issues.push(
      issue(
        "hard_block",
        "roman.banding.color_required",
        { ...ROMAN_GUIDE, page: 10 },
        { fold_style: fold, banding_color: null },
        "Select the documented banding color for a banded Roman style.",
      ),
    );
  }
  const bandingColor = text(configValue(context, "banding_color"));
  const bandingCode = bandingColor.match(/\b([FT]\d{3,5})\b/i)?.[1]?.toUpperCase() ?? "";
  if (fold.includes("edge banded") && bandingColor) {
    const border = findRomanFrontColor(collection, bandingCode);
    if (!bandingCode || !border) {
      issues.push(
        issue(
          "hard_block",
          "roman.edge_banding.color_ineligible",
          { ...ROMAN_GUIDE, page: 9 },
          { fabric_collection: collection, banding_color: bandingColor },
          "The edge-band color must be an exact active color from the same Roman fabric collection.",
        ),
      );
    } else if (bandingCode === colorCode.toUpperCase()) {
      issues.push(
        issue(
          "hard_block",
          "roman.edge_banding.same_as_base",
          { ...ROMAN_GUIDE, page: 9 },
          { fabric_color_code: colorCode, banding_color: bandingColor },
          "Roman base and edge-band colors must be different colors from the same collection.",
        ),
      );
    }
  }
  if (
    fold.includes("ribbon banded") &&
    bandingColor &&
    !["T001", "T002", "T169", "T201", "T402", "T5124"].includes(bandingCode)
  ) {
    issues.push(
      issue(
        "hard_block",
        "roman.ribbon_banding.color_ineligible",
        { ...ROMAN_GUIDE, page: 8 },
        { banding_color: bandingColor },
        "Select one of the six documented Roman ribbon decorative tape colors.",
      ),
    );
  }

  if (fabric) {
    const rawMax = Number.parseFloat(fabric.maxWidth);
    if (Number.isFinite(rawMax) && context.widthInches > rawMax) {
      const acknowledgment = normalized(configValue(context, "fabric_join_acknowledgment"));
      const selectedOrientation = normalized(configValue(context, "fabric_orientation"));
      const selectedIsRailroaded =
        selectedOrientation.includes("railroad") &&
        !selectedOrientation.includes("non railroad");
      const selectedSeaming = normalized(configValue(context, "seaming"));
      const documentedJoinSelected =
        selectedIsRailroaded ||
        selectedSeaming.includes("vertical seam") ||
        selectedSeaming.includes("horizontal seam") ||
        acknowledgment.includes("railroad") ||
        acknowledgment.includes("vertical seam") ||
        acknowledgment.includes("horizontal seam");
      if (fabric.joinable === "N" && fabric.clothCode !== "AB0103") {
        issues.push(
          issue(
            "hard_block",
            "roman.fabric.not_joinable",
            { ...ROMAN_GUIDE, pages: [12, 13] },
            { widthInches: context.widthInches, fabricMaxWidthInches: rawMax, clothCode: fabric.clothCode },
            "This fabric is not joinable and the selected width exceeds its documented fabric width.",
          ),
        );
      } else if (!documentedJoinSelected) {
        issues.push(
          issue(
            "hard_block",
            "roman.fabric.orientation_ack_required",
            { ...ROMAN_GUIDE, pages: [12, 13] },
            { widthInches: context.widthInches, fabricMaxWidthInches: rawMax, fabric_orientation: configValue(context, "fabric_orientation") ?? null },
            "A railroad, seam, or railroad-and-seam acknowledgment is required when the order exceeds the usable fabric width.",
          ),
        );
      }
      if (
        colorCode.toUpperCase() === "F0031" &&
        normalized(configValue(context, "fabric_orientation")).includes("railroad") &&
        !normalized(configValue(context, "fabric_orientation")).includes("non railroad")
      ) {
        const maxRailroadHeight = fold.includes("soft") ? 26 : fold.includes("batten") ? 36 : 45;
        if (context.heightInches > maxRailroadHeight) {
          issues.push(
            issue(
              "hard_block",
              "roman.f0031.railroad.max_height",
              { ...ROMAN_GUIDE, page: 13 },
              { heightInches: context.heightInches, maxHeightInches: maxRailroadHeight, fold_style: fold },
              `Railroaded Lorraine F0031 cannot exceed ${maxRailroadHeight} inches high for this style.`,
            ),
          );
        }
      }
    }
  }

  if (isCommonValance) {
    const panels = configValue(context, "common_valance_panel_widths");
    const gap = finiteNumber(configValue(context, "common_valance_gap"));
    if (!Array.isArray(panels) || panels.length !== 2 || panels.some((value) => finiteNumber(value) === null)) {
      issues.push(
        issue(
          "hard_block",
          "roman.common_valance.two_panel_widths_required",
          { ...ROMAN_GUIDE, page: 13 },
          { common_valance_panel_widths: panels ?? null },
          "Common Valance requires the two actual panel widths; V2 does not infer equal panels from the overall opening.",
        ),
      );
    }
    if (gap === null || gap < 0.125 || gap > 6) {
      issues.push(
        issue(
          "hard_block",
          "roman.common_valance.gap_range",
          { ...ROMAN_GUIDE, page: 13 },
          { common_valance_gap: gap, minGapInches: 0.125, maxGapInches: 6 },
          "Common Valance gap must be between 1/8 inch and 6 inches.",
        ),
      );
    }
    if (Array.isArray(panels) && panels.length === 2 && gap !== null) {
      const widths = panels.map(finiteNumber);
      if (widths.every((value): value is number => value !== null)) {
        const total = widths[0] + widths[1] + gap;
        if (Math.abs(total - context.widthInches) > 0.0625) {
          issues.push(
            issue(
              "hard_block",
              "roman.common_valance.panel_width_reconciliation",
              { ...ROMAN_GUIDE, page: 13 },
              {
                common_valance_panel_widths: widths,
                common_valance_gap: gap,
                totalWidthInches: total,
                orderWidthInches: context.widthInches,
              },
              "The two actual panel widths plus the selected gap must equal the measured Common Valance order width.",
            ),
          );
        }
        if (total > 144) {
          issues.push(
            issue(
              "hard_block",
              "roman.common_valance.max_total_width",
              { ...ROMAN_GUIDE, page: 13 },
              { common_valance_panel_widths: widths, common_valance_gap: gap, totalWidthInches: total, maxWidthInches: 144 },
              "The two Common Valance panels plus their gap cannot exceed 144 inches.",
            ),
          );
        }
      }
    }
  }

  if (yes(configValue(context, "side_by_side"))) {
    if (isDayNight || isCommonValance || fold.includes("without seams") || fold.includes("banded")) {
      issues.push(
        issue(
          "hard_block",
          "roman.side_by_side.configuration_exclusion",
          { ...ROMAN_GUIDE, page: 14 },
          { side_by_side: true, shade_type: shadeType, fold_style: fold },
          "Side-by-side matching is unavailable for this Roman shade type/style.",
        ),
      );
    } else if (!text(configValue(context, "side_by_side_match_line_id"))) {
      issues.push(
        issue(
          "hard_block",
          "roman.side_by_side.match_required",
          { ...ROMAN_GUIDE, page: 14 },
          { side_by_side: true, side_by_side_match_line_id: null },
          "Select the exact line this shade must match for side-by-side production.",
        ),
      );
    }
  }

  issues.push(...validateNormanShadeMotorization(context));
  return issues;
}

function validateHoneycomb(context: SelectionContext): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const application = normalized(configValue(context, "application"));
  const specialtyShapeApplication = application.includes("specialty shape");
  requireText(
    context,
    issues,
    "honeycomb",
    [
      { key: "mount_type", label: "Mount type" },
      { key: "cell_size", label: "Cell size" },
      ...(specialtyShapeApplication
        ? []
        : [{ key: "lift_system", label: "Operating system" }]),
      { key: "fabric_collection", label: "Fabric collection" },
      { key: "fabric_color_code", label: "Exact fabric color" },
      { key: "application", label: "Application" },
    ],
    { ...HONEYCOMB_GUIDE, pages: [15, 16, 17] },
  );

  const colorCode = text(configValue(context, "fabric_color_code"));
  const collection = text(configValue(context, "fabric_collection"));
  const color = findHoneycombColor(collection, colorCode);
  const cellSize = text(configValue(context, "cell_size"));
  const normalizedCell = normalized(cellSize);
  const sourceCell =
    normalizedCell.includes("smartfit") || normalizedCell.includes("decoflex")
      ? normalizeIdentity('3/8" Single Cell')
      : normalizedCell;
  const expectedProgramId = expectedHoneycombProgramId(collection, colorCode, cellSize);
  if (color && expectedProgramId && context.programId !== expectedProgramId) {
    issues.push(
      issue(
        "hard_block",
        "honeycomb.program.fabric_cell_mismatch",
        { sourceId: "norman-retail-guide-2026-07", page: 8 },
        {
          fabric_collection: collection,
          fabric_color_code: colorCode,
          cell_size: cellSize,
          selectedProgramId: context.programId,
          expectedProgramId,
        },
        "The selected Honeycomb price program does not match the exact fabric and cell-size price group.",
      ),
    );
  }
  const lift = normalized(configValue(context, "lift_system"));

  if (colorCode && !color) {
    issues.push(
      issue(
        "hard_block",
        "honeycomb.fabric.unknown_identity",
        HONEYCOMB_COLORS,
        { fabric_collection: collection, fabric_color_code: colorCode },
        "This Honeycomb collection/color identity is not active in the pinned companion workbook.",
      ),
    );
  }
  if (color && !color.cellSizes.some((size) => normalizeIdentity(size) === sourceCell)) {
    issues.push(
      issue(
        "hard_block",
        "honeycomb.fabric.cell_ineligible",
        HONEYCOMB_COLORS,
        { fabric_color_code: colorCode, cell_size: cellSize, fabric_family: color.family },
        "The selected exact color is not offered in this cell size.",
      ),
    );
  }
  if (
    normalizeIdentity(color?.family) === "whispers" ||
    normalizeIdentity(text(configValue(context, "fabric_collection"))) === "whispers"
  ) {
    issues.push(
      issue(
        "hard_block",
        "honeycomb.fabric.whispers.unavailable",
        HONEYCOMB_COLORS,
        { fabric_color_code: colorCode, fabric_family: color?.family ?? "Whispers" },
        "Whispers is unavailable because it appears only as stale workbook residue.",
      ),
    );
  }
  const exactApplicationRows = application.includes("patio door vertical")
    ? normanHoneycombV2Source.verticalColors
    : application.includes("motorized skylight")
      ? normanHoneycombV2Source.motorizedSkylightColors
      : null;
  if (
    color &&
    exactApplicationRows &&
    !exactApplicationRows.some(
      (row) =>
        normalizeIdentity(row.family) === normalizeIdentity(color.family) &&
        (normalizeIdentity(row.customerColorCode) === normalizeIdentity(color.customerColorCode) ||
          normalizeIdentity(row.factoryColorCode) === normalizeIdentity(color.factoryColorCode)),
    )
  ) {
    issues.push(
      issue(
        "hard_block",
        "honeycomb.fabric.application_ineligible",
        HONEYCOMB_COLORS,
        {
          application: text(configValue(context, "application")),
          fabric_collection: collection,
          fabric_color_code: colorCode,
        },
        "The selected exact Honeycomb fabric/color is not eligible for this application.",
      ),
    );
  }
  const dayNight = lift.includes("day night") || application.includes("day night");
  if (normalizeIdentity(color?.family) === "sheer" && !dayNight) {
    issues.push(
      issue(
        "hard_block",
        "honeycomb.sheer.day_night_only",
        HONEYCOMB_COLORS,
        { fabric_collection: collection, fabric_color_code: colorCode, application },
        "The pinned catalog offers these Sheer Honeycomb fabrics only as the sheer layer of a Day & Night configuration.",
      ),
    );
  }

  if (dayNight) {
    const rearCollection = text(configValue(context, "rear_fabric_collection"));
    const rearCode = text(configValue(context, "rear_fabric_color_code"));
    const rearCell = text(configValue(context, "rear_cell_size"));
    const rearColor = findHoneycombColor(rearCollection, rearCode);
    if (!rearCollection || !rearCode || !rearCell) {
      issues.push(
        issue(
          "hard_block",
          "honeycomb.day_night.rear_exact_selection_required",
          HONEYCOMB_COLORS,
          { rear_fabric_collection: rearCollection || null, rear_fabric_color_code: rearCode || null, rear_cell_size: rearCell || null },
          "Day & Night requires the exact rear fabric color and cell size.",
        ),
      );
    } else if (!rearColor || !rearColor.cellSizes.some((size) => normalizeIdentity(size) === normalizeIdentity(rearCell))) {
      issues.push(
        issue(
          "hard_block",
          "honeycomb.day_night.invalid_pair",
          HONEYCOMB_COLORS,
          { front_fabric_color_code: colorCode, rear_fabric_color_code: rearCode, rear_cell_size: rearCell },
          "The selected front/rear Day & Night fabric-color pair is not documented as compatible.",
        ),
      );
    }
  }
  issues.push(...validateNormanShadeMotorization(context));
  return issues;
}

function validateSynchronyVertical(context: SelectionContext): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  requireText(
    context,
    issues,
    "vertical",
    [
      { key: "mount_type", label: "Mount type" },
      { key: "fabric_collection", label: "Vane collection" },
      { key: "fabric_color_name", label: "Exact vane color" },
      { key: "stack_option", label: "Stack direction" },
      { key: "draw_direction", label: "Draw/wand direction" },
    ],
    { ...VERTICAL_GUIDE, pages: [6, 7, 9] },
  );
  if (context.widthInches < 18 || context.widthInches > 100) {
    issues.push(
      issue(
        "hard_block",
        "vertical.dimension.width",
        { ...VERTICAL_GUIDE, page: 6 },
        { widthInches: context.widthInches, minWidthInches: 18, maxWidthInches: 100 },
        "Synchrony Vertical width must be from 18 through 100 inches.",
      ),
    );
  }
  if (context.heightInches < 36 || context.heightInches > 108) {
    issues.push(
      issue(
        "hard_block",
        "vertical.dimension.height",
        { ...VERTICAL_GUIDE, page: 6 },
        { heightInches: context.heightInches, minHeightInches: 36, maxHeightInches: 108 },
        "Synchrony Vertical height must be from 36 through 108 inches.",
      ),
    );
  }
  const collection = text(configValue(context, "fabric_collection", "fabric_group"));
  const colorName = text(configValue(context, "fabric_color_name", "vertical_color"));
  const verticalColor = findSynchronyVerticalColor(collection, colorName);
  if (collection && colorName && !verticalColor) {
    issues.push(
      issue(
        "hard_block",
        "vertical.color.inactive_or_unknown",
        { ...VERTICAL_GUIDE, page: 9 },
        { fabric_collection: collection, fabric_color_name: colorName },
        "The selected collection/color identity is not one of the 46 active Synchrony Vertical colors.",
      ),
    );
  }
  if (verticalColor && !programMatchesGroup(context.programId, verticalColor.priceGroup ?? "")) {
    issues.push(
      issue(
        "hard_block",
        "vertical.program.color_mismatch",
        { sourceId: "norman-retail-guide-2026-07", page: 33 },
        {
          fabric_collection: collection,
          fabric_color_name: colorName,
          selectedProgramId: context.programId,
          expectedPriceGroup: verticalColor.priceGroup,
        },
        "The selected Synchrony price program does not match the exact collection/color price group.",
      ),
    );
  }

  const mount = normalized(configValue(context, "mount_type"));
  if (mount.includes("inside")) {
    const mountDepth = finiteNumber(configValue(context, "mount_depth_inches"));
    if (mountDepth === null || mountDepth < 2.8125) {
      issues.push(
        issue(
          "hard_block",
          "vertical.inside_mount.minimum_depth",
          { ...VERTICAL_GUIDE, page: 11 },
          { mount_depth_inches: mountDepth, minimumDepthInches: 2.8125 },
          "Synchrony inside mount requires at least 2 13/16 inches of mounting depth.",
        ),
      );
    } else {
      issues.push(
        issue(
          "auto_derive",
          "vertical.inside_mount.depth_class",
          { ...VERTICAL_GUIDE, page: 11 },
          { mount_depth_inches: mountDepth },
          mountDepth >= 3.75
            ? "The supplied depth supports a fully flushed inside mount."
            : "The supplied depth supports a semi-inside mount but not a fully flushed mount.",
          { insideMountClass: mountDepth >= 3.75 ? "fully_flushed" : "semi_inside" },
        ),
      );
    }
    issues.push(
      issue(
        "auto_derive",
        "vertical.inside_mount.deductions",
        { ...VERTICAL_GUIDE, page: 6 },
        { mount_type: text(configValue(context, "mount_type")), orderWidthInches: context.widthInches, orderHeightInches: context.heightInches },
        "Inside-mount finished dimensions use the exact published 3/8-inch width and 3/16-inch height deductions.",
        {
          finishedWidthInches: context.widthInches - 0.375,
          finishedHeightInches: context.heightInches - 0.1875,
        },
      ),
    );
  } else if (mount.includes("outside")) {
    issues.push(
      issue(
        "warning",
        "vertical.outside_mount.coverage_recommendation",
        { ...VERTICAL_GUIDE, page: 6 },
        { mount_type: text(configValue(context, "mount_type")) },
        "Norman recommends adding 1 1/2 inches on all four sides for outside-mount light-leakage coverage; this is a recommendation, not an order block.",
      ),
    );
  }

  const wandDrop = context.heightInches <= 84 ? 34 : context.heightInches <= 96 ? 49 : 61;
  issues.push(
    issue(
      "auto_derive",
      "vertical.wand_drop",
      { ...VERTICAL_GUIDE, page: 6 },
      { heightInches: context.heightInches },
      `The published standard wand drop for this height is ${wandDrop} inches.`,
      { wandDropInches: wandDrop },
    ),
  );
  const bracketCount = context.widthInches <= 48 ? 2 : context.widthInches <= 78 ? 3 : 4;
  issues.push(
    issue(
      "auto_derive",
      "vertical.bracket_count",
      { ...VERTICAL_GUIDE, page: 12 },
      { widthInches: context.widthInches },
      `The published bracket count for this width is ${bracketCount}.`,
      { bracketCount, centerSupportRequired: context.widthInches >= 78 },
    ),
  );

  if (yes(configValue(context, "side_by_side"))) {
    const orientation = normalized(
      configValue(context, "side_by_side_wand_orientation", "draw_direction"),
    );
    const stack = normalized(configValue(context, "stack_option"));
    if (!orientation) {
      issues.push(
        issue(
          "hard_block",
          "vertical.side_by_side.wand_orientation_required",
          { ...VERTICAL_GUIDE, page: 7 },
          { side_by_side: true, side_by_side_wand_orientation: null },
          "Side-by-side Vertical blinds must record the same exact wand orientation for both blinds.",
        ),
      );
    }
    if (stack.includes("center") || stack.includes("split")) {
      issues.push(
        issue(
          "hard_block",
          "vertical.side_by_side.center_opening_prohibited",
          { ...VERTICAL_GUIDE, page: 7 },
          { side_by_side: true, stack_option: text(configValue(context, "stack_option")) },
          "Do not butt a left-stack and right-stack blind to create a center opening; order separate same-orientation blinds.",
        ),
      );
    }
  }
  if (mount.includes("inside") && yes(configValue(context, "shims"))) {
    issues.push(
      issue(
        "hard_block",
        "vertical.shims.outside_mount_only",
        { ...VERTICAL_GUIDE, page: 12 },
        { mount_type: text(configValue(context, "mount_type")), shims: true },
        "Synchrony shims are available for outside mount only.",
      ),
    );
  }
  return issues;
}

function validateLotusFauxWood(
  context: SelectionContext,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const profile = lotusFauxWoodProgramProfile(context.programId);
  const source = {
    ...LOTUS_WEST_A26,
    ...(profile ? { page: profile.sourcePage } : {}),
  };
  const typedConfiguration =
    text(configValue(context, "lotus_configuration_version")) ===
    "lotus-faux-v2";

  if (!typedConfiguration) {
    issues.push(
      issue(
        "warning",
        "lotus.faux.configuration.legacy_untyped",
        source,
        { programId: context.programId },
        "This is a historical Lotus cost-evidence selection without the manufacturer-specific FLX V2 configuration contract. It remains non-sendable and must be reselected before customer use.",
      ),
    );
    return issues;
  }

  if (!profile) {
    issues.push(
      issue(
        "hard_block",
        "lotus.faux.program.required",
        source,
        { programId: context.programId },
        "Select an exact Lotus faux-wood source program before this configuration can be reviewed.",
      ),
    );
    return issues;
  }

  requireText(
    context,
    issues,
    "lotus.faux",
    [
      { key: "mount_type", label: "Mount type" },
      { key: "lotus_program_code", label: "Lotus program" },
      { key: "slat_size", label: "Slat size" },
      { key: "color", label: "Color" },
    ],
    source,
  );

  const exactFields = [
    ["lotus_program_code", profile.programCode],
    ["product_line", profile.programCode],
    ["slat_size", profile.slatSize],
    ["color", profile.color],
    ["lotus_finish", profile.finish],
  ] as const;
  for (const [field, expected] of exactFields) {
    const selected = text(configValue(context, field));
    if (!selected || normalizeIdentity(selected) === normalizeIdentity(expected)) {
      continue;
    }
    issues.push(
      issue(
        "hard_block",
        `lotus.faux.program.${field}_mismatch`,
        source,
        { [field]: selected, programId: profile.programId },
        `${profile.programCode} requires ${field.replaceAll("_", " ")} '${expected}'. Reselect the Lotus program instead of mixing manufacturer options.`,
      ),
    );
  }

  const mount = normalized(configValue(context, "mount_type"));
  if (
    mount &&
    !["inside mount", "outside mount", "side mount"].includes(mount)
  ) {
    issues.push(
      issue(
        "hard_block",
        "lotus.faux.mount.unsupported_input",
        source,
        { mount_type: text(configValue(context, "mount_type")) },
        "Lotus faux wood records only Inside Mount, Outside Mount, or Side Mount in this draft configuration route.",
      ),
    );
  }

  const blindCount = finiteNumber(
    configValue(context, "lotus_blind_count"),
  );
  if (blindCount !== 1 && blindCount !== 3) {
    issues.push(
      issue(
        "hard_block",
        "lotus.faux.blind_count.required",
        source,
        { lotus_blind_count: blindCount },
        "Select whether this original opening uses one blind or a three-blind split.",
      ),
    );
  }

  if (blindCount === 3) {
    const widths = numericArray(
      configValue(context, "lotus_blind_widths_inches"),
    );
    if (!widths || widths.length !== 3 || widths.some((width) => width <= 0)) {
      issues.push(
        issue(
          "hard_block",
          "lotus.faux.split.three_widths_required",
          source,
          {
            lotus_blind_count: blindCount,
            lotus_blind_widths_inches: widths,
          },
          "A three-blind Lotus opening requires the measured left, center, and right blind widths. The center width is never inferred.",
        ),
      );
    } else if (widths.some((width) => width > profile.maxWidth)) {
      issues.push(
        issue(
          "hard_block",
          "lotus.faux.split.component_width_exceeds_program",
          source,
          {
            lotus_blind_widths_inches: widths,
            max_component_width_inches: profile.maxWidth,
          },
          `${profile.programCode} accepts no component wider than ${profile.maxWidth} inches in the supplied dealer grid.`,
        ),
      );
    }
  }

  issues.push(
    issue(
      "warning",
      "lotus.faux.authority.needs_effective_date_and_fitment",
      source,
      {
        programId: profile.programId,
        mount_type: text(configValue(context, "mount_type")) || null,
      },
      "The supplied Lotus West A26.v1 book has no stated effective date, and this route does not claim manufacturer fitment approval. Keep the line internal and draft-only pending authority.",
    ),
  );
  return issues;
}

function validateNormanFauxWoodSplit(
  context: SelectionContext,
): ValidationIssue[] {
  if (
    text(configValue(context, "faux_configuration_version")) !==
    "faux-wood-v2"
  ) {
    return [];
  }
  const source: RuleSource = {
    sourceId: "norman-retail-guide-2026-07",
  };
  const issues: ValidationIssue[] = [];
  const blindCount = finiteNumber(configValue(context, "faux_blind_count"));
  if (blindCount !== 1 && blindCount !== 3) {
    issues.push(
      issue(
        "hard_block",
        "faux.blind_count.required",
        source,
        { faux_blind_count: blindCount },
        "Select whether this original opening uses one blind or a three-blind split.",
      ),
    );
  }
  if (blindCount === 3) {
    const widths = numericArray(
      configValue(context, "faux_blind_widths_inches"),
    );
    if (!widths || widths.length !== 3 || widths.some((width) => width <= 0)) {
      issues.push(
        issue(
          "hard_block",
          "faux.split.three_widths_required",
          source,
          {
            faux_blind_count: blindCount,
            faux_blind_widths_inches: widths,
          },
          "A three-blind faux-wood opening requires the measured left, center, and right blind widths. The center width is never inferred.",
        ),
      );
    }
  }
  return issues;
}

function validateNormanShutterFramePricing(
  context: SelectionContext,
): ValidationIssue[] {
  const resolution = resolveNormanShutterWindowSizePricing(context);
  if (!resolution.applicable || resolution.supported) return [];
  const selectedValues = {
    measurement_basis: configValue(context, "measurement_basis") ?? null,
    mount_type: configValue(context, "mount_type") ?? null,
    frame_type: configValue(context, "frame_type") ?? null,
    frame_sides: configValue(context, "frame_sides") ?? null,
  };
  const explanationByReason = {
    not_applicable: "The Norman shutter frame-pricing selection is incomplete.",
    invalid_dimensions: "Shutter width and height must be positive before frame pricing can be calculated.",
    missing_frame: "Window-size shutter pricing requires an exact Norman frame.",
    missing_frame_sides: "Window-size shutter pricing requires three or four framed sides.",
    mount_frame_mismatch: "The selected Norman frame is not valid for the selected mount type.",
    unsupported_frame: "The selected Norman frame has no source-backed window-size pricing addition.",
  } as const;
  const reason = resolution.reason ?? "unsupported_frame";
  return [
    issue(
      "hard_block",
      `norman.shutter.frame_pricing.${reason}`,
      NORMAN_SHUTTER_FRAME_PRICING,
      selectedValues,
      explanationByReason[reason],
    ),
  ];
}

export function productRuleStatusForSelection(context: SelectionContext): ProductRuleStatus {
  if (context.productId.startsWith("polar_")) return "manual_quote_required";
  if (context.productId === "vertical_honeycomb") return "manual_quote_required";
  // The pinned July 2026 Motorization Guide now supplies exact motor-family,
  // power, control, accessory, and size rules. Unsupported or incomplete
  // configurations remain fail-closed through structured hard blocks rather
  // than downgrading every motorized selection to a blanket product status.
  if (
    context.productId === "honeycomb" &&
    normalizeIdentity(text(configValue(context, "fabric_collection"))) === "whispers"
  ) {
    return "unavailable";
  }
  // A price book entry is not restriction evidence. Any newly added product
  // stays blocked until it receives an explicit V2 catalog status and rules.
  return QUOTE_V2_PRODUCT_STATUS[context.productId] ?? "restriction_source_incomplete";
}

export function validateSelection(context: SelectionContext): readonly ValidationIssue[] {
  const issues = validateCommon(context);
  switch (context.productId) {
    case "roller":
      issues.push(...validateRoller(context));
      break;
    case "roman":
      issues.push(...validateRoman(context));
      break;
    case "honeycomb":
      issues.push(...validateHoneycomb(context));
      issues.push(...validateHoneycombMatrix(context));
      break;
    case "vertical_honeycomb":
      issues.push(...validateHoneycomb(context));
      issues.push(...validateHoneycombMatrix(context));
      break;
    case "synchrony_vertical":
      issues.push(...validateSynchronyVertical(context));
      break;
    case "onyx_shutters":
      issues.push(...validateOnyxShutterRestrictions(context));
      break;
    case "norman_shutters":
      issues.push(...validateNormanShutterFramePricing(context));
      break;
    case "polar_elite_patio":
      issues.push(...validatePolarExteriorConfiguration(context));
      issues.push(...validatePolarElitePortalConflict(context));
      break;
    case "polar_titan_patio":
    case "polar_mega_exterior":
      issues.push(...validatePolarExteriorConfiguration(context));
      break;
    case "polar_interior_roller":
      issues.push(...validatePolarInteriorConfiguration(context));
      break;
    case "polar_drapery_track":
      issues.push(...validatePolarDraperyConfiguration(context));
      break;
    case "polar_awning_premium_pro":
    case "polar_awning_premium_plus":
    case "polar_awning_premium":
    case "polar_awning_select":
    case "polar_awning_drop_arm":
      issues.push(...validatePolarAwningConfiguration(context));
      break;
    case "lotus_faux_wood_blinds":
      issues.push(...validateLotusFauxWood(context));
      break;
    case "smartprivacy_faux":
    case "faux_wood":
      issues.push(...validateNormanFauxWoodSplit(context));
      break;
    default:
      break;
  }
  return issues;
}

export const quoteV2RuleTestHelpers = {
  configValue,
  optionValue,
  values,
};
