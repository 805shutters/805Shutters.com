import { describe,it,expect } from 'vitest';
import { createNormanPanelDraft,editNormanPanelDraft,syncNormanPanelDraft,submitNormanPanelDraft,hasUnsavedNormanPanelDraft } from './norman-shutter-panel-draft';
import { parseNormanPanelRecord,type NormanShutterPanelRecord } from './norman-shutter-panels';
const blank:NormanShutterPanelRecord={version:1,application:'',motor:'',existingDoorGlassOrSidelight:false,panels:[{heightInches:null,divider:''},{heightInches:null,divider:''}]};
describe('atomic Norman finished-panel draft',()=>{
 it('retains six rapid edits and emits one complete saved/reopened record',()=>{
  let state=createNormanPanelDraft('plus',blank);
  state=editNormanPanelDraft(state,{application:'regular'});
  state=editNormanPanelDraft(state,{motor:'none'});
  state=editNormanPanelDraft(state,{panels:state.draft.panels.map((p,i)=>i===0?{...p,heightInches:58}:p)});
  state=syncNormanPanelDraft(state,'plus',blank);
  state=editNormanPanelDraft(state,{panels:state.draft.panels.map((p,i)=>i===1?{...p,heightInches:58}:p)});
  state=editNormanPanelDraft(state,{panels:state.draft.panels.map((p,i)=>i===0?{...p,divider:'none'}:p)});
  state=editNormanPanelDraft(state,{panels:state.draft.panels.map((p,i)=>i===1?{...p,divider:'none'}:p)});
  expect(hasUnsavedNormanPanelDraft(state)).toBe(true);
  const writes:NormanShutterPanelRecord[]=[];
  writes.push(state.draft);state=submitNormanPanelDraft(state);
  state=syncNormanPanelDraft(state,'plus',blank);
  expect(writes).toHaveLength(1);
  const reopened=parseNormanPanelRecord(JSON.parse(JSON.stringify(writes[0])))!;
  expect(reopened).toEqual({...blank,application:'regular',motor:'none',panels:[{heightInches:58,divider:'none'},{heightInches:58,divider:'none'}]});
  expect(syncNormanPanelDraft(state,'plus',reopened)).toEqual(createNormanPanelDraft('plus',reopened));
 });
 it('keeps edits made after submit when the earlier acknowledgement arrives',()=>{
  let state=editNormanPanelDraft(createNormanPanelDraft('a',blank),{application:'regular'});
  state=submitNormanPanelDraft(state);const sent=state.submitted!;
  state=editNormanPanelDraft(state,{motor:'none'});
  state=syncNormanPanelDraft(state,'a',sent);
  expect(state.draft.motor).toBe('none');expect(hasUnsavedNormanPanelDraft(state)).toBe(true);
  expect(state.base).toEqual(sent);
 });
 it('loads a new design identity and accepts fresh saved props only when clean',()=>{
  const initial=createNormanPanelDraft('a',blank),saved={...blank,motor:'none' as const};
  expect(syncNormanPanelDraft(initial,'a',saved).draft).toEqual(saved);
  expect(syncNormanPanelDraft(editNormanPanelDraft(initial,{application:'regular'}),'b',saved)).toEqual(createNormanPanelDraft('b',saved));
 });
});
