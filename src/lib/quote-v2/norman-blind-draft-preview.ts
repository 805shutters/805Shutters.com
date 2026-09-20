import type { ISODate } from "./core";
import { quoteV2CatalogVersionFor } from "./catalog";
/** Editable-draft advice follows the same UTC date as server repricing.
 * This does not mutate or reprice the historical selection/price snapshot. */
export function normanBlindDraftCatalog(productId:"wood_blinds"|"faux_wood"|"smartprivacy_faux",now=new Date()) {
  const catalogAsOf=now.toISOString().slice(0,10) as ISODate;
  return {catalogAsOf,catalogVersion:quoteV2CatalogVersionFor(productId,catalogAsOf)};
}
