import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { lotusObservedOfferings as rows, lotusObservedProducts as products, LOTUS_OBSERVED_VERSION, LOTUS_OBSERVED_SOURCE_ID } from "@/lib/quote/lotus-observed-offerings";
import { getProduct } from "@/lib/quote/catalog";
import { priceDesign } from "@/lib/quote/pricing";
import { quoteLabProductType } from "@/lib/quote-lab/builder";
import { validateLotusObservedOffering } from "./lotus-observed-offerings";
import { validateSelection } from "./rules";
import { getSourceManifestEntry } from "./source-manifest";
import type { SelectionContext } from "./core";
import { lotusLegacyDeliveryBlock } from "@/lib/crm/lotus-legacy-delivery";
const selection = (row = rows[0]): SelectionContext => ({
 manufacturerId:"lotus",productId:row.productId,programId:`${row.productId}_item`,catalogVersion:LOTUS_OBSERVED_VERSION,
 catalogAsOf:"2026-09-20",widthInches:30,heightInches:48,quantity:1,
 configuration:{lotus_observed_offering_id:row.id,lotus_observed_version:LOTUS_OBSERVED_VERSION},options:{},
});
describe("complete Lotus dealer-listed destinations", () => {
 it("accounts for every observed row with an immutable source and a real CRM family destination", () => {
  expect(rows).toHaveLength(3710); expect(new Set(rows.map(r=>r.id)).size).toBe(rows.length);
  expect(rows.filter(r=>r.kind==='custom')).toHaveLength(820);
  expect(rows.filter(r=>r.kind==='parts')).toHaveLength(162);
  expect(rows.filter(r=>r.discontinued)).toHaveLength(2);
  for(const row of rows) {
   const product=getProduct(row.productId)!;expect(product).toBeDefined();
   expect(quoteLabProductType(product.id)).toBe(product.productType);
   expect(row.sourceUrl).toMatch(/^https:\/\/www\.lotusblind\.com\/products\//);
   expect(row.effectiveDate).toBeNull();expect(row.exception.length).toBeGreaterThan(0);
  }
  const source=getSourceManifestEntry(LOTUS_OBSERVED_SOURCE_ID);
  expect(source.authorities).toEqual(['assortment']);
  expect(createHash('sha256').update(readFileSync('src/lib/quote/lotus-observed-offerings-20260920.json')).digest('hex')).toBe(source.sha256);
 });
 it("never turns a listing placeholder into an automatic price in any of six destinations", () => {
  for(const product of products) {
   expect(product.priceBasis).toBe('manual_required');
   expect(priceDesign({productId:product.id,programId:product.programs[0].id,widthInches:30,heightInches:48}).ok).toBe(false);
   const row=rows.find(r=>r.productId===product.id && !r.discontinued)!;
   expect(validateSelection(selection(row))).toEqual(expect.arrayContaining([expect.objectContaining({ruleId:'lotus.observed.manual_price_required',severity:'hard_block'})]));
   expect(lotusLegacyDeliveryBlock([{options_json:{catalog_product_id:product.id,lotus_observed_offering_id:row.id,manual_price_override:true},unit_price:105}])).toContain('price confirmation');
  }
 });
 it("rejects absent, cross-family, wrong-version and discontinued choices", () => {
  const current=selection();
  expect(validateLotusObservedOffering({...current,configuration:{}})[0].ruleId).toBe('lotus.observed.selection_invalid');
  expect(validateLotusObservedOffering({...current,productId:'lotus_dealer_listed_parts'})[0].ruleId).toBe('lotus.observed.selection_invalid');
  expect(validateLotusObservedOffering({...current,configuration:{...current.configuration,lotus_observed_version:'changed'}})[0].ruleId).toBe('lotus.observed.selection_invalid');
  expect(validateLotusObservedOffering(selection(rows.find(r=>r.discontinued)!))[0].ruleId).toBe('lotus.observed.discontinued');
  expect(validateLotusObservedOffering({...current,productId:'lotus_mini_blinds',configuration:{}})).toEqual([]);
 });
});
