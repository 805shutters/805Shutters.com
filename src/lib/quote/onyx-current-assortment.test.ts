import { describe,it,expect } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { onyxPortalAssortment, onyxPortalColors, onyxPortalTiltLabels } from './onyx-current-assortment';
import { validateOnyxCurrentAssortment } from '../quote-v2/onyx-current-assortment';
import { getSourceManifestEntry } from '../quote-v2/source-manifest';
import type { SelectionContext } from '../quote-v2/core';
import evidence from './onyx-portal-20260920.json';
const context=(configuration: SelectionContext['configuration'],programId='onyx_us_made_vinyl'):SelectionContext=>({manufacturerId:'onyx',productId:'onyx_shutters',programId,catalogVersion:'current',catalogAsOf:'2026-09-20',widthInches:30,heightInches:60,quantity:1,configuration,options:{}});
describe('Onyx observed dealer assortment',()=>{
 it('pins the source bytes and all six material records',()=>{
  const bytes=readFileSync(new URL('./onyx-portal-20260920.json',import.meta.url));
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(getSourceManifestEntry('onyx-portal-assortment-2026-09-20').sha256);
  expect(evidence.materials).toHaveLength(6);
 });
 it('routes legacy saved identities without renaming their IDs',()=>{
  expect(onyxPortalAssortment('Secamore')?.material).toBe('Sycamore');
  expect(onyxPortalAssortment('MDF Hybrid')?.material).toBe('VLO');
  expect(onyxPortalAssortment('Poly Composite')).toBeNull();
  expect(onyxPortalAssortment('vinyl','2026-09-19')).toBeNull();
 });
 it('does not leak imported Vinyl colors or louvers into the US-made program',()=>{
  expect(onyxPortalColors('Onyx US Made Vinyl')).toEqual(['100_Pure White','101_White']);
  expect(onyxPortalAssortment('onyx_us_made_vinyl')?.louverSizes).toEqual([3.5]);
  expect(onyxPortalTiltLabels('onyx_us_made_vinyl')).toEqual(['H2 - Hidden Tiltrod Notch On Louver']);
  const issues=validateOnyxCurrentAssortment(context({color_name:'Snow',louver_size_inches:4.5,frame_type:'VZ Large',tilt_type:'H3 - Hidden Tiltrod In Stile',hinge_color:'Black'}));
  expect(issues.map(i=>i.ruleId)).toEqual(['onyx.current_assortment.color','onyx.current_assortment.louver','onyx.current_assortment.frame','onyx.current_assortment.tilt','onyx.current_assortment.hinge']);
 });
 it('preserves an exact current valid selection after JSON save and reopen',()=>{
  const current=context({color_name:'White',louver_size_inches:3.5,frame_type:'VL Outside',tilt_type:'H2 - Hidden Tiltrod Notch On Louver',hinge_color:'White'});
  expect(validateOnyxCurrentAssortment(JSON.parse(JSON.stringify(current)))).toEqual([]);
  expect(validateOnyxCurrentAssortment({...current,catalogAsOf:'2026-09-19',configuration:{louver_size_inches:2.5}})).toEqual([]);
 });
 it('separates painted and stained Bassia codes and VLO restrictions',()=>{
  expect(onyxPortalColors('painted_basswood')).toContain('150_Onyx Black');
  expect(onyxPortalColors('painted_basswood')).not.toContain('215_Java');
  expect(onyxPortalColors('stained_basswood')).toContain('215_Java');
  expect(onyxPortalColors('vlo_hybrid')).not.toContain('120_Butter');
  expect(onyxPortalAssortment('vlo_hybrid')?.frames).toContain('Z Lite');
 });
 it('reconciles six dealer observations using rounded frame area without changing retail',()=>{
  for(const fixture of evidence.priceFixtures){
   const area=Math.round((fixture.width+3.5)*(fixture.height+3.5)/144*1000)/1000;
   expect(area).toBe(fixture.billableSqft);
   expect(Math.round(area*fixture.dealerRate*1000)/1000).toBe(fixture.portalLinePrice);
  }
 });
});
