/** Current dealer-guide facts; public swatch images are not ordering identities. */
export const CITYLIGHTS_CURRENT_COLORS = {
  oneInch: ["7021", "7022", "7023", "7024", "7026", "7102", "7103", "7105", "7201", "7402", "7507", "7511", "7027", "7109", "7111", "7309", "7510", "7604", "7712", "7713", "7030", "7029", "7031", "7112", "7113", "7114", "7115", "7205", "7206", "7403"],
  twoInch: ["7021", "7022", "7023", "7024", "7026", "7102", "7103", "7105", "7201", "7402", "7507", "7511", "7030", "7031", "7112", "7114", "7115", "7205", "7403", "7020", "7203", "7204"],
} as const;

export function citylightsColorSlatSizes(code: string): string[] {
  return [
    ...(CITYLIGHTS_CURRENT_COLORS.oneInch.some((value) => value === code) ? ['1"'] : []),
    ...(CITYLIGHTS_CURRENT_COLORS.twoInch.some((value) => value === code) ? ['2"'] : []),
  ];
}

export const SMARTFOLD_FABRICS = [
  ...["F1794", "F1795", "F1719", "F1721", "F1720", "F1695"].map((code) => ({ code, collection: "Impressions", opacity: "light_filtering" })),
  ...["F1708", "F1709", "F1710", "F1711"].map((code) => ({ code, collection: "Louise", opacity: "light_filtering" })),
  ...["F1934", "F1935", "F1936", "F1937", "F1938"].map((code) => ({ code, collection: "Moonlight", opacity: "room_darkening" })),
] as const;

export const SMARTDRAPE_ESSENTIALS_CODES = ["F1663", "F1664", "F1665", "F1964", "F1965", "F2038", "F2039", "F2040", "F2041", "F2042"] as const;

// Dealer-guide page 10 and September retail page 34 (PDF page 35).
export const CITYLIGHTS_FINISH_BY_CODE: Readonly<Record<string, string>> = {
  "7102": "metallic", "7103": "metallic", "7105": "metallic", "7402": "metallic", "7109": "metallic", "7403": "metallic",
  "7027": "perforated", "7111": "perforated", "7031": "matte", "7205": "matte", "7029": "textured",
};
export const WOOD_DESIGNER_CODES = ["ND080", "ND617", "ND053", "ND017", "ND091", "ND246"] as const;
export const WOOD_PREMIUM_CODES = ["1003", "1501", "1502", "1301", "1109", "1111", "1203", "1204", "1112", "1114"] as const;

// Legacy labels remain readable on saved quotes; the dealer guide identifies 066 as one finish.
export const PALLADIAN_LEGACY_COLORS = ["Pure White", "Extra White", "Silk White", "Bright White", "Pearl", "Ivory Lace", "Creamy", "Crisp Linen", "Bisque", "String", "Natural Linen", "Chateau Brown", "Sea Mist", "Gray Black", "Aura White", "Ice", "Clay", "Decorator’s White", "Taupe Gray", "Classic Black", "Winchester White", "2010", "Golden Oak", "Goldenrod", "Wenge", "Old Teak", "Black Walnut", "Red Oak", "Rich Walnut", "Auburn", "Matte Black", "Pretzel", "Toffee", "Driftwood", "Sumatra", "Silver Gray", "French Oak", "TS White", "True White", "Chiffon", "Rustic Gray", "Limed White", "Natural"] as const;

export const PALLADIAN_FINISHES = [
  {
    "code": "001",
    "name": "Pure White",
    "type": "paint"
  },
  {
    "code": "002",
    "name": "Extra White",
    "type": "paint"
  },
  {
    "code": "003",
    "name": "Silk White",
    "type": "paint"
  },
  {
    "code": "004",
    "name": "Bright White",
    "type": "paint"
  },
  {
    "code": "006",
    "name": "Pearl",
    "type": "paint"
  },
  {
    "code": "007",
    "name": "Ivory Lace",
    "type": "paint"
  },
  {
    "code": "009",
    "name": "Creamy",
    "type": "paint"
  },
  {
    "code": "012",
    "name": "Crisp Linen",
    "type": "paint"
  },
  {
    "code": "013",
    "name": "Bisque",
    "type": "paint"
  },
  {
    "code": "017",
    "name": "Gray Black",
    "type": "paint"
  },
  {
    "code": "019",
    "name": "String",
    "type": "paint"
  },
  {
    "code": "032",
    "name": "Sea Mist",
    "type": "paint"
  },
  {
    "code": "046",
    "name": "Ice",
    "type": "paint"
  },
  {
    "code": "053",
    "name": "Clay",
    "type": "paint"
  },
  {
    "code": "063",
    "name": "Decorator's White",
    "type": "paint"
  },
  {
    "code": "066",
    "name": "Winchester White 2010",
    "type": "paint"
  },
  {
    "code": "076",
    "name": "Aura White",
    "type": "paint"
  },
  {
    "code": "080",
    "name": "Taupe Gray",
    "type": "paint"
  },
  {
    "code": "090",
    "name": "TS White",
    "type": "paint"
  },
  {
    "code": "108",
    "name": "Rustic Gray",
    "type": "stain"
  },
  {
    "code": "110",
    "name": "Limed White",
    "type": "stain"
  },
  {
    "code": "200",
    "name": "Natural",
    "type": "stain"
  },
  {
    "code": "202",
    "name": "Golden Oak",
    "type": "stain"
  },
  {
    "code": "205",
    "name": "Goldenrod",
    "type": "stain"
  },
  {
    "code": "221",
    "name": "Black Walnut",
    "type": "stain"
  },
  {
    "code": "227",
    "name": "Red Oak",
    "type": "stain"
  },
  {
    "code": "229",
    "name": "Rich Walnut",
    "type": "stain"
  },
  {
    "code": "230",
    "name": "Old Teak",
    "type": "stain"
  },
  {
    "code": "237",
    "name": "Wenge",
    "type": "stain"
  },
  {
    "code": "242",
    "name": "Auburn",
    "type": "stain"
  },
  {
    "code": "246",
    "name": "Matte Black",
    "type": "stain"
  },
  {
    "code": "248",
    "name": "Pretzel",
    "type": "stain"
  },
  {
    "code": "250",
    "name": "Sumatra",
    "type": "stain"
  },
  {
    "code": "252",
    "name": "Toffee",
    "type": "stain"
  },
  {
    "code": "254",
    "name": "Driftwood",
    "type": "stain"
  },
  {
    "code": "255",
    "name": "Silver Gray",
    "type": "stain"
  },
  {
    "code": "600",
    "name": "True White",
    "type": "paint"
  },
  {
    "code": "601",
    "name": "Chiffon",
    "type": "paint"
  },
  {
    "code": "603",
    "name": "Natural Linen",
    "type": "paint"
  },
  {
    "code": "609",
    "name": "Chateau Brown",
    "type": "paint"
  },
  {
    "code": "836",
    "name": "Classic Black",
    "type": "paint"
  },
  {
    "code": "862",
    "name": "French Oak",
    "type": "stain"
  }
] as const;
export const PALLADIAN_COLORS = PALLADIAN_FINISHES.map(finish => finish.name);
export const PALLADIAN_WITH_PRODUCT_IDS = ["honeycomb", "roller", "roman", "smartfold", "perfectsheer", "citylights_aluminum", "wood_blinds"] as const;
export const palladianProductEligible = (productId: string) => PALLADIAN_WITH_PRODUCT_IDS.some(id => id === productId);
