// Complete fabric catalog based on 818 Shutters site data
// Organized by product type and cell size with full color codes, names, and light control types

export interface FabricOption {
  code: string; // e.g., C7015K
  name: string; // e.g., Brilliant White
  lightControl:
    | "Light Filtering"
    | "Room Darkening"
    | "Blackout"
    | "Designer LF"
    | "Designer RD"
    | "Solus";
  collection?: string; // Silverbrook, Solus, etc.
  priceGroup: number; // 1, 2, 3, 4
}

// Helper to format fabric option for display in dropdown
export function formatFabricDisplay(fabric: FabricOption): string {
  return `${fabric.code} ${fabric.name}`;
}

// Base fabric arrays for 1/2" Double Cell (114 options, all Group 1)
const HONEYCOMB_BASE_LIGHT_FILTERING: FabricOption[] = [
  { code: "C7015K", name: "Brilliant White", lightControl: "Light Filtering", priceGroup: 1 },
  { code: "C7016K", name: "Cotton Cloud", lightControl: "Light Filtering", priceGroup: 1 },
  { code: "C7017K", name: "Gardenia", lightControl: "Light Filtering", priceGroup: 1 },
  { code: "C7018K", name: "Soft Stone", lightControl: "Light Filtering", priceGroup: 1 },
  { code: "C7427K", name: "Wheat", lightControl: "Light Filtering", priceGroup: 1 },
  { code: "C7139K", name: "Seal Gray", lightControl: "Light Filtering", priceGroup: 1 },
  { code: "C7133K", name: "Daisy", lightControl: "Light Filtering", priceGroup: 1 },
  { code: "C7134K", name: "Silver Satin", lightControl: "Light Filtering", priceGroup: 1 },
  { code: "C7135K", name: "French Silver", lightControl: "Light Filtering", priceGroup: 1 },
  { code: "C7136K", name: "Classic Silver", lightControl: "Light Filtering", priceGroup: 1 },
  { code: "C7137K", name: "Power Gray", lightControl: "Light Filtering", priceGroup: 1 },
  { code: "C7138K", name: "Iron Mountain", lightControl: "Light Filtering", priceGroup: 1 },
  { code: "C7140K", name: "Orion Gray", lightControl: "Light Filtering", priceGroup: 1 },
  { code: "C7515K", name: "White Cream", lightControl: "Light Filtering", priceGroup: 1 },
  { code: "C7423K", name: "Natural Tan", lightControl: "Light Filtering", priceGroup: 1 },
  { code: "C7424K", name: "Pale Oak", lightControl: "Light Filtering", priceGroup: 1 },
  { code: "C7425K", name: "Whipped Mocha", lightControl: "Light Filtering", priceGroup: 1 },
  { code: "C7426K", name: "Rue Bourbon", lightControl: "Light Filtering", priceGroup: 1 },
  { code: "C7516K", name: "New Camel", lightControl: "Light Filtering", priceGroup: 1 },
  { code: "C7510K", name: "Yellow Bliss", lightControl: "Light Filtering", priceGroup: 1 },
  { code: "C7506K", name: "Autumn Gold", lightControl: "Light Filtering", priceGroup: 1 },
  { code: "C7433K", name: "Cabin", lightControl: "Light Filtering", priceGroup: 1 },
  { code: "C7417K", name: "Provence Cream", lightControl: "Light Filtering", priceGroup: 1 },
  { code: "C7145K", name: "Reflections", lightControl: "Light Filtering", priceGroup: 1 },
  { code: "C7507K", name: "River Rock", lightControl: "Light Filtering", priceGroup: 1 },
  { code: "C7434K", name: "Coffee Beans", lightControl: "Light Filtering", priceGroup: 1 },
  { code: "C7408K", name: "Pashmina", lightControl: "Light Filtering", priceGroup: 1 },
  { code: "C7121K", name: "Morning Mist", lightControl: "Light Filtering", priceGroup: 1 },
  { code: "C7105K", name: "Annapolis Gray", lightControl: "Light Filtering", priceGroup: 1 },
  { code: "C7201K", name: "Black Olive", lightControl: "Light Filtering", priceGroup: 1 },
  { code: "C7705K", name: "Ocean Air", lightControl: "Light Filtering", priceGroup: 1 },
  { code: "C7704K", name: "Seaside Blue", lightControl: "Light Filtering", priceGroup: 1 },
  { code: "C7706K", name: "Blue Flower", lightControl: "Light Filtering", priceGroup: 1 },
  { code: "C7702K", name: "Lakeside", lightControl: "Light Filtering", priceGroup: 1 },
  { code: "C7709K", name: "Smokey Blue", lightControl: "Light Filtering", priceGroup: 1 },
  { code: "C7107K", name: "Spring Sky", lightControl: "Light Filtering", priceGroup: 1 },
  { code: "C7703K", name: "White Rain", lightControl: "Light Filtering", priceGroup: 1 },
  { code: "C7603K", name: "Catalina Blue", lightControl: "Light Filtering", priceGroup: 1 },
  { code: "C7604K", name: "Fernwood", lightControl: "Light Filtering", priceGroup: 1 },
  { code: "C7612K", name: "Meadows", lightControl: "Light Filtering", priceGroup: 1 },
  { code: "C7802K", name: "Mulberry", lightControl: "Light Filtering", priceGroup: 1 },
  { code: "C7104K", name: "Eggplant", lightControl: "Light Filtering", priceGroup: 1 },
  { code: "C7303K", name: "Morning Blush", lightControl: "Light Filtering", priceGroup: 1 },
  { code: "C7305K", name: "Pacific Cove", lightControl: "Light Filtering", priceGroup: 1 },
  { code: "C7306K", name: "Roasted Pumpkin", lightControl: "Light Filtering", priceGroup: 1 },
];

const HONEYCOMB_BASE_ROOM_DARKENING: FabricOption[] = [
  { code: "C4508", name: "Sand", lightControl: "Room Darkening", priceGroup: 1 },
  { code: "C4504", name: "Desert", lightControl: "Room Darkening", priceGroup: 1 },
  { code: "C4506", name: "Primrose", lightControl: "Room Darkening", priceGroup: 1 },
  { code: "C4507", name: "Tamarind", lightControl: "Room Darkening", priceGroup: 1 },
  { code: "C4201", name: "Black Ink", lightControl: "Room Darkening", priceGroup: 1 },
  { code: "C4105", name: "Dusk", lightControl: "Room Darkening", priceGroup: 1 },
  { code: "C4103", name: "Mineral", lightControl: "Room Darkening", priceGroup: 1 },
  { code: "C4704", name: "Indigo", lightControl: "Room Darkening", priceGroup: 1 },
  { code: "C4601", name: "Fog Green", lightControl: "Room Darkening", priceGroup: 1 },
  { code: "C4104", name: "Slate", lightControl: "Room Darkening", priceGroup: 1 },
  { code: "C4102", name: "Terra", lightControl: "Room Darkening", priceGroup: 1 },
  { code: "C4705", name: "Topaz", lightControl: "Room Darkening", priceGroup: 1 },
  { code: "C4001", name: "Glacier White", lightControl: "Room Darkening", priceGroup: 1 },
  { code: "C4108", name: "Infinity", lightControl: "Room Darkening", priceGroup: 1 },
  { code: "C4412", name: "Ecru", lightControl: "Room Darkening", priceGroup: 1 },
  { code: "C4111", name: "Champagne", lightControl: "Room Darkening", priceGroup: 1 },
  { code: "C4410", name: "Flax", lightControl: "Room Darkening", priceGroup: 1 },
  { code: "C4002", name: "Whisper White", lightControl: "Room Darkening", priceGroup: 1 },
  { code: "C4511", name: "Latte", lightControl: "Room Darkening", priceGroup: 1 },
  { code: "C4005", name: "Vanilla Milkshake", lightControl: "Room Darkening", priceGroup: 1 },
  { code: "C4119", name: "Foggy Morning", lightControl: "Room Darkening", priceGroup: 1 },
  { code: "C4120", name: "White Water", lightControl: "Room Darkening", priceGroup: 1 },
  { code: "C4109", name: "Lead Gray", lightControl: "Room Darkening", priceGroup: 1 },
  { code: "C4101", name: "Steel Gray", lightControl: "Room Darkening", priceGroup: 1 },
  { code: "C4008T", name: "Brilliant White RD", lightControl: "Room Darkening", priceGroup: 1 },
  { code: "C4009T", name: "Cotton Cloud RD", lightControl: "Room Darkening", priceGroup: 1 },
  { code: "C4010T", name: "Gardenia RD", lightControl: "Room Darkening", priceGroup: 1 },
  { code: "C4011T", name: "Soft Stone RD", lightControl: "Room Darkening", priceGroup: 1 },
  { code: "C4427T", name: "Wheat RD", lightControl: "Room Darkening", priceGroup: 1 },
  { code: "C4129T", name: "Seal Gray RD", lightControl: "Room Darkening", priceGroup: 1 },
  { code: "C4121T", name: "Daisy RD", lightControl: "Room Darkening", priceGroup: 1 },
  { code: "C4122T", name: "Silver Satin RD", lightControl: "Room Darkening", priceGroup: 1 },
  { code: "C4123T", name: "French Silver RD", lightControl: "Room Darkening", priceGroup: 1 },
  { code: "C4124T", name: "Classic Silver RD", lightControl: "Room Darkening", priceGroup: 1 },
  { code: "C4125T", name: "Power Gray RD", lightControl: "Room Darkening", priceGroup: 1 },
  { code: "C4126T", name: "Iron Mountain RD", lightControl: "Room Darkening", priceGroup: 1 },
  { code: "C4127T", name: "Orion Gray RD", lightControl: "Room Darkening", priceGroup: 1 },
  { code: "C4517T", name: "White Cream RD", lightControl: "Room Darkening", priceGroup: 1 },
  { code: "C4420T", name: "Natural Tan RD", lightControl: "Room Darkening", priceGroup: 1 },
  { code: "C4421T", name: "Pale Oak RD", lightControl: "Room Darkening", priceGroup: 1 },
  { code: "C4422T", name: "Whipped Mocha RD", lightControl: "Room Darkening", priceGroup: 1 },
  { code: "C4423T", name: "Rue Bourbon RD", lightControl: "Room Darkening", priceGroup: 1 },
];

const HONEYCOMB_DESIGNER_SILVERBROOK_LF: FabricOption[] = [
  {
    code: "C7141K",
    name: "Fog",
    lightControl: "Designer LF",
    collection: "Silverbrook",
    priceGroup: 1,
  },
  {
    code: "C7428K",
    name: "Tawny",
    lightControl: "Designer LF",
    collection: "Silverbrook",
    priceGroup: 1,
  },
  {
    code: "C7429K",
    name: "Toffee",
    lightControl: "Designer LF",
    collection: "Silverbrook",
    priceGroup: 1,
  },
  {
    code: "C7713K",
    name: "Azure Blue",
    lightControl: "Designer LF",
    collection: "Silverbrook",
    priceGroup: 1,
  },
  {
    code: "C7207K",
    name: "Soft Black",
    lightControl: "Designer LF",
    collection: "Silverbrook",
    priceGroup: 1,
  },
  {
    code: "C7019K",
    name: "White Dawn",
    lightControl: "Designer LF",
    collection: "Silverbrook",
    priceGroup: 1,
  },
  {
    code: "C7430K",
    name: "Shady Lane",
    lightControl: "Designer LF",
    collection: "Silverbrook",
    priceGroup: 1,
  },
];

const HONEYCOMB_DESIGNER_SILVERBROOK_RD: FabricOption[] = [
  {
    code: "C4128T",
    name: "Fog RD",
    lightControl: "Designer RD",
    collection: "Silverbrook",
    priceGroup: 1,
  },
  {
    code: "C4424T",
    name: "Tawny RD",
    lightControl: "Designer RD",
    collection: "Silverbrook",
    priceGroup: 1,
  },
  {
    code: "C4425T",
    name: "Toffee RD",
    lightControl: "Designer RD",
    collection: "Silverbrook",
    priceGroup: 1,
  },
  {
    code: "C4706T",
    name: "Azure Blue RD",
    lightControl: "Designer RD",
    collection: "Silverbrook",
    priceGroup: 1,
  },
  {
    code: "C4204T",
    name: "Soft Black RD",
    lightControl: "Designer RD",
    collection: "Silverbrook",
    priceGroup: 1,
  },
  {
    code: "C4007T",
    name: "White Dawn RD",
    lightControl: "Designer RD",
    collection: "Silverbrook",
    priceGroup: 1,
  },
  {
    code: "C4426T",
    name: "Shady Lane RD",
    lightControl: "Designer RD",
    collection: "Silverbrook",
    priceGroup: 1,
  },
];

const HONEYCOMB_SOLUS: FabricOption[] = [
  { code: "C7012", name: "White Lace", lightControl: "Solus", collection: "Solus", priceGroup: 1 },
  {
    code: "C7010",
    name: "Modern White",
    lightControl: "Solus",
    collection: "Solus",
    priceGroup: 1,
  },
  {
    code: "C7514",
    name: "Sweet Cream",
    lightControl: "Solus",
    collection: "Solus",
    priceGroup: 1,
  },
  { code: "C7011", name: "Pearl Sand", lightControl: "Solus", collection: "Solus", priceGroup: 1 },
  { code: "C7615", name: "Serene", lightControl: "Solus", collection: "Solus", priceGroup: 1 },
  {
    code: "C7804",
    name: "Dusty Lilac",
    lightControl: "Solus",
    collection: "Solus",
    priceGroup: 1,
  },
  { code: "C7419", name: "Modern Tan", lightControl: "Solus", collection: "Solus", priceGroup: 1 },
  { code: "C7122", name: "Steel", lightControl: "Solus", collection: "Solus", priceGroup: 1 },
  { code: "C7123", name: "Dim Gray", lightControl: "Solus", collection: "Solus", priceGroup: 1 },
  { code: "C7203", name: "Midnight", lightControl: "Solus", collection: "Solus", priceGroup: 1 },
  { code: "C7712", name: "Denim", lightControl: "Solus", collection: "Solus", priceGroup: 1 },
  { code: "C7204", name: "Warm Black", lightControl: "Solus", collection: "Solus", priceGroup: 1 },
];

// Combine all base fabrics for 1/2" Double
const HONEYCOMB_HALF_DOUBLE_ALL: FabricOption[] = [
  ...HONEYCOMB_BASE_LIGHT_FILTERING,
  ...HONEYCOMB_BASE_ROOM_DARKENING,
  ...HONEYCOMB_DESIGNER_SILVERBROOK_LF,
  ...HONEYCOMB_DESIGNER_SILVERBROOK_RD,
  ...HONEYCOMB_SOLUS,
];

// Additional fabrics for larger cell sizes
const HONEYCOMB_CLASSIC_FABRICS: FabricOption[] = [
  { code: "CL-LF", name: "Classic LF", lightControl: "Light Filtering", priceGroup: 1 },
  { code: "CL-RD", name: "Classic RD", lightControl: "Room Darkening", priceGroup: 1 },
  { code: "CL-BO", name: "Classic BO", lightControl: "Blackout", priceGroup: 1 },
];

const HONEYCOMB_PREMIER_FABRICS: FabricOption[] = [
  { code: "PR-LF", name: "Premier LF", lightControl: "Light Filtering", priceGroup: 1 },
  { code: "PR-RD", name: "Premier RD", lightControl: "Room Darkening", priceGroup: 1 },
  { code: "PR-BO", name: "Premier BO", lightControl: "Blackout", priceGroup: 1 },
];

const HONEYCOMB_LINEN_FABRICS: FabricOption[] = [
  { code: "LN-DBL", name: "Linen Double", lightControl: "Light Filtering", priceGroup: 1 },
];

const HONEYCOMB_SILHOUETTE_FABRICS: FabricOption[] = [
  {
    code: "SIL-DBL",
    name: "Silhouette Double",
    lightControl: "Light Filtering",
    priceGroup: 1,
  },
];

const HONEYCOMB_WOVEN_WINDSONG: FabricOption[] = [
  { code: "WS-LF", name: "Windsong LF", lightControl: "Light Filtering", priceGroup: 1 },
  { code: "WS-RD", name: "Windsong RD", lightControl: "Room Darkening", priceGroup: 1 },
  { code: "WS-BO", name: "Windsong BO", lightControl: "Blackout", priceGroup: 1 },
];

const HONEYCOMB_WOVEN_BREEZE: FabricOption[] = [
  { code: "BZ-LF", name: "Breeze LF", lightControl: "Light Filtering", priceGroup: 2 },
  { code: "BZ-RD", name: "Breeze RD", lightControl: "Room Darkening", priceGroup: 2 },
  { code: "BZ-BO", name: "Breeze BO", lightControl: "Blackout", priceGroup: 2 },
];

// Honeycomb catalog by cell size
export const HONEYCOMB_FABRIC_CATALOG: Record<string, FabricOption[]> = {
  half_double: HONEYCOMB_HALF_DOUBLE_ALL,
  three_quarter_double: [
    ...HONEYCOMB_HALF_DOUBLE_ALL,
    ...HONEYCOMB_CLASSIC_FABRICS,
    ...HONEYCOMB_PREMIER_FABRICS,
    ...HONEYCOMB_LINEN_FABRICS,
    ...HONEYCOMB_SILHOUETTE_FABRICS,
  ],
  nine_sixteenth_single: [
    ...HONEYCOMB_HALF_DOUBLE_ALL,
    ...HONEYCOMB_CLASSIC_FABRICS,
    ...HONEYCOMB_LINEN_FABRICS,
  ],
  three_eighth_single: [
    ...HONEYCOMB_HALF_DOUBLE_ALL,
    ...HONEYCOMB_CLASSIC_FABRICS,
    ...HONEYCOMB_LINEN_FABRICS,
  ],
  three_quarter_single: [
    ...HONEYCOMB_HALF_DOUBLE_ALL,
    ...HONEYCOMB_CLASSIC_FABRICS,
    ...HONEYCOMB_LINEN_FABRICS,
  ],
  three_quarter_woven: [...HONEYCOMB_WOVEN_WINDSONG, ...HONEYCOMB_WOVEN_BREEZE],
  one_and_quarter_single: [
    ...HONEYCOMB_HALF_DOUBLE_ALL,
    ...HONEYCOMB_CLASSIC_FABRICS,
    ...HONEYCOMB_PREMIER_FABRICS,
    ...HONEYCOMB_LINEN_FABRICS,
    ...HONEYCOMB_SILHOUETTE_FABRICS,
  ],
};

function normalizeFabricLookup(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function findHoneycombFabricOption(fabric: string): FabricOption | undefined {
  const normalized = normalizeFabricLookup(fabric);
  const allFabrics = Object.values(HONEYCOMB_FABRIC_CATALOG).flat();

  return allFabrics.find((option) =>
    [formatFabricDisplay(option), option.code, option.name].some(
      (candidate) => normalizeFabricLookup(candidate) === normalized
    )
  );
}

// Normalize cell size string to catalog key
function normalizeCellSize(cellSize: string): string {
  const normalized = cellSize
    .toLowerCase()
    .replace(/"/g, "")
    .replace(/\s+/g, "_")
    .replace(/1\/2/g, "half")
    .replace(/3\/4/g, "three_quarter")
    .replace(/9\/16/g, "nine_sixteenth")
    .replace(/3\/8/g, "three_eighth")
    .replace(/1_1\/4/g, "one_and_quarter");
  return normalized;
}

// Get honeycomb fabrics for a specific cell size (returns FabricOption array)
export function getHoneycombFabrics(cellSize: string): FabricOption[] {
  const key = normalizeCellSize(cellSize);
  return HONEYCOMB_FABRIC_CATALOG[key] || HONEYCOMB_HALF_DOUBLE_ALL;
}

// Get honeycomb fabric strings for dropdown (formatted for display)
export function getHoneycombFabricStrings(cellSize: string): readonly string[] {
  const fabrics = getHoneycombFabrics(cellSize);
  return fabrics.map(formatFabricDisplay);
}

// Get honeycomb fabric groups for grouped dropdown
export function getHoneycombFabricGroups(
  cellSize: string
): { label: string; items: readonly string[] }[] {
  const fabrics = getHoneycombFabrics(cellSize);

  // Group by light control type
  const groups: Record<string, string[]> = {};
  fabrics.forEach((fabric) => {
    const category = fabric.collection
      ? `${fabric.collection} - ${fabric.lightControl}`
      : fabric.lightControl;
    if (!groups[category]) {
      groups[category] = [];
    }
    groups[category].push(formatFabricDisplay(fabric));
  });

  return Object.entries(groups).map(([label, items]) => ({
    label,
    items,
  }));
}

// Complete roller fabric catalog from 818 site (70 fabrics in 4 categories)
export interface RollerFabricCategory {
  label: string;
  fabrics: readonly string[];
}

export function getRollerFabrics(): readonly string[] {
  return [
    // Room Darkening (12)
    "Amelia RD (Room Darkening)",
    "Bermuda (Room Darkening)",
    "Breeze RD (Room Darkening)",
    "Callie RD (Room Darkening)",
    "Cory (Room Darkening)",
    "Fiji (Room Darkening)",
    "Francis RD (Room Darkening)",
    "Garden (Room Darkening)",
    "Jamaica (Room Darkening)",
    "Lola BO (Room Darkening)",
    "Remy RD (Room Darkening)",
    "Summerland (Room Darkening)",
    // Sheer (4)
    "Dazzle (Sheer)",
    "Lakeshore (Sheer)",
    "Scarlett (Sheer)",
    "Sheer",
    // Natural (13)
    "Aruba (Natural)",
    "Bali (Natural)",
    "Bora Bora (Natural)",
    "Caroline (Natural)",
    "Catalina (Natural)",
    "Cove (Natural)",
    "Java (Natural)",
    "Lake Tahoe (Natural)",
    "Maui (Natural)",
    "Phuket (Natural)",
    "Riviera (Natural)",
    "Samoa (Natural)",
    "Sumatra (Natural)",
    // Other (41)
    "Amelia",
    "Breeze",
    "Breeze (1%, 3%)",
    "Brook",
    "Callie",
    "Canvas LF",
    "Cascade LF",
    "Chelsea",
    "Clarissa",
    "Classic LF",
    "Elements",
    "Emery",
    "Flow (1%, 5%)",
    "Flow (7%)",
    "Francis",
    "Galaxy (3%)",
    "Hayes",
    "Horizon LF",
    "Jubilee (3%)",
    "Kendra",
    "Lakeview (3%, 7%, 10%)",
    "Linen LF",
    "Lola LF",
    "Meadows (1%, 3%)",
    "Moon (5%)",
    "NA300 (1%)",
    "NA300 (3%, 5%)",
    "NA400 (1%)",
    "NA400 (3%, 5%, 10%)",
    "NA820 (3%)",
    "Remy",
    "Serene (1%, 3%)",
    "Serene (7%)",
    "Shimmer",
    "Sierra",
    "Valerie",
    "Verona LF",
    "Vista LF",
    "W120 (12%)",
    "Windsong (1%)",
    "Windsong (5%)",
  ];
}

// Get roller fabrics organized by category for grouped dropdown
export function getRollerFabricCategories(): RollerFabricCategory[] {
  return [
    {
      label: "Room Darkening",
      fabrics: [
        "Amelia RD (Room Darkening)",
        "Bermuda (Room Darkening)",
        "Breeze RD (Room Darkening)",
        "Callie RD (Room Darkening)",
        "Cory (Room Darkening)",
        "Fiji (Room Darkening)",
        "Francis RD (Room Darkening)",
        "Garden (Room Darkening)",
        "Jamaica (Room Darkening)",
        "Lola BO (Room Darkening)",
        "Remy RD (Room Darkening)",
        "Summerland (Room Darkening)",
      ],
    },
    {
      label: "Sheer",
      fabrics: ["Dazzle (Sheer)", "Lakeshore (Sheer)", "Scarlett (Sheer)", "Sheer"],
    },
    {
      label: "Natural",
      fabrics: [
        "Aruba (Natural)",
        "Bali (Natural)",
        "Bora Bora (Natural)",
        "Caroline (Natural)",
        "Catalina (Natural)",
        "Cove (Natural)",
        "Java (Natural)",
        "Lake Tahoe (Natural)",
        "Maui (Natural)",
        "Phuket (Natural)",
        "Riviera (Natural)",
        "Samoa (Natural)",
        "Sumatra (Natural)",
      ],
    },
    {
      label: "Other",
      fabrics: [
        "Amelia",
        "Breeze",
        "Breeze (1%, 3%)",
        "Brook",
        "Callie",
        "Canvas LF",
        "Cascade LF",
        "Chelsea",
        "Clarissa",
        "Classic LF",
        "Elements",
        "Emery",
        "Flow (1%, 5%)",
        "Flow (7%)",
        "Francis",
        "Galaxy (3%)",
        "Hayes",
        "Horizon LF",
        "Jubilee (3%)",
        "Kendra",
        "Lakeview (3%, 7%, 10%)",
        "Linen LF",
        "Lola LF",
        "Meadows (1%, 3%)",
        "Moon (5%)",
        "NA300 (1%)",
        "NA300 (3%, 5%)",
        "NA400 (1%)",
        "NA400 (3%, 5%, 10%)",
        "NA820 (3%)",
        "Remy",
        "Serene (1%, 3%)",
        "Serene (7%)",
        "Shimmer",
        "Sierra",
        "Valerie",
        "Verona LF",
        "Vista LF",
        "W120 (12%)",
        "Windsong (1%)",
        "Windsong (5%)",
      ],
    },
  ];
}

// Complete roman fabric catalog from 818 site (15 fabrics including Ellie)
export function getRomanFabrics(): readonly string[] {
  return [
    "Sheer Elegance (F1085)",
    "Alma",
    "Blake",
    "Breeze",
    "Caroline",
    "Ellie",
    "Lakeside",
    "Libeco",
    "Lorraine",
    "Rochelle",
    "Seabreeze",
    "Sierra",
    "Taylor",
    "Valencia (F0255)",
    "Windsor",
  ];
}
