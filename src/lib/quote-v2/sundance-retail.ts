import { lookupSundanceSourceGrid } from '@/lib/quote/sundance/catalog';
import { sundanceOptionEvidence, sundanceSheerviewAccessories } from '@/lib/quote/sundance/option-schedules';
import type { PriceInput, PriceResult } from '@/lib/quote/pricing';
import type { SelectionContext } from './core';
import { sourceProvenance } from './source-manifest';
import type { PriceComponentOptionInput } from './price-components';
import { readSundanceAssembly } from '@/lib/quote/sundance/assembly-records';

/** Owner-approved published retail policy. No dealer-net conversion is assumed. */
export { SUNDANCE_RETAIL_PRODUCTS } from '@/lib/quote/sundance/retail-policy';
import { SUNDANCE_RETAIL_PRODUCTS } from '@/lib/quote/sundance/retail-policy';
const money = (n: number) => Math.round(n * 100) / 100;
const sourceId = 'sundance-h-sheerview-pricing_aug2026-4a981c88776d';

export function sundanceRetailOptions(s: SelectionContext) {
  const c = s.configuration;
  const evidence = sundanceOptionEvidence('sheerview', c, s.widthInches);
  const accessoryKeys = new Set<string>(sundanceSheerviewAccessories.map(row => row.key));
  return evidence.entries.map(entry => ({...entry,
    id: `sundance:${entry.key}`,
    billingScope: accessoryKeys.has(entry.key) ? 'once_per_line' as const : 'per_window' as const,
  }));
}

export function priceSundanceRetail(s: SelectionContext, input: PriceInput): PriceResult {
  const fail = (error: string): PriceResult => ({ok:false,code:'CONFIGURATION_INCOMPLETE',error,warnings:[]});
  if (!SUNDANCE_RETAIL_PRODUCTS.has(s.productId)) return fail('The selected Sundance product does not yet have a complete published-retail option route.');
  const grid = lookupSundanceSourceGrid(s.productId, s.programId ?? '', s.widthInches, s.heightInches);
  if (!grid) return fail('No published Sundance retail cell exists for this exact program and measurement.');
  const assembly = readSundanceAssembly(s.configuration.sundance_assembly_v1);
  if (assembly) {
    // The published $80 upgrade applies to the configured common headrail.
    // Independently configured fabrics/controls cannot silently inherit its price.
    const sameFields = ['catalog_program_id','fabric_color_code','vane_size','light_control',
      'sundance_sheerview_control','sundance_sheerview_headrail','sundance_sheerview_cord_option','sundance_sheerview_headrail_finish'];
    if (assembly.components.some(component => sameFields.some(key => String(component.configuration[key] ?? '') !== String(s.configuration[key] ?? '')) ||
      sundanceSheerviewAccessories.some(a => Number(component.configuration[`sundance_sheerview_${a.key}_qty`] ?? 0) > 0))) {
      return fail('This two-on-one assembly has independently configured shades or accessories. Confirm its component retail price before quoting.');
    }
  }
  // Shared accessories require an order-derived allocation. Until that allocation
  // is priced here, never silently omit its charge or accept a client amount.
  const shared = s.configuration.sundance_shared_accessories_v1 as {assignments?: unknown[]} | undefined;
  if (shared?.assignments?.length) return fail('Shared Sundance accessories require a verified retail allocation. Use explicit accessory quantities for this quote.');
  const evidence = sundanceOptionEvidence('sheerview', s.configuration, s.widthInches);
  if (evidence.unresolved.length) return fail(evidence.unresolved.join(' '));
  if (input.surcharges?.length || input.motorization?.length) return fail('Sundance options must use the documented product controls and accessory quantities.');
  const entries = sundanceRetailOptions(s);
  const onceTotal = money(entries.filter(e => e.billingScope === 'once_per_line').reduce((sum,e) => sum + e.sourceRetail * e.quantity, 0));
  const subtotal = money(grid.sourceRetail + entries.filter(e => e.billingScope === 'per_window').reduce((sum,e) => sum + e.sourceRetail * e.quantity, 0));
  const discountPercent = input.discountPercent ?? 0;
  if (!Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent > 100) return fail('Discount must be between 0 and 100 percent.');
  const discountAmount = money(subtotal * discountPercent / 100), unitPrice = money(subtotal - discountAmount);
  return {ok:true,productId:s.productId,programId:s.programId!,programName:s.programId!,
    matchedWidth:grid.gridWidth,matchedHeight:grid.gridHeight,base:grid.sourceRetail,
    configurationUnits:s.configuration.sundance_sheerview_assembly === 'Two on one' ? 2 : 1,
    wholesaleBase:null,wholesaleUnitPrice:null,wholesaleTotal:null,costStatus:'unavailable',
    surchargeLines:entries.map(e => ({id:e.id,label:e.label,amount:money(e.sourceRetail * e.quantity),kind:'flat' as const})),
    unitPrice,discountPercent,discountAmount,quantity:s.quantity,onceTotal,total:money(unitPrice*s.quantity+onceTotal),warnings:[]};
}

export function sundanceRetailComponentInputs(s: SelectionContext) {
  const grid = lookupSundanceSourceGrid(s.productId,s.programId ?? '',s.widthInches,s.heightInches);
  const source = sourceProvenance(sourceId,{page:grid?.sourcePage ?? 23});
  const options: PriceComponentOptionInput[] = sundanceRetailOptions(s).map(e => ({
    id:e.id,label:e.label,category:e.billingScope === 'once_per_line' ? 'order_charge' : 'accessory',
    status:'priced',basis:'flat',selectionBindings:[{field:'configuration',value:e.key}],
    source:sourceProvenance(sourceId,{page:e.page}),priceLineId:e.id,units:e.quantity,billingScope:e.billingScope,
  }));
  const control: PriceComponentOptionInput = {id:'sundance:control',label:String(s.configuration.sundance_sheerview_control),
    category:'operating_system',status:'included',basis:'included',selectionBindings:[{field:'sundance_sheerview_control',value:String(s.configuration.sundance_sheerview_control)}],source,billingScope:'per_window'};
  return {accessories:options.length ? options : [{...control,id:'sundance:no_accessories',category:'accessory' as const,label:'No additional accessories'}],
    operatingSystem:control,selectedProgramSource:source,contractSource:source};
}
