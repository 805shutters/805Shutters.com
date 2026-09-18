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
