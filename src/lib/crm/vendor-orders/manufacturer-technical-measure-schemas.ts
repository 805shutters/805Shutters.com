import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  resolveManufacturerOrderForm,
  technicalMeasureTemplateRelativePath,
  type OrderFormRegistryEntry,
  type OrderFormSourceValues,
} from "@/lib/crm/vendor-orders/manufacturer-order-form-registry";

export type TechnicalMeasureFieldInput =
  | "boolean"
  | "choice"
  | "dimension"
  | "integer"
  | "long_text"
  | "text";

export type TechnicalMeasureFieldSection =
  | "opening"
  | "product"
  | "operation"
  | "hardware"
  | "motorization"
  | "installation";

export type ManufacturerTechnicalMeasureField = {
  key: string;
  label: string;
  input: TechnicalMeasureFieldInput;
  section: TechnicalMeasureFieldSection;
  portalOrder: number;
  required: boolean;
  options?: string[];
};

export type ManufacturerTechnicalMeasureSchema = {
  schemaVersion: 1;
  routingKey: string;
  manufacturer: string;
  productKey: string;
  productName: string;
  productKind: string;
  orderSchemaPath: string;
  orderTemplateDocxUrl: string;
  orderTemplatePdfUrl: string;
  technicalMeasureDocxUrl: string;
  technicalMeasurePdfUrl: string;
  sourceReference: string;
  verification: string;
  fields: ManufacturerTechnicalMeasureField[];
};

type FlatOrderSchema = {
  ordered_fields?: unknown;
};

type JsonSchemaProperty = {
  type?: unknown;
  enum?: unknown;
  oneOf?: unknown;
};

type OnyxOrderSchema = {
  $defs?: {
    line?: {
      required?: unknown;
      properties?: Record<string, JsonSchemaProperty>;
    };
  };
};

const ORDER_HEADER_FIELDS = new Set([
  "customer_name",
  "crm_customer_id",
  "contract_number",
  "order_packet_id",
  "project_address",
  "customer_phone",
  "customer_email",
  "salesperson",
  "measure_status",
  "final_order_source",
  "line_item_number",
]);

const CORE_MEASURE_FIELD_ALIASES = new Set([
  "quantity",
  "room_location",
  "ordered_width",
  "ordered_height",
]);

const BOOLEAN_FIELDS = new Set([
  "alternating_colors",
  "day_night",
  "end_caps",
  "frame_light_guard",
  "hold_down_brackets",
  "keystone",
  "light_channels",
  "long_l_bracket",
  "motorized",
  "palladian_shelf",
  "rafter_fascia_option",
  "room_darkening",
  "shelf_ordered_with_product",
  "side_mount_bracket",
  "side_mount_brackets",
  "top_down_bottom_up_option",
  "wind_option",
  "wind_sun_sensor",
]);

const INTEGER_FIELDS = new Set([
  "additional_vane_pack",
  "bracket_quantity",
  "number_of_carriers",
  "number_of_panels",
  "shim_quantity",
]);

const DIMENSION_FIELDS = new Set([
  "build_out",
  "chain_cord_length",
  "control_length",
  "cord_wand_length",
  "crank_length",
  "divider_rail_height",
  "finished_height",
  "height",
  "length",
  "mount_height",
  "ordered_height",
  "ordered_width",
  "overlap_return",
  "pitch_drop",
  "projection",
  "returns",
  "shelf_depth",
  "shelf_width",
  "t_post_location",
  "tilt_location",
  "track_length",
  "track_width",
  "valance_height",
  "width",
]);

const LONG_TEXT_FIELDS = new Set([
  "hardware_bracket_notes",
  "home_automation_notes",
  "mount_special_instructions",
  "mounting_surface_notes",
  "special_instructions",
]);

const FIELD_OPTIONS: Record<string, string[]> = {
  ceiling_wall_mount: ["Ceiling", "Wall"],
  control_side: ["Left", "Right", "Center", "N/A"],
  draw_type: ["One Way", "Split Draw", "N/A"],
  manual_motorized: ["Manual", "Motorized"],
  mount_type: ["Inside Mount", "Outside Mount", "Ceiling Mount", "Wall Mount"],
  motor_side: ["Left", "Right", "N/A"],
  one_way_split_draw: ["One Way", "Split Draw"],
  opening_direction: ["Left", "Right", "Inward", "Outward", "N/A"],
  power_side: ["Left", "Right", "N/A"],
  roll_type: ["Standard Roll", "Reverse Roll"],
  stack_side: ["Left", "Right", "Split", "N/A"],
  straight_bent: ["Straight", "Bent"],
  tilt_side: ["Left", "Right", "N/A"],
};

const REQUIRED_FIELDS = new Set([
  "mount_type",
  "product_type",
  "shutter_category",
  "shutter_type",
]);

const OPERATION_FIELD_MARKERS = [
  "control",
  "cord",
  "crank",
  "draw",
  "lift",
  "opening",
  "roll",
  "stack",
  "tilt",
  "wand",
];

const HARDWARE_FIELD_MARKERS = [
  "bracket",
  "cassette",
  "end_cap",
  "fascia",
  "frame",
  "headrail",
  "hem_bar",
  "hinge",
  "hood",
  "keystone",
  "light",
  "louver",
  "rail",
  "sill",
  "slat",
  "track",
  "valance",
];

const MOTOR_FIELD_MARKERS = [
  "automation",
  "charging",
  "motor",
  "power",
  "remote",
  "sensor",
  "smart_home",
];

const INSTALL_FIELD_MARKERS = [
  "bend",
  "build_out",
  "cut_out",
  "mount",
  "pitch",
  "projection",
  "rafter",
  "return",
  "shelf",
  "shim",
  "special",
  "template",
];

const schemaCache = new Map<string, ManufacturerTechnicalMeasureSchema>();

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function label(key: string): string {
  const exact: Record<string, string> = {
    crm_customer_id: "CRM Customer ID",
    po: "PO",
    side_mark_po: "Side Mark / PO",
    t_post_location: "T-Post Location",
    top_down_bottom_up_option: "Top-Down / Bottom-Up",
  };
  return exact[key] || key
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase())
    .replace(/\bPo\b/g, "PO");
}

function includesMarker(key: string, markers: string[]): boolean {
  return markers.some((marker) => key.includes(marker));
}

function sectionFor(key: string): TechnicalMeasureFieldSection {
  if (DIMENSION_FIELDS.has(key) || ["room_location", "side_mark_po"].includes(key)) return "opening";
  if (includesMarker(key, MOTOR_FIELD_MARKERS)) return "motorization";
  if (includesMarker(key, INSTALL_FIELD_MARKERS)) return "installation";
  if (includesMarker(key, HARDWARE_FIELD_MARKERS)) return "hardware";
  if (includesMarker(key, OPERATION_FIELD_MARKERS)) return "operation";
  return "product";
}

function inputFor(key: string, property?: JsonSchemaProperty): TechnicalMeasureFieldInput {
  if (Array.isArray(property?.enum) || FIELD_OPTIONS[key]) return "choice";
  if (property?.type === "boolean" || BOOLEAN_FIELDS.has(key)) return "boolean";
  if (INTEGER_FIELDS.has(key)) return "integer";
  if (DIMENSION_FIELDS.has(key)) return "dimension";
  if (LONG_TEXT_FIELDS.has(key) || key.endsWith("_notes") || key.endsWith("_instructions")) return "long_text";
  return "text";
}

function optionsFor(key: string, property?: JsonSchemaProperty): string[] | undefined {
  if (Array.isArray(property?.enum)) {
    const options = property.enum.map(text).filter(Boolean);
    return options.length ? options : undefined;
  }
  return FIELD_OPTIONS[key];
}

function readOrderSchema(entry: OrderFormRegistryEntry): FlatOrderSchema | OnyxOrderSchema {
  const path = join(process.cwd(), "public", "order-form-templates", entry.schema);
  return JSON.parse(readFileSync(path, "utf8")) as FlatOrderSchema | OnyxOrderSchema;
}

function schemaFields(entry: OrderFormRegistryEntry): ManufacturerTechnicalMeasureField[] {
  const orderSchema = readOrderSchema(entry);
  const onyxLine = (orderSchema as OnyxOrderSchema).$defs?.line;
  const required = new Set(Array.isArray(onyxLine?.required) ? onyxLine.required.map(text) : []);
  const rawOrderedFields = (orderSchema as FlatOrderSchema).ordered_fields;
  const orderedFields: string[] = Array.isArray(rawOrderedFields)
    ? rawOrderedFields.map(text)
    : Object.keys(onyxLine?.properties || {});

  return orderedFields
    .filter(Boolean)
    .filter((key) => !ORDER_HEADER_FIELDS.has(key) && !CORE_MEASURE_FIELD_ALIASES.has(key))
    .filter((key) => ![
      "compatibility_verification",
      "line_number",
      "portal_line_quantity",
      "source_opening_id",
    ].includes(key))
    .map((key, portalOrder) => {
      const property = onyxLine?.properties?.[key];
      return {
        key,
        label: label(key),
        input: inputFor(key, property),
        section: sectionFor(key),
        portalOrder,
        required: required.has(key) || REQUIRED_FIELDS.has(key),
        ...(optionsFor(key, property) ? { options: optionsFor(key, property) } : {}),
      };
    });
}

export function resolveManufacturerTechnicalMeasureSchema(
  values: OrderFormSourceValues,
): ManufacturerTechnicalMeasureSchema | null {
  const entry = resolveManufacturerOrderForm(values);
  if (!entry) return null;
  const cached = schemaCache.get(entry.routing_key);
  if (cached) return cached;
  const schema: ManufacturerTechnicalMeasureSchema = {
    schemaVersion: 1,
    routingKey: entry.routing_key,
    manufacturer: entry.manufacturer,
    productKey: entry.product_key,
    productName: entry.product_name,
    productKind: entry.product_kind,
    orderSchemaPath: entry.schema,
    orderTemplateDocxUrl: `/order-form-templates/${entry.template_docx}`,
    orderTemplatePdfUrl: `/order-form-templates/${entry.template_docx.replace(/\.docx$/i, ".pdf")}`,
    technicalMeasureDocxUrl: `/technical-measure-templates/${technicalMeasureTemplateRelativePath(entry, "docx")}`,
    technicalMeasurePdfUrl: `/technical-measure-templates/${technicalMeasureTemplateRelativePath(entry, "pdf")}`,
    sourceReference: entry.source_reference,
    verification: entry.verification,
    fields: schemaFields(entry),
  };
  schemaCache.set(entry.routing_key, schema);
  return schema;
}
