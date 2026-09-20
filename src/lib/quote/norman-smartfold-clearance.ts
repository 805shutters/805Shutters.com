export const SMARTFOLD_CLEARANCE_KEY="smartfold_clearance_v1";
export type SmartfoldClearance={version:1;mountingAreaHeight:number|null;mountingSpaceHeight:number|null};
export const emptySmartfoldClearance=():SmartfoldClearance=>({version:1,mountingAreaHeight:null,mountingSpaceHeight:null});
export function parseSmartfoldClearance(raw:unknown):SmartfoldClearance|null {
 if(!raw||typeof raw!=="object"||Array.isArray(raw))return null;const r=raw as Record<string,unknown>;
 const valid=(n:unknown)=>n===null||typeof n==="number"&&Number.isFinite(n)&&n>=0;
 return r.version===1&&valid(r.mountingAreaHeight)&&valid(r.mountingSpaceHeight)?{version:1,mountingAreaHeight:r.mountingAreaHeight as number|null,mountingSpaceHeight:r.mountingSpaceHeight as number|null}:null;
}
export type SmartfoldClearanceDraft={key:string;base:SmartfoldClearance;record:SmartfoldClearance;submitted:SmartfoldClearance|null};
const equal=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
export const newSmartfoldClearanceDraft=(key:string,record:SmartfoldClearance):SmartfoldClearanceDraft=>({key,base:record,record,submitted:null});
export const smartfoldClearanceDirty=(s:SmartfoldClearanceDraft)=>!equal(s.record,s.submitted??s.base);
export function syncSmartfoldClearanceDraft(s:SmartfoldClearanceDraft,key:string,incoming:SmartfoldClearance):SmartfoldClearanceDraft{
 if(s.key!==key||equal(s.record,incoming))return newSmartfoldClearanceDraft(key,incoming);
 if(s.submitted&&equal(s.submitted,incoming))return {...s,base:incoming,submitted:null};
 return s.submitted||!equal(s.base,s.record)?s:newSmartfoldClearanceDraft(key,incoming);
}
