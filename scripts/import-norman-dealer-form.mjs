#!/usr/bin/env node

import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const EXPECTED_SHA256 =
  "147f0ad2a883d35a6c0713df92cbf23731d7a7c99a33fa7f6d8fd5324b68848b";
const CAPTURE_DATE = "2026-07-27";
const sourcePath = process.argv[2];

if (!sourcePath) {
  throw new Error(
    "Usage: node scripts/import-norman-dealer-form.mjs /absolute/path/to/pasted-text.txt",
  );
}

const root = process.cwd();
const archiveDir = path.join(root, "vendor-sources", "norman", "dealer-form");
const archivePath = path.join(
  archiveDir,
  "R00646-dealer-form-pricing-2026-07-27.txt",
);
const outputPath = path.join(
  archiveDir,
  "R00646-dealer-form-pricing-2026-07-27.json",
);

const rawBuffer = await readFile(sourcePath);
const sha256 = createHash("sha256").update(rawBuffer).digest("hex");
if (sha256 !== EXPECTED_SHA256) {
  throw new Error(`Unexpected dealer-form source hash: ${sha256}`);
}

const raw = rawBuffer.toString("utf8");
const lines = raw.split(/\r?\n/).map((line) => line.trimEnd());

const parseMoneyOrPercent = (rawValue) => {
  const value = rawValue.trim();
  if (value === "N/A**") {
    return { available: false };
  }
  if (value.endsWith("%")) {
    return {
      available: true,
      kind: "percentage",
      rate: Number(value.slice(0, -1)) / 100,
    };
  }
  if (value.startsWith("$")) {
    return {
      available: true,
      kind: "fixed-dollar",
      amount: Number(value.slice(1).replaceAll(",", "")),
    };
  }
  throw new Error(`Unsupported dealer-form value: ${rawValue}`);
};

const parseThreeColumnRows = (startLine, endLine) =>
  lines.slice(startLine, endLine).flatMap((line) => {
    const cells = line.split("\t");
    if (cells.length !== 4) return [];
    return [
      {
        label: cells[0],
        standard: parseMoneyOrPercent(cells[1]),
        woodloreAmericasThreeWeeks: parseMoneyOrPercent(cells[2]),
        airFreightThreeWeeks: parseMoneyOrPercent(cells[3]),
      },
    ];
  });

const blindStart = lines.indexOf("Blinds\tStandard");
const shadesStart = lines.indexOf("Shades\tStandard");
const marginsStart = lines.findIndex((line) =>
  line.startsWith("Margins for Quotes & Invoices for Consumers Tool"),
);
const shutterSurchargeStart = lines.findIndex((line) =>
  line.startsWith("Specialty: French Door Cutout"),
);

if (
  blindStart < 0 ||
  shadesStart < 0 ||
  marginsStart < 0 ||
  shutterSurchargeStart < 0
) {
  throw new Error("Dealer-form sections did not match the expected capture");
}

const shutterPriceRows = parseThreeColumnRows(0, 6);
const shutterSurchargeRows = parseThreeColumnRows(
  shutterSurchargeStart,
  blindStart,
);

const parseFactorRows = (startLine, endLine) =>
  lines.slice(startLine, endLine).flatMap((line) => {
    const cells = line.split("\t");
    if (cells.length < 3 || !/^\d\.\d{4}$/.test(cells[1])) return [];
    return [
      {
        dealerFormProduct: cells[0],
        standardFactor: Number(cells[1]),
        shutterLeadTimeFactor:
          cells.at(-1) === "N/A**" ? null : Number(cells.at(-1)),
      },
    ];
  });

const blindFactors = parseFactorRows(blindStart, shadesStart);
const shadeFactors = parseFactorRows(shadesStart, marginsStart);

const fulfillmentKeys = {
  standard: "standard",
  woodloreAmericasThreeWeeks: "woodloreAmericasThreeWeeks",
  airFreightThreeWeeks: "airFreightThreeWeeks",
};

const makeShutterModel = (dealerFormProduct, product, fulfillmentNames) => {
  const baseRow = shutterPriceRows.find(
    (row) => row.label === dealerFormProduct,
  );
  if (!baseRow) throw new Error(`Missing shutter price row: ${dealerFormProduct}`);

  return {
    manufacturer: "Norman",
    product,
    dealerFormProduct,
    activationStatus: "blocked-wrong-dealer-account",
    pricingMethod: "direct-dealer-cost-per-square-foot",
    minimumBillableSquareFeet: 8,
    fulfillmentPricing: fulfillmentNames.map((fulfillmentName) => ({
      fulfillment: fulfillmentName,
      dealerCostPerSquareFoot: baseRow[fulfillmentKeys[fulfillmentName]],
      surcharges: shutterSurchargeRows.map((row) => ({
        label: row.label,
        price: row[fulfillmentKeys[fulfillmentName]],
      })),
    })),
    freight: {
      standard: {
        firstUnit: 75,
        eachAdditionalUnit: 25,
      },
      oversize: {
        thresholdInches: 90,
        appliesTo: ["shutter width", "specialty shutter length"],
        firstUnit: 80,
        eachAdditionalUnit: 50,
      },
      waiver: "Ocean-container shutters shipped via will call",
    },
  };
};

const factorProductNames = {
  "2\" SmartPrivacy® Cordless Faux Wood Blinds":
    "2-inch SmartPrivacy Cordless Faux Wood Blinds",
  "2.5\" SmartPrivacy® Cordless Faux Wood Blinds":
    "2.5-inch SmartPrivacy Cordless Faux Wood Blinds",
  "2\" San Clemente Cordless Faux Wood Blinds":
    "2-inch San Clemente Cordless Faux Wood Blinds",
  "2.5\" Ultimate™ Cordless Faux Wood Blinds":
    "2.5-inch Ultimate Cordless Faux Wood Blinds",
  "2\" Ultimate™ Cordless Faux Wood Blinds":
    "2-inch Ultimate Cordless Faux Wood Blinds",
  "Ultimate Normandy Wood Blinds": "Ultimate Normandy Wood Blinds",
  "1\" CityLights™ Aluminum Blinds": "1-inch CityLights Aluminum Blinds",
  "2\" CityLights™ Aluminum Blinds": "2-inch CityLights Aluminum Blinds",
  "1/2\" CityLights™ Aluminum Blinds": "0.5-inch CityLights Aluminum Blinds",
  "Synchrony™ Vertical Blinds": "Synchrony Vertical Blinds",
  "Honeycomb Shades": "Portrait Honeycomb Shades",
  "PerfectSheer™ Shades": "PerfectSheer Shades",
  "9/16\" San Clemente Cordless Honeycomb Shades":
    "9/16-inch San Clemente Cordless Honeycomb Shades",
  "SmartDrape® Shades": "SmartDrape Shades",
  "Roman Shades": "Centerpiece Roman Shades",
  "Roller Shades": "Soluna Roller Shades",
  "SmartFold™ Shades": "SmartFold Shades",
};

const makeFactorModel = (row, category) => ({
  manufacturer: "Norman",
  product: factorProductNames[row.dealerFormProduct],
  dealerFormProduct: row.dealerFormProduct,
  category,
  activationStatus:
    "standard-0.30-user-confirmed-for-RA00743; other factors reference-only",
  pricingMethod: "retail-grid-times-product-factor",
  wholesaleFactors: {
    standard: row.standardFactor,
    shutterLeadTime: row.shutterLeadTimeFactor,
  },
  freight: {
    standard: {
      firstUnit: 25,
      eachAdditionalUnit: 8,
    },
    oversize: {
      thresholdInches: 90,
      firstUnit: 80,
      eachAdditionalUnit: 50,
      verticalLengthRule:
        "Also applies to lengths on vertical blinds, vertical honeycomb, Light Guard, LightGuard 360, shades with frames, and motorized skylight honeycomb.",
    },
    oversizeWaiver:
      "Waived when freight handling fees are waived; ocean-container will-call waiver is stated for shutters.",
  },
});

const models = [
  makeShutterModel("Woodlore®", "Woodlore Shutters", [
    "standard",
    "woodloreAmericasThreeWeeks",
  ]),
  makeShutterModel("Woodlore® Plus", "Woodlore Plus Shutters", [
    "standard",
    "airFreightThreeWeeks",
  ]),
  makeShutterModel(
    "Woodlore® Plus with AquaShield™",
    "Woodlore Plus with AquaShield Shutters",
    ["standard", "airFreightThreeWeeks"],
  ),
  makeShutterModel("Brightwood™", "Brightwood Shutters", [
    "standard",
    "airFreightThreeWeeks",
  ]),
  makeShutterModel("Normandy® Painted", "Normandy Painted Shutters", [
    "standard",
    "airFreightThreeWeeks",
  ]),
  makeShutterModel("Normandy® Stained", "Normandy Stained Shutters", [
    "standard",
    "airFreightThreeWeeks",
  ]),
  ...blindFactors.map((row) => makeFactorModel(row, "blinds")),
  ...shadeFactors.map((row) => makeFactorModel(row, "shades")),
];

if (models.some((model) => !model.product)) {
  throw new Error("A dealer-form product is missing an independent V4 name");
}

const output = {
  schemaVersion: 1,
  source: {
    manufacturer: "Norman",
    dealerAccount: "R00646",
    dealerCompany: "Arjay's Window Fashions",
    sourceType:
      "user-supplied dealer-form capture matched to authenticated Chrome page",
    capturedAt: CAPTURE_DATE,
    effectiveDate: null,
    copyrightYear: 2026,
    rawFile: path.relative(root, archivePath),
    sha256,
  },
  interpretation: {
    retailAuthority:
      "Use the July 2026 Norman retail guide for retail/list grids.",
    wholesaleAuthority:
      "The R00646 shutter rates, expedited factors, and freight are reference-only for V4. The user independently confirmed 0.30 as the RA00743 standard wholesale factor; that confirmation is limited to the exact products whose retail grids and factor model apply.",
    fixedCharges:
      "Freight and fixed-dollar dealer-form charges are direct costs and must not be multiplied by a product factor.",
    isolation:
      "Every object in independentProductModels is complete for its captured price method and may not inherit pricing, restrictions, or options from another product.",
  },
  independentProductModels: models,
  consumerToolMargins: {
    shutters: null,
    blinds: null,
    shades: null,
    sourceText: "No margin has been saved",
  },
  unresolvedSourceQuestions: [
    "The dealer-form capture belongs to R00646 / Arjay's Window Fashions, not RA00743 / 805 Shutters.",
    "RA00743 shutter square-foot costs, expedited factors, and freight remain unverified.",
    "The pasted capture states copyright 2026 but does not expose an effective date.",
    "Percentage-surcharge calculation order and stacking basis must be verified before production activation.",
    "Product specifications still control whether each option is allowed; a priced surcharge is not proof that the option is valid for every product.",
  ],
};

await mkdir(archiveDir, { recursive: true });
await copyFile(sourcePath, archivePath);
await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);

console.log(
  JSON.stringify(
    {
      archivePath,
      outputPath,
      sha256,
      shutterModels: 6,
      blindModels: blindFactors.length,
      shadeModels: shadeFactors.length,
      totalIndependentModels: models.length,
      surchargeRowsPerShutterFulfillment: shutterSurchargeRows.length,
    },
    null,
    2,
  ),
);
