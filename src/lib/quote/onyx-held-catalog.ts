import shadeEvidence from './onyx-shade-assortment-20260920.json';
import shutterEvidence from './onyx-portal-20260920.json';
import type { CatalogProduct, CatalogProgram } from './catalog/types';
import type { ProductColorOption } from './product-color-options';

export const ONYX_SHADE_SOURCE = 'onyx-shade-assortment-2026-09-20';
export const ONYX_HELD_VERSION = 'onyx-current-assortment-2026-09-20-manual-r1';
export const ONYX_HELD_REASON = 'Current Onyx assortment is recorded. Obtain and verify the current dealer grid, configuration limits, accessory charges and freight before pricing or customer delivery.';
const definitions = [
  ['onyx_signature_roller','Onyx Signature Roller Shades','Roller Shades','signature','Roller'],
  ['onyx_signature_sunscreen','Onyx Signature Sunscreen Shades','Roller Shades','signature','Sunscreen'],
  ['onyx_signature_zebra','Onyx Signature Zebra Shades','Sheer Shades','signature','Zebra'],
  ['onyx_lux_fabric_blinds','Onyx Lux Fabric Blinds','Fabric Blinds','lux','Fabric Blinds'],
  ['onyx_lux_honeycomb','Onyx Lux Honeycomb Shades','Honeycomb Shades','lux','Honeycomb'],
  ['onyx_lux_sheerview','Onyx Lux Sheerview Shades','Sheer Shades','lux','Sheerview'],
  ['onyx_woven','Onyx Woven Wood Shades','Woven Wood Shades','woven','Woven'],
] as const;
const slug=(v:string)=>v.toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');
export const onyxHeldProgramId=(productId:string,pattern:string)=>`${productId}_${slug(pattern)}`;
const sourceFor=(productId:string)=>productId==='onyx_ash_shutters'?'onyx-portal-assortment-2026-09-20':ONYX_SHADE_SOURCE;
function program(id:string,name:string,productId:string):CatalogProgram {
  return {id,name,priceGroup:null,priceAxis:'wh',priceBasis:'manual_required',sourceId:sourceFor(productId),grid:{widths:[],heights:[],prices:[]},minWidth:null,minHeight:null,maxWidth:null,maxHeight:null,maxAreaSqft:null,fabricCollections:[],sourcePages:[],notes:[ONYX_HELD_REASON,'Observation date is not a manufacturer effective date. No sample price is extrapolated into a grid.']};
}
export const onyxHeldProducts:CatalogProduct[]=definitions.map(([id,name,productType,portalProgram,portalProduct])=>{
  const fabrics=shadeEvidence.fabrics.filter(r=>r.portalProgram===portalProgram&&r.product===portalProduct);
  return {id,name,productType,manufacturer:'Onyx',priceBasis:'manual_required',customerRetailStatus:'unverified',provisional:true,source:`Onyx CHE01 visible dealer assortment observed 2026-09-20; effective date unpublished`,pages:[],fabricRouting:Object.fromEntries(fabrics.map(r=>[r.pattern,onyxHeldProgramId(id,r.pattern)])),programs:fabrics.map(r=>program(onyxHeldProgramId(id,r.pattern),r.pattern,id)),surcharges:[],fabricByYard:[],freightStatus:'unresolved',notes:[ONYX_HELD_REASON]};
});
const ash=shutterEvidence.materials.find(r=>r.material==='Ash')!;
onyxHeldProducts.push({id:'onyx_ash_shutters',name:'Onyx Ash Shutters',productType:'Shutters',manufacturer:'Onyx',priceBasis:'manual_required',customerRetailStatus:'unverified',provisional:true,source:'Onyx CHE01 Ash ordering menu observed 2026-09-20',pages:[],fabricRouting:null,programs:[program('onyx_ash','Ash','onyx_ash_shutters')],surcharges:[],fabricByYard:[],freightStatus:'unresolved',notes:[ONYX_HELD_REASON,'Ash is a distinct current material; it is not an alias for legacy Poly Composite.']});
export function isOnyxHeldProduct(id:string){return onyxHeldProducts.some(p=>p.id===id);}
export const onyxHeldColors:ProductColorOption[]= [...definitions.flatMap(([productId,,,portalProgram,portalProduct])=>shadeEvidence.fabrics.filter(r=>r.portalProgram===portalProgram&&r.product===portalProduct).flatMap(r=>r.colors.map(c=>({productId,programId:onyxHeldProgramId(productId,r.pattern),collection:r.pattern,colorCode:c.id,colorName:c.name})))), ...ash.colors.map(c=>({productId:'onyx_ash_shutters',programId:'onyx_ash',collection:'Ash',colorCode:c.split('_')[0],colorName:c.slice(c.indexOf('_')+1)}))].map(r=>({...r,id:`${r.productId}:${r.programId}:${r.colorCode}`,publicCollection:r.collection,publicColorName:r.colorName,fabricType:r.productId==='onyx_ash_shutters'?'Ash finish':'Shade fabric',frStatus:'Unverified',imageUrl:'',sourcePage:r.productId==='onyx_ash_shutters'?shutterEvidence.sourceUrl:shadeEvidence.sourceUrl,sourcePageModified:null,sourceNote:ONYX_HELD_REASON,selectionMode:'program' as const,requiresProgram:false,available:true,automaticDetails:{onyx_portal_pattern:r.collection},searchText:`${r.collection} ${r.colorCode} ${r.colorName}`.toLowerCase()}));

/** Independent menu observations, never a claim that every cross-combination is valid. */
export function onyxHeldControlChoices(productId:string):readonly string[]{
  if(productId==='onyx_ash_shutters')return [];
  if(productId==='onyx_lux_fabric_blinds')return ['Cordless','Motorization'];
  if(productId==='onyx_lux_honeycomb')return ['Continuous Cord','Cordless','Top Down Bottom Up Cordless','Motorization'];
  if(productId==='onyx_woven')return ['Continuous Cord','Cordless','Top Down Bottom Up','Wand Motor','Remote Motor'];
  return ['Continuous Cord','Cordless','Motorization'];
}
export const onyxAshAssortment=ash;
