import { isInternalQuoteDetail } from "./customer-quote-detail-policy";

/** Presentation only: never rewrite catalog, supplier, pricing, or order records. */
const PRODUCT_BRANDS: Array<[RegExp, string]> = [
  [/\b(?:PerfectSheer|SmartFold)\b/gi, "Sheer"],
  [/\bSmartDrape\b/gi, "Drapery"],
  [/\b(?:Woodlore Plus|Woodlore|Normandy|Brightwood|Aquashield)\b/gi, ""],
  [/\b(?:Soluna|Centerpiece|Portrait|Synchrony|CityLights|Ultimate|SmartPrivacy)\b/gi, ""],
  [/\bSmartRise\b/gi, ""],
  [/\bSmartRelease\b/gi, "Auto-release"],
  [/\bSmartFit\b/gi, "Track-guided"],
  [/\bPerfectTilt(?: G4)?\b/gi, "Motorized tilt"],
  [/\bInvisibleTilt\b/gi, "Hidden tilt"],
  [/\b(?:Decoflex|SmartDial(?: G2)?|SmartSense|Telis|Situo|Smoove|TaHoma|Sonesse|Glydea|Irismo|Soliris|Eolis|Ondeis|Sunis|Altus|AutoSun|animeo)\b/gi, ""],
  [/\bAutoWand\b/gi, "Motorized Wand"],
  [/\b(?:Elite|Titan) Patio\b/gi, "Patio Shades"],
  [/\bMega Exterior\b/gi, "Exterior Shades"],
];

const MANUFACTURERS = /\b(?:Norman(?: USA)?|Onyx|Polar|Lotus(?: Windoware)?|Somfy|Lutron|Rollease(?: Acmeda)?|Automate(?: Home)?|Hunter Douglas|Alta|Graber|Bali)\b/gi;

export function customerQuoteText(value: string | null | undefined, specification = false): string {
  let result = value || "";
  for (const [pattern, replacement] of PRODUCT_BRANDS) result = result.replace(pattern, replacement);
  return result.replace(MANUFACTURERS, (brand: string, offset: number, source: string) => {
    // These are actual catalog colors, not manufacturer attribution. Do not
    // turn F1244 - Polar White into a different customer-selected color.
    if (specification && /^(?:Polar|Lotus)$/i.test(brand) && /^\s+White\b/i.test(source.slice(offset + brand.length))) return brand;
    if (specification && /^Onyx$/i.test(source.trim())) return brand;
    return "";
  })
    .replace(/[®™]/g, "")
    .replace(/\b(?:MFR|Manufacturer|Supplier|Brand)\s*[:|—-]\s*(?=$|[|;,])/gi, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/^[\s|,;:—–-]+|[\s|,;:—–-]+$/g, "")
    .trim();
}

export function customerQuoteProductName(value: string | null | undefined): string {
  return customerQuoteText(value) || "Window treatment";
}

/** Imported program names sometimes contain the source table instead of a style. */
export function customerQuoteStyleName(value: string | null | undefined): string {
  return customerQuoteText(value, true)
    .replace(/\b(?:PDF|page)\s*\d+(?:\s*,?\s*table\s*\d+)?/gi, "")
    .replace(/\b(?:fabric\s+)?price\s+group\s+[\w.-]+/gi, "")
    .replace(/^[\s·|,—–-]+|[\s·|,—–-]+$/g, "").trim();
}

export function isManufacturerDetail(label: string): boolean {
  return /\b(?:manufacturer|mfr|supplier|vendor|brand)\b/i.test(label.replace(/[_-]/g, " "));
}

/** Legacy imports can carry financial metadata as arbitrary display labels. */
function isInternalPricingDetail(label: string): boolean {
  const normalized = label
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[^a-zA-Z0-9]+/g, " ");
  return /\b(?:costs?|wholesale|dealer|landed|margin|profit|markup|uplift|pricing|price|discount|commission|cogs)\b/i.test(normalized);
}

/** Keep complete track specifications while retaining the customer-facing brand policy. */
function sundanceTrackDetail(label: string, value: string): { label: string; value: string } | null {
  const labels: Record<string, string> = {
    "Sundance Track Motor Type": "Track Motor",
    "Sundance Track Headrail Colors": "Track Color",
    "Sundance Track Motor Position": "Track Motor Position",
    "Sundance Track Curved Track": "Track Shape",
    "Sundance Track Stack Type": "Track Stack",
    "Sundance Track Drapery Style Track": "Drapery Style",
    "Sundance Track Remote Control": "Track Remote",
  };
  if (!labels[label]) return null;
  const values: Record<string, Record<string, string>> = {
    "Sundance Track Motor Type": {
      "GLYDEA MOTOR /1.O NM/ 110 VOLTS": "AC motor / 1.0 Nm / 110 volts",
      "GLYDEA MOTOR/ 0.6 NM /110 VOLTS": "AC motor / 0.6 Nm / 110 volts",
      "IRISMO 35/ 24VOLTS/ 0.6 NM (WITH TRANSFORMER)": "Low-voltage motor 35 / 24 volts / 0.6 Nm / transformer included",
      "IRISMO 45/LI-ON RECHARGEABLE/0.8 NM": "Rechargeable motor 45 / lithium-ion / 0.8 Nm",
      "No": "No motor",
    },
    "Sundance Track Remote Control": {
      "Situo 1 (Single Line)": "1-channel remote",
      "Situo 5 (5 Lines)": "5-channel remote",
      "Telis 16": "16-channel remote",
      "No": "No remote",
    },
    "Sundance Track Curved Track": { "No": "Straight", "Yes": "Curved" },
  };
  const normalized = value.trim().replace(/\s+/g, " ");
  return { label: labels[label], value: values[label]?.[normalized] ?? normalized };
}

/** Remove supplier and internal pricing fields before customer serialization. */
export function customerQuoteOptions(options: string[]): string[] {
  return options.flatMap((option) => {
    const separator = option.indexOf(":");
    let label = separator < 0 ? "" : option.slice(0, separator);
    if (isManufacturerDetail(label) || isInternalPricingDetail(label || option) || isInternalQuoteDetail(label)) return [];
    if (separator < 0) {
      const cleaned = customerQuoteText(option);
      return cleaned ? [cleaned] : [];
    }
    const track = sundanceTrackDetail(label, option.slice(separator + 1));
    if (track) label = track.label;
    const value = customerQuoteText(track?.value ?? option.slice(separator + 1), /\b(?:color|fabric|finish)\b/i.test(label));
    const cleanLabel = customerQuoteText(label);
    return cleanLabel && value ? [`${cleanLabel}: ${value}`] : [];
  });
}
