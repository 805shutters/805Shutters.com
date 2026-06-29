import {
  ONYX_SHUTTER_FIXED_SURCHARGES,
  ONYX_SHUTTER_PERCENTAGE_SURCHARGES,
  SHUTTER_FIXED_SURCHARGES,
  SHUTTER_PERCENTAGE_SURCHARGES,
  type Surcharge,
} from "./pricingData";
import type { SalesQuoteDesign } from "../types/quote";

export interface ShutterQuoteSurcharge {
  id: string;
  name: string;
  type: "percentage" | "fixed";
  value: number;
  quantity: number;
  category: string;
  portalLabel?: string;
}

function slugifySurcharge(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function toAutomaticSurcharge(
  productType: string,
  surcharge: Surcharge,
  category: string
): ShutterQuoteSurcharge {
  return {
    id: slugifySurcharge(`${productType}-${category}-${surcharge.name}-${surcharge.type}-${surcharge.value}`),
    name: surcharge.name,
    type: surcharge.type,
    value: surcharge.value,
    quantity: 1,
    category,
    portalLabel: surcharge.name,
  };
}

function findSurcharge(catalog: readonly Surcharge[], name: string): Surcharge | undefined {
  return catalog.find((surcharge) => surcharge.name === name);
}

function appendByName(
  items: ShutterQuoteSurcharge[],
  productType: string,
  catalog: readonly Surcharge[],
  category: string,
  name: string | null | undefined
): void {
  if (!name) return;
  const surcharge = findSurcharge(catalog, name);
  if (!surcharge) return;
  const item = toAutomaticSurcharge(productType, surcharge, category);
  if (items.some((selected) => selected.id === item.id)) return;
  items.push(item);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function yes(value: unknown): boolean {
  return value === true || /^true|yes|on$/i.test(text(value));
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function getNormanSpecialtySurchargeName(value: string): string | null {
  const normalized = normalize(value);
  if (!normalized) return null;
  if (normalized.includes("liberty arch")) return "Liberty Arch";
  if (normalized.includes("french door")) return "French Door Cutout";
  if (normalized.includes("angle top")) return "Angle Top";
  if (normalized.includes("arch top picture")) return "Arch Top Picture Window with Horizontal Louvers";
  if (normalized.includes("quarter sunburst")) return "Quarter Sunburst Panel with Continuous Frame";
  if (normalized.includes("horizontal center arch")) return "Horizontal Center Arch with Quarter Round Side Panels";
  if (normalized.includes("sunburst center arch")) return "Sunburst Center Arch with Quarter Round Side Panels";
  if (normalized.includes("all other")) return "All Other Shapes";
  return null;
}

function getOnyxSpecialtySurchargeName(value: string): string | null {
  const normalized = normalize(value);
  if (!normalized) return null;
  if (normalized.includes("french door")) return "French Door CutOut (L Frame only)";
  if (normalized.includes("sunburst")) return "Sunburst";
  if (normalized.includes("octagon")) return "Octagon";
  if (normalized.includes("hexagon")) return "Hexagon";
  if (normalized.includes("circle")) return "Circle";
  if (normalized.includes("elongated eyebrow")) return "Elongated Eyebrow";
  if (normalized.includes("liberty arch")) return "Liberty Arch Panel";
  if (normalized.includes("angle") || normalized.includes("triangle") || normalized.includes("racked")) return "Racked";
  if (normalized.includes("arch") || normalized.includes("eyebrow") || normalized.includes("round") || normalized.includes("oval") || normalized.includes("peak")) return "Arch";
  return null;
}

function addNormanShutterSurcharges(
  surcharges: ShutterQuoteSurcharge[],
  productType: string,
  design: SalesQuoteDesign
): void {
  const opts = design.options_json || {};
  const percentageCategory = "Shutter Percentage Surcharges";
  const fixedCategory = "Shutter Fixed Surcharges";

  const louverSize = text(design.louver_size);
  if (louverSize === '1 7/8"') {
    appendByName(surcharges, productType, SHUTTER_PERCENTAGE_SURCHARGES, percentageCategory, '1 7/8" Louvers');
  } else if (louverSize === '4 1/2"') {
    appendByName(surcharges, productType, SHUTTER_PERCENTAGE_SURCHARGES, percentageCategory, '4.5" Louvers');
  }

  const tiltType = text(design.tilt_type);
  if (/offset/i.test(tiltType)) {
    appendByName(surcharges, productType, SHUTTER_FIXED_SURCHARGES, fixedCategory, "Offset Tilt Rod");
  } else if (/invisible|clearview/i.test(tiltType)) {
    appendByName(surcharges, productType, SHUTTER_FIXED_SURCHARGES, fixedCategory, "InvisibleTilt");
  }

  if (text(design.hinge_color) === "Stainless Steel") {
    appendByName(surcharges, productType, SHUTTER_PERCENTAGE_SURCHARGES, percentageCategory, "Stainless Steel Hinges");
  }

  const frameType = text(opts.frame_type);
  if (/l frame/i.test(frameType) && /buildout/i.test(frameType)) {
    appendByName(surcharges, productType, SHUTTER_PERCENTAGE_SURCHARGES, percentageCategory, 'L Frames with 1/2" or 1" Buildout');
  }

  const panelConfig = normalize(text(design.panel_config) || text(opts.panel_config));
  if (panelConfig.includes("double hung")) {
    appendByName(surcharges, productType, SHUTTER_PERCENTAGE_SURCHARGES, percentageCategory, "Double-Hung");
  } else if (panelConfig.includes("cafe")) {
    appendByName(surcharges, productType, SHUTTER_PERCENTAGE_SURCHARGES, percentageCategory, "Cafe Shutters");
  } else if (panelConfig.includes("bypass") || panelConfig.includes("bifold")) {
    appendByName(surcharges, productType, SHUTTER_PERCENTAGE_SURCHARGES, percentageCategory, "Bypass & Bifold Track Shutters");
  }

  const trackSystem = normalize(text(opts.track_system));
  if (trackSystem === "bypass track") {
    appendByName(surcharges, productType, SHUTTER_PERCENTAGE_SURCHARGES, percentageCategory, "Bypass Track");
  } else if (trackSystem === "bifold 180") {
    appendByName(surcharges, productType, SHUTTER_PERCENTAGE_SURCHARGES, percentageCategory, "Bifold 180");
  } else if (trackSystem === "floating 90 bifold") {
    appendByName(surcharges, productType, SHUTTER_PERCENTAGE_SURCHARGES, percentageCategory, "Floating 90 Bifold");
  } else if (trackSystem === "triple track") {
    appendByName(surcharges, productType, SHUTTER_PERCENTAGE_SURCHARGES, percentageCategory, "Triple Track");
  } else if (trackSystem === "track only") {
    appendByName(surcharges, productType, SHUTTER_PERCENTAGE_SURCHARGES, percentageCategory, "Track Only");
  } else if (trackSystem === "track w header fascia" || trackSystem === "track with header and fascia") {
    appendByName(surcharges, productType, SHUTTER_PERCENTAGE_SURCHARGES, percentageCategory, "Track w/ Header & Fascia");
  }

  if (yes(opts.french_door_cutout) || text(opts.custom_work) === "French Door Cutout") {
    appendByName(surcharges, productType, SHUTTER_FIXED_SURCHARGES, fixedCategory, "French Door Cutout");
  }

  appendByName(
    surcharges,
    productType,
    SHUTTER_FIXED_SURCHARGES,
    fixedCategory,
    getNormanSpecialtySurchargeName(text(opts.specialty_shape))
  );
}

function addOnyxShutterSurcharges(
  surcharges: ShutterQuoteSurcharge[],
  productType: string,
  design: SalesQuoteDesign
): void {
  const opts = design.options_json || {};
  const percentageCategory = "Onyx Shutter Surcharges";
  const fixedCategory = "Onyx Shutter Fixed Surcharges";

  if (text(design.tilt_type) === "Offset Tilt Rod") {
    appendByName(surcharges, productType, ONYX_SHUTTER_PERCENTAGE_SURCHARGES, percentageCategory, "Offset Tilt Rod");
  }

  const extensionRod = text(opts.extension_rod);
  if (extensionRod === '1/2"') {
    appendByName(surcharges, productType, ONYX_SHUTTER_PERCENTAGE_SURCHARGES, percentageCategory, 'Extension less than 1"');
  } else if (extensionRod && extensionRod !== "None") {
    appendByName(surcharges, productType, ONYX_SHUTTER_PERCENTAGE_SURCHARGES, percentageCategory, 'Extension equal to or greater than 1"');
  }

  const trackType = text(opts.track_type);
  const orderType = text(opts.onyx_order_type);
  if (orderType === "By Pass" && !trackType) {
    appendByName(surcharges, productType, ONYX_SHUTTER_FIXED_SURCHARGES, fixedCategory, "Close By-Pass (2 tracks)");
  } else if (orderType === "Bi Fold" && !trackType) {
    appendByName(surcharges, productType, ONYX_SHUTTER_FIXED_SURCHARGES, fixedCategory, "Bi-Fold");
  } else if (orderType === "French Door") {
    appendByName(surcharges, productType, ONYX_SHUTTER_FIXED_SURCHARGES, fixedCategory, "French Door CutOut (L Frame only)");
  }

  if (trackType === "Bypass") {
    const bypassType = text(opts.bypass_type);
    appendByName(
      surcharges,
      productType,
      ONYX_SHUTTER_FIXED_SURCHARGES,
      fixedCategory,
      bypassType === "Open Bypass" ? "Open By-Pass (2 tracks)" : "Close By-Pass (2 tracks)"
    );
  } else if (trackType === "Bifold") {
    appendByName(surcharges, productType, ONYX_SHUTTER_FIXED_SURCHARGES, fixedCategory, "Bi-Fold");
  }

  const specialtyName = getOnyxSpecialtySurchargeName(text(opts.specialty_shape));
  const specialtyCatalog =
    specialtyName === "Liberty Arch Panel"
      ? ONYX_SHUTTER_PERCENTAGE_SURCHARGES
      : ONYX_SHUTTER_FIXED_SURCHARGES;
  const specialtyCategory =
    specialtyName === "Liberty Arch Panel" ? percentageCategory : fixedCategory;
  appendByName(surcharges, productType, specialtyCatalog, specialtyCategory, specialtyName);

  const customWork = text(opts.custom_work);
  if (customWork === "French Door CutOut (L Frame only)" || customWork === "French Door Cutout") {
    appendByName(surcharges, productType, ONYX_SHUTTER_FIXED_SURCHARGES, fixedCategory, "French Door CutOut (L Frame only)");
  } else if (customWork === "Custom Color (per color)") {
    appendByName(surcharges, productType, ONYX_SHUTTER_FIXED_SURCHARGES, fixedCategory, "Custom Color (per color)");
  } else if (/dishout/i.test(customWork)) {
    appendByName(surcharges, productType, ONYX_SHUTTER_FIXED_SURCHARGES, fixedCategory, 'Dishout Cut (per cut; 1 1/4" max)');
  }
}

export function getAutomaticShutterOptionSurcharges(
  design: SalesQuoteDesign | undefined,
  productType = "Shutters"
): ShutterQuoteSurcharge[] {
  if (!design) return [];

  const surcharges: ShutterQuoteSurcharge[] = [];
  if (design.supplier === "Onyx") {
    addOnyxShutterSurcharges(surcharges, productType, design);
  } else {
    addNormanShutterSurcharges(surcharges, productType, design);
  }
  return surcharges;
}
