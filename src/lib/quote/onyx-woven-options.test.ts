import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { onyxWovenOptions, ONYX_WOVEN_SOURCE, clearOnyxWovenDetails } from './onyx-woven-options';
import { validateOnyxHeldSelection } from '../quote-v2/onyx-held-rules';
import { getSourceManifestEntry } from '../quote-v2/source-manifest';
import { onyxHeldColors } from './onyx-held-catalog';
import type { SelectionContext } from '../quote-v2/core';
const selection=(programId:string):SelectionContext=>{
 const color=onyxHeldColors.find(row=>row.programId===programId)!;
 return {manufacturerId:'Onyx',productId:'onyx_woven',programId,catalogAsOf:'2026-09-20',catalogVersion:'current',widthInches:30,heightInches:60,quantity:1,configuration:{fabric_color_id:color.id,fabric_color_code:color.colorCode,fabric_color_collection:color.collection,fabric_color_name:color.colorName},options:{}};
};
const rules=(s:SelectionContext)=>validateOnyxHeldSelection(s).map(issue=>issue.ruleId);
describe('Onyx Woven current accessory identities',()=>{
 it('pins a separate source and keeps Premier and Select accessory lists distinct',()=>{
  expect(createHash('sha256').update(readFileSync(new URL('./onyx-woven-options-20260920.json',import.meta.url))).digest('hex')).toBe(getSourceManifestEntry(ONYX_WOVEN_SOURCE).sha256);
  expect(onyxWovenOptions.profiles.map(p=>[p.liners.length,p.bindings.length,p.controlsChecked.length])).toEqual([[6,4,5],[6,12,5]]);
 });
 it('round-trips every source accessory and retains the unresolved pricing hold',()=>{
  for(const profile of onyxWovenOptions.profiles){
   const s=selection(profile.programId);
   for(const [key,choices] of [['onyx_woven_liner_id',profile.liners],['onyx_woven_binding_id',profile.bindings],['onyx_woven_assembly',onyxWovenOptions.assemblies]] as const){
    for(const choice of choices){
     const saved=JSON.parse(JSON.stringify({...s,configuration:{...s.configuration,[key]:choice.id}}));
     expect(rules(saved)).toEqual(['onyx.current.price_grid_required']);
    }
   }
  }
 });
 it('rejects cross-collection accessory IDs and clears them when collection changes',()=>{
  const [premier,select]=onyxWovenOptions.profiles;
  for(const [own,other] of [[premier,select],[select,premier]]){
   const s=selection(own.programId);
   for(const patch of [{onyx_woven_liner_id:other.liners[0].id},{onyx_woven_binding_id:other.bindings[0].id},{onyx_woven_assembly:'forged'}] as Record<string,string>[]){
    expect(rules({...s,configuration:{...s.configuration,...patch}})).toContain('onyx.current.woven_accessory');
   }
  }
  expect(Object.values(clearOnyxWovenDetails()).every(v=>v===null)).toBe(true);
 });
 it('enforces the stated120-inch custom valance boundary without pricing any assembly',()=>{
  const s=selection(onyxWovenOptions.profiles[0].programId);
  for(const width of [0.0625,119.9375,120])expect(rules({...s,configuration:{...s.configuration,onyx_woven_custom_valance_inches:width}})).toEqual(['onyx.current.price_grid_required']);
  for(const width of [0,-1,120.0625,144,'not-a-width'])expect(rules({...s,configuration:{...s.configuration,onyx_woven_custom_valance_inches:width}})).toContain('onyx.current.woven_valance_size');
 });
});
