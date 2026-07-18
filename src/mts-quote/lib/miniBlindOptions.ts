import { getProduct, getProgram } from "@/lib/quote/catalog";

const CITYLIGHTS_PRODUCT_ID = "citylights_aluminum";
const CITYLIGHTS_PROGRAM_ID = "citylights_aluminum_1in_slats_cordless_pgusa";

export interface MiniBlindSurcharge {
  id: string;
  name: string;
  portalLabel: string;
  type: "percentage" | "fixed";
  value: number;
  quantity: number;
  category: string;
}

export interface MiniBlindSpecWarning {
  id: string;
  message: string;
}

export interface MiniBlindSpecInput {
  productType: string | null | undefined;
  widthInches: number;
  heightInches: number;
  slatSize?: string | null;
}

export function getMiniBlindMaxWidth(slatSize?: string | null): number {
  return slatSize === '1/2"' || slatSize === '1"' ? 78 : 96;
}

export function isMiniBlindSizeWithinLimits(
  widthInches: number,
  heightInches: number,
  slatSize?: string | null
): boolean {
  if (!slatSize) return false;
  return (
    Number.isFinite(widthInches) &&
    Number.isFinite(heightInches) &&
    widthInches > 0 &&
    heightInches > 0 &&
    widthInches <= getMiniBlindMaxWidth(slatSize) &&
    heightInches <= 96
  );
}

export function getMiniBlindSpecWarnings(input: MiniBlindSpecInput): MiniBlindSpecWarning[] {
  if (input.productType !== "Mini Blinds") return [];
  if (!input.slatSize || input.widthInches <= 0 || input.heightInches <= 0) return [];

  const warnings: MiniBlindSpecWarning[] = [];
  const maxWidth = getMiniBlindMaxWidth(input.slatSize);

  if (input.widthInches > maxWidth) {
    warnings.push({
      id: "mini-blind-max-width",
      message: `Norman CityLights ${input.slatSize} slats must be ${maxWidth}\" wide or less. This opening is ${formatInches(input.widthInches)} wide.`,
    });
  }

  if (input.heightInches > 96) {
    warnings.push({
      id: "mini-blind-max-height",
      message: `Norman CityLights mini blinds must be 96\" high or less. This opening is ${formatInches(input.heightInches)} high.`,
    });
  }

  if (
    warnings.length === 0 &&
    !isMiniBlindCatalogCellAvailable(input.widthInches, input.heightInches)
  ) {
    warnings.push({
      id: "mini-blind-na-cell",
      message: `Norman CityLights is not available at the catalog size required for this ${formatInches(input.widthInches)} x ${formatInches(input.heightInches)} opening.`,
    });
  }

  return warnings;
}

function isMiniBlindCatalogCellAvailable(widthInches: number, heightInches: number): boolean {
  const product = getProduct(CITYLIGHTS_PRODUCT_ID);
  const program = product ? getProgram(product, CITYLIGHTS_PROGRAM_ID) : undefined;
  if (!program) return false;

  const widthIndex = program.grid.widths.findIndex((width) => width >= widthInches);
  const heightIndex = program.grid.heights.findIndex((height) => height >= heightInches);
  if (widthIndex < 0 || heightIndex < 0) return false;

  const price = program.grid.prices[heightIndex]?.[widthIndex];
  return price !== null && price !== undefined && price > 0;
}

function formatInches(value: number): string {
  return `${value.toFixed(3).replace(/\.?0+$/, "")}\"`;
}

function isSelected(value: unknown): boolean {
  return value === true || String(value || "").toLowerCase() === "yes";
}

function surcharge(
  id: string,
  name: string,
  type: MiniBlindSurcharge["type"],
  value: number,
  category: string
): MiniBlindSurcharge {
  return { id, name, portalLabel: name, type, value, quantity: 1, category };
}

export function getMiniBlindLightControlOptions(slatSize?: string | null): readonly string[] {
  if (slatSize === '1/2"') return ["Regular Route Holes"];
  if (slatSize === '2"') return ["SmartPrivacy"];
  if (slatSize === '1"') return ["Regular Route Holes", "Privacy"];
  return ["Regular Route Holes", "Privacy", "SmartPrivacy"];
}

export function getMiniBlindDefaultLightControl(slatSize?: string | null): string | null {
  if (slatSize === '1/2"') return "Regular Route Holes";
  if (slatSize === '2"') return "SmartPrivacy";
  return null;
}

export function getMiniBlindFinishFromColor(colorName?: string | null): string {
  const color = String(colorName || "").toLowerCase();
  if (color.includes("perforated")) return "Perforated";
  if (color.includes("textured")) return "Textured";
  if (color.includes("metallic") || color.includes("brushed aluminum")) return "Metallic";
  if (color.includes("matte")) return "Matte";
  return "Standard";
}

export function getMiniBlindAutomaticSurcharges(
  options: Record<string, unknown>
): MiniBlindSurcharge[] {
  const slatSize = String(options.slat_size || "");
  const finish = String(options.slat_finish || "");
  const lightControl = String(options.light_control || "");
  const result: MiniBlindSurcharge[] = [];

  if (slatSize === '1/2"') {
    result.push(
      surcharge(
        "mini-blinds-micro-half-inch-slats",
        'Micro (1/2") Slats',
        "percentage",
        10,
        "Slat Size"
      )
    );
  }

  if (slatSize === '2"' || finish === "Textured") {
    result.push(
      surcharge(
        "mini-blinds-two-inch-or-textured-slats",
        slatSize === '2"' ? '2" Slats (SmartPrivacy Included)' : "Textured Slats",
        "percentage",
        20,
        slatSize === '2"' ? "Slat Size" : "Slat Finish"
      )
    );
  }

  if (["Metallic", "Matte", "Perforated"].includes(finish)) {
    result.push(
      surcharge(
        "mini-blinds-special-finish",
        `${finish} Slats`,
        "percentage",
        10,
        "Slat Finish"
      )
    );
  }

  if (slatSize === '1"' && lightControl === "Privacy") {
    result.push(
      surcharge("mini-blinds-privacy", "Privacy", "percentage", 10, "Light Control")
    );
  }

  if (isSelected(options.side_mount_bracket)) {
    result.push(
      surcharge(
        "mini-blinds-side-mount-bracket",
        'Side Mount Bracket (2" only)',
        "fixed",
        25,
        "Add-ons"
      )
    );
  }

  if (isSelected(options.shim)) {
    result.push(surcharge("mini-blinds-shim", "Shim", "fixed", 7, "Add-ons"));
  }

  return result;
}
