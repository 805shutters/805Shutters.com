import { findProductSurcharge, getProduct, type CatalogSurcharge } from "./catalog";

export type AutomaticSurchargeSelection = { id: string; units?: number };

export const LIGHT_GUARD_SURCHARGE_IDS = [
  "basic_light_guard",
  "premium_wood_light_guard",
  "lightguard_360",
] as const;

export const AUTOMATIC_CHECKBOX_DETAIL_IDS = [
  "shim",
  "aluminum_shim",
  "keystone",
  "magnetic_hold_down",
  "side_mount_bracket",
] as const;

type DetailRecord = Record<string, unknown>;
type AutomaticCheckboxDetailId = (typeof AUTOMATIC_CHECKBOX_DETAIL_IDS)[number];

const ROOM_DARKENING_SURCHARGE_IDS: Record<string, string[]> = {
  honeycomb: ["room_darkening"],
  perfectsheer: ["room_darkening_fabric"],
  smartdrape: ["room_darkening"],
  vertical_honeycomb: ["room_darkening_sheer_fr_essentials_fabric_surcharge"],
};

const FABRIC_SURCHARGE_DETAIL_ID = "fabric_surcharge_id";

const PRODUCT_FIELD_MAPPINGS: Record<string, Record<string, Record<string, string>>> = {
  citylights_aluminum: {
    slat_finish: {
      metallic: "metallic_slats_matte_finishes_perforated_slats",
      matte: "metallic_slats_matte_finishes_perforated_slats",
      perforated: "metallic_slats_matte_finishes_perforated_slats",
    },
  },
  faux_wood: {
    color: {
      printed: "printed_color",
    },
  },
  honeycomb: {
    lift_system: {
      continuous_cord_loop: "continuous_cord_loop",
      smartrelease: "smartrelease",
    },
  },
  perfectsheer: {
    valance: {
      wood: "wood_valance",
      fabric: "3_1_2in_and_4_1_2in_fabric_valance",
    },
  },
  roller: {
    lift_system: {
      smartrelease: "smartrelease",
    },
    shade_type: {
      dual: "dual_shade",
      coupled: "coupled_shade",
    },
    valance: {
      square_fascia: "fascia_wood_valance_3_1_2in_4_1_2in_and_6in",
      plain_curved_fascia: "fascia_wood_valance_3_1_2in_4_1_2in_and_6in",
      curved_fascia_with_fabric: "fabric_valance_3_1_2in_4_1_2in_and_6in",
      fabric_valance_3_1_2: "fabric_valance_3_1_2in_4_1_2in_and_6in",
      fabric_valance_4_1_2: "fabric_valance_3_1_2in_4_1_2in_and_6in",
      fabric_valance_6: "fabric_valance_3_1_2in_4_1_2in_and_6in",
      fabric_valance_8: "8in_fabric_valance_and_cassette",
      modern_wood_valance_4_1_2: "fascia_wood_valance_3_1_2in_4_1_2in_and_6in",
      cassette: "8in_fabric_valance_and_cassette",
      // Legacy values from the previous generic selector; retained so saved quotes
      // continue to reprice against the same guide-backed surcharge tables.
      fascia: "fascia_wood_valance_3_1_2in_4_1_2in_and_6in",
      wood_valance: "fascia_wood_valance_3_1_2in_4_1_2in_and_6in",
      fabric_valance: "fabric_valance_3_1_2in_4_1_2in_and_6in",
      raceway: "raceway",
    },
  },
  roman: {
    lift_system: {
      smartrelease: "smartrelease_lift_system",
    },
    lining: {
      blackout: "blackout_lining",
    },
  },
  smartdrape: {
    vane_style: {
      alternating: "alternating_colors",
      room_darkening: "room_darkening",
    },
  },
  smartprivacy_faux: {
    color: {
      printed: "printed_colors",
    },
  },
  wood_blinds: {
    color: {
      designer: "designer_color",
      premium: "premium_color",
    },
  },
};

const CHECKBOX_SURCHARGE_ID_CANDIDATES: Record<AutomaticCheckboxDetailId, string[]> = {
  shim: ["shim"],
  aluminum_shim: ["aluminum_shim"],
  keystone: ["keystone"],
  magnetic_hold_down: ["magnetic_hold_down"],
  side_mount_bracket: ["side_mount_bracket", "side_mount_bracket_available_in_2in_only"],
};

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isSelected(value: unknown): boolean {
  return value === true || value === "true" || value === "yes" || value === "on";
}

export function isPriceableCatalogSurcharge(surcharge: CatalogSurcharge): boolean {
  return surcharge.value != null || surcharge.widthGraduated != null;
}

export function findPriceableProductSurcharge(productId: string, surchargeId: string): CatalogSurcharge | null {
  const product = getProduct(productId);
  if (!product) return null;
  const surcharge = findProductSurcharge(product, surchargeId);
  return surcharge && isPriceableCatalogSurcharge(surcharge) ? surcharge : null;
}

export function resolveAutomaticCheckboxSurcharge(productId: string, detailId: AutomaticCheckboxDetailId): CatalogSurcharge | null {
  for (const surchargeId of CHECKBOX_SURCHARGE_ID_CANDIDATES[detailId]) {
    const surcharge = findPriceableProductSurcharge(productId, surchargeId);
    if (surcharge) return surcharge;
  }
  return null;
}

export function getProductLightGuardSurcharges(productId: string): CatalogSurcharge[] {
  return LIGHT_GUARD_SURCHARGE_IDS
    .map((id) => findPriceableProductSurcharge(productId, id))
    .filter(Boolean) as CatalogSurcharge[];
}

export function deriveAutomaticSurcharges(productId: string, details: DetailRecord | null | undefined): AutomaticSurchargeSelection[] {
  const product = getProduct(productId);
  if (!product) return [];
  const source = details && typeof details === "object" && !Array.isArray(details) ? details : {};
  const seen = new Set<string>();
  const selections: AutomaticSurchargeSelection[] = [];

  const add = (surchargeId: string | null | undefined) => {
    if (!surchargeId || seen.has(surchargeId)) return;
    if (!findPriceableProductSurcharge(productId, surchargeId)) return;
    seen.add(surchargeId);
    selections.push({ id: surchargeId });
  };

  const lightGuard = text(source.light_guard);
  if (lightGuard && lightGuard !== "none" && (LIGHT_GUARD_SURCHARGE_IDS as readonly string[]).includes(lightGuard)) {
    add(lightGuard);
  }

  const fabricSurcharge = text(source[FABRIC_SURCHARGE_DETAIL_ID]);
  if (fabricSurcharge) add(fabricSurcharge);

  for (const detailId of AUTOMATIC_CHECKBOX_DETAIL_IDS) {
    if (!isSelected(source[detailId])) continue;
    add(resolveAutomaticCheckboxSurcharge(productId, detailId)?.id);
  }

  if (text(source.light_control) === "room_darkening") {
    for (const surchargeId of ROOM_DARKENING_SURCHARGE_IDS[productId] ?? []) add(surchargeId);
  }

  const fieldMappings = PRODUCT_FIELD_MAPPINGS[productId] ?? {};
  for (const [fieldId, options] of Object.entries(fieldMappings)) {
    const selected = text(source[fieldId]);
    if (selected) add(options[selected]);
  }

  return selections;
}
