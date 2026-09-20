import { describe, expect, it } from 'vitest';
import { priceDesign } from '@/lib/quote/pricing';
import { quoteV2CatalogVersionFor } from './catalog';
import type { SelectionContext } from './core';
import { authoritativeAutomaticSurchargeSelections, priceQuoteV2Selection } from './engine';
const shade=(fold_style:string):SelectionContext=>({manufacturerId:'Norman',productId:'roman',programId:'roman_cordless_usa_price_group_2_pg2',catalogAsOf:'2026-09-20',catalogVersion:quoteV2CatalogVersionFor('roman','2026-09-20'),widthInches:36,heightInches:60,quantity:1,options:{},configuration:{mount_type:'Inside Mount',shade_type:'Single',lift_system:'Cordless',fold_style,fabric_collection:'Caroline',fabric_color_code:'F1090',lining:'Translucent',fabric_orientation:'Standard',seaming:'No Seams',roman_mount_fit:'Flush Inside',mount_depth_inches:2.125}});
describe('Roman configurator style pricing',()=>{
 it.each([['Flat Fold without Seams',1038],['Flat Fold with Batten Back',1038],['Soft Fold',1349.4]])('prices saved Caroline %s against the dealer-confirmed 30 percent relationship',(style,retail)=>{
  const selection=JSON.parse(JSON.stringify(shade(style))) as SelectionContext;
  const result=priceQuoteV2Selection({selection,priceInput:{productId:'roman',programId:selection.programId!,widthInches:36,heightInches:60,surcharges:authoritativeAutomaticSurchargeSelections(selection)},includeInternalCost:true});
  expect(result,JSON.stringify(result)).toMatchObject({ok:true,unitPrice:retail,total:retail});
 });
 it.each([['Soft Fold','soft_fold_edge_banding_border'],['Edge Banded','soft_fold_edge_banding_border'],['Ribbon Banded','ribbon_banding']])('derives %s exactly once from the saved style',(style,id)=>{
  const s=shade(style);s.configuration={...s.configuration,roman_style:'soft_fold',decorative_trim:'ribbon_banding'};
  const charges=authoritativeAutomaticSurchargeSelections(s).filter(x=>['soft_fold_edge_banding_border','ribbon_banding'].includes(x.id));
  expect(charges).toEqual([{id,units:1}]);
 });
 it('does not mutate prior snapshot pricing and removes stale style charges from current plain styles',()=>{
  const s=shade('Soft Fold');
  expect(authoritativeAutomaticSurchargeSelections({...s,catalogVersion:s.catalogVersion.replace('-r8','-r3')})).not.toContainEqual({id:'soft_fold_edge_banding_border',units:1});
  const plain=shade('Flat Fold without Seams');plain.configuration={...plain.configuration,roman_style:'soft_fold',decorative_trim:'ribbon_banding'};
  expect(authoritativeAutomaticSurchargeSelections(plain).filter(x=>['soft_fold_edge_banding_border','ribbon_banding'].includes(x.id))).toEqual([]);
 });
});

describe('Roman saved fabric valance pricing',()=>{
 it.each([[24,128],[24.125,133],[31,133],[31.125,145],[36,145],[71,221],[96,293]])('uses the guide width boundary for %s inches',(width,expected)=>{
  const s=shade('Flat Fold without Seams');s.widthInches=width;s.configuration={...s.configuration,valance:'Fabric Valance'};
  expect(authoritativeAutomaticSurchargeSelections(s)).toContainEqual({id:'roman_fabric_valance_surcharge',units:1});
  const result=priceDesign({productId:'roman',programId:s.programId!,widthInches:width,heightInches:60,surcharges:authoritativeAutomaticSurchargeSelections(s)});
  expect(result.ok).toBe(true);
  if(result.ok)expect(result.surchargeLines.find(x=>x.id==='roman_fabric_valance_surcharge')?.amount).toBe(expected);
 });
 it('charges a36inch fabric valance145 once in the saved server-priced configuration',()=>{
  const s=shade('Flat Fold without Seams');s.configuration={...s.configuration,valance:'Fabric Valance',valance_returns:'No Returns'};
  const result=priceQuoteV2Selection({selection:s,priceInput:{productId:'roman',programId:s.programId!,widthInches:36,heightInches:60,surcharges:authoritativeAutomaticSurchargeSelections(s)}});
  expect(result,JSON.stringify(result)).toMatchObject({ok:true,unitPrice:1183,total:1183});
 });
});
