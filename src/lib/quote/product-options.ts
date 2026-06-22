export type QuoteDetailOption = {
  value: string;
  label: string;
};

export type QuoteDetailField = {
  id: string;
  label: string;
  type: "select" | "checkbox";
  options?: QuoteDetailOption[];
  customerVisible?: boolean;
};

const yesNo = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
];

const lightControlOptions = [
  { value: "light_filtering", label: "Light filtering" },
  { value: "room_darkening", label: "Room darkening" },
  { value: "day_night", label: "Day / night" },
];

const mountFields: QuoteDetailField[] = [
  {
    id: "mount_type",
    label: "Mount",
    type: "select",
    options: [
      { value: "inside", label: "Inside mount" },
      { value: "outside", label: "Outside mount" },
      { value: "ceiling", label: "Ceiling mount" },
      { value: "side", label: "Side mount" },
    ],
  },
];

const shadeControlFields: QuoteDetailField[] = [
  {
    id: "control_side",
    label: "Control side",
    type: "select",
    options: [
      { value: "left", label: "Left" },
      { value: "right", label: "Right" },
      { value: "center", label: "Center" },
      { value: "na", label: "N/A" },
    ],
  },
  {
    id: "lift_system",
    label: "Lift / control",
    type: "select",
    options: [
      { value: "cordless", label: "Cordless" },
      { value: "continuous_cord_loop", label: "Continuous cord loop" },
      { value: "wand", label: "Wand" },
      { value: "motorized", label: "Motorized" },
      { value: "smartrelease", label: "SmartRelease" },
    ],
  },
];

const installationFields: QuoteDetailField[] = [
  { id: "hard_surface_install", label: "Hard-surface install", type: "checkbox", customerVisible: false },
  { id: "ladder_over_15ft", label: "Ladder over 15 ft", type: "checkbox", customerVisible: false },
  { id: "requires_takedown", label: "Existing treatment takedown", type: "checkbox", customerVisible: false },
];

const shutterFields: QuoteDetailField[] = [
  {
    id: "frame_type",
    label: "Frame",
    type: "select",
    options: [
      { value: "inside_mount_l_frame", label: "Inside mount L frame" },
      { value: "outside_mount_l_frame", label: "Outside mount L frame" },
      { value: "z_frame", label: "Z frame" },
      { value: "deco_frame", label: "Deco frame" },
      { value: "direct_mount", label: "Direct mount" },
      { value: "track", label: "Track" },
    ],
  },
  {
    id: "louver_size",
    label: "Louver",
    type: "select",
    options: [
      { value: "1_7_8", label: "1 7/8 in" },
      { value: "2_1_2", label: "2 1/2 in" },
      { value: "3_1_2", label: "3 1/2 in" },
      { value: "4_1_2", label: "4 1/2 in" },
    ],
  },
  {
    id: "tilt_type",
    label: "Tilt",
    type: "select",
    options: [
      { value: "front_tilt", label: "Front tilt rod" },
      { value: "offset_tilt", label: "Offset tilt rod" },
      { value: "hidden_tilt", label: "Hidden / clearview tilt" },
      { value: "motorized_tilt", label: "Motorized tilt" },
    ],
  },
  {
    id: "color",
    label: "Color",
    type: "select",
    options: [
      { value: "white", label: "White" },
      { value: "silk_white", label: "Silk white" },
      { value: "pearl", label: "Pearl" },
      { value: "painted", label: "Painted color" },
      { value: "stained", label: "Stained color" },
      { value: "custom", label: "Custom color" },
    ],
  },
  {
    id: "hinge_color",
    label: "Hinge color",
    type: "select",
    options: [
      { value: "white", label: "White" },
      { value: "brass", label: "Brass" },
      { value: "nickel", label: "Nickel" },
      { value: "bronze", label: "Bronze" },
      { value: "black", label: "Black" },
      { value: "hidden", label: "Hidden" },
    ],
  },
  {
    id: "panel_config",
    label: "Panel configuration",
    type: "select",
    options: [
      { value: "single_left", label: "Single panel left" },
      { value: "single_right", label: "Single panel right" },
      { value: "left_right", label: "Left / right pair" },
      { value: "double_hung", label: "Double hung" },
      { value: "bypass", label: "Bypass track" },
      { value: "bifold", label: "Bifold track" },
      { value: "specialty", label: "Specialty shape" },
    ],
  },
  { id: "divider_rail", label: "Divider rail", type: "select", options: yesNo },
  { id: "t_post", label: "T-post", type: "select", options: yesNo },
  { id: "extension", label: "Extension / buildout", type: "select", options: yesNo },
  ...installationFields,
];

const productDetails: Record<string, QuoteDetailField[]> = {
  norman_shutters: shutterFields,
  onyx_shutters: [
    {
      id: "onyx_order_type",
      label: "Order type",
      type: "select",
      options: [
        { value: "standard", label: "Standard" },
        { value: "rush", label: "Rush" },
        { value: "reorder", label: "Reorder" },
      ],
    },
    {
      id: "onyx_mount",
      label: "Mount",
      type: "select",
      options: [
        { value: "inside", label: "Inside mount" },
        { value: "outside", label: "Outside mount" },
        { value: "l_frame", label: "L frame" },
        { value: "z_frame", label: "Z frame" },
      ],
    },
    ...shutterFields,
    {
      id: "track_type",
      label: "Track type",
      type: "select",
      options: [
        { value: "none", label: "None" },
        { value: "close_bypass", label: "Close bypass" },
        { value: "open_bypass", label: "Open bypass" },
        { value: "bifold", label: "Bifold" },
      ],
    },
  ],
  roller: [
    ...mountFields,
    {
      id: "shade_type",
      label: "Shade type",
      type: "select",
      options: [
        { value: "standard", label: "Standard roller" },
        { value: "dual", label: "Dual shade" },
        { value: "coupled", label: "Coupled shade" },
      ],
    },
    ...shadeControlFields,
    {
      id: "valance",
      label: "Valance / cassette",
      type: "select",
      options: [
        { value: "none", label: "None" },
        { value: "fascia", label: "Fascia" },
        { value: "wood_valance", label: "Wood valance" },
        { value: "fabric_valance", label: "Fabric valance" },
        { value: "cassette", label: "Cassette" },
        { value: "raceway", label: "Raceway" },
      ],
    },
    { id: "bottomrail", label: "Hem bar / bottomrail", type: "select", options: yesNo },
    ...installationFields,
  ],
  roman: [
    ...mountFields,
    ...shadeControlFields,
    {
      id: "roman_style",
      label: "Roman style",
      type: "select",
      options: [
        { value: "flat", label: "Flat" },
        { value: "soft_fold", label: "Soft fold" },
        { value: "relaxed", label: "Relaxed" },
      ],
    },
    {
      id: "lining",
      label: "Lining",
      type: "select",
      options: [
        { value: "privacy", label: "Privacy lining" },
        { value: "blackout", label: "Blackout lining" },
        { value: "unlined", label: "Unlined" },
      ],
    },
    ...installationFields,
  ],
  honeycomb: [
    ...mountFields,
    ...shadeControlFields,
    {
      id: "light_control",
      label: "Light control",
      type: "select",
      options: lightControlOptions,
    },
    {
      id: "cell_size",
      label: "Cell size",
      type: "select",
      options: [
        { value: "3_8", label: "3/8 in" },
        { value: "9_16", label: "9/16 in" },
        { value: "3_4", label: "3/4 in" },
      ],
    },
    ...installationFields,
  ],
  vertical_honeycomb: [
    ...mountFields,
    {
      id: "stack_option",
      label: "Stack",
      type: "select",
      options: [
        { value: "left", label: "Left stack" },
        { value: "right", label: "Right stack" },
        { value: "split", label: "Split stack" },
      ],
    },
    { id: "light_control", label: "Light control", type: "select", options: lightControlOptions },
    ...installationFields,
  ],
  perfectsheer: [
    ...mountFields,
    ...shadeControlFields,
    { id: "light_control", label: "Light control", type: "select", options: [{ value: "light_filtering", label: "Light filtering" }, { value: "room_darkening", label: "Room darkening" }] },
    { id: "valance", label: "Valance", type: "select", options: [{ value: "standard", label: "Standard" }, { value: "wood", label: "Wood" }, { value: "fabric", label: "Fabric" }] },
    ...installationFields,
  ],
  smartdrape: [
    ...mountFields,
    {
      id: "stack_option",
      label: "Stack",
      type: "select",
      options: [
        { value: "left", label: "Left stack" },
        { value: "right", label: "Right stack" },
        { value: "split", label: "Split stack" },
      ],
    },
    {
      id: "vane_style",
      label: "Vane style",
      type: "select",
      options: [
        { value: "standard", label: "Standard" },
        { value: "alternating", label: "Alternating colors" },
        { value: "room_darkening", label: "Room darkening" },
      ],
    },
    ...shadeControlFields,
    ...installationFields,
  ],
  smartfold: [
    ...mountFields,
    ...shadeControlFields,
    { id: "fabric_category", label: "Fabric category", type: "select", options: [{ value: "light_filtering", label: "Light filtering" }, { value: "room_darkening", label: "Room darkening" }] },
    { id: "valance", label: "Valance", type: "select", options: yesNo },
    ...installationFields,
  ],
  synchrony_vertical: [
    ...mountFields,
    {
      id: "stack_option",
      label: "Stack",
      type: "select",
      options: [
        { value: "left", label: "Left stack" },
        { value: "right", label: "Right stack" },
        { value: "split", label: "Split stack" },
      ],
    },
    ...shadeControlFields,
    ...installationFields,
  ],
  faux_wood: [
    ...mountFields,
    { id: "slat_size", label: "Slat size", type: "select", options: [{ value: "2", label: "2 in" }, { value: "2_1_2", label: "2 1/2 in" }] },
    { id: "color", label: "Color", type: "select", options: [{ value: "white", label: "White" }, { value: "printed", label: "Printed color" }, { value: "stained", label: "Stained look" }] },
    ...shadeControlFields,
    ...installationFields,
  ],
  smartprivacy_faux: [
    ...mountFields,
    { id: "slat_size", label: "Slat size", type: "select", options: [{ value: "2", label: "2 in" }, { value: "2_1_2", label: "2 1/2 in" }] },
    { id: "color", label: "Color", type: "select", options: [{ value: "white", label: "White" }, { value: "printed", label: "Printed color" }, { value: "stained", label: "Stained look" }] },
    ...shadeControlFields,
    ...installationFields,
  ],
  wood_blinds: [
    ...mountFields,
    { id: "slat_size", label: "Slat size", type: "select", options: [{ value: "2", label: "2 in" }, { value: "2_1_2", label: "2 1/2 in" }] },
    { id: "color", label: "Color", type: "select", options: [{ value: "designer", label: "Designer color" }, { value: "premium", label: "Premium color" }, { value: "stained", label: "Stained" }] },
    ...shadeControlFields,
    ...installationFields,
  ],
  citylights_aluminum: [
    ...mountFields,
    { id: "slat_size", label: "Slat size", type: "select", options: [{ value: "1_2", label: "1/2 in" }, { value: "1", label: "1 in" }, { value: "2", label: "2 in" }] },
    { id: "slat_finish", label: "Slat finish", type: "select", options: [{ value: "standard", label: "Standard" }, { value: "metallic", label: "Metallic" }, { value: "matte", label: "Matte" }, { value: "perforated", label: "Perforated" }] },
    ...shadeControlFields,
    ...installationFields,
  ],
  palladian_shelf: [
    {
      id: "shelf_type",
      label: "Shelf type",
      type: "select",
      options: [
        { value: "standard", label: "Standard" },
        { value: "deep", label: "Deep" },
      ],
    },
    { id: "color", label: "Color", type: "select", options: [{ value: "white", label: "White" }, { value: "painted", label: "Painted" }, { value: "custom", label: "Custom" }] },
  ],
};

const shadeMotorizationGroups = ["automate_home", "autowand", "smart_motorization"];

const productMotorizationGroups: Record<string, string[]> = {
  honeycomb: shadeMotorizationGroups,
  perfectsheer: shadeMotorizationGroups,
  roller: shadeMotorizationGroups,
  roman: shadeMotorizationGroups,
  smartdrape: shadeMotorizationGroups,
  smartfold: shadeMotorizationGroups,
  synchrony_vertical: shadeMotorizationGroups,
  vertical_honeycomb: shadeMotorizationGroups,
};

export function getDetailFieldsForProduct(productId: string): QuoteDetailField[] {
  return productDetails[productId] ?? [];
}

export function getMotorizationGroupsForProduct(productId: string): string[] {
  return productMotorizationGroups[productId] ?? [];
}

export function detailDisplayValue(productId: string, fieldId: string, value: unknown): string | null {
  const field = getDetailFieldsForProduct(productId).find((f) => f.id === fieldId);
  if (!field) return null;
  if (field.type === "checkbox") {
    return value === true ? field.label : null;
  }
  if (typeof value !== "string" || !value) return null;
  const option = field.options?.find((o) => o.value === value);
  return `${field.label}: ${option?.label ?? value}`;
}

export function isCustomerVisibleDetail(productId: string, fieldId: string): boolean {
  const field = getDetailFieldsForProduct(productId).find((f) => f.id === fieldId);
  return field?.customerVisible !== false;
}

/**
 * Shutter "auto-variant" tiers (the A/B/C tabs). When a shutter window is added,
 * these three material tiers are auto-created as priced design alternatives so the
 * customer gets a value / premium / specialty comparison. Mapped to the ACTUAL
 * catalog programs (catalog/shutters-mts.catalog.json):
 *   Norman: Woodlore (composite, value) / Normandy (real hardwood, premium) /
 *           Woodlore Aquashield (moisture-proof composite, baths & kitchens)
 *   Onyx:   Vinyl (value) / Poly composite (mid) / Basswood (real wood, premium)
 * Tunable: change programId/label here to change the offered tiers.
 */
export type ShutterVariant = { variant: string; label: string; programId: string };

export const SHUTTER_VARIANTS: Record<string, ShutterVariant[]> = {
  norman_shutters: [
    { variant: "A", label: "Composite", programId: "woodlore" },
    { variant: "B", label: "Hardwood", programId: "normandy_painted" },
    { variant: "C", label: "Moisture-proof", programId: "woodlore_aquashield" },
  ],
  onyx_shutters: [
    { variant: "A", label: "Vinyl", programId: "vinyl" },
    { variant: "B", label: "Poly composite", programId: "poly_composite" },
    { variant: "C", label: "Wood (basswood)", programId: "stained_basswood" },
  ],
};

/** The auto-variant tiers for a shutter product, or null if it isn't a variant shutter. */
export function shutterVariantsFor(productId: string): ShutterVariant[] | null {
  return SHUTTER_VARIANTS[productId] ?? null;
}
