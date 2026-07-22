import type { TechnicalMeasureForm, TechnicalMeasureLine } from "@/lib/crm/technical-measures";

export const NORMAN_ROLLER_ADAPTER_VERSION = "2026-07-22.1";

export const NORMAN_ROLLER_PORTAL_SEQUENCE = [
  "header.lead_time",
  "header.po_number",
  "header.po_date",
  "header.side_mark",
  "header.ship_via",
  "header.ship_to_profile",
  "header.delivery_flags",
  "line.room",
  "line.window_type",
  "line.measurements",
  "line.mount_type",
  "line.installation_location",
  "line.shade_type",
  "line.compound_dimensions",
  "line.fabric_type",
  "line.fabric_collection",
  "line.fabric_color",
  "line.fabric_rules",
  "line.lightguard_360",
  "line.lift_system",
  "line.lift_accessories",
  "line.valance",
  "line.valance_details",
  "line.brackets_and_hardware",
  "line.chain_details",
  "line.hem_bar",
  "line.light_guard",
  "line.quantity",
  "line.special_instructions",
  "line.accessories",
] as const;

export type NormanRollerPortalStep = (typeof NORMAN_ROLLER_PORTAL_SEQUENCE)[number];

export type NormanRollerProfile = {
  accountId: string;
  leadTimeCode: "09" | "14";
  shipViaCode: "B1" | "20";
  shipToProfileId: string;
  deliveryFlags?: {
    callBeforeDelivery?: boolean;
    residential?: boolean;
    smallTruck?: boolean;
    liftgate?: boolean;
    insideDelivery?: boolean;
  };
};

export type NormanRollerDraftIssue = {
  code: string;
  field: string;
  message: string;
  lineId?: string;
};

export type NormanRollerDraftLine = {
  lineId: string;
  sourceDesignId: string;
  sequence: number;
  room: string;
  widthEighths: number;
  lengthEighths: number;
  quantity: number;
  mountCode: "I" | "O";
  installationCode: "N" | "Y";
  shadeTypeCode: "1" | "2" | "4" | "5" | "6";
  liftCode: "L" | "N" | "Y";
  valanceCode: "" | "V000" | "F001" | "F002" | "F009" | "F010" | "F011" | "F014" | "F017" | "MOD" | "F013";
  fabric: { type: string; collection: string; colorCode: string; colorName: string | null };
  hemBarCode: "HB001" | "HB002" | "HB005" | "HB004";
  motorCode: "MT018" | "MT019" | "MT025" | "MT030" | "MT031" | "MT026" | "MT023" | "MT028" | null;
  chainCode: "CT001" | "CT002" | "CT003" | null;
  smartRelease: boolean;
  specialInstructions: string;
};

export type NormanRollerDraftPlan = {
  adapter: "norman_roller";
  adapterVersion: string;
  safety: "saved_draft_only";
  source: { formId: string; quoteId: string; submittedAt: string | null };
  header: {
    accountId: string;
    leadTimeCode: "09" | "14";
    poNumber: string;
    poDate: string;
    sideMark: string;
    shipViaCode: "B1" | "20";
    shipToProfileId: string;
    deliveryFlags: Required<NonNullable<NormanRollerProfile["deliveryFlags"]>>;
  } | null;
  portalSequence: readonly NormanRollerPortalStep[];
  lines: NormanRollerDraftLine[];
  issues: NormanRollerDraftIssue[];
  ready: boolean;
};

const MOUNT_CODES = new Map<string, "I" | "O">([
  ["inside mount", "I"],
  ["inside", "I"],
  ["i", "I"],
  ["outside mount", "O"],
  ["outside", "O"],
  ["o", "O"],
]);

const SHADE_TYPE_CODES = new Map<string, NormanRollerDraftLine["shadeTypeCode"]>([
  ["single shade", "1"],
  ["standard", "1"],
  ["1", "1"],
  ["coupled shades", "2"],
  ["coupled", "2"],
  ["2", "2"],
  ["dual shades", "5"],
  ["dual rollers", "5"],
  ["dual", "5"],
  ["5", "5"],
  ["common valance", "4"],
  ["4", "4"],
  ["lightguard 360 with t-post", "6"],
  ["lightguard 360™ with t-post", "6"],
  ["lightguard_360_t_post", "6"],
  ["6", "6"],
]);

const LIFT_CODES = new Map<string, NormanRollerDraftLine["liftCode"]>([
  ["precisionlift cordless", "L"],
  ["precisionlift™ cordless", "L"],
  ["cordless", "L"],
  ["l", "L"],
  ["continuous cord loop", "N"],
  ["n", "N"],
  ["smart release", "N"],
  ["smartrelease", "N"],
  ["motorized", "Y"],
  ["y", "Y"],
]);

const VALANCE_CODES = new Map<string, NormanRollerDraftLine["valanceCode"]>([
  ["no valance", ""],
  ["none", ""],
  ["no valance; will order separately", "V000"],
  ["square fascia", "F001"],
  ["plain curved fascia", "F002"],
  ["curved fascia with fabric", "F009"],
  ['3 1/2" fabric valance', "F010"],
  ['4 1/2" fabric valance', "F011"],
  ['6" fabric valance', "F014"],
  ['8" fabric valance', "F017"],
  ['4 1/2" modern wood valance', "MOD"],
  ["cassette", "F013"],
]);

const HEM_BAR_CODES = new Map<string, NormanRollerDraftLine["hemBarCode"]>([
  ["plain", "HB001"],
  ["external", "HB002"],
  ["exposed metal", "HB002"],
  ["fabric-wrapped", "HB005"],
  ["fabric wrapped", "HB005"],
  ["fabric covered", "HB005"],
  ["brushed ebony finish", "HB004"],
]);

const MOTOR_CODES = new Map<string, NonNullable<NormanRollerDraftLine["motorCode"]>>([
  ["rechargeable battery with wireless charging wand", "MT018"],
  ["rechargeable battery with wired charging wand", "MT019"],
  ["rechargeable battery with ac adapter charger", "MT025"],
  ["dc low voltage hard wire", "MT030"],
  ["ac adapter plug-in", "MT031"],
  ["autowand", "MT026"],
  ["automate home li-ion arc motor (rechargeable)", "MT023"],
  ["automate home li-ion arc rechargeable", "MT023"],
  ["automate home 12v low voltage dc motor", "MT028"],
]);

const CHAIN_CODES = new Map<string, NonNullable<NormanRollerDraftLine["chainCode"]>>([
  ["plastic", "CT001"],
  ["stainless steel chain", "CT002"],
  ["cordloop with stainless steel chain", "CT003"],
]);

function normalized(value: unknown) {
  return String(value ?? "").trim().replace(/\*/g, "").replace(/\s+/g, " ").toLowerCase();
}

function detail(line: TechnicalMeasureLine, key: string) {
  const value = line.current_values.details[key];
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? String(value).trim() : "";
}

function issue(issues: NormanRollerDraftIssue[], line: TechnicalMeasureLine | null, code: string, field: string, message: string) {
  issues.push({ code, field, message, ...(line ? { lineId: line.id } : {}) });
}

function mapped<T>(
  issues: NormanRollerDraftIssue[],
  line: TechnicalMeasureLine,
  field: string,
  raw: unknown,
  values: Map<string, T>,
): T | null {
  const key = normalized(raw);
  if (!key) {
    issue(issues, line, "missing_required_field", field, `${line.current_values.room}: ${field.replaceAll("_", " ")} is required.`);
    return null;
  }
  const value = values.get(key);
  if (value === undefined) {
    issue(issues, line, "unmapped_portal_value", field, `${line.current_values.room}: ${String(raw)} is not a verified Norman value.`);
    return null;
  }
  return value;
}

function eighths(issues: NormanRollerDraftIssue[], line: TechnicalMeasureLine, field: "width_in" | "height_in") {
  const value = line.current_values[field];
  if (!value || value <= 0) {
    issue(issues, line, "missing_measurement", field, `${line.current_values.room}: ${field === "width_in" ? "width" : "height"} is required.`);
    return null;
  }
  const units = value * 8;
  if (!Number.isInteger(units)) {
    issue(issues, line, "unsupported_fraction", field, `${line.current_values.room}: Norman Roller measurements must be on a 1/8-inch increment.`);
    return null;
  }
  return units;
}

function buildLine(line: TechnicalMeasureLine, sequence: number, issues: NormanRollerDraftIssue[]): NormanRollerDraftLine | null {
  const values = line.current_values;
  if (values.product_id !== "roller") {
    issue(issues, line, "unsupported_product", "product_id", `${values.room}: Norman Roller phase one only accepts Roller Shade lines.`);
  }
  if (line.price_status !== "ok") issue(issues, line, "invalid_price_status", "price_status", `${values.room}: pricing must be valid before ordering.`);
  if (!values.design_id || values.design_id !== line.baseline.design_id) {
    issue(issues, line, "signed_design_mismatch", "design_id", `${values.room}: measured design does not match the signed design snapshot.`);
  }
  if (normalized(detail(line, "supplier")) !== "norman") {
    issue(issues, line, "wrong_supplier", "supplier", `${values.room}: supplier must be Norman.`);
  }

  const widthEighths = eighths(issues, line, "width_in");
  const lengthEighths = eighths(issues, line, "height_in");
  const mountCode = mapped(issues, line, "mount_type", detail(line, "mount_type"), MOUNT_CODES);
  const shadeTypeCode = mapped(issues, line, "shade_type", detail(line, "shade_type"), SHADE_TYPE_CODES);
  const liftRaw = detail(line, "lift_system");
  const liftCode = mapped(issues, line, "lift_system", liftRaw, LIFT_CODES);
  const valanceCode = mapped(issues, line, "valance", detail(line, "valance"), VALANCE_CODES);
  const hemBarCode = mapped(issues, line, "hem_bar", detail(line, "hem_bar"), HEM_BAR_CODES);
  const installationRaw = normalized(detail(line, "installation_location"));
  const installationCode = installationRaw === "window" || installationRaw === "n" ? "N" : installationRaw === "door" || installationRaw === "y" ? "Y" : null;
  if (!installationCode) issue(issues, line, "missing_required_field", "installation_location", `${values.room}: window or door installation is required.`);
  const windowType = normalized(detail(line, "window_type"));
  if (windowType !== "single") issue(issues, line, windowType ? "unsupported_configuration" : "missing_required_field", "window_type", `${values.room}: phase one requires an explicit Single window type.`);

  const fabricType = detail(line, "fabric_color_type");
  const fabricCollection = detail(line, "fabric_color_collection") || values.fabric || "";
  const fabricColorCode = detail(line, "fabric_color_code");
  const fabricColorName = detail(line, "fabric_color_name") || null;
  if (!fabricType) issue(issues, line, "missing_required_field", "fabric_color_type", `${values.room}: exact Norman fabric type is required.`);
  if (!fabricCollection) issue(issues, line, "missing_required_field", "fabric_color_collection", `${values.room}: exact Norman fabric collection is required.`);
  if (!fabricColorCode) issue(issues, line, "missing_required_field", "fabric_color_code", `${values.room}: exact Norman fabric color code is required.`);

  let motorCode: NormanRollerDraftLine["motorCode"] = null;
  if (liftCode === "Y") motorCode = mapped(issues, line, "motor_type", detail(line, "motor_type"), MOTOR_CODES);

  const smartRelease = normalized(liftRaw) === "smart release" || normalized(liftRaw) === "smartrelease" || normalized(detail(line, "cord_loop_release")) === "smart release";
  let chainCode: NormanRollerDraftLine["chainCode"] = null;
  if (liftCode === "N") {
    chainCode = mapped(issues, line, "chain_type", detail(line, "chain_type"), CHAIN_CODES);
    if (!detail(line, "control_side")) issue(issues, line, "missing_required_field", "control_side", `${values.room}: chain control side is required.`);
    if (!detail(line, "chain_length_type")) issue(issues, line, "missing_required_field", "chain_length_type", `${values.room}: chain length type is required.`);
  }
  if (shadeTypeCode && shadeTypeCode !== "1") {
    issue(issues, line, "unsupported_configuration", "shade_type", `${values.room}: ${detail(line, "shade_type")} requires a later Norman Roller adapter phase.`);
  }

  if (
    widthEighths === null || lengthEighths === null || !mountCode || !shadeTypeCode || !liftCode ||
    valanceCode === null || !hemBarCode || !installationCode || !fabricType || !fabricCollection || !fabricColorCode ||
    !values.design_id
  ) return null;

  return {
    lineId: line.id,
    sourceDesignId: values.design_id,
    sequence,
    room: values.room,
    widthEighths,
    lengthEighths,
    quantity: values.quantity,
    mountCode,
    installationCode,
    shadeTypeCode,
    liftCode,
    valanceCode,
    fabric: { type: fabricType, collection: fabricCollection, colorCode: fabricColorCode, colorName: fabricColorName },
    hemBarCode,
    motorCode,
    chainCode,
    smartRelease,
    specialInstructions: values.notes,
  };
}

export function buildNormanRollerDraftPlan(
  form: TechnicalMeasureForm,
  profile: NormanRollerProfile,
  now = new Date(),
): NormanRollerDraftPlan {
  const issues: NormanRollerDraftIssue[] = [];
  if (form.status !== "submitted") issue(issues, null, "measure_not_submitted", "status", "The technical measure must be submitted before a Norman draft is prepared.");
  if (!form.submitted_at) issue(issues, null, "missing_submission_timestamp", "submitted_at", "The submitted measure needs an immutable submission timestamp.");
  if (!profile.accountId.trim()) issue(issues, null, "missing_profile", "account_id", "A Norman dealer account profile is required.");
  if (!profile.shipToProfileId.trim()) issue(issues, null, "missing_profile", "ship_to_profile_id", "A Norman ship-to profile is required.");

  const poNumber = form.quote_snapshot.quoteNumber?.trim() || "";
  const sideMark = form.customer_snapshot.name.trim();
  if (!poNumber) issue(issues, null, "missing_required_field", "po_number", "Quote number is required for the Norman PO number.");
  if (!sideMark) issue(issues, null, "missing_required_field", "side_mark", "Customer name is required for the Norman side mark.");

  const orderedLines = [...form.lines].sort((left, right) => left.sort_order - right.sort_order || left.quote_line_item_id.localeCompare(right.quote_line_item_id));
  if (!orderedLines.length) issue(issues, null, "missing_lines", "lines", "The submitted measure contains no orderable lines.");
  const lines = orderedLines.map((line, index) => buildLine(line, index + 1, issues)).filter((line): line is NormanRollerDraftLine => Boolean(line));
  const flags = profile.deliveryFlags || {};
  const header = poNumber && sideMark && profile.accountId.trim() && profile.shipToProfileId.trim() ? {
    accountId: profile.accountId,
    leadTimeCode: profile.leadTimeCode,
    poNumber,
    poDate: now.toISOString().slice(0, 10),
    sideMark,
    shipViaCode: profile.shipViaCode,
    shipToProfileId: profile.shipToProfileId,
    deliveryFlags: {
      callBeforeDelivery: flags.callBeforeDelivery ?? false,
      residential: flags.residential ?? false,
      smallTruck: flags.smallTruck ?? false,
      liftgate: flags.liftgate ?? false,
      insideDelivery: flags.insideDelivery ?? false,
    },
  } : null;

  return {
    adapter: "norman_roller",
    adapterVersion: NORMAN_ROLLER_ADAPTER_VERSION,
    safety: "saved_draft_only",
    source: { formId: form.id, quoteId: form.quote_id, submittedAt: form.submitted_at },
    header,
    portalSequence: NORMAN_ROLLER_PORTAL_SEQUENCE,
    lines,
    issues,
    ready: issues.length === 0 && header !== null && lines.length === orderedLines.length,
  };
}
