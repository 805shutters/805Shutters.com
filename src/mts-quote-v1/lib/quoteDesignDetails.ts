import { storedCustomerCharges, customerChargeLabels } from "@/lib/quote/customer-charges";
import {
  PRODUCT_COLOR_CODE_DETAIL,
  PRODUCT_COLOR_COLLECTION_DETAIL,
  PRODUCT_COLOR_ID_DETAIL,
  PRODUCT_COLOR_NAME_DETAIL,
  PRODUCT_COLOR_PRODUCT_ID_DETAIL,
  PRODUCT_COLOR_PROGRAM_DETAIL,
  PRODUCT_COLOR_SURCHARGE_DETAIL,
  PRODUCT_COLOR_TYPE_DETAIL,
} from "@mts-v1/lib/productColorCatalog";
import type { SalesQuoteDesign } from "@mts-v1/types/quote";

export interface QuoteDesignDetail {
  label: string;
  value: string;
}

const DIRECT_DETAIL_FIELDS: Array<[string, keyof SalesQuoteDesign]> = [
  ["Supplier", "supplier"],
  ["Material", "material"],
  ["Louver Size", "louver_size"],
  ["Tilt Type", "tilt_type"],
  ["Hinge Color", "hinge_color"],
  ["Panel Config", "panel_config"],
  ["Mount Type", "mount_type"],
  ["Shade Type", "shade_type"],
  ["Lift System", "lift_system"],
  ["Valance", "valance"],
  ["Fabric", "fabric"],
  ["Motor Type", "motor_type"],
  ["Remote Type", "remote_type"],
];

const INTERNAL_OPTION_KEYS = new Set([
  "norman_assembly_v1",
  "norman_order_record_v1",
  "smartfold_common_valance_v1",
  "base_price",
  "surcharge_total",
  "customer_charges",
  "manual_price_override",
  "discount_source_price",
  "discount_amount",
  "pricing_method",
  "pricing_grid_key",
  "pricing_grid_price",
  "pricing_grid_width",
  "pricing_grid_height",
  "pricing_built_in_adjustment",
  "pricing_calculation_status",
  "pricing_dimension_width",
  "pricing_dimension_height",
  "pricing_input_width_whole",
  "pricing_input_width_fraction",
  "pricing_input_height_whole",
  "pricing_input_height_fraction",
  "pricing_source",
  "pricing_source_version",
  "sent_price_snapshot",
  PRODUCT_COLOR_ID_DETAIL,
  PRODUCT_COLOR_PRODUCT_ID_DETAIL,
  PRODUCT_COLOR_PROGRAM_DETAIL,
  PRODUCT_COLOR_COLLECTION_DETAIL,
  PRODUCT_COLOR_CODE_DETAIL,
  PRODUCT_COLOR_NAME_DETAIL,
  PRODUCT_COLOR_TYPE_DETAIL,
  PRODUCT_COLOR_SURCHARGE_DETAIL,
]);

export function getQuoteDesignDetails(design: SalesQuoteDesign): QuoteDesignDetail[] {
  const details: QuoteDesignDetail[] = [];

  DIRECT_DETAIL_FIELDS.forEach(([label, key]) => {
    const value = design[key];
    if (hasValue(value)) details.push({ label, value: String(value) });
  });

  if (design.hard_surface_install) details.push({ label: "Hard Surface Install", value: "Yes" });
  if (design.ladder_over_15ft) details.push({ label: "Requires Ladder Over 15ft", value: "Yes" });
  if (design.requires_takedown) details.push({ label: "Requires Takedown", value: "Yes" });

  const options = design.options_json || {};
  const fabricColor = formatFabricColorDetail(options);
  if (fabricColor) {
    details.push({
      label: design.product_type === "Mini Blinds" ? "Color" : "Fabric Color",
      value: fabricColor,
    });
  }

  Object.entries(options).forEach(([key, value]) => {
    if (!hasValue(value) || INTERNAL_OPTION_KEYS.has(key) || ["catalog_", "quote_lab_", "authoritative_", "pricing_", "priced_", "quote_v2_"].some(prefix => key.startsWith(prefix)) || ["_blind_count", "_configuration_version", "_program_code", "_source_page"].some(suffix => key.endsWith(suffix))) return;

    if (key === "surcharges" && Array.isArray(value)) {
      const surchargeText = value
        .map((item) => {
          const surcharge = item as Record<string, unknown>;
          const name = surcharge.name || surcharge.label || "Surcharge";
          const qty = Number(surcharge.quantity || 1);
          const amount = Number(surcharge.price || surcharge.amount || 0);
          const price = amount > 0 ? ` - ${formatCurrency(amount)}` : "";
          return `${name}${qty > 1 ? ` x${qty}` : ""}${price}`;
        })
        .filter(Boolean)
        .join(", ");
      if (surchargeText) details.push({ label: "Surcharges", value: surchargeText });
      return;
    }

    details.push({ label: humanizeKey(key), value: formatOptionValue(value) });
  });

  if (design.notes) details.push({ label: "Notes", value: design.notes });

  for (const text of customerChargeLabels(storedCustomerCharges(options))) {
    const [label, ...value] = text.split(":");
    details.push({ label, value: value.join(":").trim() });
  }
  return details;
}

function formatFabricColorDetail(options: Record<string, unknown>): string | null {
  const code = stringValue(options[PRODUCT_COLOR_CODE_DETAIL]);
  const name = stringValue(options[PRODUCT_COLOR_NAME_DETAIL]);
  if (code && name) return `${code} - ${name}`;
  return name || code;
}

export function formatCurrency(value: unknown): string {
  return `$${Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
}

function hasValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function formatOptionValue(value: unknown): string {
  if (Array.isArray(value)) return value.map(formatOptionValue).join(", ");
  if (typeof value === "object" && value !== null) {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, val]) => `${humanizeKey(key)}: ${formatOptionValue(val)}`)
      .join(", ");
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function humanizeKey(key: string): string {
  const labels: Record<string, string> = {
    vertical_hardware_color: "Hardware Color",
    vertical_wand_drop_inches: "Wand Drop (inches)",
    vertical_shim_layers: "Shim Layers per Bracket",
    smartfold_installation: "Mounting Method",
    smartfold_shim_layers: "Shim Layers",
    smartfold_hold_down: "Hold-Downs",
    smartfold_magnet_color: "Magnet Catch Color",
    smartfold_pole: "Additional Pole per Shade",
    smartfold_light_guard_color: "Light Guard Color",
    smartfold_fabric_pattern: "Fabric Pattern",
    smartfold_hardware_color: "Hardware Color",
    smartfold_hem_style: "Hem-Bar Style",
    smartfold_hem_color: "Hem-Bar Color",
    smartfold_hem_end_cap: "Hem-Bar End Caps",
    smartfold_fascia_style: "Curved Fascia Style",
    smartfold_fascia_color: "Fascia Color",
    smartfold_fascia_end_cap: "Fascia End Caps",
    smartfold_valance_fabric_code: "Valance Fabric Code",
    smartfold_wood_valance_color: "Wood Valance Finish",
    smartfold_chain_color: "Chain Color",
    smartfold_common_valance_id: "Common Valance Group",
    smartfold_common_position: "Shade Position from Left",
    smartfold_common_gap_after: "Gap After This Shade",
    smartfold_valance_width: "Custom Valance Width",
    smartfold_valance_returns: "Valance Returns",
    smartfold_valance_return_size: "Custom Return Length",
    smartfold_valance_joinery: "Valance Joinery",
    smartfold_keystone_count: "Keystone Count",
    smartfold_keystone_layout: "Keystone Locations",
    smartfold_keystone_location_1: "Keystone 1 from Left",
    smartfold_keystone_location_2: "Keystone 2 from Left",
    smartfold_keystone_location_3: "Keystone 3 from Left",
  };
  if (labels[key]) return labels[key];
  return key
    .replace(/_/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}
