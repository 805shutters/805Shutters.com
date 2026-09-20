import type { RomanAncillaryRecord } from './norman-roman-ancillary';
export type AncillaryDraft = {key:string;base:RomanAncillaryRecord;record:RomanAncillaryRecord;submitted:RomanAncillaryRecord|null};
const equal=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
export const newAncillaryDraft=(key:string,record:RomanAncillaryRecord):AncillaryDraft=>({key,base:record,record,submitted:null});
export function syncAncillaryDraft(s:AncillaryDraft,key:string,incoming:RomanAncillaryRecord):AncillaryDraft {
  if(s.key!==key||equal(s.record,incoming))return newAncillaryDraft(key,incoming);
  if(s.submitted&&equal(s.submitted,incoming))return {...s,base:incoming,submitted:null};
  if(s.submitted||!equal(s.base,s.record))return s;
  return newAncillaryDraft(key,incoming);
}
export const ancillaryDraftDirty=(s:AncillaryDraft)=>!equal(s.record,s.submitted??s.base);
