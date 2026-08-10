import {
  PRODUCT_COLOR_CODE_DETAIL,
  PRODUCT_COLOR_COLLECTION_DETAIL,
  PRODUCT_COLOR_ID_DETAIL,
  PRODUCT_COLOR_NAME_DETAIL,
  PRODUCT_COLOR_PRODUCT_ID_DETAIL,
  PRODUCT_COLOR_PROGRAM_DETAIL,
  PRODUCT_COLOR_SURCHARGE_DETAIL,
  PRODUCT_COLOR_TYPE_DETAIL,
} from "@mts/lib/productColorCatalog";
import type { SalesQuoteDesign } from "@mts/types/quote";

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
  "base_price",
  "surcharge_total",
  "manual_price_override",
  "discount_source_price",
  "discount_amount",
  "pricing_method",
  "pricing_grid_key",
  "pricing_grid_price",
  "pricing_grid_width",
  "pricing_grid_height",
  "pricing_built_in_adjustment",
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

const INTERNAL_OPTION_KEY_PREFIXES = ["catalog_", "quote_lab_"];

const INTERNAL_OPTION_KEY_SUFFIXES = [
  "_blind_count",
  "_configuration_version",
  "_program_code",
  "_source_page",
];

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
    if (!hasValue(value) || isInternalOptionKey(key)) return;

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

  return details;
}

function isInternalOptionKey(key: string): boolean {
  return (
    INTERNAL_OPTION_KEYS.has(key) ||
    INTERNAL_OPTION_KEY_PREFIXES.some((prefix) => key.startsWith(prefix)) ||
    INTERNAL_OPTION_KEY_SUFFIXES.some((suffix) => key.endsWith(suffix))
  );
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
  if (typeof value === "boolean") return value;
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
  return key
    .replace(/_/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}
