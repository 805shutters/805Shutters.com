import { describe,it,expect } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { onyxPortalAssortment, onyxPortalHingeColors, onyxPortalColors, onyxPortalTiltLabels } from './onyx-current-assortment';
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
 it('enforces the painted and stained split on server-saved configurations',()=>{
  for(const [programId,color] of [['painted_basswood','215_Java'],['stained_basswood','101_White']]) {
   expect(validateOnyxCurrentAssortment(context({color_name:color},programId)).map(i=>i.ruleId)).toContain('onyx.current_assortment.color');
  }
  expect(validateOnyxCurrentAssortment(context({color_name:'Java'},'stained_basswood'))).toEqual([]);
 });
 it('resolves binder frames with mount and holds ambiguous or unknown saved selections',()=>{
  expect(validateOnyxCurrentAssortment(context({frame_type:'Vinyl L Frame',mount_type:'outside',tilt_source_code:'H2 - Hidden Tiltrod Notch On Louver'}))).toEqual([]);
  for(const config of [{frame_type:'Vinyl Z Frame Large'},{frame_type:'Vinyl L Frame'},{frame_type:'Unknown Frame'}]) {
   expect(validateOnyxCurrentAssortment(context(config)).map(i=>i.ruleId)).toContain('onyx.current_assortment.frame');
  }
  for(const tilt of ['hidden','H4','H2-invalid','unknown']) {
   expect(validateOnyxCurrentAssortment(context({tilt_type:tilt})).map(i=>i.ruleId)).toContain('onyx.current_assortment.tilt');
  }
 });
 it('enforces exact applications for each material without expanding a historical generic selection',()=>{
  expect(validateOnyxCurrentAssortment(context({onyx_order_type:'French Door'}))).toEqual([]);
  expect(validateOnyxCurrentAssortment(context({order_type:'standard'}))).toEqual([]);
  for(const shape of ['ByPass-Close','ByPass-Open','Bi-Fold Tracking','Cafe']){
   expect(validateOnyxCurrentAssortment(context({onyx_order_type:shape})).map(i=>i.ruleId)).toContain('onyx.current_assortment.shape');
   expect(validateOnyxCurrentAssortment(context({onyx_order_type:shape},'vinyl'))).toEqual([]);
  }
  expect(validateOnyxCurrentAssortment(context({onyx_order_type:'French Door'},'vinyl')).map(i=>i.ruleId)).toContain('onyx.current_assortment.shape');
  expect(validateOnyxCurrentAssortment(context({onyx_order_type:'Barn Door'},'painted_basswood'))).toEqual([]);
  expect(validateOnyxCurrentAssortment(context({order_type:'bypass'},'painted_basswood')).map(i=>i.ruleId)).toContain('onyx.current_assortment.shape');
 });
 it('pins enabled imported hinges and rejects disabled or unsupported finishes',()=>{
  const bytes=readFileSync(new URL('./onyx-hinge-assortment-20260920.json',import.meta.url));
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(getSourceManifestEntry('onyx-hinge-assortment-2026-09-20').sha256);
  for(const program of ['painted_basswood','stained_basswood','secamore','vinyl','vlo_hybrid']){
   expect(onyxPortalHingeColors(program)).toEqual(['White','Cream','Antique Brass','Bright Brass','Nickle','Black']);
   for(const hinge of ['White','Cream','Antique Brass','Bright Brass','Nickle','Black','Nickel','Anti Brass','Bri Brass']) expect(validateOnyxCurrentAssortment(context({hinge_color:hinge},program))).toEqual([]);
   for(const hinge of ['Match','Paint to Match','ORB','forged']) expect(validateOnyxCurrentAssortment(context({hinge_color:hinge},program)).map(i=>i.ruleId)).toContain('onyx.current_assortment.hinge');
  }
 });
 it('accounts for every recorded choice in each existing current shutter program',()=>{
  for(const program of ['painted_basswood','stained_basswood','secamore','vinyl','vlo_hybrid','onyx_us_made_vinyl']){
   const row=onyxPortalAssortment(program)!;
   const choices: Array<[string,readonly (string|number)[]]> = [
    ['color_name',onyxPortalColors(program)!],['frame_type',row.frames],
    ['louver_size_inches',row.louverSizes],['tilt_source_code',row.tiltCodes],
    ['onyx_order_type',row.shapes],['hinge_color',onyxPortalHingeColors(program)!],
   ];
   for(const [field,values] of choices)for(const value of values){
    expect(validateOnyxCurrentAssortment(context({[field]:value},program)),`${program}: ${field}=${value}`).toEqual([]);
   }
  }
 });
 it('reconciles six dealer observations using rounded frame area without changing retail',()=>{
  for(const fixture of evidence.priceFixtures){
   const area=Math.round((fixture.width+3.5)*(fixture.height+3.5)/144*1000)/1000;
   expect(area).toBe(fixture.billableSqft);
   expect(Math.round(area*fixture.dealerRate*1000)/1000).toBe(fixture.portalLinePrice);
  }
 });
});
