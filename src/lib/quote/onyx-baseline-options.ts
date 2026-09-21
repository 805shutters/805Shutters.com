import evidence from './onyx-baseline-options-20260920.json';
import { onyxHeldColors } from './onyx-held-catalog';

export const ONYX_BASELINE_SOURCE = 'onyx-baseline-options-2026-09-20';
export const ONYX_BASELINE_KEY = 'onyx_baseline_options_v1';
export const onyxBaselineProfiles = evidence.profiles;
export type OnyxBaselineProfile = typeof onyxBaselineProfiles[number];
export type OnyxBaselineRecord = {version:1;profileId:string;selections:Record<string,string|boolean>};
export type OnyxBaselineContext = {productId:string;programId?:string|null;colorCode?:unknown;control?:unknown;mount?:unknown;controlSide?:unknown;width?:number|null;height?:number|null;quantity?:number|null};
export const onyxBaselineControl = (p:OnyxBaselineProfile) => p.control==='Cord'?'Continuous Cord':p.control;
export function onyxBaselineProfile(c:OnyxBaselineContext):OnyxBaselineProfile|undefined {
 return onyxBaselineProfiles.find(p=>p.productId===c.productId&&p.color===c.colorCode&&
  onyxHeldColors.some(color=>color.productId===p.productId&&color.programId===c.programId&&color.colorCode===p.color&&color.collection===p.pattern)&&
  c.control===onyxBaselineControl(p)&&c.mount==='Inside Mount'&&c.controlSide==='Right'&&c.width===p.context.width&&c.height===p.context.height&&c.quantity===p.context.quantity);
}
export const onyxBaselineFields=(p:OnyxBaselineProfile)=>Object.entries(p.menus).filter(([,v])=>v!==undefined) as [string,string[]|boolean][];
export const onyxBaselineLabels:Record<string,string>={cassette:'Cassette',cassetteColor:'Cassette color',cordColor:'Cord color',bottomRail:'Bottom rail',bottomColor:'Bottom rail color',fabricWrappedBottom:'Fabric-wrapped bottom rail',valance:'Valance',valanceColor:'Valance color',valanceReturn:'Valance return',clothTape:'Cloth tape',assembly:'Shade assembly',tileCut:'Tile cut',chain:'Chain',cordLength:'Cord length'};
export function parseOnyxBaselineRecord(raw:unknown):OnyxBaselineRecord|null {
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;const r=raw as Record<string,unknown>;
 if(r.version!==1||typeof r.profileId!=='string'||!r.selections||typeof r.selections!=='object'||Array.isArray(r.selections))return null;
 if(!Object.values(r.selections).every(v=>typeof v==='string'||typeof v==='boolean'))return null;
 return {version:1,profileId:r.profileId,selections:{...r.selections as Record<string,string|boolean>}};
}
export function onyxBaselineSelectionErrors(p:OnyxBaselineProfile,r:OnyxBaselineRecord):string[]{
 const fields=new Map(onyxBaselineFields(p));
 return Object.entries(r.selections).filter(([key,v])=>{
  const choices=fields.get(key);
  return choices===undefined||(Array.isArray(choices)?typeof v!=='string'||!choices.includes(v):typeof v!=='boolean'||(choices===false&&v));
 }).map(([key])=>key);
}
export type OnyxBaselineDraft={key:string;base:OnyxBaselineRecord;record:OnyxBaselineRecord;submitted:OnyxBaselineRecord|null};
const equal=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
export const newOnyxBaselineDraft=(key:string,record:OnyxBaselineRecord):OnyxBaselineDraft=>({key,base:record,record,submitted:null});
export const onyxBaselineDirty=(s:OnyxBaselineDraft)=>!equal(s.record,s.submitted??s.base);
export function syncOnyxBaselineDraft(s:OnyxBaselineDraft,key:string,incoming:OnyxBaselineRecord):OnyxBaselineDraft{
 if(s.key!==key||equal(s.record,incoming))return newOnyxBaselineDraft(key,incoming);
 if(s.submitted&&equal(s.submitted,incoming))return {...s,base:incoming,submitted:null};
 return s.submitted||!equal(s.base,s.record)?s:newOnyxBaselineDraft(key,incoming);
}
