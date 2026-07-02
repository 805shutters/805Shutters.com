#!/usr/bin/env node
/**
 * Generates src/lib/quote/norman-honeycomb-dealer-fabrics.generated.ts — the
 * fabric/color availability per shade size as served by the Norman DEALER
 * Portrait Honeycomb order form (QB_Order.asp inline flow).
 *
 * The data endpoint is NOT public (it requires a logged-in dealer session),
 * so the per-size fabric digest and the color-code → display-name map below
 * are embedded literally; both were captured from the logged-in dealer form
 * on 2026-07-01 (see docs/norman-honeycomb-order-map.md). If Norman changes
 * the fabric offering, re-capture and update the literals, then re-run:
 *
 *   node scripts/generate-honeycomb-dealer-fabrics.mjs
 *
 * Norman's "Decoflex" size = the 805 builder's "SmartFit with Frame";
 * "Decoflex for skylights" (same fabric set) = "SmartFit Sloped with Frame".
 * Fabric labels ending in "*" carry the 20% fabric surcharge family
 * (Room Darkening | Sheer | Solus | FR Essentials) — emitted as
 * `surcharged: true` with the asterisk stripped from the label.
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

// Captured from the logged-in Norman dealer order form 2026-07-01.
// shade size → [fabric label, Norman cloth code, comma-separated color codes]
const FABRICS_BY_SIZE = {
  "3/8\" Single Cell": [
    [
      "Designer Fabric (LF)",
      "HCDL21",
      "C7114K,C7115K,C7117K,C7118K,C7119K,C7120K,C7403K,C7410K"
    ],
    [
      "Flame Resistant (LF)",
      "HCF25",
      "C6001,C6002,C6003,C6101,C6102,C6401,C6402,C6501,C6502,C6503"
    ],
    [
      "Flame Resistant (RD)*",
      "HCRF25",
      "C8001,C8002,C8101,C8401,C8501"
    ],
    [
      "FR Essentials*",
      "HCEF25",
      "C6004,C6005,C6505"
    ],
    [
      "Light Filtering",
      "HCL21",
      "C7015K,C7016K,C7017K,C7104K,C7105K,C7107K,C7121K,C7133K,C7134K,C7135K,C7136K,C7137K,C7138K,C7139K,C7140K,C7145K,C7201K,C7303K,C7305K,C7306K,C7408K,C7417K,C7423K,C7424K,C7425K,C7426K,C7427K,C7433K,C7434K,C7506K,C7507K,C7510K,C7515K,C7516K,C7603K,C7604K,C7612K,C7702K,C7703K,C7704K,C7705K,C7706K,C7709K,C7802K"
    ],
    [
      "Room Darkening*",
      "HCR25",
      "C4008T,C4009T,C4010T,C4011T,C4102T,C4104T,C4108T,C4121T,C4122T,C4123T,C4124T,C4125T,C4126T,C4127T,C4129T,C4133T,C4134T,C4135T,C4201B,C4305T,C4306T,C4307B,C4420T,C4421T,C4422T,C4423T,C4427T,C4430T,C4431T,C4432B,C4433T,C4517T,C4518T,C4519T,C4520T,C4521T,C4601T,C4610T,C4611T,C4705T,C4709T,C4710T,C4711T,C4712T,C4804T"
    ],
    [
      "Sheer*",
      "HCS25",
      "C5001,C5002,C5004,C5201,C5501"
    ]
  ],
  "9/16\" Single Cell": [
    [
      "Light Filtering",
      "HCO26",
      "C7015K,C7016K,C7017K,C7135K,C7138K,C7142K,C7143K,C7208K,C7423K,C7424K,C7425K,C7427K,C7516K,C7617K,C7715K"
    ],
    [
      "Room Darkening*",
      "HCR26",
      "C4008T,C4009T,C4010T,C4011T,C4123T,C4126T,C4130T,C4131T,C4205T,C4420T,C4421T,C4422T,C4427T,C4518T,C4609T,C4708T"
    ]
  ],
  "3/4\" Single Cell": [
    [
      "3/4\" Single Cell Sheer*",
      "HCS23",
      "C5001,C5002,C5004,C5201,C5501"
    ],
    [
      "Designer Fabric (LF)",
      "HCDL22",
      "C7019K,C7114K,C7115K,C7117K,C7118K,C7119K,C7120K,C7141K,C7207K,C7403K,C7410K,C7428K,C7429K,C7430K,C7713K"
    ],
    [
      "Designer Fabric (RD)*",
      "HCDR23",
      "C4007T,C4106T,C4107T,C4112T,C4113T,C4114T,C4116T,C4128T,C4204T,C4413T,C4414T,C4424T,C4425T,C4426T,C4706T"
    ],
    [
      "Designer Fabric Ashton (LF)",
      "HCAL22",
      "C9001K,C9002K,C9101K,C9301K,C9401K,C9402K,C9701K"
    ],
    [
      "Designer Fabric Ashton (RD)*",
      "HCAR23",
      "C0001T,C0002T,C0101T,C0301T,C0401T,C0402T,C0701T"
    ],
    [
      "Flame Resistant (LF)",
      "HCF23",
      "C6001,C6002,C6003,C6101,C6102,C6401,C6402,C6501,C6502,C6503"
    ],
    [
      "Flame Resistant (RD)*",
      "HCRF23",
      "C8001,C8002,C8101,C8401,C8501"
    ],
    [
      "FR Essentials*",
      "HCEF23",
      "C6004,C6005,C6505"
    ],
    [
      "Light Filtering",
      "HCL22",
      "C7015K,C7016K,C7017K,C7104K,C7105K,C7107K,C7121K,C7133K,C7134K,C7135K,C7136K,C7137K,C7138K,C7139K,C7140K,C7145K,C7201K,C7303K,C7305K,C7306K,C7408K,C7417K,C7423K,C7424K,C7425K,C7426K,C7427K,C7433K,C7434K,C7506K,C7507K,C7510K,C7515K,C7516K,C7603K,C7604K,C7612K,C7702K,C7703K,C7704K,C7705K,C7706K,C7709K,C7802K"
    ],
    [
      "Room Darkening*",
      "HCR23",
      "C4008T,C4009T,C4010T,C4011T,C4102T,C4104T,C4108T,C4121T,C4122T,C4123T,C4124T,C4125T,C4126T,C4127T,C4129T,C4133T,C4134T,C4135T,C4201B,C4305T,C4306T,C4307B,C4420T,C4421T,C4422T,C4423T,C4427T,C4430T,C4431T,C4432B,C4433T,C4517T,C4518T,C4519T,C4520T,C4521T,C4601T,C4610T,C4611T,C4705T,C4709T,C4710T,C4711T,C4712T,C4804T"
    ],
    [
      "Solus*",
      "HCV22",
      "C7010,C7011,C7012,C7122,C7123,C7203,C7204,C7419,C7514,C7615,C7712,C7804"
    ],
    [
      "Woven Breeze",
      "HCW222",
      "F1299,F1300,F1301,F1302,F1303"
    ],
    [
      "Woven Windsong",
      "HCW122",
      "F0908K,F1283K,F1284K,F1285K,F1526K,F1527K,F1528K,F1531K"
    ]
  ],
  "1 1/4\" Single Cell": [
    [
      "1 1/4\" Single Cell Sheer*",
      "HCS2A",
      "C5001,C5002,C5004,C5201,C5501"
    ],
    [
      "Designer Fabric (LF)",
      "HCDL2A",
      "C7019K,C7114K,C7115K,C7117K,C7118K,C7119K,C7120K,C7141K,C7207K,C7403K,C7410K,C7428K,C7429K,C7430K,C7713K"
    ],
    [
      "Designer Fabric (RD)*",
      "HCDR2A",
      "C4007T,C4106T,C4107T,C4112T,C4113T,C4114T,C4116T,C4128T,C4204T,C4413T,C4414T,C4424T,C4425T,C4426T,C4706T"
    ],
    [
      "Designer Fabric Ashton (LF)",
      "HCAL2A",
      "C9001K,C9002K,C9101K,C9301K,C9401K,C9402K,C9701K"
    ],
    [
      "Designer Fabric Ashton (RD)*",
      "HCAR2A",
      "C0001T,C0002T,C0101T,C0301T,C0401T,C0402T,C0701T"
    ],
    [
      "Light Filtering",
      "HCL2A",
      "C7015K,C7016K,C7017K,C7104K,C7105K,C7107K,C7121K,C7133K,C7134K,C7135K,C7136K,C7137K,C7138K,C7139K,C7140K,C7145K,C7201K,C7303K,C7305K,C7306K,C7408K,C7417K,C7423K,C7424K,C7425K,C7426K,C7427K,C7433K,C7434K,C7506K,C7507K,C7510K,C7515K,C7516K,C7603K,C7604K,C7612K,C7702K,C7703K,C7704K,C7705K,C7706K,C7709K,C7802K"
    ],
    [
      "Room Darkening*",
      "HCR2A",
      "C4008T,C4009T,C4010T,C4011T,C4102T,C4104T,C4108T,C4121T,C4122T,C4123T,C4124T,C4125T,C4126T,C4127T,C4129T,C4133T,C4134T,C4135T,C4201B,C4305T,C4306T,C4307B,C4420T,C4421T,C4422T,C4423T,C4427T,C4430T,C4431T,C4432B,C4433T,C4517T,C4518T,C4519T,C4520T,C4521T,C4601T,C4610T,C4611T,C4705T,C4709T,C4710T,C4711T,C4712T,C4804T"
    ],
    [
      "Solus*",
      "HCV2A",
      "C7010,C7011,C7012,C7122,C7123,C7203,C7204,C7419,C7514,C7615,C7712,C7804"
    ],
    [
      "Woven Breeze",
      "HCW22A",
      "F1299,F1300,F1301,F1302,F1303"
    ],
    [
      "Woven Windsong",
      "HCW12A",
      "F0908K,F1283K,F1284K,F1285K,F1526K,F1527K,F1528K,F1531K"
    ]
  ],
  "1/2\" Double Cell": [
    [
      "Light Filtering",
      "HCL24",
      "C7015K,C7016K,C7017K,C7104K,C7105K,C7107K,C7121K,C7133K,C7134K,C7135K,C7136K,C7137K,C7138K,C7139K,C7140K,C7145K,C7201K,C7303K,C7305K,C7306K,C7408K,C7417K,C7423K,C7424K,C7425K,C7426K,C7427K,C7433K,C7434K,C7506K,C7507K,C7510K,C7515K,C7516K,C7603K,C7604K,C7612K,C7702K,C7703K,C7704K,C7705K,C7706K,C7709K,C7802K"
    ],
    [
      "Room Darkening*",
      "HCR24",
      "C4008T,C4009T,C4010T,C4011T,C4102T,C4104T,C4108T,C4121T,C4122T,C4123T,C4124T,C4125T,C4126T,C4127T,C4129T,C4133T,C4134T,C4135T,C4201B,C4305T,C4306T,C4307B,C4420T,C4421T,C4422T,C4423T,C4427T,C4430T,C4431T,C4432B,C4433T,C4517T,C4518T,C4519T,C4520T,C4521T,C4601T,C4610T,C4611T,C4705T,C4709T,C4710T,C4711T,C4712T,C4804T"
    ]
  ],
  "3/4\" Double Cell": [
    [
      "Light Filtering",
      "HCL29",
      "C7015K,C7016K,C7017K,C7104K,C7105K,C7107K,C7121K,C7133K,C7134K,C7135K,C7136K,C7137K,C7138K,C7139K,C7140K,C7145K,C7201K,C7303K,C7305K,C7306K,C7408K,C7417K,C7423K,C7424K,C7425K,C7426K,C7427K,C7433K,C7434K,C7506K,C7507K,C7510K,C7515K,C7516K,C7603K,C7604K,C7612K,C7702K,C7703K,C7704K,C7705K,C7706K,C7709K,C7802K"
    ],
    [
      "Room Darkening*",
      "HCR29",
      "C4008T,C4009T,C4010T,C4011T,C4102T,C4104T,C4108T,C4121T,C4122T,C4123T,C4124T,C4125T,C4126T,C4127T,C4129T,C4133T,C4134T,C4135T,C4201B,C4305T,C4306T,C4307B,C4420T,C4421T,C4422T,C4423T,C4427T,C4430T,C4431T,C4432B,C4433T,C4517T,C4518T,C4519T,C4520T,C4521T,C4601T,C4610T,C4611T,C4705T,C4709T,C4710T,C4711T,C4712T,C4804T"
    ]
  ],
  "Decoflex": [
    [
      "Designer Fabric (LF)",
      "HCFDL21",
      "C7114K,C7115K,C7117K,C7118K,C7119K,C7120K,C7403K,C7410K"
    ],
    [
      "Flame Resistant (LF)",
      "HCFF25",
      "C6001,C6002,C6003,C6101,C6102,C6401,C6402,C6501,C6502,C6503"
    ],
    [
      "Flame Resistant (RD)*",
      "HCFRF25",
      "C8001,C8002,C8101,C8401,C8501"
    ],
    [
      "FR Essentials*",
      "HCFEF25",
      "C6004,C6005,C6505"
    ],
    [
      "Light Filtering",
      "HCFL21",
      "C7015K,C7016K,C7017K,C7104K,C7105K,C7107K,C7121K,C7133K,C7134K,C7135K,C7136K,C7137K,C7138K,C7139K,C7140K,C7145K,C7201K,C7303K,C7305K,C7306K,C7408K,C7417K,C7423K,C7424K,C7425K,C7426K,C7427K,C7433K,C7434K,C7506K,C7507K,C7510K,C7515K,C7516K,C7603K,C7604K,C7612K,C7702K,C7703K,C7704K,C7705K,C7706K,C7709K,C7802K"
    ],
    [
      "Room Darkening*",
      "HCFR25",
      "C4008T,C4009T,C4010T,C4011T,C4102T,C4104T,C4108T,C4121T,C4122T,C4123T,C4124T,C4125T,C4126T,C4127T,C4129T,C4133T,C4134T,C4135T,C4201B,C4305T,C4306T,C4307B,C4420T,C4421T,C4422T,C4423T,C4427T,C4430T,C4431T,C4432B,C4433T,C4517T,C4518T,C4519T,C4520T,C4521T,C4601T,C4610T,C4611T,C4705T,C4709T,C4710T,C4711T,C4712T,C4804T"
    ],
    [
      "Sheer*",
      "HCFS25",
      "C5001,C5002,C5004,C5201,C5501"
    ]
  ],
  "Decoflex for skylights": "SAME_AS_DECOFLEX"
};

// Captured from the logged-in Norman dealer order form 2026-07-01.
// color code → display name (all 191 honeycomb colors).
const COLOR_NAMES = {
  "C7114K": "C7114 Winter Solstice",
  "C7115K": "C7115 Sterling",
  "C7117K": "C7117 Smokey Violet",
  "C7118K": "C7118 Silver Coin",
  "C7119K": "C7119 Quarry",
  "C7120K": "C7120 Urban Gray",
  "C7403K": "C7403 Fresh Brew",
  "C7410K": "C7410 Canvas",
  "C6001": "Ice Mist",
  "C6002": "Cotton",
  "C6003": "Moonshine",
  "C6101": "Ashley Gray",
  "C6102": "Silvery Blue",
  "C6401": "Earth",
  "C6402": "Travertine",
  "C6501": "Mascarpone",
  "C6502": "Calla Lily",
  "C6503": "Toasted Beige",
  "C8001": "White Ice",
  "C8002": "Blizzard Fog",
  "C8101": "Pale Gray",
  "C8401": "Rustic Taupe",
  "C8501": "Sweet Custard",
  "C6004": "Powder",
  "C6005": "Icicle",
  "C6505": "Eggshell Cream",
  "C7015K": "Brilliant White",
  "C7016K": "Cotton Cloud",
  "C7017K": "Gardenia",
  "C7104K": "Eggplant",
  "C7105K": "Annapolis Gray",
  "C7107K": "Spring Sky",
  "C7121K": "Morning Mist",
  "C7133K": "Daisy",
  "C7134K": "Silver Satin",
  "C7135K": "French Silver",
  "C7136K": "Classic Silver",
  "C7137K": "Power Gray",
  "C7138K": "Iron Mountain",
  "C7139K": "Seal Gray",
  "C7140K": "Orion Gray",
  "C7145K": "Reflections",
  "C7201K": "Black Olive",
  "C7303K": "Morning Blush",
  "C7305K": "Pacific Cove",
  "C7306K": "Roasted Pumpkin",
  "C7408K": "Pashmina",
  "C7417K": "Provence Cream",
  "C7423K": "Natural Tan",
  "C7424K": "Pale Oak",
  "C7425K": "Whipped Mocha",
  "C7426K": "Rue Bourbon",
  "C7427K": "Wheat",
  "C7433K": "Cabin",
  "C7434K": "Coffee Beans",
  "C7506K": "Autumn Gold",
  "C7507K": "River Rock",
  "C7510K": "Yellow Bliss",
  "C7515K": "White Cream",
  "C7516K": "New Camel",
  "C7603K": "Catalina Blue",
  "C7604K": "Fernwood",
  "C7612K": "Meadows",
  "C7702K": "Lakeside",
  "C7703K": "White Rain",
  "C7704K": "Seaside Blue",
  "C7705K": "Ocean Air",
  "C7706K": "Blue Flower",
  "C7709K": "Smokey Blue",
  "C7802K": "Mulberry",
  "C4008T": "Brilliant White RD",
  "C4009T": "Cotton Cloud RD",
  "C4010T": "Gardenia RD",
  "C4011T": "Soft Stone RD",
  "C4102T": "Annapolis Gray RD",
  "C4104T": "Spring Sky RD",
  "C4108T": "Smokey Blue RD",
  "C4121T": "Daisy RD",
  "C4122T": "Silver Satin RD",
  "C4123T": "French Silver RD",
  "C4124T": "Classic Silver RD",
  "C4125T": "Power Gray RD",
  "C4126T": "Iron Mountain RD",
  "C4127T": "Orion Gray RD",
  "C4129T": "Seal Gray RD",
  "C4133T": "Morning Mist RD",
  "C4134T": "Eggplant RD",
  "C4135T": "Reflections RD",
  "C4201B": "Black Olive RD",
  "C4305T": "Morning Blush RD",
  "C4306T": "Pacific Cove RD",
  "C4307B": "Roasted Pumpkin RD",
  "C4420T": "Natural Tan RD",
  "C4421T": "Pale Oak RD",
  "C4422T": "Whipped Mocha RD",
  "C4423T": "Rue Bourbon RD",
  "C4427T": "Wheat RD",
  "C4430T": "Cabin RD",
  "C4431T": "Provence Cream RD",
  "C4432B": "Coffee Beans RD",
  "C4433T": "Pashmina RD",
  "C4517T": "White Cream RD",
  "C4518T": "New Camel RD",
  "C4519T": "Yellow Bliss RD",
  "C4520T": "Autumn Gold RD",
  "C4521T": "River Rock RD",
  "C4601T": "Fernwood RD",
  "C4610T": "Catalina Blue RD",
  "C4611T": "Meadows RD",
  "C4705T": "Seaside Blue RD",
  "C4709T": "Ocean Air RD",
  "C4710T": "Blue Flower RD",
  "C4711T": "Lakeside RD",
  "C4712T": "White Rain RD",
  "C4804T": "Mulberry RD",
  "C5001": "Seapearl",
  "C5002": "Cloudy Chiffon",
  "C5004": "Cloud White",
  "C5201": "Nightfall",
  "C5501": "Jersey Cream",
  "C7142K": "Dew",
  "C7143K": "Silver Dusk",
  "C7208K": "Space Gray",
  "C7617K": "Florida Keys",
  "C7715K": "Bella Blue",
  "C4130T": "Silver Dusk RD",
  "C4131T": "Dew RD",
  "C4205T": "Space Gray RD",
  "C4609T": "Florida Keys RD",
  "C4708T": "Bella Blue RD",
  "C7019K": "White Dawn",
  "C7141K": "Fog",
  "C7207K": "Soft Black",
  "C7428K": "Tawny",
  "C7429K": "Toffee",
  "C7430K": "Shady Lane",
  "C7713K": "Azure Blue",
  "C4007T": "White Dawn RD",
  "C4106T": "C4106 Winter Solstice",
  "C4107T": "C4107 Storm Cloud",
  "C4112T": "C4112 Titanium",
  "C4113T": "C4113 Dawn",
  "C4114T": "C4114 Magnetic Gray",
  "C4116T": "C4116 Sterling",
  "C4128T": "Fog RD",
  "C4204T": "Soft Black RD",
  "C4413T": "C4413 Fresh Brew",
  "C4414T": "C4414 Canvas",
  "C4424T": "Tawny RD",
  "C4425T": "Toffee RD",
  "C4426T": "Shady Lane RD",
  "C4706T": "Azure Blue RD",
  "C9001K": "Eggshell White",
  "C9002K": "Ballet White",
  "C9101K": "Moonlight",
  "C9301K": "Dreamy White",
  "C9401K": "Toasted Pecan",
  "C9402K": "Dark Champagne",
  "C9701K": "Country Sky",
  "C0001T": "Eggshell White RD",
  "C0002T": "Ballet White RD",
  "C0101T": "Moonlight RD",
  "C0301T": "Dreamy White RD",
  "C0401T": "Toasted Pecan RD",
  "C0402T": "Dark Champagne RD",
  "C0701T": "Country Sky RD",
  "C7010": "Modern White",
  "C7011": "Pearl Sand",
  "C7012": "White Lace",
  "C7122": "Steel*",
  "C7123": "Dim Gray*",
  "C7203": "Midnight*",
  "C7204": "Warm Black*",
  "C7419": "Modern Tan",
  "C7514": "Sweet Cream",
  "C7615": "Serene",
  "C7712": "Denim*",
  "C7804": "Dusty Lilac",
  "F1299": "Almond Milk",
  "F1300": "Flax",
  "F1301": "Sand",
  "F1302": "Khaki",
  "F1303": "Dune",
  "F0908K": "F0908 Linen Weave",
  "F1283K": "F1283 Coffee",
  "F1284K": "F1284 Burnt Ember",
  "F1285K": "F1285 Black Magic",
  "F1526K": "F1526 Cotton",
  "F1527K": "F1527 Toasted Wheat",
  "F1528K": "F1528 Glazed Pecan",
  "F1531K": "F1531 Dawn"
};

// Norman dealer-form size label → 805 builder cell-size label.
const SIZE_LABELS = {
  '3/8" Single Cell': '3/8" Single Cell',
  '9/16" Single Cell': '9/16" Single Cell',
  '3/4" Single Cell': '3/4" Single Cell',
  '1 1/4" Single Cell': '1 1/4" Single Cell',
  '1/2" Double Cell': '1/2" Double Cell',
  '3/4" Double Cell': '3/4" Double Cell',
  Decoflex: "SmartFit with Frame",
  "Decoflex for skylights": "SmartFit Sloped with Frame",
};

const rows = [];
for (const [normanSize, fabrics] of Object.entries(FABRICS_BY_SIZE)) {
  const cellSize = SIZE_LABELS[normanSize];
  if (!cellSize) throw new Error(`Unmapped Norman size label: ${normanSize}`);
  const entries = fabrics === "SAME_AS_DECOFLEX" ? FABRICS_BY_SIZE.Decoflex : fabrics;
  for (const [label, clothCode, codes] of entries) {
    const surcharged = label.endsWith("*");
    const fabricType = surcharged ? label.slice(0, -1).trim() : label;
    for (const colorCode of codes.split(",")) {
      const colorName = COLOR_NAMES[colorCode];
      if (!colorName) throw new Error(`No display name for color ${colorCode}`);
      rows.push({ cellSize, fabricType, surcharged, clothCode, colorCode, colorName });
    }
  }
}

const header = `// Generated by scripts/generate-honeycomb-dealer-fabrics.mjs from data
// captured on the logged-in Norman dealer Portrait Honeycomb order form
// (2026-07-01). Do not edit by hand — update the script's embedded capture
// and re-run it instead.

export interface NormanHoneycombDealerFabricRow {
  /** 805 builder cell-size label (Norman "Decoflex" = SmartFit with Frame). */
  cellSize: string;
  /** Norman fabric label with the surcharge asterisk stripped. */
  fabricType: string;
  /** True when Norman marks the fabric * (20% RD|Sheer|Solus|FR surcharge). */
  surcharged: boolean;
  clothCode: string;
  colorCode: string;
  colorName: string;
}

export const normanHoneycombDealerFabricRows: readonly NormanHoneycombDealerFabricRow[] = `;

writeFileSync(
  path.join(ROOT, "src/lib/quote/norman-honeycomb-dealer-fabrics.generated.ts"),
  header + JSON.stringify(rows, null, 2) + ";\n"
);

console.log(`Wrote ${rows.length} rows across ${new Set(rows.map((r) => r.cellSize)).size} shade sizes.`);
