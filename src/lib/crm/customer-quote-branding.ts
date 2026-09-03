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

export function isManufacturerDetail(label: string): boolean {
  return /\b(?:manufacturer|mfr|supplier|vendor|brand)\b/i.test(label.replace(/[_-]/g, " "));
}

/** Remove identifying fields entirely, including unknown/custom manufacturers. */
export function customerQuoteOptions(options: string[]): string[] {
  return options.flatMap((option) => {
    const separator = option.indexOf(":");
    const label = separator < 0 ? "" : option.slice(0, separator);
    if (isManufacturerDetail(label) || /^(?:catalog|quote lab)\b/i.test(label)) return [];
    if (separator < 0) {
      const cleaned = customerQuoteText(option);
      return cleaned ? [cleaned] : [];
    }
    const value = customerQuoteText(option.slice(separator + 1), /\b(?:color|fabric|finish)\b/i.test(label));
    const cleanLabel = customerQuoteText(label);
    return cleanLabel && value ? [`${cleanLabel}: ${value}`] : [];
  });
}
