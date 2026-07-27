import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { selectedDesign } from "@/lib/crm/quote-builder";
import type {
  CrmQuote,
  CrmQuoteDesign,
  CrmQuoteDetailValue,
  CrmQuoteLineItem,
  CrmQuoteWithItems,
} from "@/lib/crm/types";
import type {
  TechnicalMeasureForm,
  TechnicalMeasureLineValues,
} from "@/lib/crm/technical-measures";

export const ONYX_PACKET_SCHEMA_VERSION = "onyx-agent-order-packet.v3" as const;

export type OnyxPortalMaterial = "Bassia" | "Sycamore" | "Vinyl" | "VLO" | "Ash";
export type OnyxOrderFormKey =
  | "onyx_painted_basswood_v1"
  | "onyx_stained_basswood_v1"
  | "onyx_sycamore_v1"
  | "onyx_vinyl_v1"
  | "onyx_vlo_hybrid_v1"
  | "onyx_us_made_vinyl_v1"
  | "onyx_poly_composite_v1"
  | "onyx_ash_v1"
  | "onyx_unmapped_v1";

export type OnyxOrderFormDefinition = {
  orderFormKey: OnyxOrderFormKey;
  quoteProgramKey: string;
  displayName: string;
  portalMaterial: OnyxPortalMaterial | null;
  mappingStatus: "verified" | "portal_mapping_required";
};

export const ONYX_ORDER_FORM_REGISTRY: Record<string, OnyxOrderFormDefinition> = {
  painted_basswood: {
    orderFormKey: "onyx_painted_basswood_v1",
    quoteProgramKey: "painted_basswood",
    displayName: "Painted Basswood",
    portalMaterial: "Bassia",
    mappingStatus: "verified",
  },
  stained_basswood: {
    orderFormKey: "onyx_stained_basswood_v1",
    quoteProgramKey: "stained_basswood",
    displayName: "Stained Basswood",
    portalMaterial: "Bassia",
    mappingStatus: "verified",
  },
  secamore: {
    orderFormKey: "onyx_sycamore_v1",
    quoteProgramKey: "secamore",
    displayName: "Sycamore",
    portalMaterial: "Sycamore",
    mappingStatus: "verified",
  },
  sycamore: {
    orderFormKey: "onyx_sycamore_v1",
    quoteProgramKey: "sycamore",
    displayName: "Sycamore",
    portalMaterial: "Sycamore",
    mappingStatus: "verified",
  },
  vinyl: {
    orderFormKey: "onyx_vinyl_v1",
    quoteProgramKey: "vinyl",
    displayName: "Vinyl",
    portalMaterial: "Vinyl",
    mappingStatus: "verified",
  },
  vlo_hybrid: {
    orderFormKey: "onyx_vlo_hybrid_v1",
    quoteProgramKey: "vlo_hybrid",
    displayName: "VLO Hybrid",
    portalMaterial: "VLO",
    mappingStatus: "verified",
  },
  onyx_us_made_vinyl: {
    orderFormKey: "onyx_us_made_vinyl_v1",
    quoteProgramKey: "onyx_us_made_vinyl",
    displayName: "Onyx US Made Vinyl",
    portalMaterial: null,
    mappingStatus: "portal_mapping_required",
  },
  poly_composite: {
    orderFormKey: "onyx_poly_composite_v1",
    quoteProgramKey: "poly_composite",
    displayName: "Poly Composite",
    portalMaterial: null,
    mappingStatus: "portal_mapping_required",
  },
  ash: {
    orderFormKey: "onyx_ash_v1",
    quoteProgramKey: "ash",
    displayName: "Ash",
    portalMaterial: "Ash",
    mappingStatus: "verified",
  },
};

export type OnyxOrderSourceKind = "signed_contract" | "submitted_technical_measure";

type NullableDimension = { whole: number; fraction: string } | null;

export type OnyxOrderSourceLine = {
  lineId: string;
  sourceOpeningId: string;
  sourceQuoteLineItemId: string;
  sourceQuantityIndex: number;
  sortOrder: number;
  values: TechnicalMeasureLineValues;
};

export type OnyxPacketContext = {
  sourceKind: OnyxOrderSourceKind;
  sourceId: string;
  contractId: string | null;
  technicalMeasureId: string | null;
  jobId: string;
  quoteId: string;
  quoteNumber: string | null;
  generatedAt: string;
  customerId: string | null;
  customerName: string;
  customerPhone: string | null;
  customerEmail: string | null;
  jobsiteAddress: string | null;
  jobNotes: string;
  holdForTechnicalMeasure?: boolean;
};

export type OnyxAgentOrderPacket = {
  schemaVersion: typeof ONYX_PACKET_SCHEMA_VERSION;
  manufacturerKey: "onyx";
  productFamilyKey: "shutters";
  orderFormKey: OnyxOrderFormKey;
  quoteProgramKey: string;
  productDisplayName: string;
  portalMaterial: OnyxPortalMaterial | null;
  portalMappingStatus: "verified" | "portal_mapping_required";
  portalVerifiedOn: "2026-07-27";
  packetId: string;
  status: "READY" | "BLOCKED" | "AWAITING_TECHNICAL_MEASURE";
  blockingIssues: string[];
  allowedAction: "draft_entry_only";
  source: {
    kind: OnyxOrderSourceKind;
    sourceId: string;
    contractId: string | null;
    technicalMeasureId: string | null;
    jobId: string;
    quoteId: string;
    quoteNumber: string | null;
    generatedAt: string;
    customerId: string | null;
    customerName: string;
    customerPhone: string | null;
    customerEmail: string | null;
    jobsiteAddress: string | null;
    jobNotes: string;
  };
  header: {
    materialCategory: OnyxPortalMaterial | null;
    sideMark: string;
    poNumber: string | null;
    rushOrder: boolean;
    orderNote: string;
    shipToName: "Bill to";
    shipNote: string;
    portalDateCheck: "VERIFY IN LIVE ONYX PORTAL";
    portalShipViaCheck: "VERIFY IN LIVE ONYX PORTAL";
  };
  lines: Array<{
    lineNumber: number;
    sourceOpeningId: string;
    sourceQuoteLineItemId: string;
    sourceQuantityIndex: number;
    portalLineQuantity: 1;
    compatibilityVerification: "matrix_verified";
    material: string | null;
    shutterType: string | null;
    frameType: string | null;
    widthType: "Window Size" | "Finish Size" | null;
    frameNo: string | null;
    color: string | null;
    louver: string | null;
    hingeColor: string | null;
    stile: "Astragal" | "Rabbet" | null;
    tiltRod: string | null;
    libertyArch: boolean;
    otherOptions: string[];
    room: string;
    widthA: NullableDimension;
    heightB: NullableDimension;
    panelConfig: string | null;
    itemNote: string;
    windowType: string | null;
    dividerRail: string | null;
    dividerPosition: NullableDimension;
    dividerExactPosition: boolean | null;
    splitTiltRod: string | null;
    splitPosition: NullableDimension;
    scribe: boolean;
    extension: boolean;
    doubleHung: boolean;
    motor: boolean;
    frenchDoor: Record<string, unknown> | null;
    specialtyReference: Record<string, unknown> | null;
  }>;
  attachments: Array<Record<string, unknown>>;
};

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function booleanValue(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  const normalized = text(value).toLowerCase();
  if (["yes", "true", "1", "on"].includes(normalized)) return true;
  if (["no", "false", "0", "off", "none"].includes(normalized)) return false;
  return null;
}

function dimension(value: unknown): NullableDimension {
  const parsed = numberValue(value);
  if (parsed === null || parsed <= 0) return null;
  const sixteenths = Math.round(parsed * 16);
  const remainder = sixteenths % 16;
  const fractions = [
    "",
    "1/16",
    "1/8",
    "3/16",
    "1/4",
    "5/16",
    "3/8",
    "7/16",
    "1/2",
    "9/16",
    "5/8",
    "11/16",
    "3/4",
    "13/16",
    "7/8",
    "15/16",
  ];
  return { whole: Math.floor(sixteenths / 16), fraction: fractions[remainder] };
}

function detailRecord(design: CrmQuoteDesign): Record<string, CrmQuoteDetailValue> {
  const details = { ...(design.details || {}) };
  const priceBreakdown = object(design.price_breakdown);
  const legacyDetails = priceBreakdown.details;
  if (Array.isArray(legacyDetails)) {
    for (const item of legacyDetails) {
      const row = object(item);
      const key = text(row.label)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_|_$/g, "");
      if (key && !Object.prototype.hasOwnProperty.call(details, key)) {
        details[key] = text(row.value);
      }
    }
  }
  for (const [key, value] of Object.entries(object(priceBreakdown.optionsJson))) {
    if (
      !Object.prototype.hasOwnProperty.call(details, key)
      && (value === null || ["string", "number", "boolean"].includes(typeof value))
    ) {
      details[key] = value as CrmQuoteDetailValue;
    }
  }
  return details;
}

function quoteLineValues(line: CrmQuoteLineItem, design: CrmQuoteDesign): TechnicalMeasureLineValues {
  return {
    design_id: design.id,
    room: line.room || "Window",
    opening_label: "",
    width_in: line.width_in,
    height_in: line.height_in,
    quantity: 1,
    notes: line.notes || design.notes || "",
    product_id: design.product_id,
    program_id: design.program_id,
    fabric: design.fabric,
    details: detailRecord(design),
    motorization: design.motorization || [],
    surcharges: design.surcharges || [],
    discount_percent: Number(line.discount_percent) || 0,
  };
}

function signedLineIds(quote: Pick<CrmQuote, "meta">): Set<string> | null {
  const ids = object(object(quote.meta).signed_selection).lineItemIds;
  return Array.isArray(ids)
    ? new Set(ids.filter((id): id is string => typeof id === "string"))
    : null;
}

export function isOnyxShutterValues(values: TechnicalMeasureLineValues): boolean {
  const manufacturer = text(
    values.details.supplier
    ?? values.details.manufacturer
    ?? values.details.catalog_manufacturer,
  ).toLowerCase();
  return values.product_id === "onyx_shutters"
    || (values.product_id.toLowerCase().includes("shutter") && manufacturer.includes("onyx"));
}

export function onyxLinesFromSignedContract(quote: CrmQuoteWithItems): OnyxOrderSourceLine[] {
  const selectedIds = signedLineIds(quote);
  const result: OnyxOrderSourceLine[] = [];
  let sortOrder = 0;
  for (const line of quote.lineItems) {
    if (selectedIds && !selectedIds.has(line.id)) continue;
    const design = selectedDesign(line);
    if (!design) continue;
    const values = quoteLineValues(line, design);
    if (!isOnyxShutterValues(values)) continue;
    const quantity = Math.max(1, Math.floor(Number(line.quantity) || 1));
    for (let quantityIndex = 1; quantityIndex <= quantity; quantityIndex += 1) {
      result.push({
        lineId: `${line.id}:${quantityIndex}`,
        sourceOpeningId: `${line.id}:${quantityIndex}`,
        sourceQuoteLineItemId: line.id,
        sourceQuantityIndex: quantityIndex,
        sortOrder: sortOrder++,
        values,
      });
    }
  }
  return result;
}

export function onyxLinesFromTechnicalMeasure(form: TechnicalMeasureForm): OnyxOrderSourceLine[] {
  return form.lines
    .filter((line) => isOnyxShutterValues(line.current_values))
    .flatMap((line) => {
      const quantity = Math.max(1, Math.floor(Number(line.current_values.quantity) || 1));
      return Array.from({ length: quantity }, (_, offset) => ({
        lineId: quantity === 1 ? line.id : `${line.id}:${offset + 1}`,
        sourceOpeningId: quantity === 1 ? line.id : `${line.id}:${offset + 1}`,
        sourceQuoteLineItemId: line.source_quote_line_item_id || line.quote_line_item_id,
        sourceQuantityIndex: line.source_quantity_index || offset + 1,
        sortOrder: line.sort_order * 1000 + offset,
        values: { ...line.current_values, quantity: 1 },
      }));
    })
    .sort((left, right) => left.sortOrder - right.sortOrder);
}

function material(details: Record<string, CrmQuoteDetailValue>, programId: string | null): OnyxPortalMaterial | null {
  const explicit = text(details.portal_material ?? details.material);
  const candidate = explicit || text(programId);
  const normalized = candidate.toLowerCase().replace(/[^a-z0-9]+/g, "_");
  if (/sycamore|secamore/.test(normalized)) return "Sycamore";
  if (/basswood|bassia/.test(normalized)) return "Bassia";
  if (normalized === "vinyl") return "Vinyl";
  if (/^vlo|mdf_hybrid/.test(normalized)) return "VLO";
  if (normalized === "ash") return "Ash";
  return null;
}

function normalizedProgramKey(value: string | null): string {
  return text(value).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

export function onyxOrderFormDefinition(
  values: TechnicalMeasureLineValues,
): OnyxOrderFormDefinition {
  const programKey = normalizedProgramKey(values.program_id);
  const registered = ONYX_ORDER_FORM_REGISTRY[programKey];
  if (registered) return registered;
  const explicitProductKey = normalizedProgramKey(
    text(values.details?.quote_program)
    || text(values.details?.material),
  );
  const explicitProduct = ONYX_ORDER_FORM_REGISTRY[explicitProductKey];
  if (explicitProduct) return explicitProduct;
  const explicitMaterial = material(values.details || {}, values.program_id);
  if (explicitMaterial) {
    const fallbackKey = explicitMaterial.toLowerCase();
    return ONYX_ORDER_FORM_REGISTRY[fallbackKey]
      || {
        orderFormKey: "onyx_unmapped_v1",
        quoteProgramKey: programKey || "unmapped",
        displayName: text(values.program_id) || explicitMaterial,
        portalMaterial: explicitMaterial,
        mappingStatus: "verified",
      };
  }
  return {
    orderFormKey: "onyx_unmapped_v1",
    quoteProgramKey: programKey || "unmapped",
    displayName: text(values.program_id) || "Unmapped Onyx Product",
    portalMaterial: null,
    mappingStatus: "portal_mapping_required",
  };
}

function widthType(value: unknown): "Window Size" | "Finish Size" | null {
  const normalized = text(value).toLowerCase();
  if (normalized === "w - window size" || normalized === "window size") return "Window Size";
  if (
    normalized === "f - frame to frame"
    || normalized === "finish size"
    || normalized === "frame to frame"
  ) return "Finish Size";
  return null;
}

function frameNumber(details: Record<string, CrmQuoteDetailValue>): string | null {
  const explicit = text(details.frame_no);
  if (explicit) return explicit;
  const sides = text(details.frame_sides);
  if (sides === "4") return "4 side";
  if (sides === "3") return "3 side";
  if (sides === "2") return "2 side";
  return null;
}

function louver(value: unknown): string | null {
  const normalized = text(value).replace(/"/g, "").replace(/\s+/g, " ");
  const match = normalized.match(/(2 1\/2|3 1\/2|4 1\/2|5 1\/2)/);
  return match?.[1] || null;
}

function hingeColor(value: unknown): string | null {
  const normalized = text(value).toLowerCase();
  const values: Record<string, string> = {
    match: "Paint to Match",
    "paint to match": "Paint to Match",
    white: "White",
    cream: "Cream",
    "anti-brass": "Antique Brass",
    "antique brass": "Antique Brass",
    "bri-brass": "Bright Brass",
    "bright brass": "Bright Brass",
    nickel: "Nickle",
    nickle: "Nickle",
    black: "Black",
  };
  return values[normalized] || null;
}

function tiltRod(value: unknown): string | null {
  const normalized = text(value).toLowerCase();
  if (/^c\\b|front center|center tilt/.test(normalized)) return "Center";
  if (/^h1\\b|notch on stile/.test(normalized)) return "Hidden1 (Notch on Stile)";
  if (/^h2\\b|notch on louver/.test(normalized)) return "Hidden2 (Notch on Louver)";
  if (/^h3\\b|hidden.*stile/.test(normalized)) return "Hidden3";
  if (/offset/.test(normalized)) return "Off Set";
  return null;
}

function required(
  issues: string[],
  lineNumber: number,
  field: string,
  value: unknown,
): void {
  if (value === null || value === undefined || value === "") {
    issues.push(`Line ${lineNumber}: ${field} is required for Onyx ordering.`);
  }
}

function optionalCustomDimension(details: Record<string, CrmQuoteDetailValue>, key: string): NullableDimension {
  return dimension(details[key]);
}

function packetLine(
  source: OnyxOrderSourceLine,
  lineNumber: number,
  issues: string[],
  definition: OnyxOrderFormDefinition,
) {
  const values = source.values;
  const details = values.details || {};
  const explicitMaterial = material(details, null);
  const mappedMaterial = explicitMaterial || definition.portalMaterial;
  if (
    definition.portalMaterial
    && explicitMaterial
    && explicitMaterial !== definition.portalMaterial
  ) {
    issues.push(
      `Line ${lineNumber}: explicit Onyx material ${explicitMaterial} conflicts with ${definition.displayName} routing (${definition.portalMaterial}).`,
    );
  }
  if (definition.mappingStatus === "portal_mapping_required" && !explicitMaterial) {
    issues.push(
      `Line ${lineNumber}: ${definition.displayName} does not have a verified Onyx portal material mapping.`,
    );
  }
  const shutterType = text(details.onyx_order_type ?? details.shutter_type) || null;
  const frameType = text(details.frame_type) || null;
  const mappedWidthType = widthType(details.size_type ?? details.width_type);
  const frameNo = frameNumber(details);
  const color = text(details.color) || null;
  const mappedLouver = louver(details.louver_size ?? details.louver_size_inches);
  const mappedHingeColor = hingeColor(details.hinge_color);
  const astragal = booleanValue(details.astragal);
  const stile: "Astragal" | "Rabbet" | null = astragal === true
    ? "Astragal"
    : astragal === false
      ? "Rabbet"
      : null;
  const mappedTiltRod = tiltRod(details.tilt_type ?? details.tilt ?? details.tilt_rod);
  const widthA = dimension(values.width_in);
  const heightB = dimension(values.height_in);
  const panelConfig = text(details.panel_config ?? details.panel_configuration) || null;
  const windowType = text(details.window_type) || null;
  const dividerRail = text(details.divider_rail) || null;
  const splitTilt = text(details.split_tilt_rod) || null;

  for (const [field, value] of [
    ["material", mappedMaterial],
    ["shutter type", shutterType],
    ["frame type", frameType],
    ["width type", mappedWidthType],
    ["frame sides", frameNo],
    ["color", color],
    ["louver", mappedLouver],
    ["hinge color", mappedHingeColor],
    ["stile / astragal", stile],
    ["tilt rod", mappedTiltRod],
    ["width", widthA],
    ["height", heightB],
    ["panel configuration", panelConfig],
    ["window type", windowType],
    ["divider rail", dividerRail],
    ["split tilt rod", splitTilt],
  ] as const) {
    required(issues, lineNumber, field, value);
  }

  const dividerCustom = dividerRail?.toLowerCase() === "custom";
  const splitCustom = splitTilt?.toLowerCase() === "custom";
  const dividerPosition = dividerCustom
    ? optionalCustomDimension(details, "divider_position_inches")
    : null;
  const splitPosition = splitCustom
    ? optionalCustomDimension(details, "split_position_inches")
    : null;
  if (dividerCustom) required(issues, lineNumber, "custom divider position", dividerPosition);
  if (splitCustom) required(issues, lineNumber, "custom split-tilt position", splitPosition);

  const specialty = text(details.specialty_shape);
  const isFrenchDoor = /french door/i.test(shutterType || "");
  const frenchDoor = isFrenchDoor
    ? {
        cutOut: text(details.french_door_cutout) || null,
        flatMountingArea: numberValue(details.flat_mounting_area_inches),
        hardwareClearance: numberValue(details.hardware_clearance_inches),
        handleCenterFromBottom: numberValue(details.handle_center_from_bottom_inches),
        lockCenterFromBottom: numberValue(details.lock_center_from_bottom_inches),
      }
    : null;
  if (isFrenchDoor) {
    required(issues, lineNumber, "French-door cut-out selection", frenchDoor?.cutOut);
    required(issues, lineNumber, "flat mounting area", frenchDoor?.flatMountingArea);
    required(issues, lineNumber, "hardware clearance", frenchDoor?.hardwareClearance);
  }

  return {
    lineNumber,
    sourceOpeningId: source.sourceOpeningId,
    sourceQuoteLineItemId: source.sourceQuoteLineItemId,
    sourceQuantityIndex: source.sourceQuantityIndex,
    portalLineQuantity: 1 as const,
    compatibilityVerification: "matrix_verified" as const,
    material: mappedMaterial,
    shutterType,
    frameType,
    widthType: mappedWidthType,
    frameNo,
    color,
    louver: mappedLouver,
    hingeColor: mappedHingeColor,
    stile,
    tiltRod: mappedTiltRod,
    libertyArch: /liberty_arch/.test(specialty),
    otherOptions: [
      booleanValue(details.hidden_hinge) ? "Hidden Hinge" : null,
      booleanValue(details.raised_panel) ? "Raised Panel" : null,
      booleanValue(details.flush_rail) ? "Flush Rail" : null,
      booleanValue(details.solid_flat_panel) ? "Solid Flat Panel" : null,
    ].filter((value): value is string => Boolean(value)),
    room: values.room || "Window",
    widthA,
    heightB,
    panelConfig,
    itemNote: values.notes || "",
    windowType,
    dividerRail,
    dividerPosition,
    dividerExactPosition: dividerCustom
      ? booleanValue(details.divider_exact_position)
      : null,
    splitTiltRod: splitTilt,
    splitPosition,
    scribe: booleanValue(details.scribe) === true,
    extension: booleanValue(details.extension ?? details.extension_rod) === true,
    doubleHung:
      booleanValue(details.double_hung) === true
      || values.surcharges.some((item) => item.id === "double_hung"),
    motor:
      booleanValue(details.motor) === true
      || values.motorization.length > 0,
    frenchDoor,
    specialtyReference: specialty && specialty !== "none"
      ? {
          shape: specialty,
          orientationViewedFrom: text(details.orientation_viewed_from) || null,
          templateAttachmentId: text(details.template_attachment_id) || null,
          notes: text(details.specialty_notes),
        }
      : null,
  };
}

export function buildOnyxAgentOrderPacket(
  context: OnyxPacketContext,
  sourceLines: OnyxOrderSourceLine[],
): OnyxAgentOrderPacket | null {
  if (!sourceLines.length) return null;
  const definition = onyxOrderFormDefinition(sourceLines[0].values);
  const blockingIssues: string[] = [];
  for (const sourceLine of sourceLines) {
    const lineDefinition = onyxOrderFormDefinition(sourceLine.values);
    if (lineDefinition.orderFormKey !== definition.orderFormKey) {
      blockingIssues.push(
        `Line ${sourceLine.sourceOpeningId}: ${lineDefinition.displayName} must use its own ${lineDefinition.orderFormKey} document.`,
      );
    }
  }
  const lines = sourceLines
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((line, index) => packetLine(line, index + 1, blockingIssues, definition));
  if (!context.customerName.trim()) blockingIssues.push("Customer name is required.");
  if (!context.jobsiteAddress?.trim()) blockingIssues.push("Jobsite address is required.");
  if (!context.quoteNumber?.trim()) blockingIssues.push("Quote number is required.");

  const sourceHash = createHash("sha256").update(JSON.stringify({
    schemaVersion: ONYX_PACKET_SCHEMA_VERSION,
    context,
    sourceLines,
  })).digest("hex");
  const status = context.holdForTechnicalMeasure
    ? "AWAITING_TECHNICAL_MEASURE"
    : blockingIssues.length
      ? "BLOCKED"
      : "READY";

  return {
    schemaVersion: ONYX_PACKET_SCHEMA_VERSION,
    manufacturerKey: "onyx",
    productFamilyKey: "shutters",
    orderFormKey: definition.orderFormKey,
    quoteProgramKey: definition.quoteProgramKey,
    productDisplayName: definition.displayName,
    portalMaterial: definition.portalMaterial,
    portalMappingStatus: definition.mappingStatus,
    portalVerifiedOn: "2026-07-27",
    packetId: `onyx:${context.quoteId}:${definition.orderFormKey}:${sourceHash.slice(0, 16)}`,
    status,
    blockingIssues,
    allowedAction: "draft_entry_only",
    source: {
      kind: context.sourceKind,
      sourceId: context.sourceId,
      contractId: context.contractId,
      technicalMeasureId: context.technicalMeasureId,
      jobId: context.jobId,
      quoteId: context.quoteId,
      quoteNumber: context.quoteNumber,
      generatedAt: context.generatedAt,
      customerId: context.customerId,
      customerName: context.customerName,
      customerPhone: context.customerPhone,
      customerEmail: context.customerEmail,
      jobsiteAddress: context.jobsiteAddress,
      jobNotes: context.jobNotes,
    },
    header: {
      materialCategory: definition.portalMaterial,
      sideMark: context.customerName,
      poNumber: context.quoteNumber,
      rushOrder: sourceLines.some((line) =>
        booleanValue(line.values.details.rush_order) === true
      ),
      orderNote: context.jobNotes,
      shipToName: "Bill to",
      shipNote: "",
      portalDateCheck: "VERIFY IN LIVE ONYX PORTAL",
      portalShipViaCheck: "VERIFY IN LIVE ONYX PORTAL",
    },
    lines,
    attachments: [],
  };
}

export function buildOnyxAgentOrderPackets(
  context: OnyxPacketContext,
  sourceLines: OnyxOrderSourceLine[],
): OnyxAgentOrderPacket[] {
  const groups = new Map<OnyxOrderFormKey, OnyxOrderSourceLine[]>();
  for (const sourceLine of sourceLines) {
    const key = onyxOrderFormDefinition(sourceLine.values).orderFormKey;
    groups.set(key, [...(groups.get(key) || []), sourceLine]);
  }
  return [...groups.values()]
    .map((group) => buildOnyxAgentOrderPacket(context, group))
    .filter((packet): packet is OnyxAgentOrderPacket => Boolean(packet));
}

export function onyxPreparationSummary(
  packet: OnyxAgentOrderPacket | null,
  requestedBy?: string,
) {
  if (!packet) {
    return {
      manufacturer: "Onyx" as const,
      productType: "shutters" as const,
      status: "skipped" as const,
      taskId: null,
      issueCount: 0,
      message: "No Onyx shutter lines were found.",
    };
  }
  const status = packet.status === "AWAITING_TECHNICAL_MEASURE"
    ? "awaiting_measure" as const
    : packet.status === "READY"
      ? "queued" as const
      : "needs_input" as const;
  return {
    manufacturer: "Onyx" as const,
    productType: "shutters" as const,
    status,
    taskId: packet.packetId,
    issueCount: packet.blockingIssues.length,
    requestedAt: packet.source.generatedAt,
    requestedBy: requestedBy || null,
    sourceHash: packet.packetId.split(":").at(-1),
    payload: packet as unknown as Record<string, unknown>,
    message: status === "awaiting_measure"
      ? "Onyx contract packet is saved in the customer file and is awaiting the submitted technical measure."
      : status === "queued"
        ? `Onyx packet is ready for draft entry from the ${packet.source.kind === "signed_contract" ? "signed contract" : "submitted technical measure"}.`
        : `Onyx packet needs ${packet.blockingIssues.length} correction${packet.blockingIssues.length === 1 ? "" : "s"} before draft entry.`,
  };
}

export async function upsertOnyxCustomerFileArtifact(
  supabase: SupabaseClient,
  packet: OnyxAgentOrderPacket,
) {
  const externalId = `onyx-order:${packet.source.quoteId}:${packet.orderFormKey}`;
  const { data: existing } = await supabase
    .from("crm_customer_contracts")
    .select("meta")
    .eq("external_source", "manufacturer_order_packet")
    .eq("external_id", externalId)
    .maybeSingle();
  const existingMeta = object(existing?.meta);
  const current = object(existingMeta.current_packet);
  const history = Array.isArray(existingMeta.packet_history)
    ? [...existingMeta.packet_history]
    : [];
  if (current.packetId && current.packetId !== packet.packetId) {
    history.push(current);
  }

  const { error } = await supabase.from("crm_customer_contracts").upsert({
    external_source: "manufacturer_order_packet",
    external_id: externalId,
    customer_id: packet.source.customerId,
    job_id: packet.source.jobId,
    quote_id: packet.source.quoteId,
    bookkeeping_entry_id: null,
    title: `Onyx ${packet.productDisplayName} Order Packet - ${packet.source.quoteNumber || packet.source.customerName}`,
    contract_url: `/api/crm/vendor-order-packets/onyx/${encodeURIComponent(packet.source.quoteId)}`,
    share_token: null,
    status: packet.status.toLowerCase(),
    signed_at: packet.source.kind === "signed_contract"
      ? packet.source.generatedAt
      : null,
    total_amount: 0,
    meta: {
      source: "manufacturer_order_packet",
      manufacturer_key: "onyx",
      product_family_key: "shutters",
      order_form_key: packet.orderFormKey,
      quote_program_key: packet.quoteProgramKey,
      product_display_name: packet.productDisplayName,
      portal_material: packet.portalMaterial,
      portal_mapping_status: packet.portalMappingStatus,
      authoritative_source: packet.source.kind,
      current_packet: packet,
      packet_history: history.slice(-20),
    },
  }, { onConflict: "external_source,external_id" });
  if (error) throw new Error(`The Onyx order packet could not be saved to the customer file: ${error.message}`);
}
