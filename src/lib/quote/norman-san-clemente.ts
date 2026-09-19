import type { CatalogProduct, CatalogProgram } from "./catalog/types";
import type { ProductColorOption } from "./product-color-options";

export const SAN_CLEMENTE_SOURCE_ID = "norman-san-clemente-guide-2025-11-19";
export const SAN_CLEMENTE_SOURCE_URL = "https://download.normanwindowcoverings.com/Document/Service/download/ProgramBinderSync/Other/Norman/San%20Clemente/San%20Clemente%20Guide.pdf";
export const SAN_CLEMENTE_HONEYCOMB = "san_clemente_honeycomb";
export const SAN_CLEMENTE_FAUX = "san_clemente_faux_wood";
export function isSanClementeProduct(id: string): boolean {
  return id === SAN_CLEMENTE_HONEYCOMB || id === SAN_CLEMENTE_FAUX;
}
const program = (id: string, name: string, minWidth: number, minHeight: number, maxHeight: number, page: number): CatalogProgram => ({
  id, name, priceGroup: null, priceAxis: "wh", priceBasis: "manual_required",
  sourceId: SAN_CLEMENTE_SOURCE_ID, grid: { widths: [], heights: [], prices: [] },
  minWidth, minHeight, maxWidth: 72, maxHeight, maxAreaSqft: null,
  fabricCollections: [], sourcePages: [page],
  notes: ["Program code verified in Norman dealer order form on September 19, 2026. Current price schedule has not been supplied; do not substitute Portrait or Ultimate grids.", "Width limits are net; inside mount deducts 3/8 inch from ordered width."],
});
export const sanClementeProducts: CatalogProduct[] = [
  {
    id: SAN_CLEMENTE_HONEYCOMB, name: "San Clemente Honeycomb", productType: "Honeycomb Shades",
    manufacturer: "Norman", priceBasis: "manual_required", customerRetailStatus: "unverified", provisional: true,
    source: "San Clemente Program Reference Guide, November 2025", pages: [4,5,6,7,8],
    fabricRouting: { "Light Filtering": "san_clemente_hg006", "Room Darkening": "san_clemente_hg006bo" },
    programs: [program("san_clemente_hg006", "HG006 · Light Filtering",12,42,96,5), program("san_clemente_hg006bo", "HG006BO · Room Darkening",12,42,96,5)],
    surcharges: [], fabricByYard: [], freightStatus: "unresolved",
    notes: ["G2 assortment: 9/16-inch single cell; Cordless or Cordless TDBU. G1 discontinued April 30, 2025.", "Base, TDBU and accessory pricing await current San Clemente schedule."],
  },
  {
    id: SAN_CLEMENTE_FAUX, name: "San Clemente Faux Wood", productType: "Faux Wood Blinds",
    manufacturer: "Norman", priceBasis: "manual_required", customerRetailStatus: "unverified", provisional: true,
    source: "San Clemente Program Reference Guide, November 2025", pages: [9,10,11,12,13], fabricRouting: null,
    programs: [program("san_clemente_b5w20", 'B5W20 · 2" Cordless Faux Wood',20,24,84,10)],
    surcharges: [], fabricByYard: [], freightStatus: "unresolved",
    notes: ["White 6008 embossed only; 2-inch slats; cordless lift; fixed left wand tilt; standard valance.", "Base and optional hardware pricing await current San Clemente schedule."],
  },
];
const honeycombColors = [
  ["C7015K","Brilliant White"], ["C7515K","White Cream"], ["C7423K","Natural Tan"], ["C7137K","Power Gray"], ["C7140K","Orion Gray"],
  ["C4008T","Brilliant White RD"], ["C4517T","White Cream RD"], ["C4420T","Natural Tan RD"], ["C4125T","Power Gray RD"], ["C4127T","Orion Gray RD"],
];
export const sanClementeColors: ProductColorOption[] = [...honeycombColors, ["6008","White"]].map(([code,name], i): ProductColorOption => {
  const faux = i === 10;
  const rd = i >= 5 && !faux;
  const productId = faux ? SAN_CLEMENTE_FAUX : SAN_CLEMENTE_HONEYCOMB;
  const collection = faux ? "Embossed" : rd ? "Room Darkening" : "Light Filtering";
  return {
    id: `${productId}:${code}`, productId, collection, publicCollection: collection,
    fabricType: faux ? "Faux Wood" : collection, colorCode: code, colorName: name, publicColorName: name,
    frStatus: "Not specified", imageUrl: "", sourcePage: `${SAN_CLEMENTE_SOURCE_URL}#page=${faux ? 12 : 7}`,
    sourcePageModified: null, sourceNote: "November 2025 guide and authenticated September 19, 2026 order-form assortment. Availability does not establish pricing.",
    programId: faux ? "san_clemente_b5w20" : rd ? "san_clemente_hg006bo" : "san_clemente_hg006",
    selectionMode: "program", requiresProgram: false, available: true,
    automaticDetails: faux ? { slat_size: '2"', control_side: "Left" } : { cell_size: '9/16" Single', light_control: rd ? "room_darkening" : "light_filtering" },
    searchText: `San Clemente ${code} ${name} ${collection}`.toLowerCase(),
  };
});
