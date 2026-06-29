import { writeFileSync } from "node:fs";

const outputPath = "src/lib/quote/norman-product-colors.generated.ts";

const sources = [
  {
    productIds: ["roman"],
    url: "https://normanusa.com/product/centerpiece-roman/",
    note: "Norman public Centerpiece Roman Colors & Materials cards",
  },
  {
    productIds: ["honeycomb", "vertical_honeycomb"],
    url: "https://normanusa.com/product/portrait-honeycomb/",
    note: "Norman public Portrait Honeycomb Colors & Materials cards",
    leadingCollections: ["Breeze", "Windsong"],
  },
  {
    productIds: ["smartdrape"],
    url: "https://normanusa.com/product/smartdrape-shades/",
    note: "Norman public SmartDrape Colors & Materials cards",
  },
  {
    productIds: ["perfectsheer"],
    url: "https://normanusa.com/product/perfectsheer-shades/",
    note: "Norman public PerfectSheer Colors & Materials cards",
  },
  {
    productIds: ["smartfold"],
    url: "https://normanusa.com/product/smartfold-shades/",
    note: "Norman public SmartFold Colors & Materials cards",
  },
  {
    productIds: ["synchrony_vertical"],
    url: "https://normanusa.com/product/synchrony-blinds/",
    note: "Norman public Synchrony Vertical Blinds Colors & Materials cards",
  },
  {
    productIds: ["faux_wood", "smartprivacy_faux"],
    url: "https://normanusa.com/product/ultimate-faux-wood-blinds/",
    note: "Norman public Ultimate Faux Wood Blinds Colors & Materials cards; shared by SmartPrivacy Faux Wood pricing product",
  },
  {
    productIds: ["wood_blinds"],
    url: "https://normanusa.com/product/ultimate-normandy-wood-blinds/",
    note: "Norman public Ultimate Normandy Wood Blinds Colors & Materials cards",
  },
  {
    productIds: ["citylights_aluminum"],
    url: "https://normanusa.com/product/citylights-blinds/",
    note: "Norman public CityLights Aluminum Blinds Colors & Materials cards",
  },
];

const collectionAliases = {
  roman: {
    "Libeco™ Belgian Linen": "Libeco",
  },
  smartdrape: {
    Lakeshore: "Lakeshore Stripe",
    Stripe: "Lakeshore Stripe",
  },
};

function decodeHtml(value) {
  return String(value ?? "")
    .replace(/&amp;/g, "&")
    .replace(/&#038;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#8211;|&ndash;/g, "-")
    .replace(/&#8212;|&mdash;/g, "-")
    .replace(/&#8482;|&trade;/g, "™")
    .replace(/&#174;|&reg;/g, "®")
    .replace(/&#8243;/g, '"')
    .replace(/&#8242;/g, "'")
    .replace(/&nbsp;|\u00a0/g, " ")
    .replace(/\u3000/g, " ");
}

function textFromHtml(value) {
  return decodeHtml(value)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function normalizeText(value) {
  return decodeHtml(value)
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeSearchText(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function firstProductTab(html) {
  const start = html.indexOf('id="product-tab-1"');
  if (start < 0) return html;
  const rest = html.slice(start);
  const next = rest.search(/<div id="product-tab-[2-9]"/);
  return next > 0 ? rest.slice(0, next) : rest;
}

function extractModifiedDate(html) {
  const match = html.match(/"dateModified":"([^"]+)"/);
  return match?.[1] ?? null;
}

function extractColorCode(imageUrl, colorName) {
  const file = decodeURIComponent(
    imageUrl
      .split("/")
      .pop()
      ?.replace(/\.webp$/i, "")
      .replace(/\.(jpg|jpeg|png)$/i, "") ?? "",
  );
  const direct = file.match(/\b(F\d{4}|C\d{4}[A-Z]?|ND\d{3}|P\d{3}|E\d{3}|\d{4})\b/i);
  if (direct) return direct[1].toUpperCase();
  const compact = file.match(/(?:^|[_-])(F\d{4}|C\d{4}[A-Z]?|ND\d{3}|P\d{3}|E\d{3}|\d{4})(?:[_-]|$)/i);
  if (compact) return compact[1].toUpperCase();
  const fromName = colorName.match(/\b(F\d{4}|C\d{4}[A-Z]?|ND\d{3}|P\d{3}|E\d{3}|\d{4})\b/i);
  return fromName ? fromName[1].toUpperCase() : "";
}

function parseDescription(desc, source) {
  const lines = desc.split("\n").map((line) => normalizeText(line)).filter(Boolean);
  let collection = "";
  let fabricTypeLines = [...lines];

  const collectionLineIndex = lines.findIndex((line) => /^Collection:/i.test(line));
  if (collectionLineIndex >= 0) {
    collection = lines[collectionLineIndex].replace(/^Collection:\s*/i, "").trim();
    fabricTypeLines = lines.filter((_, index) => index !== collectionLineIndex);
  } else {
    const patternLineIndex = lines.findIndex((line) => /^Fabric Pattern\s*-/i.test(line));
    if (patternLineIndex >= 0) {
      collection = lines[patternLineIndex].replace(/^Fabric Pattern\s*-\s*/i, "").trim();
      fabricTypeLines = lines.filter((_, index) => index !== patternLineIndex);
    } else {
      const collectionSuffixIndex = lines.findIndex((line) => /\bCollection$/i.test(line));
      if (collectionSuffixIndex >= 0) {
        let rawCollection = lines[collectionSuffixIndex].replace(/\s+Collection$/i, "").trim();
        if (/^Designer\s+/i.test(rawCollection)) {
          rawCollection = rawCollection.replace(/^Designer\s+/i, "").trim();
          fabricTypeLines = [
            ...lines.slice(0, collectionSuffixIndex),
            "Designer",
            ...lines.slice(collectionSuffixIndex + 1),
          ];
        } else {
          fabricTypeLines = lines.filter((_, index) => index !== collectionSuffixIndex);
        }
        collection = rawCollection;
      }
    }
  }

  if (!collection && source.leadingCollections?.includes(lines[0])) {
    collection = lines[0];
    fabricTypeLines = lines.slice(1);
  }

  return {
    collection: normalizeText(collection),
    fabricType: normalizeText(fabricTypeLines.join(" / ")),
  };
}

function canonicalCollection(productId, collection) {
  const normalized = normalizeText(collection);
  return collectionAliases[productId]?.[normalized] ?? normalized;
}

function parseColorCards(html, source) {
  const section = firstProductTab(html);
  const rows = [];
  const cardRe =
    /<a\b[^>]*data-color="([^"]+)"[\s\S]*?<img\b[^>]*alt="([^"]*)"[\s\S]*?<h5[^>]*>([\s\S]*?)<\/h5>[\s\S]*?<p>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = cardRe.exec(section))) {
    const imageUrl = decodeHtml(match[1]).replace(/\.webp$/i, "");
    const alt = textFromHtml(match[2]);
    const title = textFromHtml(match[3]);
    const colorName = normalizeText(title || alt);
    const desc = textFromHtml(match[4]);
    if (!colorName || !desc) continue;

    const parsed = parseDescription(desc, source);
    for (const productId of source.productIds) {
      const collection = canonicalCollection(productId, parsed.collection);
      const colorCode = extractColorCode(imageUrl, colorName);
      const publicCollection = parsed.collection;
      rows.push({
        productId,
        collection,
        publicCollection,
        fabricType: parsed.fabricType,
        colorCode,
        colorName,
        publicColorName: colorName,
        imageUrl,
        sourcePage: source.url,
        sourcePageModified: source.modifiedDate,
        sourceNote: source.note,
        searchText: normalizeSearchText(
          [collection, publicCollection, parsed.fabricType, colorCode, colorName].join(" "),
        ),
      });
    }
  }
  return rows;
}

function dedupeRows(rows) {
  const seen = new Set();
  const unique = [];
  for (const row of rows) {
    const key = [
      row.productId,
      row.collection,
      row.publicCollection,
      row.fabricType,
      row.colorCode,
      row.colorName,
      row.imageUrl,
    ].join("\u0000");
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(row);
  }
  return unique;
}

const rows = [];
for (const source of sources) {
  const response = await fetch(source.url);
  if (!response.ok) {
    throw new Error(`Could not fetch ${source.url}: ${response.status}`);
  }
  const html = await response.text();
  source.modifiedDate = extractModifiedDate(html);
  rows.push(...parseColorCards(html, source));
}

const uniqueRows = dedupeRows(rows);
const header = `// Generated by scripts/generate-norman-product-color-catalog.mjs from Norman public product pages.
// Do not edit by hand. Re-run the generator after source product-page updates.

`;

const body = `export const normanProductColorRows = ${JSON.stringify(uniqueRows, null, 2)} as const;
`;

writeFileSync(outputPath, `${header}${body}`);

const counts = uniqueRows.reduce((acc, row) => {
  acc[row.productId] = (acc[row.productId] ?? 0) + 1;
  return acc;
}, {});
console.log(`Wrote ${uniqueRows.length} Norman product color rows to ${outputPath}`);
for (const [productId, count] of Object.entries(counts).sort()) {
  console.log(`${productId}: ${count}`);
}
