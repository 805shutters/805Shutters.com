import {
  FAUX_WOOD_MOUNT_TYPES,
  FAUX_WOOD_PRODUCT_LINES,
  FAUX_WOOD_SLAT_SIZES,
  FAUX_WOOD_SMARTPRIVACY_COLORS,
  FAUX_WOOD_ULTIMATE_COLORS,
  HONEYCOMB_CELL_SIZES,
  HONEYCOMB_LIFT_SYSTEMS,
  HONEYCOMB_LIGHT_CONTROL,
  HONEYCOMB_SHADE_TYPES,
  NORMAN_WOODLORE_FRAME_TYPES,
  ONYX_COLORS,
  PERFECTSHEER_FABRICS,
  PERFECTSHEER_LIFT_SYSTEMS,
  PERFECTSHEER_LIGHT_CONTROL,
  PERFECTSHEER_MOUNT_TYPES,
  ROLLER_LIFT_SYSTEMS,
  ROLLER_MOUNT_TYPES,
  ROLLER_VALANCES,
  ROMAN_ALL_FABRICS,
  ROMAN_FABRIC_CATEGORY_NAMES,
  ROMAN_LIFT_SYSTEMS,
  ROMAN_MOUNT_TYPES,
  ROMAN_VALANCES,
  SHUTTER_LOUVER_SIZES,
  SHUTTER_TILT_TYPES,
  SMARTDRAPE_CONTROL_SIDES,
  SMARTDRAPE_CONTROL_TYPES,
  SMARTDRAPE_FABRICS,
  SMARTDRAPE_SHADE_TYPES,
  VERTICAL_CONTROL_TYPES,
  VERTICAL_FABRIC_GROUPS,
  VERTICAL_STACK_OPTIONS,
  WOOD_BLIND_COLORS,
  WOOD_BLIND_MOUNT_TYPES,
  WOOD_BLIND_SLAT_SIZES,
  getRomanFabricCategoryForColor,
  getRomanFabricColorsForCategory,
  getVerticalColorsForGroup,
} from "@mts/lib/quoteConstants";
import { getHoneycombFabricStrings } from "@mts/lib/fabricCatalog";
import {
  ROLLER_FABRIC_COLOR_CODE_DETAIL,
  ROLLER_FABRIC_COLOR_COLLECTION_DETAIL,
  ROLLER_FABRIC_COLOR_ID_DETAIL,
  ROLLER_FABRIC_COLOR_NAME_DETAIL,
  ROLLER_FABRIC_COLOR_TYPE_DETAIL,
  findMtsRollerFabricColorInText,
  getMtsRollerFabricCollections,
} from "@mts/lib/normanRollerFabricCatalog";
import type { SalesQuoteDesign } from "@mts/types/quote";

export interface QuoteOptionParseResult {
  patch: Partial<SalesQuoteDesign>;
  matches: string[];
  unmatchedText: string;
}

type FieldPatch = Partial<SalesQuoteDesign> & {
  options_json?: Record<string, unknown>;
};

export function parseQuoteOptionText(productType: string, input: string): QuoteOptionParseResult {
  const text = normalize(input);
  const patch: FieldPatch = {};
  const matches: string[] = [];

  if (!text) return { patch, matches, unmatchedText: input };

  if (productType === "Honeycomb Shades") {
    matchHoneycomb(text, patch, matches);
  } else if (productType === "Roller Shades") {
    matchRoller(text, patch, matches);
  } else if (productType === "Roman Shades") {
    matchRoman(text, patch, matches);
  } else if (productType === "Sheer Shades") {
    matchSheer(text, patch, matches);
  } else if (productType === "Faux Wood Blinds") {
    matchFauxWood(text, patch, matches);
  } else if (productType === "Wood Blinds") {
    matchWoodBlind(text, patch, matches);
  } else if (productType === "Vertical Blinds") {
    matchVertical(text, patch, matches);
  } else if (productType === "Smart Drapes") {
    matchSmartDrapes(text, patch, matches);
  } else if (productType === "Shutters") {
    matchShutters(text, patch, matches);
  }

  return { patch, matches, unmatchedText: input };
}

function matchHoneycomb(text: string, patch: FieldPatch, matches: string[]) {
  const cellSize = matchCellSize(text);
  if (cellSize) setJson(patch, "cell_size", cellSize, matches, "Cell Size");

  const shadeType = matchOption(text, HONEYCOMB_SHADE_TYPES);
  if (shadeType) setField(patch, "shade_type", shadeType, matches, "Shade Type");
  else if (cellSize) setField(patch, "shade_type", "Single", matches, "Shade Type");

  const lift = matchOption(text, HONEYCOMB_LIFT_SYSTEMS, {
    "Top Down-Bottom Up": ["tdbu", "top down bottom up", "top down"],
  });
  if (lift) setField(patch, "lift_system", lift, matches, "Lift System");

  const fabric = matchOption(text, getHoneycombFabricStrings(cellSize || '3/4" Single Cell'), {
    "C4506 Primrose": ["primrose"],
  });
  if (fabric) {
    setField(patch, "fabric", fabric, matches, "Fabric");
    if (normalize(fabric).includes("primrose")) {
      setJson(patch, "light_control", "Room Darkening", matches, "Light Control");
    }
  }

  const lightControl = matchOption(text, HONEYCOMB_LIGHT_CONTROL, {
    "Light Filtering": ["lf", "light filter"],
    "Room Darkening": ["rd", "room dark"],
  });
  if (lightControl) setJson(patch, "light_control", lightControl, matches, "Light Control");
}

function matchRoller(text: string, patch: FieldPatch, matches: string[]) {
  const mount = matchMount(text, ROLLER_MOUNT_TYPES);
  if (mount) setField(patch, "mount_type", mount, matches, "Mount Type");

  const lift = matchOption(text, ROLLER_LIFT_SYSTEMS, {
    "Smart Release": ["smart release", "smartrelease"],
  });
  if (lift) setField(patch, "lift_system", lift, matches, "Lift System");

  const valance = matchOption(text, ROLLER_VALANCES, {
    "No Valance": ["open roll", "no valance", "no valance open roll"],
    "Square Fascia*": ["square fascia"],
    "Plain Curved Fascia*": ["plain curved fascia"],
    "Curved Fascia with Fabric*": ["decorative fabric valance", "curved fascia fabric"],
    '3 1/2" Fabric Valance*': ["3 1/2 fabric valance", "3.5 fabric valance"],
    '4 1/2" Fabric Valance*': ["4 1/2 fabric valance", "4.5 fabric valance"],
    '6" Fabric Valance*': ["6 fabric valance"],
    '8" Fabric Valance*': ["8 fabric valance"],
    '4 1/2" Modern Wood Valance*': [
      "premium wood valance",
      "modern wood valance",
      "4 1/2 modern wood valance",
      "4.5 modern wood valance",
    ],
    "Cassette*": ["standard cassette", "cassette"],
  });
  if (valance) setField(patch, "valance", valance, matches, "Valance");

  const fabricColor = findMtsRollerFabricColorInText(text);
  if (fabricColor) {
    setField(patch, "fabric", fabricColor.collection, matches, "Fabric");
    setJson(patch, ROLLER_FABRIC_COLOR_ID_DETAIL, fabricColor.id, matches, "Fabric Color ID");
    setJson(
      patch,
      ROLLER_FABRIC_COLOR_COLLECTION_DETAIL,
      fabricColor.collection,
      matches,
      "Fabric Collection"
    );
    setJson(patch, ROLLER_FABRIC_COLOR_CODE_DETAIL, fabricColor.colorCode, matches, "Fabric Code");
    setJson(patch, ROLLER_FABRIC_COLOR_NAME_DETAIL, fabricColor.colorName, matches, "Fabric Color");
    setJson(patch, ROLLER_FABRIC_COLOR_TYPE_DETAIL, fabricColor.fabricType, matches, "Fabric Type");
    return;
  }

  const fabric = matchOption(text, getMtsRollerFabricCollections());
  if (fabric) setField(patch, "fabric", fabric, matches, "Fabric");
}

function matchRoman(text: string, patch: FieldPatch, matches: string[]) {
  const mount = matchMount(text, ROMAN_MOUNT_TYPES);
  if (mount) setField(patch, "mount_type", mount, matches, "Mount Type");

  const lift = matchOption(text, ROMAN_LIFT_SYSTEMS);
  if (lift) setField(patch, "lift_system", lift, matches, "Lift System");

  const valance = matchOption(text, ROMAN_VALANCES, {
    "Standard Cassette Valance": ["standard cassette", "cassette"],
    "Premium Wood Valance": ["premium wood"],
    "No Valance / Open Roll": ["open roll", "no valance"],
  });
  if (valance) setField(patch, "valance", valance, matches, "Valance");

  const category = matchOption(text, ROMAN_FABRIC_CATEGORY_NAMES, {
    "Belgian Linen": ["libeco", "libeco belgian linen"],
  });
  if (category) setJson(patch, "roman_fabric_category", category, matches, "Fabric Category");

  const fabricOptions = category ? getRomanFabricColorsForCategory(category) : ROMAN_ALL_FABRICS;
  const fabric = matchOption(text, fabricOptions);
  if (fabric) {
    setField(patch, "fabric", fabric, matches, "Fabric Color");
    const fabricCategory = getRomanFabricCategoryForColor(fabric);
    if (fabricCategory && !category) {
      setJson(patch, "roman_fabric_category", fabricCategory, matches, "Fabric Category");
    }
  }
}

function matchSheer(text: string, patch: FieldPatch, matches: string[]) {
  const mount = matchMount(text, PERFECTSHEER_MOUNT_TYPES);
  if (mount) setField(patch, "mount_type", mount, matches, "Mount Type");

  const lightControl = matchOption(text, PERFECTSHEER_LIGHT_CONTROL, {
    "Light Filtering": ["lf", "light filter"],
    "Room Darkening": ["rd", "room dark"],
  });
  if (lightControl) setJson(patch, "light_control", lightControl, matches, "Light Control");

  const lift = matchOption(text, PERFECTSHEER_LIFT_SYSTEMS);
  if (lift) setField(patch, "lift_system", lift, matches, "Lift System");

  const fabric = matchOption(text, PERFECTSHEER_FABRICS);
  if (fabric) setField(patch, "fabric", fabric, matches, "Fabric");
}

function matchFauxWood(text: string, patch: FieldPatch, matches: string[]) {
  const mount = matchMount(text, FAUX_WOOD_MOUNT_TYPES);
  if (mount) setField(patch, "mount_type", mount, matches, "Mount Type");

  const slatSize = matchOption(text, FAUX_WOOD_SLAT_SIZES, {
    '2.5"': ["2.5", "2 1/2", "two and a half"],
    '2"': ["2 inch", "2in"],
  });
  if (slatSize) setJson(patch, "slat_size", slatSize, matches, "Slat Size");

  const productLine = matchOption(text, FAUX_WOOD_PRODUCT_LINES);
  if (productLine) setJson(patch, "product_line", productLine, matches, "Product Line");

  const colorOptions =
    productLine === "Ultimate"
      ? FAUX_WOOD_ULTIMATE_COLORS
      : [...FAUX_WOOD_SMARTPRIVACY_COLORS, ...FAUX_WOOD_ULTIMATE_COLORS];
  const color = matchOption(text, colorOptions);
  if (color) setJson(patch, "color", color, matches, "Color");
}

function matchWoodBlind(text: string, patch: FieldPatch, matches: string[]) {
  const mount = matchMount(text, WOOD_BLIND_MOUNT_TYPES);
  if (mount) setField(patch, "mount_type", mount, matches, "Mount Type");

  const slatSize = matchOption(text, WOOD_BLIND_SLAT_SIZES, {
    '2.5"': ["2.5", "2 1/2", "two and a half"],
    '2"': ["2 inch", "2in"],
  });
  if (slatSize) setJson(patch, "slat_size", slatSize, matches, "Slat Size");

  const color = matchOption(text, WOOD_BLIND_COLORS);
  if (color) setJson(patch, "color", color, matches, "Color");
}

function matchVertical(text: string, patch: FieldPatch, matches: string[]) {
  const fabricGroup = matchOption(text, VERTICAL_FABRIC_GROUPS);
  if (fabricGroup) setJson(patch, "fabric_group", fabricGroup, matches, "Fabric Group");

  const color = matchOption(text, getVerticalColorsForGroup(fabricGroup || "Classic collection"));
  if (color) setJson(patch, "vertical_color", color, matches, "Color / Material");

  const stack = matchOption(text, VERTICAL_STACK_OPTIONS, {
    "Stack Left": ["left stack", "stack left"],
    "Stack Right": ["right stack", "stack right"],
  });
  if (stack) setJson(patch, "stack_option", stack, matches, "Stack Option");

  const control = matchOption(text, VERTICAL_CONTROL_TYPES, {
    "Cordless Wand Operation": ["cordless wand", "wand"],
  });
  if (control) setJson(patch, "control_type", control, matches, "Control Type");
}

function matchSmartDrapes(text: string, patch: FieldPatch, matches: string[]) {
  const shadeType = matchOption(text, SMARTDRAPE_SHADE_TYPES, {
    "Light Filtering": ["lf", "light filter"],
    "Room Darkening": ["rd", "room dark"],
  });
  if (shadeType) setField(patch, "shade_type", shadeType, matches, "Shade Type");

  const fabric = matchOption(text, SMARTDRAPE_FABRICS);
  if (fabric) setField(patch, "fabric", fabric, matches, "Fabric");

  const control = matchOption(text, SMARTDRAPE_CONTROL_TYPES);
  if (control) setJson(patch, "control_type", control, matches, "Control Type");

  const controlSide = matchOption(text, SMARTDRAPE_CONTROL_SIDES);
  if (controlSide) setJson(patch, "control_side", controlSide, matches, "Control Side");
}

function matchShutters(text: string, patch: FieldPatch, matches: string[]) {
  if (containsAny(text, ["woodlore", "wood lore", "composite"])) {
    setField(patch, "supplier", "Norman", matches, "Supplier");
    setField(patch, "material", null, matches, "Material");
    setJson(patch, "material_type", "Composite", matches, "Material Type");
    setJson(patch, "composite_subtype", "Woodlore", matches, "Composite Type");
  }

  const frame = matchOption(text, NORMAN_WOODLORE_FRAME_TYPES, {
    '2" Bel Air Z Frame': ["2 bel air z frame", "bel air z frame", "bel air"],
    "Direct Mount (No Frame)": ["direct mount", "no frame"],
  });
  if (frame) setJson(patch, "frame_type", frame, matches, "Frame Type");

  const louver = matchOption(text, SHUTTER_LOUVER_SIZES, {
    '3 1/2"': ["3.5", "3 1/2", "three and a half"],
    '4 1/2"': ["4.5", "4 1/2", "four and a half"],
    '2 1/2"': ["2.5", "2 1/2", "two and a half"],
  });
  if (louver) setField(patch, "louver_size", louver, matches, "Louver Size");

  const tilt = matchOption(text, SHUTTER_TILT_TYPES, {
    "Invisible Tilt": ["hidden tilt", "invisible", "hidden"],
    "Standard Tilt": ["standard tilt", "front tilt"],
    "Offset Tilt": ["offset tilt", "offset"],
  });
  if (tilt) setField(patch, "tilt_type", tilt, matches, "Tilt Type");

  const color = matchOption(text, ONYX_COLORS, {
    "100_Pure White": ["pure white"],
  });
  if (color) setJson(patch, "color", color, matches, "Color");
}

function matchCellSize(text: string): string | null {
  if (containsAny(text, ["3/4", "3 4", "three quarter", "three-quarter"])) {
    if (containsAny(text, ["double"])) return '3/4" Double Cell';
    return '3/4" Single Cell';
  }

  return matchOption(text, HONEYCOMB_CELL_SIZES, {
    '1/2" Double Cell': ["1/2 double", "half double"],
    '3/8" Single Cell': ["3/8", "three eighth"],
    '9/16" Single Cell': ["9/16"],
    '1 1/4" Single Cell': ["1 1/4", "one and a quarter"],
  });
}

function matchMount<T extends string>(text: string, options: readonly T[]): T | null {
  return matchOption(text, options, {
    "Inside Mount": ["inside", "inside mount"],
    "Outside Mount": ["outside", "outside mount"],
  } as Partial<Record<T, string[]>>);
}

function matchOption<T extends string>(
  text: string,
  options: readonly T[],
  aliases: Partial<Record<T, string[]>> = {}
): T | null {
  const sortedOptions = [...options].sort(
    (a, b) => normalize(b).length - normalize(a).length
  ) as T[];

  for (const option of sortedOptions) {
    const candidates = [option, shortFabricName(option), ...(aliases[option] || [])]
      .filter(Boolean)
      .map((candidate) => normalize(candidate));
    if (
      candidates.some(
        (candidate) => candidate && (text.includes(candidate) || allWordsMatch(text, candidate))
      )
    ) {
      return option;
    }
  }
  return null;
}

function allWordsMatch(text: string, candidate: string): boolean {
  const rawWords = candidate.split(" ").filter(Boolean);
  const numericWords = rawWords.filter((word) => /\d/.test(word));
  if (numericWords.length > 0 && !numericWords.every((word) => text.includes(word))) {
    return false;
  }

  const words = rawWords.filter((word) => word.length > 1 && !/^\d+$/.test(word));
  return words.length > 1 && words.every((word) => text.includes(word));
}

function setField<K extends keyof SalesQuoteDesign>(
  patch: FieldPatch,
  key: K,
  value: SalesQuoteDesign[K],
  matches: string[],
  label: string
) {
  patch[key] = value;
  matches.push(`${label}: ${String(value)}`);
}

function setJson(patch: FieldPatch, key: string, value: unknown, matches: string[], label: string) {
  patch.options_json = { ...(patch.options_json || {}), [key]: value };
  matches.push(`${label}: ${String(value)}`);
}

function shortFabricName(value: string): string {
  return value
    .replace(/^[A-Z]\d+[A-Z]?\s+/, "")
    .replace(/\s+Collection:/i, " ")
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .trim();
}

function containsAny(text: string, needles: string[]): boolean {
  return needles.some((needle) => text.includes(normalize(needle)));
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/®/g, "")
    .replace(/["']/g, "")
    .replace(/[^a-z0-9/.\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
