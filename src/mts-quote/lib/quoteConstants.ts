import { ACCOUNT_IDS } from "./accounts";

export const QUOTE_ACCOUNTS = [
  { id: ACCOUNT_IDS.SHUTTERS_805, name: "805 Shutters", prefix: "805" },
  { id: ACCOUNT_IDS.MTS_INSTALLATIONS, name: "MTS Installations", prefix: "MTS" },
] as const;

// Colors for multi-quote options (Quote A, B, C, etc.)
export const QUOTE_OPTION_COLORS = [
  {
    letter: "A",
    bg: "bg-blue-500",
    border: "border-blue-500",
    text: "text-blue-700",
    light: "bg-blue-50",
    ring: "ring-blue-500/30",
    hex: "#3b82f6",
  },
  {
    letter: "B",
    bg: "bg-violet-500",
    border: "border-violet-500",
    text: "text-violet-700",
    light: "bg-violet-50",
    ring: "ring-violet-500/30",
    hex: "#8b5cf6",
  },
  {
    letter: "C",
    bg: "bg-emerald-500",
    border: "border-emerald-500",
    text: "text-emerald-700",
    light: "bg-emerald-50",
    ring: "ring-emerald-500/30",
    hex: "#10b981",
  },
  {
    letter: "D",
    bg: "bg-orange-500",
    border: "border-orange-500",
    text: "text-orange-700",
    light: "bg-orange-50",
    ring: "ring-orange-500/30",
    hex: "#f97316",
  },
  {
    letter: "E",
    bg: "bg-pink-500",
    border: "border-pink-500",
    text: "text-pink-700",
    light: "bg-pink-50",
    ring: "ring-pink-500/30",
    hex: "#ec4899",
  },
  {
    letter: "F",
    bg: "bg-teal-500",
    border: "border-teal-500",
    text: "text-teal-700",
    light: "bg-teal-50",
    ring: "ring-teal-500/30",
    hex: "#14b8a6",
  },
] as const;

export function getQuoteColor(letter: string) {
  const idx = letter.charCodeAt(0) - 65; // A=0, B=1, etc.
  return QUOTE_OPTION_COLORS[idx % QUOTE_OPTION_COLORS.length];
}

export const PRODUCT_TYPES = [
  "Shutters",
  "Roller Shades",
  "Roman Shades",
  "Honeycomb Shades",
  "Sheer Shades",
  "Faux Wood Blinds",
  "Wood Blinds",
  "Vertical Blinds",
  "Smart Drapes",
] as const;

export type ProductType = (typeof PRODUCT_TYPES)[number];

export const ROOM_PRESETS = [
  "Living Room",
  "Family Room",
  "Dining Room",
  "Kitchen",
  "Breakfast Nook",
  "Hall",
  "Foyer",
  "Primary Bedroom",
  "Primary Bathroom",
  "Bedroom 1",
  "Bedroom 2",
  "Bedroom 3",
  "Guest Room",
  "Nursery",
  "Stair",
  "Loft",
  "Office",
  "Gym",
  "Garage",
  "Closet",
] as const;

export const FRACTIONS = [
  "0",
  "1/16",
  "1/8",
  "3/16",
  "1/4",
  "5/16",
  "3/8",
  "7/16",
  "1/2",
  "9/16",
  "5/8",
  "11/16",
  "3/4",
  "13/16",
  "7/8",
  "15/16",
] as const;

// Shutter design options
export const SHUTTER_SUPPLIERS = ["Norman", "Onyx"] as const;

// Onyx-specific options
export const ONYX_SHUTTER_TYPES = [
  "Standard Shutter",
  "Specialty Shutter",
  "Tracked Shutter",
] as const;

export const ONYX_WOOD_MATERIALS = ["Painted Basswood", "Stained Basswood", "Secamore"] as const;

export const ONYX_POLY_MATERIALS = [
  "Vinyl",
  "VLO Hybrid",
  "Onyx US Made Vinyl",
  "Poly Composite",
] as const;

export const ONYX_STANDARD_MATERIALS = [...ONYX_WOOD_MATERIALS, ...ONYX_POLY_MATERIALS] as const;

export const ONYX_ORDER_SHUTTER_TYPES = ["Regular", "By Pass", "Bi Fold", "French Door"] as const;

export const ONYX_SIZE_TYPES = ["W - Window Size", "F - Frame to Frame"] as const;

export const ONYX_MOUNT_TYPES = ["IM", "OM"] as const;

export const ONYX_TRACK_TYPES = ["Bypass", "Bifold"] as const;

export const ONYX_BYPASS_TYPES = ["Open Bypass", "Closed Bypass"] as const;

export const ONYX_FOLDING_DIRECTIONS = ["Center Open", "Side Open"] as const;

export const ONYX_FACIA_TYPES = [
  "Plain Boxout Facia (standard)",
  "Decorative Boxout Facia",
] as const;

export const ONYX_DIVIDER_RAIL_LOCATIONS = ["Center", "Custom"] as const;

export const ONYX_TILT_TYPES = [
  "C - Front Center Tiltrod",
  "H1 - Hidden Tiltrod Notch On Stile",
  "H2 - Hidden Tiltrod Notch On Louver",
  "H3 - Hidden Tiltrod In Stile",
  "Offset Tilt Rod",
] as const;

export const ONYX_HINGE_COLORS = [
  "Match",
  "Anti-Brass",
  "Bri-Brass",
  "Nickel",
  "ORB",
  "White",
] as const;

export const ONYX_PANEL_CONFIGS = [
  "L",
  "R",
  "LR",
  "LL",
  "RR",
  "LLRR",
  "LRTLR",
  "3SP",
  "3FC",
  "3 Invert",
] as const;

export const ONYX_EXTENSION_ROD_OPTIONS = ["None", '1/2"', '1"', '1-1/2"', '2"'] as const;

export const ONYX_T_POST_OPTIONS = ["None", "T1", "T2", "Custom"] as const;

export const ONYX_ASTRAGAL_OPTIONS = ["No", "Yes"] as const;

export const ONYX_POLY_FRAME_TYPES = [
  "VZ Small",
  "VZ Large",
  "VL Outside",
  "VL Outside FS",
  "VL Inside",
  "VL Inside FS",
  "VZ Fine",
  "VZ Fine FS",
  "VZ Crest",
  "VZ Crest FS",
  "VZ Crown",
  "VZ Crown FS",
  "VDecor 2",
  "Panel Only",
] as const;

export const ONYX_WOOD_FRAME_TYPES = [
  "Decor 2",
  "Decor 2 FS",
  "Decor 3",
  "Decor 3 FS",
  "Z Fine",
  "Z Fine FS",
  "Z Crown",
  "Z Crown FS",
  "Z Trim",
  "Z Trim FS",
  "Z Crest",
  "Z Crest FS",
  "Z Lite",
  "L Outside",
  "L Outside FS",
  "L Inside",
  "L Inside FS",
  "L Bullnose Outside",
  "L Bullnose Outside FS",
  "L Bullnose Inside",
  "L Bullnose Inside FS",
  "Hang Strip",
  "Panel Only",
] as const;

export const NORMAN_WOODLORE_FRAME_TYPES = [
  '3" Ridge Deco Frame',
  '2 1/2" Mission Deco Frame',
  '2" Camber Deco Frame',
  '2" Classic Deco Frame',
  "Beaded L Frame",
  'Beaded L Frame with 1/4" Light Block',
  'Beaded L Frame with 1/2" Buildout *',
  'Beaded L Frame with 1" Buildout *',
  "Colonial L Frame",
  'Colonial L Frame with 1/4" Light Block',
  'Colonial L Frame with 1/2" Buildout *',
  "Vintage L Frame",
  'Vintage L Frame with 1/4" Light Block',
  'Vintage L Frame with 1/2" Buildout *',
  'Vintage L Frame with 1" Buildout *',
  "Plain L Frame",
  '3" Crown Z Frame',
  '2" Bel Air Z Frame',
  '2" Bullnose Z Frame',
  '1 1/2" Bullnose Z Frame',
  '1 1/4" Beaded Z Frame',
  "Tilt Out Z Frame",
  '7/8" Vintage Hang Strip',
  "Direct Mount (No Frame)",
] as const;

export const ONYX_COLORS = [
  "100_Pure White",
  "101_White",
  "102_Studio",
  "103_Blanco",
  "105_Snow",
  "106_Silk White",
  "107_Swiss Coffee",
  "110_Creamy",
  "120_Butter",
  "130_Gray",
  "190_Paint (Primed)",
  "191_Norman Paint",
  "192_Sunland Paint",
  "900_Custom Paint",
  "Nature",
  "Honey",
  "Oak",
  "Rose",
  "Mahogany",
  "Java",
  "Black Walnut",
] as const;

// Specialty shutter shapes with images, organized by category
export interface SpecialtyShape {
  id: string;
  label: string;
  image: string;
  category: string;
}

export const ONYX_SPECIALTY_CATEGORIES = [
  "Arched Window",
  "Hexagons, Octagons, Circles, Ovals & Triangles",
  "Angle Top & French Door",
] as const;

export const ONYX_SPECIALTY_SHAPES: SpecialtyShape[] = [
  // Arched Window
  {
    id: "eyebrow-sunburst",
    label: "Eyebrow Sunburst",
    image: "/images/specialty-shutters/eyebrow-sunburst.png",
    category: "Arched Window",
  },
  {
    id: "elongated-eyebrow-sunburst",
    label: "Elongated Eyebrow Sunburst",
    image: "/images/specialty-shutters/elongated-eyebrow-sunburst.png",
    category: "Arched Window",
  },
  {
    id: "half-round-sunburst",
    label: "Half Round Sunburst",
    image: "/images/specialty-shutters/half-round-sunburst.png",
    category: "Arched Window",
  },
  {
    id: "half-round-horizontal-louvers",
    label: "Half Round w/ Horizontal Louvers",
    image: "/images/specialty-shutters/half-round-horizontal-louvers.png",
    category: "Arched Window",
  },
  {
    id: "left-quarter-round-sunburst",
    label: "Left Quarter Round Sunburst",
    image: "/images/specialty-shutters/left-quarter-round-sunburst.png",
    category: "Arched Window",
  },
  {
    id: "right-quarter-round-sunburst",
    label: "Right Quarter Round Sunburst",
    image: "/images/specialty-shutters/right-quarter-round-sunburst.png",
    category: "Arched Window",
  },
  {
    id: "left-quarter-arch",
    label: "Left Quarter Arch",
    image: "/images/specialty-shutters/left-quarter-arch.png",
    category: "Arched Window",
  },
  {
    id: "right-quarter-arch",
    label: "Right Quarter Arch",
    image: "/images/specialty-shutters/right-quarter-arch.png",
    category: "Arched Window",
  },
  {
    id: "sunburst-top-divider-strip",
    label: "Sunburst on Top w/ Divider Strip",
    image: "/images/specialty-shutters/sunburst-top-divider-strip.png",
    category: "Arched Window",
  },
  {
    id: "sunburst-top-t-post",
    label: "Sunburst on Top w/ T Post",
    image: "/images/specialty-shutters/sunburst-top-t-post.png",
    category: "Arched Window",
  },
  {
    id: "sunburst-top-continuous-frame",
    label: "Sunburst on Top w/ Continuous Frame",
    image: "/images/specialty-shutters/sunburst-top-continuous-frame.png",
    category: "Arched Window",
  },
  {
    id: "quarter-sunburst-panel-continuous",
    label: "Quarter Sunburst Panel w/ Continuous Frame",
    image: "/images/specialty-shutters/quarter-sunburst-panel-continuous.png",
    category: "Arched Window",
  },
  {
    id: "left-quarter-sunburst-panel-continuous",
    label: "Left Quarter Sunburst Panel with Continuous Frame",
    image: "/images/specialty-shutters/left-quarter-sunburst-panel-continuous.png",
    category: "Arched Window",
  },
  {
    id: "right-quarter-sunburst-panel-continuous",
    label: "Right Quarter Sunburst Panel with Continuous Frame",
    image: "/images/specialty-shutters/right-quarter-sunburst-panel-continuous.png",
    category: "Arched Window",
  },
  {
    id: "solid-rail-arch",
    label: "Solid Rail Arch",
    image: "/images/specialty-shutters/solid-rail-arch.png",
    category: "Arched Window",
  },
  {
    id: "louvered-arch-shutter",
    label: "Louvered Arch Shutter",
    image: "/images/specialty-shutters/louvered-arch-shutter.png",
    category: "Arched Window",
  },
  {
    id: "peak",
    label: "Peak",
    image: "/images/specialty-shutters/peak.png",
    category: "Arched Window",
  },
  {
    id: "arch-top-picture-sunburst",
    label: "Arch Top Picture Window with Sunburst",
    image: "/images/specialty-shutters/arch-top-picture-sunburst.png",
    category: "Arched Window",
  },
  {
    id: "standard-unit-horizontal-arch-center",
    label: "Standard Unit with Horizontal Arch Center",
    image: "/images/specialty-shutters/standard-unit-horizontal-arch-center.png",
    category: "Arched Window",
  },
  {
    id: "arch-top-picture-horizontal-louvers",
    label: "Arch Top Picture Window with Horizontal Louvers",
    image: "/images/specialty-shutters/arch-top-picture-horizontal-louvers.png",
    category: "Arched Window",
  },
  {
    id: "horizontal-louvers-center-arch-quarter-round",
    label: "Horizontal Louvers Center Arch with Quarter Round Side Panels",
    image: "/images/specialty-shutters/horizontal-louvers-center-arch-quarter-round.png",
    category: "Arched Window",
  },
  {
    id: "sunburst-louvers-center-arch-quarter-round",
    label: "Sunburst Louvers Center Arch with Quarter Round Side Panels",
    image: "/images/specialty-shutters/sunburst-louvers-center-arch-quarter-round.png",
    category: "Arched Window",
  },

  // Hexagons, Octagons, Circles, Ovals & Triangles
  {
    id: "hexagon-horizontal-louvers",
    label: "Hexagon w/ Horizontal Louvers",
    image: "/images/specialty-shutters/hexagon-horizontal-louvers.png",
    category: "Hexagons, Octagons, Circles, Ovals & Triangles",
  },
  {
    id: "hexagon-straight-sides-horizontal-louvers",
    label: "Hexagon Straight Sides w/ Horizontal Louvers",
    image: "/images/specialty-shutters/hexagon-straight-sides-horizontal-louvers.png",
    category: "Hexagons, Octagons, Circles, Ovals & Triangles",
  },
  {
    id: "octagon-horizontal-louvers",
    label: "Octagon w/ Horizontal Louvers",
    image: "/images/specialty-shutters/octagon-horizontal-louvers.png",
    category: "Hexagons, Octagons, Circles, Ovals & Triangles",
  },
  {
    id: "circle-horizontal-louvers",
    label: "Circle w/ Horizontal Louvers",
    image: "/images/specialty-shutters/circle-horizontal-louvers.png",
    category: "Hexagons, Octagons, Circles, Ovals & Triangles",
  },
  {
    id: "hexagon-sunburst",
    label: "Hexagon Sunburst",
    image: "/images/specialty-shutters/hexagon-sunburst.png",
    category: "Hexagons, Octagons, Circles, Ovals & Triangles",
  },
  {
    id: "hexagon-sunburst-straight-sides",
    label: "Hexagon Sunburst w/ Straight Sides",
    image: "/images/specialty-shutters/hexagon-sunburst-straight-sides.png",
    category: "Hexagons, Octagons, Circles, Ovals & Triangles",
  },
  {
    id: "octagon-sunburst",
    label: "Octagon Sunburst",
    image: "/images/specialty-shutters/octagon-sunburst.png",
    category: "Hexagons, Octagons, Circles, Ovals & Triangles",
  },
  {
    id: "circle-sunburst",
    label: "Circle Sunburst",
    image: "/images/specialty-shutters/circle-sunburst.png",
    category: "Hexagons, Octagons, Circles, Ovals & Triangles",
  },
  {
    id: "oval-horizontal-louvers",
    label: "Oval w/ Horizontal Louvers",
    image: "/images/specialty-shutters/oval-horizontal-louvers.png",
    category: "Hexagons, Octagons, Circles, Ovals & Triangles",
  },
  {
    id: "triangle-horizontal-louvers",
    label: "Triangle with Horizontal Louvers",
    image: "/images/specialty-shutters/triangle-horizontal-louvers.png",
    category: "Hexagons, Octagons, Circles, Ovals & Triangles",
  },
  {
    id: "triangle-sunburst",
    label: "Triangle Sunburst",
    image: "/images/specialty-shutters/triangle-sunburst.png",
    category: "Hexagons, Octagons, Circles, Ovals & Triangles",
  },

  // Angle Top & French Door
  {
    id: "left-angle-top",
    label: "Left Angle Top",
    image: "/images/specialty-shutters/left-angle-top.png",
    category: "Angle Top & French Door",
  },
  {
    id: "right-angle-top",
    label: "Right Angle Top",
    image: "/images/specialty-shutters/right-angle-top.png",
    category: "Angle Top & French Door",
  },
  {
    id: "french-door-cutout",
    label: "French Door Cut-out",
    image: "/images/specialty-shutters/french-door-cutout.png",
    category: "Angle Top & French Door",
  },
];

export const SHUTTER_MATERIALS = [
  "Woodlore Composite",
  "Poly Composite",
  "Premium Wood",
  "Wood",
] as const;

export const SHUTTER_LOUVER_SIZES = ['1 7/8"', '2 1/2"', '3"', '3 1/2"', '4 1/2"'] as const;

export const SHUTTER_TILT_TYPES = ["Standard Tilt", "Invisible Tilt", "Offset Tilt"] as const;

export const SHUTTER_HINGE_COLORS = [
  "Silk White",
  "Stainless Steel",
  "Pearl",
  "Bisque",
  "Antique Brass",
  "Bright Brass",
  "Black",
  "Pure White",
  "Nickel-Plated",
  "Brushed Nickel",
  "Crisp Linen",
  "String",
  "Sea Mist",
] as const;

export const SHUTTER_PANEL_CONFIGS = [
  "L",
  "R",
  "L R",
  "LLRR",
  "LL",
  "RR",
  "LRR",
  "LLR",
  "LTLRTR",
  "LRTLR",
  "L TRTR",
  "LTLTR",
] as const;

// Auto-variant mapping for shutters
export const SHUTTER_AUTO_VARIANTS = [
  { variant: "A", label: "Wood Shutters", material: "Wood" },
  { variant: "B", label: "Composite Shutters", material: "Woodlore Composite" },
  { variant: "C", label: "Poly Shutters", material: "Poly Composite" },
] as const;

// Norman material types
export const NORMAN_MATERIAL_TYPES = ["Wood", "Composite"] as const;

// Norman composite sub-types
export const NORMAN_COMPOSITE_SUBTYPES = [
  "Woodlore",
  "Woodlore Plus",
  "Brightwood",
  "Normandy",
] as const;

// Onyx material types
export const ONYX_MATERIAL_TYPES = ["Wood", "Poly"] as const;

// Onyx Poly delivery options
export const ONYX_POLY_DELIVERY = ["3-Week", "6-Week"] as const;

export const PAYMENT_METHODS = [
  { id: "check", label: "Check", icon: "FileText" },
  { id: "card_ach", label: "Card / ACH", icon: "CreditCard" },
  { id: "zelle", label: "Zelle", icon: "Zap" },
  { id: "cash", label: "Cash", icon: "Banknote" },
] as const;

// Roller Shade Options
export const ROLLER_MOUNT_TYPES = ["Inside Mount", "Outside Mount"] as const;
export const ROLLER_SHADE_TYPES = ["Single Shade", "Dual Rollers", "Common Valance"] as const;
export const ROLLER_LIFT_SYSTEMS = ["Cordless", "Smart Release", "Motorized"] as const;
export const ROLLER_VALANCES = [
  "Standard Cassette Valance",
  "Decorative Fabric Valance",
  "Premium Wood Valance",
  "No Valance / Open Roll",
] as const;

// Roller Shade Fabrics - COMPLETE catalog from 818 site (70 fabrics, 4 categories)
// Category: Room Darkening (12 fabrics)
export const ROLLER_ROOM_DARKENING_FABRICS = [
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
] as const;

// Category: Sheer (4 fabrics)
export const ROLLER_SHEER_FABRICS = [
  "Dazzle (Sheer)",
  "Lakeshore (Sheer)",
  "Scarlett (Sheer)",
  "Sheer",
] as const;

// Category: Natural (13 fabrics)
export const ROLLER_NATURAL_FABRICS = [
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
] as const;

// Category: Other/Standard (41 fabrics including solar screens)
export const ROLLER_OTHER_FABRICS = [
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
] as const;

// All roller fabrics combined
export const ROLLER_ALL_FABRICS = [
  ...ROLLER_ROOM_DARKENING_FABRICS,
  ...ROLLER_SHEER_FABRICS,
  ...ROLLER_NATURAL_FABRICS,
  ...ROLLER_OTHER_FABRICS,
] as const;

// Fabric categories for grouped dropdown
export const ROLLER_FABRIC_CATEGORIES = {
  roomDarkening: ROLLER_ROOM_DARKENING_FABRICS,
  sheer: ROLLER_SHEER_FABRICS,
  natural: ROLLER_NATURAL_FABRICS,
  other: ROLLER_OTHER_FABRICS,
} as const;

// EXACT price group arrays verified from 818 V2 Quote Builder (all 70 fabrics)
// Group 1: 19 fabrics
export const ROLLER_GROUP1_FABRICS = [
  "Brook",
  "Callie",
  "Callie RD (Room Darkening)",
  "Canvas LF",
  "Cascade LF",
  "Catalina (Natural)",
  "Chelsea",
  "Classic LF",
  "Elements",
  "Flow (7%)",
  "Horizon LF",
  "Linen LF",
  "NA300 (3%, 5%)",
  "NA400 (3%, 5%, 10%)",
  "Scarlett (Sheer)",
  "Serene (7%)",
  "Verona LF",
  "Vista LF",
  "Windsong (5%)",
] as const;

// Group 2: 34 fabrics
export const ROLLER_GROUP2_FABRICS = [
  "Amelia",
  "Amelia RD (Room Darkening)",
  "Bali (Natural)",
  "Bermuda (Room Darkening)",
  "Bora Bora (Natural)",
  "Breeze (1%, 3%)",
  "Dazzle (Sheer)",
  "Emery",
  "Fiji (Room Darkening)",
  "Flow (1%, 5%)",
  "Francis",
  "Francis RD (Room Darkening)",
  "Hayes",
  "Jamaica (Room Darkening)",
  "Java (Natural)",
  "Lake Tahoe (Natural)",
  "Lakeshore (Sheer)",
  "Lola LF",
  "Moon (5%)",
  "NA300 (1%)",
  "NA400 (1%)",
  "NA820 (3%)",
  "Phuket (Natural)",
  "Remy",
  "Riviera (Natural)",
  "Samoa (Natural)",
  "Serene (1%, 3%)",
  "Sheer",
  "Shimmer",
  "Sierra",
  "Sumatra (Natural)",
  "Valerie",
  "W120 (12%)",
  "Windsong (1%)",
] as const;

// Group 3: 16 fabrics
export const ROLLER_GROUP3_FABRICS = [
  "Aruba (Natural)",
  "Breeze",
  "Breeze RD (Room Darkening)",
  "Caroline (Natural)",
  "Clarissa",
  "Cory (Room Darkening)",
  "Cove (Natural)",
  "Galaxy (3%)",
  "Garden (Room Darkening)",
  "Jubilee (3%)",
  "Lakeview (3%, 7%, 10%)",
  "Lola BO (Room Darkening)",
  "Maui (Natural)",
  "Meadows (1%, 3%)",
  "Remy RD (Room Darkening)",
  "Summerland (Room Darkening)",
] as const;

// Group 4: 1 fabric
export const ROLLER_GROUP4_FABRICS = ["Kendra"] as const;

// Solar screen fabrics are also in the main groups above (Group 1 = high %, Group 2 = low %)
// These arrays are kept for backward compatibility with solar-specific pricing logic
export const ROLLER_SOLAR_GROUP1_FABRICS = [
  "Flow (7%)",
  "NA300 (3%, 5%)",
  "NA400 (3%, 5%, 10%)",
  "Serene (7%)",
  "Windsong (5%)",
] as const;

export const ROLLER_SOLAR_GROUP2_FABRICS = [
  "Breeze (1%, 3%)",
  "Flow (1%, 5%)",
  "Moon (5%)",
  "Serene (1%, 3%)",
  "W120 (12%)",
  "Windsong (1%)",
] as const;

export const ROLLER_SOLAR_CORDLESS_GROUP3_FABRICS = [
  "Galaxy (3%)",
  "Jubilee (3%)",
  "Lakeview (3%, 7%, 10%)",
  "Meadows (1%, 3%)",
  "NA300 (1%)",
  "NA400 (1%)",
  "NA820 (3%)",
] as const;

export const ROLLER_LIGHT_FILTERING_FABRICS = [
  "Classic LF",
  "Linen LF",
  "Canvas LF",
  "Horizon LF",
  "Vista LF",
  "Cascade LF",
  "Lola LF",
] as const;

// Roman Shade Options
export const ROMAN_MOUNT_TYPES = ["Inside Mount", "Outside Mount"] as const;
export const ROMAN_LIFT_SYSTEMS = ["Cordless", "Motorized"] as const;
export const ROMAN_VALANCES = [
  "Standard Cassette Valance",
  "Decorative Fabric Valance",
  "Premium Wood Valance",
  "No Valance / Open Roll",
] as const;

export type RomanFabricPriceGroup = "group1" | "group2" | "group3";

export interface RomanFabricColor {
  code: string;
  name: string;
  priceGroup: RomanFabricPriceGroup;
}

export interface RomanFabricCategory {
  name: string;
  colors: readonly RomanFabricColor[];
}

const romanColor = (
  code: string,
  name: string,
  priceGroup: RomanFabricPriceGroup
): RomanFabricColor => ({ code, name, priceGroup });

// Roman Shade fabric catalog from the Norman Centerpiece Roman order flow.
export const ROMAN_FABRIC_CATEGORIES: readonly RomanFabricCategory[] = [
  {
    name: "Alma",
    colors: [
      romanColor("F1621", "Dusk Blue", "group2"),
      romanColor("F1622", "Coronet Blue", "group2"),
      romanColor("F1623", "Dark Shadow", "group2"),
      romanColor("F1624", "Paloma", "group2"),
      romanColor("F1625", "Cloudburst", "group2"),
      romanColor("F1626", "Whitecap Gray", "group2"),
      romanColor("F1627", "Doeskin", "group2"),
      romanColor("F1628", "Whisper White", "group2"),
      romanColor("F1629", "Chalk White", "group2"),
      romanColor("F1631", "Plum", "group2"),
    ],
  },
  {
    name: "Ashley",
    colors: [
      romanColor("F2071", "Extra White", "group2"),
      romanColor("F2072", "Warm White", "group2"),
      romanColor("F2073", "Dovetail", "group2"),
      romanColor("F2074", "Sand Canyon", "group2"),
      romanColor("F2075", "Driftwood", "group2"),
      romanColor("F2076", "Light Fawn", "group2"),
    ],
  },
  {
    name: "Bali",
    colors: [
      romanColor("F0668", "Black Walnut", "group2"),
      romanColor("F1668", "Sand", "group2"),
      romanColor("F1669", "Flax", "group2"),
      romanColor("F1926", "Latte", "group2"),
      romanColor("F1927", "Stone Gray", "group2"),
      romanColor("F2023", "Desert Beige", "group2"),
      romanColor("F2024", "Warm Mocha", "group2"),
      romanColor("F2025", "Soft Sandstone", "group2"),
      romanColor("F2026", "Gentle Ash", "group2"),
      romanColor("F2027", "Gray", "group2"),
    ],
  },
  {
    name: "Belgian Linen",
    colors: [
      romanColor("F1051", "Warm Gray", "group3"),
      romanColor("F1057", "Champagne", "group3"),
      romanColor("F1058", "Gray", "group3"),
      romanColor("F1061", "Sag Harbor", "group3"),
    ],
  },
  {
    name: "Blake",
    colors: [romanColor("F0247", "Dark Slate", "group3")],
  },
  {
    name: "Bora Bora",
    colors: [
      romanColor("F0662", "Seashell White", "group2"),
      romanColor("F0663", "Straw", "group2"),
      romanColor("F0869", "Cinnamon", "group2"),
    ],
  },
  {
    name: "Breeze",
    colors: [
      romanColor("F1897", "Linen Natural", "group3"),
      romanColor("F1898", "Linen Khaki", "group3"),
      romanColor("F1899", "Linen Graphite", "group3"),
      romanColor("F1900", "Linen Almond Milk", "group3"),
      romanColor("F1901", "Linen Stone", "group3"),
      romanColor("F1902", "Linen Warm Ivory", "group3"),
      romanColor("F1903", "Linen Cloud", "group3"),
    ],
  },
  {
    name: "Caroline",
    colors: [
      romanColor("F0867", "White Sand", "group2"),
      romanColor("F1089", "Optic White", "group2"),
      romanColor("F1090", "Warm White", "group2"),
      romanColor("F1091", "Taupe", "group2"),
      romanColor("F1092", "Sky Gray", "group2"),
      romanColor("F1093", "Dove Gray", "group2"),
      romanColor("F1094", "Pale Green", "group2"),
      romanColor("F1095", "Deep Khaki", "group2"),
      romanColor("F1096", "Light Brown", "group2"),
      romanColor("F1097", "Terra Cotta", "group2"),
      romanColor("F1098", "Dark Brown", "group2"),
      romanColor("F1099", "Navy", "group2"),
      romanColor("F1100", "Medium Blue", "group2"),
      romanColor("F1102", "Greige", "group2"),
    ],
  },
  {
    name: "Catalina",
    colors: [romanColor("F1605", "Sea Salt", "group2"), romanColor("F1712", "Oatmeal", "group2")],
  },
  {
    name: "Ella",
    colors: [romanColor("F0178", "Java", "group2"), romanColor("F0182", "Spice", "group2")],
  },
  {
    name: "Ellie",
    colors: [
      romanColor("F1939", "Linen White", "group2"),
      romanColor("F1940", "Wheat", "group2"),
      romanColor("F1941", "Mist Gray", "group2"),
    ],
  },
  {
    name: "Francis",
    colors: [
      romanColor("F1904", "White", "group2"),
      romanColor("F1905", "Weathered White", "group2"),
      romanColor("F1906", "Broken White", "group2"),
      romanColor("F1907", "Soft Sandstone", "group2"),
      romanColor("F1908", "Desert Beige", "group2"),
      romanColor("F1909", "Rich Truffle", "group2"),
      romanColor("F1932", "Oatmeal", "group2"),
      romanColor("F1933", "Black", "group2"),
      romanColor("F1984", "Soft Gray", "group2"),
      romanColor("F1985", "Cloudy Gray", "group2"),
      romanColor("F1986", "Natural Beige", "group2"),
      romanColor("F1987", "Warm Mocha", "group2"),
      romanColor("F1988", "Graphite", "group2"),
      romanColor("F1989", "Stone Gray", "group2"),
      romanColor("F1990", "Soothing Gray", "group2"),
      romanColor("F1991", "Gentle Ash", "group2"),
    ],
  },
  {
    name: "Impressions",
    colors: [
      romanColor("F1695", "Gris Perle", "group2"),
      romanColor("F1719", "Almond Ash", "group2"),
      romanColor("F1720", "Rose Dust", "group2"),
      romanColor("F1721", "Coastal Sandstone", "group2"),
      romanColor("F1794", "Ice White", "group2"),
      romanColor("F1795", "Warm White", "group2"),
    ],
  },
  {
    name: "Java",
    colors: [
      romanColor("F0856", "Raffia", "group2"),
      romanColor("F0857", "Haystack", "group2"),
      romanColor("F0858", "Natural", "group2"),
      romanColor("F0859", "Sage", "group2"),
      romanColor("F1562", "Toasted Brown", "group2"),
    ],
  },
  {
    name: "Lakeside",
    colors: [
      romanColor("F0183", "Milk", "group2"),
      romanColor("F0184", "Warm White", "group2"),
      romanColor("F0185", "Pebble", "group2"),
      romanColor("F0186", "Rich Gold", "group2"),
      romanColor("F0187", "Steel Gray", "group2"),
      romanColor("F0188", "Chocolate Brown", "group2"),
      romanColor("F0189", "Loden Green", "group2"),
      romanColor("F0190", "Deep Ocean", "group2"),
      romanColor("F0191", "Claret", "group2"),
      romanColor("F0192", "Jet Black", "group2"),
    ],
  },
  {
    name: "Lorraine",
    colors: [
      romanColor("F0031", "Black Gingham", "group2"),
      romanColor("F0058", "Seal Brown", "group2"),
      romanColor("F0193", "Vanilla Ice", "group2"),
      romanColor("F0194", "Sand", "group2"),
      romanColor("F0195", "Espresso", "group2"),
      romanColor("F0196", "Sedona Sage", "group2"),
    ],
  },
  {
    name: "Louise",
    colors: [
      romanColor("F1708", "Glacier Blue", "group2"),
      romanColor("F1709", "White Jade", "group2"),
      romanColor("F1710", "Light Apricot", "group2"),
      romanColor("F1711", "Sepia", "group2"),
    ],
  },
  {
    name: "Patterns",
    colors: [
      romanColor("F1070", "Woolen Gray", "group2"),
      romanColor("F1071", "Woolen White", "group2"),
      romanColor("F1072", "Olive Green", "group2"),
      romanColor("F1073", "Sky Blue", "group2"),
      romanColor("F1074", "Camel", "group2"),
      romanColor("F1075", "Cadet Gray", "group2"),
      romanColor("F1076", "Cosmic Latte", "group2"),
      romanColor("F1077", "Charcoal", "group2"),
      romanColor("F1078", "Ash Gray", "group2"),
      romanColor("F1079", "Dark Cerulean", "group2"),
      romanColor("F1080", "Snow White", "group2"),
      romanColor("F1081", "Field Drab", "group2"),
      romanColor("F1101", "Moss Green", "group2"),
    ],
  },
  {
    name: "Phuket",
    colors: [
      romanColor("F0656", "Snow White", "group2"),
      romanColor("F0657", "Honey", "group2"),
      romanColor("F0659", "Black Olive", "group2"),
      romanColor("F0660", "Grey Fog", "group2"),
      romanColor("F0661", "Dust", "group2"),
      romanColor("F0868", "Dough", "group2"),
      romanColor("F1670", "Mocha", "group2"),
    ],
  },
  {
    name: "Riviera",
    colors: [
      romanColor("F1290", "Frost", "group2"),
      romanColor("F1291", "Sugar Cane", "group2"),
      romanColor("F1292", "Honey", "group2"),
      romanColor("F1293", "Metal", "group2"),
      romanColor("F1713", "Silver Fox", "group2"),
    ],
  },
  {
    name: "Rochelle",
    colors: [romanColor("F0228", "French Roast", "group3")],
  },
  {
    name: "Scarlett",
    colors: [
      romanColor("F1599", "Cottage Linen", "group2"),
      romanColor("F1600", "Seashell", "group2"),
      romanColor("F1601", "Crema", "group2"),
      romanColor("F1602", "Stone", "group2"),
    ],
  },
  {
    name: "Seabreeze",
    colors: [
      romanColor("F0235", "Egret", "group2"),
      romanColor("F0236", "Rich Cream", "group2"),
      romanColor("F0238", "Ebony", "group2"),
      romanColor("F0239", "Tapestry Gold", "group2"),
      romanColor("F1956", "Vanilla White", "group2"),
      romanColor("F1968", "Gentle Ash", "group2"),
      romanColor("F1969", "Soft Sandstone", "group2"),
      romanColor("F1970", "Desert Beige", "group2"),
      romanColor("F1971", "Warm Mocha", "group2"),
      romanColor("F1972", "Anthracite Gray", "group2"),
      romanColor("F1973", "Gray", "group2"),
      romanColor("F1974", "Graphite", "group2"),
      romanColor("F1975", "Soothing Gray", "group2"),
      romanColor("F1994", "Cloudy Gray", "group2"),
      romanColor("F1995", "Rich Truffle", "group2"),
    ],
  },
  {
    name: "Sheer Elegance",
    colors: [
      romanColor("F1085", "Dim Ecru", "group1"),
      romanColor("F1470", "Cloud White", "group1"),
      romanColor("F1657", "Floral White", "group1"),
      romanColor("F1082", "Corn White", "group2"),
      romanColor("F1083", "Sea Green", "group2"),
    ],
  },
  {
    name: "Sierra",
    colors: [
      romanColor("F1916", "Snow", "group3"),
      romanColor("F1917", "Cream", "group3"),
      romanColor("F1918", "Natural", "group3"),
      romanColor("F1919", "Silverware", "group3"),
      romanColor("F1920", "Canvas", "group3"),
      romanColor("F1921", "Graphite", "group3"),
      romanColor("F1922", "Stone", "group3"),
      romanColor("F1923", "Caviar", "group3"),
    ],
  },
  {
    name: "Solids",
    colors: [
      romanColor("F1069", "Linen White", "group2"),
      romanColor("F1063", "Slate Gray", "group3"),
      romanColor("F1064", "Anti White", "group3"),
      romanColor("F1067", "Taupe", "group3"),
    ],
  },
  {
    name: "Sumatra",
    colors: [romanColor("F0854", "Fog", "group2")],
  },
  {
    name: "Taylor",
    colors: [
      romanColor("F0210", "Corn Silk White", "group2"),
      romanColor("F0211", "Khaki", "group2"),
      romanColor("F0214", "Sky Blue", "group2"),
      romanColor("F0217", "India Ink", "group2"),
      romanColor("F0219", "Puce", "group2"),
      romanColor("F0220", "Tango Red", "group2"),
      romanColor("F0221", "Orange Spice", "group2"),
      romanColor("F0261", "Navy", "group2"),
    ],
  },
  {
    name: "Valencia",
    colors: [romanColor("F0255", "Greige", "group1"), romanColor("F0145", "Rich Wheat", "group2")],
  },
  {
    name: "Whispering Willow",
    colors: [
      romanColor("F2081", "Diamond", "group2"),
      romanColor("F2082", "Dove", "group2"),
      romanColor("F2083", "Cottage Straw", "group2"),
    ],
  },
  {
    name: "Windsor",
    colors: [
      romanColor("F0229", "Pearl White", "group2"),
      romanColor("F0230", "Neutral Gray", "group2"),
      romanColor("F0231", "Smoke", "group2"),
      romanColor("F0232", "Earth", "group2"),
      romanColor("F0233", "Toast", "group2"),
      romanColor("F0234", "Tarmac", "group2"),
      romanColor("F1957", "Lotus White", "group2"),
      romanColor("F1976", "Gentle Ash", "group2"),
      romanColor("F1977", "Soft Sandstone", "group2"),
      romanColor("F1978", "Desert Beige", "group2"),
      romanColor("F1979", "Warm Mocha", "group2"),
      romanColor("F1980", "Anthracite Gray", "group2"),
      romanColor("F1981", "Gray", "group2"),
      romanColor("F1982", "Graphite", "group2"),
      romanColor("F1983", "Soothing Gray", "group2"),
      romanColor("F1992", "Cloudy Gray", "group2"),
      romanColor("F1993", "Rich Truffle", "group2"),
    ],
  },
] as const;

export function formatRomanFabricColor(color: RomanFabricColor): string {
  return `${color.code} ${color.name}`;
}

export const ROMAN_FABRIC_CATEGORY_NAMES = ROMAN_FABRIC_CATEGORIES.map((category) => category.name);

export const ROMAN_ALL_FABRICS = ROMAN_FABRIC_CATEGORIES.flatMap((category) =>
  category.colors.map(formatRomanFabricColor)
);

export const ROMAN_GROUP1_FABRICS = ROMAN_FABRIC_CATEGORIES.flatMap((category) =>
  category.colors.filter((color) => color.priceGroup === "group1").map(formatRomanFabricColor)
);

export const ROMAN_GROUP2_FABRICS = ROMAN_FABRIC_CATEGORIES.flatMap((category) =>
  category.colors.filter((color) => color.priceGroup === "group2").map(formatRomanFabricColor)
);

export const ROMAN_GROUP3_FABRICS = ROMAN_FABRIC_CATEGORIES.flatMap((category) =>
  category.colors.filter((color) => color.priceGroup === "group3").map(formatRomanFabricColor)
);

// Honeycomb Shade Options
export const HONEYCOMB_MOUNT_TYPES = ["Inside Mount", "Outside Mount"] as const;
export const HONEYCOMB_CELL_SIZES = [
  '3/8" Single Cell',
  '9/16" Single Cell',
  '3/4" Single Cell',
  '1 1/4" Single Cell',
  '1/2" Double Cell',
  '3/4" Double Cell',
  "SmartFit® with Frame",
  "SmartFit® for Sloped Windows with Frame",
] as const;
export const HONEYCOMB_SHADE_TYPES = ["Single", "Day/Night*"] as const;
export const HONEYCOMB_ADDITIONAL_OPTIONS = ["No", "Yes"] as const;
export const HONEYCOMB_LIFT_SYSTEMS = [
  "Cordless",
  "Smart Release",
  "Motorized",
  "Top Down-Bottom Up",
] as const;
export const HONEYCOMB_LIGHT_CONTROL = ["Light Filtering", "Room Darkening", "Blackout"] as const;

// Honeycomb Shade Fabrics - COMPLETE catalog from 818 site (19 fabric lines)
export const HONEYCOMB_FABRICS = [
  "Sheer Whisper",
  "Breeze",
  "Classic BO",
  "Classic Double BO",
  "Classic Double LF",
  "Classic Double RD",
  "Classic LF",
  "Classic RD",
  "Flame Resistant",
  "Linen BO",
  "Linen Double",
  "Linen LF",
  "Linen RD",
  "Premier Double BO",
  "Premier Double LF",
  "Premier Double RD",
  "Silhouette",
  "Silhouette Double",
  "Windsong",
] as const;

// Honeycomb fabric-to-grid routing
// Maps cell size + fabric → pricing grid key
export function getHoneycombGrid(cellSize: string, fabric: string): string {
  // Normalize both legacy labels ("Breeze LF") and current builder labels
  // ("BZ-LF Breeze LF") into the fabric name used for grid routing.
  const baseFabric = fabric
    .trim()
    .replace(/^[A-Z0-9-]+\s+/, "")
    .replace(/ (LF|RD|BO)$/i, "")
    .trim();

  if (cellSize === '3/8" Single Cell' && baseFabric.includes("Flame Resistant")) {
    return "flame_resistant_3_8_single";
  }

  switch (cellSize) {
    case '1/2" Double Cell':
      return "half_cordless_double";
    case '9/16" Single Cell':
      return "nine_16_cordless_single";
    case '3/8" Single Cell':
      return "three_8_single_and_3_4_single";
    case '3/4" Single Cell':
      if (baseFabric.includes("Windsong")) return "three_4_single_woven_group1";
      if (baseFabric.includes("Breeze")) return "three_4_single_woven_group2";
      return "three_8_single_and_3_4_single";
    case '3/4" Double Cell':
    case '1 1/4" Single Cell':
    case "SmartFit® with Frame":
    case "SmartFit® for Sloped Windows with Frame":
    default:
      return "general_3_4_double";
  }
}

// Get available fabrics for a given cell size
export function getHoneycombFabricsForCellSize(cellSize: string): readonly string[] {
  switch (cellSize) {
    case '3/4" Double Cell':
      return [
        "Classic Double LF",
        "Classic Double RD",
        "Classic Double BO",
        "Premier Double LF",
        "Premier Double RD",
        "Premier Double BO",
        "Linen Double",
        "Silhouette Double",
      ] as const;

    case '3/8" Single Cell':
      return [
        "Classic Single LF",
        "Classic Single RD",
        "Premier Single LF",
        "Premier Single RD",
        "Tuscany Single LF",
        "Tuscany Single RD",
        "Flame Resistant LF",
        "Flame Resistant RD",
        "Flame Resistant BO",
      ] as const;

    case '1/2" Double Cell':
      return [
        "Compact Double LF",
        "Compact Double RD",
        "Compact Double BO",
        "Energy Efficient Double",
        "Signature Double LF",
        "Signature Double RD",
      ] as const;

    case '9/16" Single Cell':
      return [
        "Verona Single LF",
        "Verona Single RD",
        "Cascade Single LF",
        "Cascade Single RD",
        "Solera Single LF",
        "Solera Single RD",
      ] as const;

    case '3/4" Single Cell':
      return [
        "Classic Single LF",
        "Classic Single RD",
        "Premier Single LF",
        "Premier Single RD",
        "Tuscany Single LF",
        "Tuscany Single RD",
        "Windsong LF",
        "Windsong RD",
        "Windsong BO",
        "Breeze LF",
        "Breeze RD",
        "Breeze BO",
      ] as const;

    case '1 1/4" Single Cell':
      return [
        "Classic Double LF",
        "Classic Double RD",
        "Classic Double BO",
        "Premier Double LF",
        "Premier Double RD",
        "Premier Double BO",
        "Linen Double",
        "Silhouette Double",
      ] as const;

    case "SmartFit® with Frame":
    case "SmartFit® for Sloped Windows with Frame":
      return [
        "Classic Double LF",
        "Classic Double RD",
        "Classic Double BO",
        "Premier Double LF",
        "Premier Double RD",
        "Premier Double BO",
      ] as const;

    default:
      return HONEYCOMB_FABRICS;
  }
}

// Sheer Shade Options (PerfectSheer)
export const PERFECTSHEER_MOUNT_TYPES = ["Inside Mount", "Outside Mount"] as const;
export const PERFECTSHEER_LIGHT_CONTROL = ["Light Filtering", "Room Darkening"] as const;
export const PERFECTSHEER_LIFT_SYSTEMS = ["Cordless", "Motorized"] as const;

export const PERFECTSHEER_FABRICS = [
  "Whisper Sheer",
  "Elegance Sheer",
  "Crystal Sheer",
  "Monaco",
  "Provence",
  "Tuscany",
] as const;

// Faux Wood Blind Options
export const FAUX_WOOD_MOUNT_TYPES = ["Inside Mount", "Outside Mount"] as const;
export const FAUX_WOOD_SLAT_SIZES = ['2"', '2.5"'] as const;
export const FAUX_WOOD_PRODUCT_LINES = ["SmartPrivacy", "Ultimate"] as const;

export const FAUX_WOOD_SMARTPRIVACY_COLORS = [
  "Silk White",
  "True White",
  "Snow White",
  "Antique White",
  "Pearl",
  "Canvas",
  "Alabaster",
  "Vanilla Bean",
] as const;

export const FAUX_WOOD_ULTIMATE_COLORS = [
  "Ultra White",
  "Bright White",
  "Warm White",
  "Cream",
  "Ivory",
  "Linen",
  "Natural",
  "Espresso",
  "Walnut",
  "Mahogany",
] as const;

// Wood Blind Options
export const WOOD_BLIND_MOUNT_TYPES = ["Inside Mount", "Outside Mount"] as const;
export const WOOD_BLIND_SLAT_SIZES = ['2"', '2.5"'] as const;

export const WOOD_BLIND_COLORS = [
  "Natural Oak",
  "Golden Oak",
  "Pecan",
  "Cherry",
  "Walnut",
  "Espresso",
  "White Wash",
  "Driftwood",
  "Slate",
] as const;

// Vertical Blind Options
export const VERTICAL_MOUNT_TYPES = ["Inside Mount", "Outside Mount"] as const;

export const VERTICAL_FABRIC_GROUP1 = ["Classic collection"] as const;
export const VERTICAL_FABRIC_GROUP2 = ["S-Curved", "Sandblasted"] as const;
export const VERTICAL_FABRIC_GROUP3 = ["Flaxen", "Adobe", "Shantung"] as const;
export const VERTICAL_FABRIC_GROUP4 = ["Linen", "Grasscloth", "Willow", "Faux Wood"] as const;

export const VERTICAL_FABRIC_GROUPS = [
  ...VERTICAL_FABRIC_GROUP1,
  ...VERTICAL_FABRIC_GROUP2,
  ...VERTICAL_FABRIC_GROUP3,
  ...VERTICAL_FABRIC_GROUP4,
] as const;

export const VERTICAL_COLORS = [
  "Pure White Collection: Classic",
  "Silk White Collection: Classic",
  "Designer White Collection: Sandblasted",
  "Pure White Collection: Shantung",
  "Pure White Collection: Linen",
  "Pure White Collection: Adobe",
  "Pearl Collection: Classic",
  "Bright White Collection: Sandblasted",
  "Bright White Collection: Adobe",
  "Crisp Linen Collection: Sandblasted",
  "Bright White Collection: Shantung",
  "Wheat Collection: Linen",
  "Chic Gray Collection: Linen",
  "Botanical Garden Collection: Grasscloth",
  "Taupe Gray Collection: Sandblasted",
  "Mustard Green Collection: Flaxen",
  "Honey Wheat Collection: Flaxen",
  "Sea Mist Collection: Classic",
  "Mist Collection: Willow",
  "Latte Collection: Adobe",
  "Taupe Collection: Adobe",
  "Latte Collection: Shantung",
  "Limed White Collection: Faux Wood",
  "Birch Collection: Willow",
  "Natural Gray Collection: Willow",
  "Driftwood Collection: Faux Wood",
  "Oak Collection: Faux Wood",
  "Cloud Collection: Willow",
  "Cement Collection: Shantung",
  "Lilac Collection: Shantung",
  "Burnished Clay Collection: Willow",
  "Platinum Collection: Flaxen",
  "Shark Fin Collection: Adobe",
  "Metropolitan Collection: Linen",
  "Metropolitan Collection: Classic",
  "Metropolitan Collection: Shantung",
  "Silver Birch Collection: Faux Wood",
  "Magnetic Gray Collection: Flaxen",
  "Dusty Blue Collection: Linen",
  "Laurel Pink Collection: Shantung",
  "Merlot Collection: Linen",
  "Chestnut Collection: Faux Wood",
] as const;

export const VERTICAL_STACK_OPTIONS = ["Stack Right", "Stack Left"] as const;
export const VERTICAL_CONTROL_TYPES = ["Cordless Wand Operation"] as const;

export function getVerticalColorsForGroup(fabricGroup: string): readonly string[] {
  if (!fabricGroup || fabricGroup === "Classic collection") {
    return VERTICAL_COLORS.filter((color) => color.endsWith(": Classic"));
  }
  return VERTICAL_COLORS.filter((color) => color.endsWith(`: ${fabricGroup}`));
}

// Smart Drape Options
export const SMARTDRAPE_MOUNT_TYPES = ["Inside Mount", "Outside Mount"] as const;
export const SMARTDRAPE_SHADE_TYPES = [
  "Light Filtering",
  "Room Darkening",
  "Light Filtering Essentials",
] as const;

export const SMARTDRAPE_LIGHT_FILTERING_FABRICS = [
  "White Light Filtering Fabric Pattern - Coronado",
  "White Light Filtering Fabric Pattern - Plain",
  "White Light Filtering Fabric Pattern - Pacific",
  "White Light Filtering Fabric Pattern - Teardrop",
  "White Light Filtering Fabric Pattern - Net",
  "White Light Filtering Fabric Pattern - Circle",
  "Cottonwood Light Filtering Fabric Pattern - Circle",
  "Cottonwood Light Filtering Fabric Pattern - Pacific",
  "Cottonwood Light Filtering Fabric Pattern - Teardrop",
  "Alabaster Light Filtering Fabric Pattern - Pacific",
  "Cottonwood Light Filtering Fabric Pattern - Coronado",
  "Cottonwood Light Filtering Fabric Pattern - Plain",
  "Cottonwood Light Filtering Fabric Pattern - Net",
  "Plain Linen Ivory Light Filtering Fabric Pattern - Plain",
  "Plain Linen Cottonwood Light Filtering Fabric Pattern - Plain",
  "Alabaster Light Filtering Fabric Pattern - Plain",
  "Ivory Light Filtering Fabric Pattern - Coronado",
  "Ivory Light Filtering Fabric Pattern - Plain",
  "Ivory Light Filtering Fabric Pattern - Circle",
  "Ivory Light Filtering Fabric Pattern - Net",
  "Ivory Light Filtering Fabric Pattern - Teardrop",
  "Ivory Light Filtering Fabric Pattern - Pacific",
  "Light Gray Light Filtering Fabric Pattern - Stripe",
  "Leather Brown Light Filtering Fabric Pattern - Pacific",
  "Soft White Room Darkening",
  "White Light Filtering Fabric Pattern - Stripe",
  "Plain Linen White Light Filtering Fabric Pattern - Plain",
  "Platinum Light Filtering Fabric Pattern - Pacific",
  "Platinum Light Filtering Fabric Pattern - Circle",
  "Platinum Light Filtering Fabric Pattern - Net",
  "Platinum Light Filtering Fabric Pattern - Plain",
  "Light Gray Light Filtering Fabric Pattern - Coronado",
  "Light Gray Light Filtering Fabric Pattern - Teardrop",
  "Light Gray Light Filtering Fabric Pattern - Net",
  "Light Gray Light Filtering Fabric Pattern - Pacific",
  "Light Gray Light Filtering Fabric Pattern - Circle",
  "Light Gray Light Filtering Fabric Pattern - Plain",
  "French Silver Light Filtering Fabric Pattern - Pacific",
  "Gray Light Filtering Fabric Pattern - Teardrop",
  "Gray Light Filtering Fabric Pattern - Coronado",
  "Gray Light Filtering Fabric Pattern - Circle",
  "Gray Light Filtering Fabric Pattern - Pacific",
  "Gray Light Filtering Fabric Pattern - Net",
  "Gray Light Filtering Fabric Pattern - Plain",
  "Charcoal Light Filtering Fabric Pattern - Teardrop",
  "Charcoal Light Filtering Fabric Pattern - Coronado",
  "Charcoal Light Filtering Fabric Pattern - Circle",
  "Charcoal Light Filtering Fabric Pattern - Plain",
  "Charcoal Light Filtering Fabric Pattern - Stripe",
  "Charcoal Light Filtering Fabric Pattern - Net",
  "Charcoal Light Filtering Fabric Pattern - Pacific",
] as const;

export const SMARTDRAPE_ESSENTIALS_FABRICS = ["Lakeshore Stripe"] as const;
export const SMARTDRAPE_ROOM_DARKENING_FABRICS = [
  "Crema Room Darkening",
  "Pacific Cottonwood Room Darkening Fabric Pattern - Pacific",
  "Plain Cottonwood Room Darkening Fabric Pattern - Plain",
  "Pacific Crema Room Darkening Fabric Pattern - Pacific",
  "Plain Crema Room Darkening Fabric Pattern - Plain",
  "Plain Light Gray Room Darkening Fabric Pattern - Plain",
  "Pacific Light Gray Room Darkening Fabric Pattern - Pacific",
  "Carbon Room Darkening",
  "Coffee Room Darkening",
  "Plain Coffee Room Darkening Fabric Pattern - Plain",
  "Pacific Coffee Room Darkening Fabric Pattern - Pacific",
  "Pacific Carbon Room Darkening Fabric Pattern - Pacific",
  "Plain Carbon Room Darkening Fabric Pattern - Plain",
] as const;

export const SMARTDRAPE_FABRICS = [
  ...SMARTDRAPE_LIGHT_FILTERING_FABRICS,
  ...SMARTDRAPE_ROOM_DARKENING_FABRICS,
  ...SMARTDRAPE_ESSENTIALS_FABRICS,
] as const;

export const SMARTDRAPE_STACK_OPTIONS = [
  "Stack Right",
  "Stack Left",
  "Side by Side",
  "Traveling Center Stack",
  "Center Opening",
] as const;

export const SMARTDRAPE_CONTROL_TYPES = ["Manual", "Motorized"] as const;
export const SMARTDRAPE_CONTROL_SIDES = ["Left", "Right"] as const;

export const QUOTE_STATUSES: { value: string; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "sent", label: "Sent" },
  { value: "sold", label: "Sold" },
  { value: "installed", label: "Installed" },
];

// EXACT fabric-to-price-group mapping verified from 818 V2 Quote Builder
// Built as a Map for O(1) lookup performance
const ROLLER_FABRIC_TO_GROUP = new Map<string, string>([
  // Group 1 (19 fabrics)
  ["Brook", "group1"],
  ["Callie", "group1"],
  ["Callie RD (Room Darkening)", "group1"],
  ["Canvas LF", "group1"],
  ["Cascade LF", "group1"],
  ["Catalina (Natural)", "group1"],
  ["Chelsea", "group1"],
  ["Classic LF", "group1"],
  ["Elements", "group1"],
  ["Flow (7%)", "group1"],
  ["Horizon LF", "group1"],
  ["Linen LF", "group1"],
  ["NA300 (3%, 5%)", "group1"],
  ["NA400 (3%, 5%, 10%)", "group1"],
  ["Scarlett (Sheer)", "group1"],
  ["Serene (7%)", "group1"],
  ["Verona LF", "group1"],
  ["Vista LF", "group1"],
  ["Windsong (5%)", "group1"],

  // Group 2 (34 fabrics)
  ["Amelia", "group2"],
  ["Amelia RD (Room Darkening)", "group2"],
  ["Bali (Natural)", "group2"],
  ["Bermuda (Room Darkening)", "group2"],
  ["Bora Bora (Natural)", "group2"],
  ["Breeze (1%, 3%)", "group2"],
  ["Dazzle (Sheer)", "group2"],
  ["Emery", "group2"],
  ["Fiji (Room Darkening)", "group2"],
  ["Flow (1%, 5%)", "group2"],
  ["Francis", "group2"],
  ["Francis RD (Room Darkening)", "group2"],
  ["Hayes", "group2"],
  ["Jamaica (Room Darkening)", "group2"],
  ["Java (Natural)", "group2"],
  ["Lake Tahoe (Natural)", "group2"],
  ["Lakeshore (Sheer)", "group2"],
  ["Lola LF", "group2"],
  ["Moon (5%)", "group2"],
  ["NA300 (1%)", "group2"],
  ["NA400 (1%)", "group2"],
  ["NA820 (3%)", "group2"],
  ["Phuket (Natural)", "group2"],
  ["Remy", "group2"],
  ["Riviera (Natural)", "group2"],
  ["Samoa (Natural)", "group2"],
  ["Serene (1%, 3%)", "group2"],
  ["Sheer", "group2"],
  ["Shimmer", "group2"],
  ["Sierra", "group2"],
  ["Sumatra (Natural)", "group2"],
  ["Valerie", "group2"],
  ["W120 (12%)", "group2"],
  ["Windsong (1%)", "group2"],

  // Group 3 (16 fabrics)
  ["Aruba (Natural)", "group3"],
  ["Breeze", "group3"],
  ["Breeze RD (Room Darkening)", "group3"],
  ["Caroline (Natural)", "group3"],
  ["Clarissa", "group3"],
  ["Cory (Room Darkening)", "group3"],
  ["Cove (Natural)", "group3"],
  ["Galaxy (3%)", "group3"],
  ["Garden (Room Darkening)", "group3"],
  ["Jubilee (3%)", "group3"],
  ["Lakeview (3%, 7%, 10%)", "group3"],
  ["Lola BO (Room Darkening)", "group3"],
  ["Maui (Natural)", "group3"],
  ["Meadows (1%, 3%)", "group3"],
  ["Remy RD (Room Darkening)", "group3"],
  ["Summerland (Room Darkening)", "group3"],

  // Group 4 (1 fabric)
  ["Kendra", "group4"],
]);

// Roller Shade fabric-to-grid routing - EXACT mapping from 818 site (all 70 fabrics verified)
export function getRollerFabricPriceGroup(fabric: string): string {
  const normalizedFabric = fabric.trim();

  // O(1) lookup from verified mapping
  const group = ROLLER_FABRIC_TO_GROUP.get(normalizedFabric);

  if (group) {
    return group;
  }

  // Fallback: if not in the map, default to group1
  console.warn(
    `Roller fabric "${normalizedFabric}" not found in verified mapping, defaulting to group1`
  );
  return "group1";
}

function normalizeRomanOption(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function romanFabricColorCandidates(categoryName: string, color: RomanFabricColor): string[] {
  const label = formatRomanFabricColor(color);
  return [
    label,
    color.code,
    color.name,
    `${categoryName} ${label}`,
    `${categoryName} ${color.name}`,
    `${categoryName} (${color.code})`,
    `${categoryName} ${color.code}`,
  ];
}

export function getRomanFabricColorsForCategory(categoryName?: string | null): readonly string[] {
  if (!categoryName) return [];
  const category = ROMAN_FABRIC_CATEGORIES.find(
    (candidate) => normalizeRomanOption(candidate.name) === normalizeRomanOption(categoryName)
  );
  return category?.colors.map(formatRomanFabricColor) || [];
}

export function getRomanFabricCategoryName(categoryName?: string | null): string | undefined {
  if (!categoryName) return undefined;
  return ROMAN_FABRIC_CATEGORIES.find(
    (candidate) => normalizeRomanOption(candidate.name) === normalizeRomanOption(categoryName)
  )?.name;
}

export function getRomanFabricCategoryForColor(fabric?: string | null): string | undefined {
  if (!fabric) return undefined;
  const normalized = normalizeRomanOption(fabric);

  for (const category of ROMAN_FABRIC_CATEGORIES) {
    for (const color of category.colors) {
      if (
        romanFabricColorCandidates(category.name, color).some(
          (candidate) => normalizeRomanOption(candidate) === normalized
        )
      ) {
        return category.name;
      }
    }
  }

  return undefined;
}

export function getRomanFabricCanonicalLabel(fabric?: string | null): string | undefined {
  if (!fabric) return undefined;
  const normalized = normalizeRomanOption(fabric);

  for (const category of ROMAN_FABRIC_CATEGORIES) {
    for (const color of category.colors) {
      if (
        romanFabricColorCandidates(category.name, color).some(
          (candidate) => normalizeRomanOption(candidate) === normalized
        )
      ) {
        return formatRomanFabricColor(color);
      }
    }
  }

  return undefined;
}

// Roman Shade fabric-to-grid routing. Norman prices several colors within one
// collection differently, so this resolves at color level before category level.
export function getRomanFabricPriceGroup(fabric: string): string {
  const normalized = normalizeRomanOption(fabric);

  for (const category of ROMAN_FABRIC_CATEGORIES) {
    for (const color of category.colors) {
      if (
        romanFabricColorCandidates(category.name, color).some(
          (candidate) => normalizeRomanOption(candidate) === normalized
        )
      ) {
        return color.priceGroup;
      }
    }
  }

  const category = ROMAN_FABRIC_CATEGORIES.find(
    (candidate) => normalizeRomanOption(candidate.name) === normalized
  );
  if (category) {
    return category.colors[0]?.priceGroup || "group1";
  }

  return "group1"; // default fallback
}

// Vertical Blinds fabric group-to-grid routing
export function getVerticalFabricPriceGroup(fabricGroup: string): string {
  const groupMapping: Record<string, string> = {
    "Classic collection": "group1",
    "S-Curved": "group2",
    Sandblasted: "group2",
    Flaxen: "group3",
    Adobe: "group3",
    Shantung: "group3",
    Linen: "group4",
    Grasscloth: "group4",
    Willow: "group4",
    "Faux Wood": "group4",
  };
  return groupMapping[fabricGroup] || "group1";
}
