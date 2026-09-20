import { describe,it,expect } from 'vitest';
import { normanBlindClips,normanBlindScrews,ultimateFauxLadders } from '../quote/norman-blind-hardware';
import { woodWandChoices,woodWandDrop } from '../quote/norman-wood';
import { woodComponents } from './norman-wood';
import { ultimateFauxComponents } from './norman-ultimate-faux';
import { quoteV2CatalogVersionFor } from './catalog';
import { deriveNormanOrderRecords } from './norman-assemblies';
import type { SelectionContext } from './core';

const blind=(wood:boolean,width=37,height=60,patch:SelectionContext['configuration']={},asOf:SelectionContext['catalogAsOf']='2026-09-20'):SelectionContext=>({productId:wood?'wood_blinds':'faux_wood',manufacturerId:'norman',programId:'source-test',catalogVersion:quoteV2CatalogVersionFor(wood?'wood_blinds':'faux_wood',asOf),catalogAsOf:asOf,widthInches:width,heightInches:height,quantity:1,options:{},configuration:{mount_type:'Outside Mount',slat_size:'2"',fabric_color_code:wood?'ND001':'P001',finish_type:'Smooth',valance:wood?'Linear':'3-inch Linear',...patch}});
describe('Ultimate Wood/Faux source hardware followup',()=>{
 it.each([[37,2],[37.0625,3],[59.9375,3],[60,4],[96,4]])('uses net standard-blind clip boundary %s', (width,count)=>{
  expect(normanBlindClips(width,null,false).quantity).toBe(count);
  expect(woodComponents(blind(true,width))?.record.components[0].valance?.clips).toBe(count);
  expect(ultimateFauxComponents(blind(false,width))?.record.components[0].valance?.clipSchedule?.quantity).toBe(count);
 });
 it('uses custom finished width for custom valance clips, rather than blind width',()=>{
  expect(woodComponents(blind(true,36,60,{wood_valance_width_inches:40}))?.record.components[0].valance).toMatchObject({clips:3,clipSchedule:{basis:'custom_or_common_valance_width',basisInches:40}});
  expect(ultimateFauxComponents(blind(false,36,60,{ultimate_valance_width_inches:40}))?.record.components[0].valance?.clipSchedule).toMatchObject({quantity:3,basisInches:40});
 });
 it('retains uncertainty in long-valance clips rather than inventing rounding',()=>{
  expect(normanBlindClips(96,96.0625,true)).toMatchObject({quantity:null,minimum:5,maximum:17,requiresFactoryConfirmation:true});
  expect(normanBlindClips(96,96.0625,false)).toMatchObject({quantity:null,minimum:4,maximum:null,requiresFactoryConfirmation:true});
 });
 it('records side support bolts even when top support is also required above37 inches',()=>{
  const config={mount_type:'Inside Mount',mount_depth_inches:4.125,wood_mount_fit:'Fully Recessed',ultimate_mount_fit:'Fully Recessed',side_mount_bracket:'Yes',ultimate_side_mount:'Yes',wood_bracket_installation:'Top Support',ultimate_bracket_installation:'Top Support'};
  expect(woodComponents(blind(true,48,60,config))?.record.components[0]).toMatchObject({sideSupport:true,topSupport:true,screws:{sideNutBolt:4,mounting:8}});
  expect(ultimateFauxComponents(blind(false,48,60,config))?.record.components[0]).toMatchObject({sideSupport:true,topSupport:true,screws:{sideNutBolt:4,mounting:8}});
  expect(normanBlindScrews(2,false,0,false)).toEqual({mounting:4,mountingLength:1.25,holdDown:0,holdDownLength:.75,sideNutBolt:0});
 });
 it('uses longer mounting screws with shims and one screw per optional hold-down',()=>{
  expect(ultimateFauxComponents(blind(false,48,60,{ultimate_shim_layers:2,ultimate_hold_down:'Yes'}))?.record.components[0]).toMatchObject({brackets:4,shims:8,holdDowns:2,screws:{mounting:8,mountingLength:2,holdDown:2,holdDownLength:.75}});
 });
 it.each([[24,2,4],[24.0625,3,4],[37,3,4],[37.0625,4,4],[50,4,4],[50.0625,5,8],[63,5,8],[63.0625,6,8],[76,6,8],[76.0625,7,8],[89,7,8],[89.0625,8,8],[96,8,8]])('keeps nominal faux ladders and cord schedule at %s', (width,ladders,cords)=>{
  expect(ultimateFauxLadders(width)).toEqual({ladders,cords,ladderCountStatus:'guide_standard_may_vary_near_width_boundary'});
 });
 it('exposes the short Wood running-change wand only for its documented height, keeps it held, and leaves established defaults',()=>{
  expect(woodWandChoices(36)).toContain('11.75');expect(woodWandChoices(36.0625)).not.toContain('11.75');
  expect(woodWandChoices(36,'2026-09-19')).not.toContain('11.75');expect(woodWandDrop(36)).toBe(17.75);
  const short=woodComponents(blind(true,36,36,{wood_wand_drop:11.75}))!;
  expect(short.issues.map(i=>i.ruleId)).toContain('norman.wood_blinds.wand_running_change');
  expect(short.issues.map(i=>i.ruleId)).not.toContain('norman.wood_blinds.wand_drop');
  expect(woodComponents(blind(true,36,36.0625,{wood_wand_drop:11.75}))!.issues.map(i=>i.ruleId)).toContain('norman.wood_blinds.wand_drop');
 });
 it('preserves previous dated records and versions, with fresh records surviving serialization',()=>{
  const old=woodComponents(blind(true,37,60,{},'2026-09-19'))!.record.components[0];
  expect(old.valance?.clips).toBe(3);expect(old.valance).not.toHaveProperty('clipSchedule');
  expect(ultimateFauxComponents(blind(false,37,60,{},'2026-09-19'))!.record.components[0]).not.toHaveProperty('screws');
  for(const wood of [true,false]){
   const s=blind(wood);deriveNormanOrderRecords([{lineId:'hardware-proof',selection:s}]);
   expect(JSON.parse(JSON.stringify(s))).toEqual(s);
   expect(s.configuration.norman_assembly_v1).toMatchObject({components:[{valance:{clipSchedule:{quantity:2}}}]});
   expect(s.catalogVersion).not.toBe(quoteV2CatalogVersionFor(s.productId,'2026-09-19'));
  }
 });
});
