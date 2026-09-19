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
