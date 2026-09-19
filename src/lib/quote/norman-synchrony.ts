type SynchronyCollection = {
  collection: string;
  priceGroup: "group1" | "group2" | "group3" | "group4";
  colors: readonly string[];
};

export const SYNCHRONY_ACTIVE_COLLECTIONS: readonly SynchronyCollection[] = [
  {
    collection: "Classic",
    priceGroup: "group1",
    colors: ["Pure White", "Silk White", "Pearl", "Sea Mist", "Metropolitan"],
  },
  {
    collection: "S-Curved",
    priceGroup: "group2",
    colors: ["Pure White", "Silk White", "Pearl", "Sea Mist", "Metropolitan"],
  },
  {
    collection: "Sandblasted",
    priceGroup: "group2",
    colors: ["Designer White", "Bright White", "Crisp Linen", "Taupe Gray"],
  },
  {
    collection: "Flaxen",
    priceGroup: "group3",
    colors: ["Mustard Green", "Honey Wheat", "Platinum", "Magnetic Gray"],
  },
  {
    collection: "Adobe",
    priceGroup: "group3",
    colors: ["Pure White", "Bright White", "Latte", "Taupe", "Shark Fin"],
  },
  {
    collection: "Shantung",
    priceGroup: "group3",
    colors: [
      "Pure White",
      "Bright White",
      "Latte",
      "Metropolitan",
      "Cement",
      "Lilac",
      "Laurel Pink",
    ],
  },
  {
    collection: "Linen",
    priceGroup: "group4",
    colors: ["Pure White", "Wheat", "Chic Gray", "Metropolitan", "Dusty Blue", "Merlot"],
  },
  { collection: "Grasscloth", priceGroup: "group4", colors: ["Botanical Garden"] },
  {
    collection: "Willow",
    priceGroup: "group4",
    colors: ["Mist", "Birch", "Burnished Clay", "Natural Gray"],
  },
  {
    collection: "Faux Wood",
    priceGroup: "group4",
    colors: ["Limed White", "Silver Birch", "Chestnut", "Oak", "Driftwood"],
  },
] as const;

export const SYNCHRONY_DISCONTINUED = [
  ["Grasscloth", "Silver Cloud"], ["Grasscloth", "Coffee"],
  ["Grasscloth", "Onyx"], ["Willow", "Cloud"],
] as const;

export const SYNCHRONY_HARDWARE_COLORS = ["White", "Silk White", "Nature", "Silver Moon"] as const;
/** June guide page 9: all 46 collection/color rows use these color-name matches. */
export function synchronyDefaultHardware(color: string): string {
  if (["Pure White", "Designer White", "Lilac", "Laurel Pink", "Dusty Blue", "Merlot", "Mist", "Burnished Clay"].includes(color)) return "White";
  if (["Silk White", "Pearl", "Bright White", "Crisp Linen", "Chestnut", "Oak"].includes(color)) return "Silk White";
  if (["Sea Mist", "Metropolitan", "Taupe Gray", "Platinum", "Magnetic Gray", "Shark Fin", "Cement", "Silver Birch"].includes(color)) return "Silver Moon";
  return "Nature";
}
export function synchronyBracketCount(width: number): number { return width <= 48 ? 2 : width <= 78 ? 3 : 4; }

/** Visible dealer collection/color dropdowns, observed September 19, 2026. */
export const SYNCHRONY_DEALER_COLOR_CODES: Readonly<Record<string, Readonly<Record<string,string>>>> = {
  "Adobe": {
    "Bright White": "8077",
    "Latte": "8518",
    "Pure White": "8078",
    "Shark Fin": "8115",
    "Taupe": "8992"
  },
  "Classic": {
    "Metropolitan": "8120",
    "Pearl": "8076",
    "Pure White": "8071",
    "Sea Mist": "8119",
    "Silk White": "8075"
  },
  "Faux Wood": {
    "Chestnut": "8987",
    "Driftwood": "8997",
    "Limed White": "8988",
    "Oak": "8986",
    "Silver Birch": "8989"
  },
  "Flaxen": {
    "Honey Wheat": "8978",
    "Magnetic Gray": "8979",
    "Mustard Green": "8980",
    "Platinum": "8981"
  },
  "Grasscloth": {
    "Botanical Garden": "8973"
  },
  "Linen": {
    "Chic Gray": "8994",
    "Dusty Blue": "8993",
    "Merlot": "8995",
    "Metropolitan": "8974",
    "Pure White": "8078",
    "Wheat": "8998"
  },
  "S-Curved": {
    "Metropolitan": "8123",
    "Pearl": "8080",
    "Pure White": "8078",
    "Sea Mist": "8122",
    "Silk White": "8079"
  },
  "Sandblasted": {
    "Bright White": "8073",
    "Crisp Linen": "8074",
    "Designer White": "8072",
    "Taupe Gray": "8121"
  },
  "Shantung": {
    "Bright White": "8077",
    "Cement": "8116",
    "Latte": "8518",
    "Laurel Pink": "8311",
    "Lilac": "8117",
    "Metropolitan": "8124",
    "Pure White": "8078"
  },
  "Willow": {
    "Birch": "8982",
    "Burnished Clay": "8985",
    "Mist": "8996",
    "Natural Gray": "8983"
  }
};
