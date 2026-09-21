import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,it,expect} from 'vitest';
import {ONYX_BASELINE_SOURCE,ONYX_BASELINE_KEY as KEY,onyxBaselineProfiles,onyxBaselineControl,onyxBaselineFields,newOnyxBaselineDraft,syncOnyxBaselineDraft,onyxBaselineDirty,type OnyxBaselineRecord} from './onyx-baseline-options';
import {onyxHeldColors} from './onyx-held-catalog';
import {getSourceManifestEntry} from '../quote-v2/source-manifest';
import {selectionContextFromExactInterface} from '../quote-v2/exact-interface-adapter';
import {validateOnyxHeldSelection} from '../quote-v2/onyx-held-rules';
import {priceQuoteV2Selection} from '../quote-v2/engine';
import {OnyxHeldDesignOptions} from '@/components/crm/OnyxHeldDesignOptions';
import type {SalesQuoteDesign,SalesQuoteLineItem} from '@mts/types/quote';
const fixture=(index:number)=>{
 const p=onyxBaselineProfiles[index],color=onyxHeldColors.find(c=>c.productId===p.productId&&c.colorCode===p.color)!;
 const line={id:'baseline',quote_id:'internal',room_name:'Internal verification',product_type:'Roller Shades',width_whole:30,width_fraction:'0',height_whole:60,height_fraction:'0',quantity:1,sort_order:0,created_at:'2026-09-20'} as SalesQuoteLineItem;
 const record:OnyxBaselineRecord={version:1,profileId:p.id,selections:{}};
 const design={id:'baseline-A',supplier:'Onyx',mount_type:'Inside Mount',lift_system:onyxBaselineControl(p),options_json:{quote_v2_backend:true,catalog_product_id:p.productId,catalog_program_id:color.programId,control_side:'Right',fabric_color_id:color.id,fabric_color_code:color.colorCode,fabric_color_name:color.colorName,fabric_color_collection:color.collection,[KEY]:record}} as unknown as SalesQuoteDesign;
 const context=()=>selectionContextFromExactInterface(line,JSON.parse(JSON.stringify(design)),{productId:p.productId,programId:color.programId!,catalogAsOf:'2026-09-20'});
 return {p,color,line,design,record,context};
};
const ids=(s:ReturnType<ReturnType<typeof fixture>['context']>)=>validateOnyxHeldSelection(s).map(i=>i.ruleId);
describe('Onyx observed baseline option profiles',()=>{
 it('pins six exact current profiles without changing dealer prices or effective-date uncertainty',()=>{
  expect(onyxBaselineProfiles.map(p=>p.draftLine)).toEqual([91828,91829,91830,91831,91832,91833]);
  expect(createHash('sha256').update(readFileSync(new URL('./onyx-baseline-options-20260920.json',import.meta.url))).digest('hex')).toBe(getSourceManifestEntry(ONYX_BASELINE_SOURCE).sha256);
  expect(getSourceManifestEntry(ONYX_BASELINE_SOURCE).effectiveDate).toBeNull();
  expect(onyxBaselineProfiles[1].menus.bottomColor).toEqual(['Silver']);
  expect(onyxBaselineProfiles[1].menus.fabricWrappedBottom).toBe(false);
  expect(onyxBaselineProfiles[3].menus.valanceReturn).toContain('Custom');
 });
 it('round-trips every observed option through the real adapter while retaining price and customer holds',()=>{
  for(let i=0;i<6;i++){
   const f=fixture(i);
   for(const [key,choices] of onyxBaselineFields(f.p))for(const value of Array.isArray(choices)?choices:choices?[false,true]:[false]){
    f.record.selections={[key]:value};const s=f.context();
    expect(s.configuration[KEY]).toEqual(f.record);
    expect(ids(s)).toEqual(['onyx.current.price_grid_required']);
    expect(priceQuoteV2Selection({selection:s,priceInput:{productId:f.p.productId,programId:f.color.programId!,widthInches:30,heightInches:60}})).toMatchObject({ok:false,validationStatus:'blocked',pricedSelectionFingerprint:null});
   }
  }
 });
 it('does not extrapolate a baseline menu to a different fabric, control, size, mount, side or quantity',()=>{
  const f=fixture(0),s=f.context();
  for(const patch of [{widthInches:30.0625},{heightInches:61},{quantity:2},{programId:'unknown'}])expect(ids({...s,...patch})).toContain('onyx.current.baseline_options');
  for(const patch of [{fabric_color_code:'another'},{lift_system:'Cordless'},{mount_type:'Outside Mount'},{control_side:'Left'}] as Record<string,string>[])expect(ids({...s,configuration:{...s.configuration,...patch}})).toContain('onyx.current.baseline_options');
  const wrongRecord=[{...f.record,profileId:'other'},{...f.record,selections:{cassette:'invented'}},{...f.record,selections:{unobservedField:'yes'}},{...f.record,selections:{cassette:123}},'malformed'];
  for(const raw of wrongRecord)expect(ids({...s,configuration:{...s.configuration,[KEY]:raw}})).toContain('onyx.current.baseline_options');
  const sunscreen=fixture(1);sunscreen.record.selections={fabricWrappedBottom:true};expect(ids(sunscreen.context())).toContain('onyx.current.baseline_options');
 });
 it('renders exact menus only for the observed saved profile and keeps changed configurations explicitly held',()=>{
  for(let i=0;i<6;i++){
   const f=fixture(i),html=renderToStaticMarkup(createElement(OnyxHeldDesignOptions,{design:f.design,productId:f.p.productId,widthInches:30,heightInches:60,quantity:1,onUpdateFields:()=>{}}));
   expect(html).toContain('Save Onyx observed options');expect(html).toContain('held internal draft');
   for(const [,choices] of onyxBaselineFields(f.p))if(Array.isArray(choices))for(const value of choices)expect(html).toContain(value.replaceAll('&','&amp;'));
   const mismatch=renderToStaticMarkup(createElement(OnyxHeldDesignOptions,{design:f.design,productId:f.p.productId,widthInches:31,heightInches:60,quantity:1,onUpdateFields:()=>{}}));
   expect(mismatch).not.toContain('Save Onyx observed options');expect(mismatch).toContain('Clear unmatched Onyx option profile');
  }
 });
 it('preserves rapid edits in one atomic save and later changes against stale props',()=>{
  const f=fixture(0),empty={...f.record,selections:{}};let draft=newOnyxBaselineDraft('line',empty);
  draft={...draft,record:{...draft.record,selections:{cassette:'Square'}}};
  draft={...draft,record:{...draft.record,selections:{...draft.record.selections,bottomRail:'Flat',bottomColor:'White',fabricWrappedBottom:true}}};
  draft=syncOnyxBaselineDraft(draft,'line',empty);expect(onyxBaselineDirty(draft)).toBe(true);
  const saved=JSON.parse(JSON.stringify(draft.record));draft={...draft,submitted:draft.record};
  draft={...draft,record:{...draft.record,selections:{...draft.record.selections,cordColor:'Metal'}}};
  draft=syncOnyxBaselineDraft(draft,'line',saved);expect(draft.record.selections.cordColor).toBe('Metal');expect(onyxBaselineDirty(draft)).toBe(true);
  expect(saved.selections).toEqual({cassette:'Square',bottomRail:'Flat',bottomColor:'White',fabricWrappedBottom:true});
  draft={...draft,submitted:draft.record};draft=syncOnyxBaselineDraft(draft,'line',JSON.parse(JSON.stringify(draft.record)));expect(onyxBaselineDirty(draft)).toBe(false);
 });
});
