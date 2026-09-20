import type { NormanShutterPanelRecord } from './norman-shutter-panels';

export type NormanPanelDraft = { key:string; base:NormanShutterPanelRecord; draft:NormanShutterPanelRecord; submitted:NormanShutterPanelRecord|null };
const equal=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
export const createNormanPanelDraft=(key:string,record:NormanShutterPanelRecord):NormanPanelDraft=>({key,base:record,draft:record,submitted:null});
export function syncNormanPanelDraft(state:NormanPanelDraft,key:string,incoming:NormanShutterPanelRecord):NormanPanelDraft {
  if(state.key!==key)return createNormanPanelDraft(key,incoming);
  if(equal(incoming,state.draft))return createNormanPanelDraft(key,state.draft);
  if(state.submitted&&equal(incoming,state.submitted))return {...state,base:incoming,submitted:null};
  // The save queue can emit older server props after later local edits.
  if(state.submitted||!equal(state.base,state.draft))return state;
  return createNormanPanelDraft(key,incoming);
}
export function editNormanPanelDraft(state:NormanPanelDraft,patch:Partial<NormanShutterPanelRecord>):NormanPanelDraft {
  return {...state,draft:{...state.draft,...patch}};
}
export function submitNormanPanelDraft(state:NormanPanelDraft):NormanPanelDraft {
  return {...state,submitted:state.draft};
}
export const hasUnsavedNormanPanelDraft=(state:NormanPanelDraft)=>!equal(state.draft,state.submitted??state.base);
