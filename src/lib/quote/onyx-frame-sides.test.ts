import { describe,it,expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { onyxPortalFrameSides,onyxCanonicalFrameSides,ONYX_FRAME_SIDE_SOURCE } from './onyx-current-assortment';
import { validateOnyxCurrentAssortment } from '../quote-v2/onyx-current-assortment';
import { selectionContextFromExactInterface } from '../quote-v2/exact-interface-adapter';
import { getSourceManifestEntry } from '../quote-v2/source-manifest';
import type { SalesQuoteLineItem } from '@mts/types/quote';
const line={id:'audit',quote_id:'audit',room_name:'Audit',product_type:'Shutters',width_whole:30,width_fraction:'0',height_whole:60,height_fraction:'0',quantity:1,sort_order:0,created_at:'2026-09-20T00:00:00Z'} satisfies SalesQuoteLineItem;
const selection=(choice:string,programId='onyx_us_made_vinyl')=>selectionContextFromExactInterface(line,{supplier:'Onyx',material:programId==='onyx_us_made_vinyl'?'Onyx US Made Vinyl':'Painted Basswood',options_json:{size_type:'W - Window Size',frame_sides:choice}},{productId:'onyx_shutters',programId,catalogAsOf:'2026-09-20'});
describe('Onyx current frame-side constructions',()=>{
 it('pins the observed menu and distinguishes US-made options',()=>{
  expect(createHash('sha256').update(readFileSync(new URL('./onyx-frame-sides-20260920.json',import.meta.url))).digest('hex')).toBe(getSourceManifestEntry(ONYX_FRAME_SIDE_SOURCE).sha256);
  expect(onyxPortalFrameSides('onyx_us_made_vinyl')?.map(c=>c.value)).toEqual(['4','3SP_B','3SP_T','3SP_R','3SP_L']);
  expect(onyxPortalFrameSides('painted_basswood')).toHaveLength(8);
 });
 it('preserves every exact construction through saved JSON without treating special sides as plain three',()=>{
  for(const programId of ['painted_basswood','stained_basswood','secamore','vinyl','vlo_hybrid','onyx_us_made_vinyl']){
   for(const choice of onyxPortalFrameSides(programId)!){
    const s=JSON.parse(JSON.stringify(selection(choice.label,programId)));
    expect(s.configuration.frame_sides_source_code).toBe(choice.value);
    const frameIssues=validateOnyxCurrentAssortment(s).filter(i=>i.ruleId.includes('frame_sides'));
    if(['3','4'].includes(choice.value)){
     expect(s.configuration.frame_sides).toBe(Number(choice.value));expect(frameIssues).toEqual([]);
    }else{
     expect(s.configuration.frame_sides).toBeUndefined();
     expect(frameIssues.map(i=>i.ruleId)).toEqual(['onyx.current_assortment.frame_sides_pricing']);
    }
   }
  }
 });
 it('blocks unsupported US-made or forged codes and retains historical numeric aliases',()=>{
  for(const value of ['2','3','3FC','3SP_X','forged'])expect(validateOnyxCurrentAssortment(selection(value)).map(i=>i.ruleId)).toContain('onyx.current_assortment.frame_sides');
  expect(onyxCanonicalFrameSides('4-sided')).toBe('4');
  expect(onyxCanonicalFrameSides('three')).toBe('3');
  expect(selection('4-sided').configuration.frame_sides).toBe(4);
  expect(validateOnyxCurrentAssortment({...selection('3'),catalogAsOf:'2026-09-19'})).toEqual([]);
 });
});
