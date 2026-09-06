import { customerQuoteOptions, customerQuoteText } from "./customer-quote-branding";
import { temporaryShadeSelected } from "@/lib/quote/temporary-shades";

export type QuoteProductDetail = {
  label: string;
  value: string;
};

const INTERNAL_DETAIL_LABELS = new Set([
  "base price",
  "discount percent",
  "discount amount",
  "discount source price",
  "fabric color collection",
  "fabric color id",
  "fabric product id",
  "fabric program id",
  "fabric surcharge id",
  "manual price override",
  "pricing built in adjustment",
  "pricing grid height",
  "pricing grid key",
  "pricing grid price",
  "pricing grid width",
  "pricing method",
  "sent price snapshot",
  "surcharge total",
]);

const INTERNAL_DETAIL_PREFIXES = ["catalog ", "quote lab "];
const INTERNAL_DETAIL_SUFFIXES = [
  " blind count",
  " configuration version",
  " program code",
  " source page",
];
const EMPTY_VALUES = new Set(["", "false", "none", "no", "n/a", "na", "not applicable", "not selected"]);

function normalized(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase()
    .replace(/[|—–-]+/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function splitDetail(detail: string): QuoteProductDetail {
  const separatorIndex = detail.indexOf(":");
  if (separatorIndex < 0) return { label: "Option", value: detail.trim() };
  return {
    label: detail.slice(0, separatorIndex).trim(),
    value: detail.slice(separatorIndex + 1).trim(),
  };
}

function isInternalDetailLabel(label: string): boolean {
  const key = normalized(label);
  return (
    INTERNAL_DETAIL_LABELS.has(key) ||
    key.endsWith(" id") ||
    INTERNAL_DETAIL_PREFIXES.some((prefix) => key.startsWith(prefix)) ||
    INTERNAL_DETAIL_SUFFIXES.some((suffix) => key.endsWith(suffix))
  );
}

function valueIsCovered(value: string, existingValues: string[]): boolean {
  const key = normalized(value);
  if (!key) return true;
  return existingValues.some((existingValue) => {
    const existingKey = normalized(existingValue);
    return existingKey === key || existingKey.includes(key) || key.includes(existingKey);
  });
}

function stripRepeatedLightControl(value: string, lightControl: string | undefined): string {
  if (!lightControl) return value;
  const pieces = value.split("|").map((piece) => piece.trim()).filter(Boolean);
  const filtered = pieces.filter((piece) => normalized(piece) !== normalized(lightControl));
  return filtered.join(" — ") || value;
}

/**
 * Convert saved quote metadata into one concise customer-facing row per
 * quote-builder selection. Internal catalog and pricing identifiers remain in
 * the source record but never render on the contract or in customer email.
 */
export function quoteProductDetails(styleName: string, options: string[], presentation: { illustrated?: boolean } = {}): QuoteProductDetail[] {
  const hasTemporaryShadeCaption = presentation.illustrated && temporaryShadeSelected(options);
  styleName = customerQuoteText(styleName, true);
  const parsed = customerQuoteOptions(options)
    .map(splitDetail)
    .filter(({ label, value }) => label && value && !EMPTY_VALUES.has(normalized(value)));
  const lightControl = parsed.find(({ label }) => normalized(label) === "light control")?.value;
  const colorCode = parsed.find(({ label }) => normalized(label) === "fabric color code")?.value;
  const colorName = parsed.find(({ label }) => normalized(label) === "fabric color name")?.value;
  const colorType = parsed.find(({ label }) => normalized(label) === "fabric color type")?.value;

  const grouped = new Map<string, QuoteProductDetail>();
  const visibleValues: string[] = [];

  for (const detail of parsed) {
    // The companion sketch already identifies the included temporary shade.
    if (hasTemporaryShadeCaption && temporaryShadeSelected([`${detail.label}: ${detail.value}`])) continue;
    const labelKey = normalized(detail.label);
    if (isInternalDetailLabel(detail.label)) continue;
    if (["fabric color code", "fabric color name", "fabric color type"].includes(labelKey)) continue;

    const value = labelKey === "fabric" ? stripRepeatedLightControl(detail.value, lightControl) : detail.value;
    const existing = grouped.get(labelKey);
    if (existing) {
      if (!valueIsCovered(value, existing.value.split(" · "))) existing.value += ` · ${value}`;
      continue;
    }

    const next = { label: detail.label, value };
    grouped.set(labelKey, next);
    visibleValues.push(value);
  }

  if (colorType && !lightControl && !valueIsCovered(colorType, visibleValues)) {
    grouped.set("light control", { label: "Light Control", value: colorType });
    visibleValues.push(colorType);
  }

  const fabric = grouped.get("fabric")?.value;
  if (!fabric && (colorCode || colorName)) {
    const color = [colorCode, colorName].filter(Boolean).join(" — ");
    if (color && !valueIsCovered(color, visibleValues)) {
      grouped.set("color", { label: "Color", value: color });
      visibleValues.push(color);
    }
  }

  if (styleName && !valueIsCovered(styleName, visibleValues)) {
    grouped.set("style", { label: "Style", value: stripRepeatedLightControl(styleName, lightControl) });
  }

  return Array.from(grouped.values());
}
