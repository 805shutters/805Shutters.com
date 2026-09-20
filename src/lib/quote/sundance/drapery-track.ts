import source from "./drapery-track.portal.json";
import type { CatalogProduct } from "../catalog/types";
import type { QuoteDetailField } from "../product-options";

export const SUNDANCE_DRAPERY_TRACK_ID = "sundance_drapery_track";
export const sundanceDraperyTrackFields: QuoteDetailField[] = source.options.map(option => ({
  id: `sundance_track_${option.name.toLowerCase().replace(/\s+/g, "_")}`,
  label: option.name,
  type: "select",
  options: option.choices.filter(value => value !== "Make Selection").map(value => ({value, label: value})),
}));

export const sundanceDraperyTrack: CatalogProduct = {
  id: SUNDANCE_DRAPERY_TRACK_ID,
  name: "Sundance Glydea drapery motor and track",
  system: "GLYDEA TRACK",
  productType: "Drapery Tracks",
  manufacturer: "Sundance",
  priceBasis: "manual_required",
  customerRetailStatus: "unverified",
  freightStatus: "unresolved",
  pages: [],
  source: source.sourceUrl,
  fabricRouting: null,
  programs: [],
  surcharges: [],
  fabricByYard: [],
  notes: [
    "Current dealer assortment observed September 20, 2026: Drapery Tracks / DRAPERY MOTOR AND TRACK / GLYDEA TRACK.",
    "Observed seven option menus are saved configuration choices; their compatibility, dimensions, current rate schedule and effective date require dealer confirmation.",
    "Motor, remote, curved-track charges, account terms and freight remain unresolved. Manual price required; no other manufacturer's rate is substituted.",
  ],
};
