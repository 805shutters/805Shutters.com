#!/usr/bin/env node
/**
 * Generates src/lib/quote/norman-roman-dealer-fabrics.generated.ts — the
 * complete Roman Shades fabric catalog as served by the Norman DEALER order
 * form (OrderRM.asp), including which fold styles each color is available in.
 *
 * The color endpoint (getXmlRs.asp?tableType=GetClothColor) is public; the
 * per-style collection lists below were captured from the logged-in dealer
 * form on 2026-07-01 (see docs/norman-roman-shades-order-map.md). If Norman
 * adds a collection, update STYLE_COLLECTIONS and re-run:
 *
 *   node scripts/generate-roman-dealer-fabrics.mjs
 *
 * Price groups come from ROMAN_FABRIC_CATEGORIES in
 * src/mts-quote/lib/quoteConstants.ts (parsed textually); colors missing
 * there default to group2 and are marked needsPriceGroupReview.
 * Images are reused from the public-page catalog when the color code matches.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE = "https://www.normanwindowcoverings.com/Login/RomanShades/getXmlRs.asp";

// Style code → 805 builder label (json:fold_style values).
const STYLE_LABELS = {
  RM001: "Flat Fold without Seams",
  RM003: "Flat Fold with Batten Back",
  RM003E: "Edge Banded",
  RM003R: "Ribbon Banded",
  RM004: "Soft Fold",
};

// [collection name, ClothCode param, brand param] per style — from the live
// dealer form's collection dropdown after selecting each style.
const STYLE_COLLECTIONS = {
  RM001: [["Alma", "Alma", ""], ["Ashley", "Ashley", ""], ["Belgian Linen", "Belgian Linen", "Collection 11"], ["Blake", "Blake", "Collection 3"], ["Breeze", "Breeze", ""], ["Caroline", "Caroline", ""], ["Ella", "Ella", "Collection 9"], ["Ellie", "Ellie", ""], ["Francis", "Francis", ""], ["Impressions", "Impressions", ""], ["Lakeside", "Lakeside", "Collection 6"], ["Lorraine", "Lorraine", "Collection 7"], ["Louise", "Louise", ""], ["Patterns", "Patterns", "Collection 13"], ["Seabreeze", "Seabreeze", "Collection 8"], ["Sheer Elegance", "Sheer Elegance", "Collection 14"], ["Sierra", "Sierra", ""], ["Solids", "Solids", "Collection 12"], ["Taylor", "Taylor", "Collection 10"], ["Valencia", "Valencia", "Collection 2"], ["Whispering Willow", "Whispering Willow", ""], ["Windsor", "Windsor", "Collection 5"]],
  RM003: [["Alma", "Alma", ""], ["Ashley", "Ashley", ""], ["Bali", "Bali", "Natural"], ["Belgian Linen", "Belgian Linen", "Collection 11"], ["Blake", "Blake", "Collection 3"], ["Bora Bora", "Bora Bora", ""], ["Breeze", "Breeze", ""], ["Caroline", "Caroline", ""], ["Catalina", "Catalina", ""], ["Ella", "Ella", "Collection 9"], ["Ellie", "Ellie", ""], ["Francis", "Francis", ""], ["Impressions", "Impressions", ""], ["Java", "Java", ""], ["Lakeside", "Lakeside", "Collection 6"], ["Lorraine", "Lorraine", "Collection 7"], ["Louise", "Louise", ""], ["Patterns", "Patterns", "Collection 13"], ["Phuket", "Phuket", ""], ["Riviera", "Riviera", ""], ["Rochelle", "Rochelle", "Collection 4"], ["Scarlett", "Scarlett", "Sheer"], ["Seabreeze", "Seabreeze", "Collection 8"], ["Sheer Elegance", "Sheer Elegance", "Collection 14"], ["Sierra", "Sierra", ""], ["Solids", "Solids", "Collection 12"], ["Sumatra", "Sumatra ", ""], ["Taylor", "Taylor", "Collection 10"], ["Valencia", "Valencia", "Collection 2"], ["Whispering Willow", "Whispering Willow", ""], ["Windsor", "Windsor", "Collection 5"]],
  RM003E: [["Alma", "Alma", ""], ["Francis", "Francis", ""], ["Lakeside", "Lakeside", "Collection 6"]],
  RM003R: [["Alma", "Alma", ""], ["Ella", "Ella", "Collection 9"], ["Francis", "Francis", ""], ["Taylor", "Taylor", "Collection 10"]],
  RM004: [["Alma", "Alma", ""], ["Ashley", "Ashley", ""], ["Belgian Linen", "Belgian Linen", "Collection 11"], ["Blake", "Blake", "Collection 3"], ["Breeze", "Breeze", ""], ["Caroline", "Caroline", ""], ["Ella", "Ella", "Collection 9"], ["Ellie", "Ellie", ""], ["Francis", "Francis", ""], ["Impressions", "Impressions", ""], ["Lorraine", "Lorraine", "Collection 7"], ["Louise", "Louise", ""], ["Patterns", "Patterns", "Collection 13"], ["Rochelle", "Rochelle", "Collection 4"], ["Seabreeze", "Seabreeze", "Collection 8"], ["Sierra", "Sierra", ""], ["Solids", "Solids", "Collection 12"], ["Taylor", "Taylor", "Collection 10"], ["Valencia", "Valencia", "Collection 2"], ["Whispering Willow", "Whispering Willow", ""], ["Windsor", "Windsor", "Collection 5"]],
};

// Norman's client JS forces Caroline to cloth AA0206 for these styles, which
// drops colors on other cloth codes (e.g. F1090 on AA0206-A).
const CAROLINE_AA0206_ONLY_STYLES = new Set(["RM001", "RM004"]);

async function fetchColors(styleCode, [name, clothCode, brand]) {
  const params = new URLSearchParams({
    tableType: "GetClothColor",
    pgmCode: `RM${styleCode}`,
    ClothCode: clothCode,
    brand,
    ClothDescEn: name,
  });
  const res = await fetch(`${BASE}?${params}`, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`${styleCode}/${name}: HTTP ${res.status}`);
  const rows = await res.json();
  if (!Array.isArray(rows)) throw new Error(`${styleCode}/${name}: unexpected payload`);
  return rows.filter(
    (row) =>
      !(
        name === "Caroline" &&
        CAROLINE_AA0206_ONLY_STYLES.has(styleCode) &&
        row.ClothCode !== "AA0206"
      )
  );
}

function parsePriceGroups() {
  const src = readFileSync(path.join(ROOT, "src/mts-quote/lib/quoteConstants.ts"), "utf8");
  const start = src.indexOf("ROMAN_FABRIC_CATEGORIES: readonly RomanFabricCategory[]");
  const end = src.indexOf("] as const;", start);
  const body = src.slice(start, end);
  const groups = new Map();
  const categoryBlocks = body.split(/name: "/).slice(1);
  for (const block of categoryBlocks) {
    const category = block.slice(0, block.indexOf('"'));
    for (const match of block.matchAll(/romanColor\("([^"]+)", "[^"]*", "(group\d)"\)/g)) {
      groups.set(`${category}|${match[1]}`, match[2]);
    }
  }
  return groups;
}

function parsePublicImages() {
  const src = readFileSync(
    path.join(ROOT, "src/lib/quote/norman-product-colors.generated.ts"),
    "utf8"
  );
  const images = new Map();
  for (const match of src.matchAll(
    /"productId": "roman"[\s\S]*?"colorCode": "([^"]*)"[\s\S]*?"imageUrl": "([^"]*)"/g
  )) {
    if (match[1] && !images.has(match[1])) images.set(match[1], match[2]);
  }
  return images;
}

const priceGroups = parsePriceGroups();
const images = parsePublicImages();
const byKey = new Map();

for (const [styleCode, collections] of Object.entries(STYLE_COLLECTIONS)) {
  const styleLabel = STYLE_LABELS[styleCode];
  for (const entry of collections) {
    const [collection] = entry;
    const colors = await fetchColors(styleCode, entry);
    for (const color of colors) {
      const key = `${collection}|${color.ColorCode}`;
      const existing = byKey.get(key);
      if (existing) {
        if (!existing.styles.includes(styleLabel)) existing.styles.push(styleLabel);
        continue;
      }
      const priceGroup = priceGroups.get(key) ?? "group2";
      byKey.set(key, {
        collection,
        colorCode: color.ColorCode,
        colorName: color.ColorEnName,
        clothCode: color.ClothCode,
        maxWidth: color.MaxWidth || "",
        joinable: color.Joinable || "",
        openness: color.Openness || "",
        discontinued: Boolean(color.EndDate),
        priceGroup,
        needsPriceGroupReview: !priceGroups.has(key),
        imageUrl: images.get(color.ColorCode) ?? "",
        styles: [styleLabel],
      });
    }
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
}

const rows = [...byKey.values()].sort(
  (a, b) => a.collection.localeCompare(b.collection) || a.colorCode.localeCompare(b.colorCode)
);

const header = `// Generated by scripts/generate-roman-dealer-fabrics.mjs from the Norman
// dealer Roman Shades order form data service. Do not edit by hand.
// Captured collections/styles: dealer form 2026-07-01 (account-level lists).

export interface NormanRomanDealerFabricRow {
  collection: string;
  colorCode: string;
  colorName: string;
  clothCode: string;
  maxWidth: string;
  joinable: string;
  openness: string;
  discontinued: boolean;
  priceGroup: "group1" | "group2" | "group3";
  needsPriceGroupReview: boolean;
  imageUrl: string;
  styles: readonly string[];
}

export const normanRomanDealerFabricRows: readonly NormanRomanDealerFabricRow[] = `;

writeFileSync(
  path.join(ROOT, "src/lib/quote/norman-roman-dealer-fabrics.generated.ts"),
  header + JSON.stringify(rows, null, 2) + ";\n"
);

const reviewCount = rows.filter((row) => row.needsPriceGroupReview).length;
console.log(`Wrote ${rows.length} unique colors (${reviewCount} need price-group review).`);
