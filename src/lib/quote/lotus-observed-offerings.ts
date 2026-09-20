import rows from "./lotus-observed-offerings-20260920.json";
import type { CatalogProduct } from "./catalog/types";
export const LOTUS_OBSERVED_VERSION = "lotus-dealer-observed-2026-09-20-v1";
export const LOTUS_OBSERVED_SOURCE_ID = "lotus-dealer-observed-2026-09-20";
export const lotusObservedOfferings = rows;
export type LotusObservedOffering = typeof rows[number];
const byId = new Map(rows.map(row => [row.id, row]));
export function lotusObservedOffering(id: string) { return byId.get(id); }
const families = [
  ["mini", "Mini Blinds", "Aluminum Mini Blinds"], ["vinyl", "Vinyl Blinds", "Vinyl Blinds"],
  ["faux", "Faux Wood Blinds", "Faux Wood Blinds"], ["roller", "Roller Shades", "Roller Shades"],
  ["vertical", "Vertical Blinds", "Vertical Blinds"], ["parts", "Parts & Accessories", "Parts & Accessories"],
] as const;
export const lotusObservedProducts: CatalogProduct[] = families.map(([key, productType, name]) => ({
  id: `lotus_dealer_listed_${key}`, productType, name: `Lotus ${name} — Dealer-listed Items`,
  manufacturer: "Lotus", system: "Exact dealer-listed item", priceBasis: "manual_required",
  customerRetailStatus: "unverified", dealerFactor: null, freightStatus: "unresolved", pages: [],
  source: "Authenticated Lotus dealer listings observed September 20, 2026", fabricRouting: null,
  programs: [{ id: `lotus_dealer_listed_${key}_item`, name: "Exact dealer-listed item — price confirmation required",
    priceGroup: null, priceAxis: "wh", priceBasis: "manual_required", sourceId: LOTUS_OBSERVED_SOURCE_ID,
    grid: { widths: [], heights: [], prices: [] }, maxWidth: null, maxHeight: null, maxAreaSqft: null,
    fabricCollections: [], notes: ["Select an exact source offering. Listing prices are not automatic customer-price authority."],
  }], surcharges: [], fabricByYard: [], notes: ["Dealer listing establishes assortment only. Obtain current availability, configuration and exact price confirmation before customer delivery."],
}));
export function isLotusObservedProduct(id: string) { return lotusObservedProducts.some(p => p.id === id); }
