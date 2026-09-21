import {describe,it,expect} from 'vitest';
import {normanRollerFabricWidths} from '../quote/norman-roller-fabric-widths.generated';
import {rollerFabricWidthSource,rollerValancePieceLimit} from '../quote/norman-roller-fabric-widths';
import {normanRollerFabricColors} from '../quote/norman-roller-fabrics';
import {deriveRollerCommonValances} from './norman-roller-common';
import {ROLLER_COMMON_CHOICE_KEY as KEY,ROLLER_COMMON_RECORD_KEY as RECORD,emptyRollerCommon} from '../quote/norman-roller-common';
import {ROLLER_VALANCE_KEY,ROLLER_VALANCE_ONLY,ROLLER_VALANCE_DERIVED,emptyRollerValance} from '../quote/norman-roller-valance-only';
import {validateRollerValance} from './norman-roller-valance-only';
import {quoteV2CatalogVersionFor,QUOTE_V2_ROLLER_PREVIEW_VERSION,isRecognizedQuoteV2Catalog} from './catalog';
import type {SelectionContext} from './core';
const lines=(codes=['F0668','F0668'],width=71)=>codes.map((code,i)=>({lineId:`l${i}`,selection:{manufacturerId:'Norman',productId:'roller',programId:'roller_cordless_fabric_price_group_2_pg2',catalogAsOf:'2026-09-20',catalogVersion:quoteV2CatalogVersionFor('roller','2026-09-20'),widthInches:width,heightInches:60,quantity:1,options:{},configuration:{roller_application:'Common Valance',lift_system:'Cordless',mount_type:'Outside Mount',valance:'6 Fabric Valance*',roller_top_treatment:'Fabric Valance',roller_tube:'2" (52mm) Tube',fabric_color_code:code,[KEY]:{...emptyRollerCommon(),groupId:'G',position:i+1}}} as SelectionContext}));
describe('Roller exact source fabric-width registry',()=>{
 it('maps every one of439active colors exactly once and no guessed codes',()=>{
  const active=normanRollerFabricColors.filter(c=>c.available).map(c=>c.colorCode).sort();expect(active).toHaveLength(439);
  expect(normanRollerFabricWidths.map(r=>r.colorCode).sort()).toEqual(active);
  expect(new Set(normanRollerFabricWidths.map(r=>r.colorCode)).size).toBe(439);
  for(const code of ['F1561','F0000','','Amelia',null])expect(rollerFabricWidthSource(code)).toBeNull();
 });
 it.each([['F0668',78],['F1668',78],['F1669',78],['F1926',94.5],['F1927',94.5],['F0739',118],['F0740',106],['F0741',106],['F0743',118],['F0751',118],['F2170',94],['F2221',96],['F1538',110],['F1484',118]])('uses exact source mergedcell %s=%s',(code,width)=>{expect(rollerFabricWidthSource(code)?.fabricWidthInches).toBe(width);});
 it('derives material-dependent splice limits separately for Fabric Valance and wrappedfascia',()=>{
  expect(rollerValancePieceLimit('6 Fabric Valance*','F0668').maximum).toBe(71);expect(rollerValancePieceLimit('4.5 Curved Fascia with Fabric','F0668').maximum).toBe(78);
  expect(rollerValancePieceLimit('6 Fabric Valance*','F1926').maximum).toBe(87.5);expect(rollerValancePieceLimit('6 Fabric Valance*','F2170').maximum).toBe(87);
  expect(rollerValancePieceLimit('6 Fabric Valance*','F2221').maximum).toBe(89);expect(rollerValancePieceLimit('6 Fabric Valance*','F1484').maximum).toBe(95);
  expect(rollerValancePieceLimit('6 Fabric Valance*','F0000').maximum).toBeNull();
 });
 it('removes blankethold forknowncommonmaterial butrequires sameexplicitoverride with mixedshade fabrics',()=>{
  const rows=lines();expect(deriveRollerCommonValances(rows)).toEqual([]);expect(rows[0].selection.configuration[RECORD]).toMatchObject({valanceFabricCode:'F0668',fabricRollWidth:78,maximumPieceWidth:71,minimumJointsAtMaterialWidth:1,materialWidthStatus:'exact_color_source_width'});
  const mixed=lines(['F0668','F1484']);expect(deriveRollerCommonValances(mixed).some(i=>i.ruleId.endsWith('material_width'))).toBe(true);
  for(const l of mixed)l.selection.configuration={...l.selection.configuration,[KEY]:{...emptyRollerCommon(),groupId:'G',position:l.lineId==='l0'?1:2,fabricCode:'F2170'}};
  expect(deriveRollerCommonValances(mixed)).toEqual([]);expect(mixed[0].selection.configuration[RECORD]).toMatchObject({valanceFabricCode:'F2170',maximumPieceWidth:87});
 });
 it('uses material maxacrosssixsections andtwosections forlimitedcontrols',()=>{
  const rows=lines(['F0668','F0668','F0668','F0668','F0668','F0668'],71);expect(deriveRollerCommonValances(rows)).toEqual([]);rows[0].selection.widthInches=71.001;expect(deriveRollerCommonValances(rows).some(i=>i.ruleId.endsWith('material_maximum'))).toBe(true);
  const two=lines();for(const [i,l] of two.entries())l.selection.configuration={...l.selection.configuration,lift_system:'Continuous Cord Loop',control_side:i?'Right':'Left'};
  expect(deriveRollerCommonValances(two)).toEqual([]);two[0].selection.widthInches=71.001;expect(deriveRollerCommonValances(two).some(i=>i.ruleId.endsWith('material_maximum'))).toBe(true);
 });
 it('reconstructs standaloneexactsections andrejectscustomsectionbeyondmateriallimit',()=>{
  const s:SelectionContext={...lines()[0].selection,productId:ROLLER_VALANCE_ONLY,programId:`${ROLLER_VALANCE_ONLY}_source`,catalogVersion:quoteV2CatalogVersionFor(ROLLER_VALANCE_ONLY,'2026-09-20'),widthInches:0,heightInches:0,configuration:{[ROLLER_VALANCE_KEY]:{...emptyRollerValance(),style:'6-inch Fabric Valance',width:142,mount:'Outside',returnLength:3,fabricCode:'F0668'}}};
  expect(validateRollerValance(s).map(i=>i.ruleId)).toEqual(['roller.valance_only.price_approval']);expect(s.configuration[ROLLER_VALANCE_DERIVED]).toMatchObject({maximumPieceWidth:71,pieceLengths:[71,71],fabricWidth:78,fabricWidthSourcePage:14});
  s.configuration={...s.configuration,[ROLLER_VALANCE_KEY]:{...emptyRollerValance(),style:'6-inch Fabric Valance',width:142,mount:'Outside',returnLength:3,fabricCode:'F0668',joinery:'Keystone',keystoneShape:'Square',keystoneCount:1,layout:'Custom',locations:[70.999]}};
  expect(validateRollerValance(s).some(i=>i.ruleId.endsWith('piece_length'))).toBe(true);
 });
 it('keeps historicalr5recognized andretainsitsoldmaterialhold',()=>{
  const rows=lines();for(const l of rows)l.selection.catalogVersion=`${QUOTE_V2_ROLLER_PREVIEW_VERSION}-panel-2026-09-20-r5`;
  expect(isRecognizedQuoteV2Catalog('roller','2026-09-20',rows[0].selection.catalogVersion)).toBe(true);expect(deriveRollerCommonValances(rows).some(i=>i.ruleId.endsWith('material_width'))).toBe(true);
 });
});
