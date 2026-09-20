export const ROLLER_COMMON_CHOICE_KEY="roller_common_choice_v1";
export const ROLLER_COMMON_RECORD_KEY="roller_common_valance_v1";
export const ROLLER_RETURN_SIDES=["None","Left","Right","Both"] as const;
export type RollerCommonChoice={version:1;groupId:string;position:number;gapAfter:number;returns:typeof ROLLER_RETURN_SIDES[number];customWidth:number|null};
export const emptyRollerCommon=():RollerCommonChoice=>({version:1,groupId:"",position:1,gapAfter:0,returns:"None",customWidth:null});
export function parseRollerCommon(value:unknown):RollerCommonChoice|null {
 if(!value||typeof value!=="object"||Array.isArray(value))return null;const r=value as Record<string,unknown>;
 return r.version===1&&typeof r.groupId==="string"&&r.groupId.trim().length<=100&&Number.isInteger(r.position)&&Number(r.position)>=1&&Number(r.position)<=6&&typeof r.gapAfter==="number"&&Number.isFinite(r.gapAfter)&&r.gapAfter>=0&&r.gapAfter<=12&&ROLLER_RETURN_SIDES.includes(r.returns as typeof ROLLER_RETURN_SIDES[number])&&(r.customWidth===null||typeof r.customWidth==="number"&&Number.isFinite(r.customWidth)&&r.customWidth>0)?{version:1,groupId:r.groupId.trim(),position:r.position as number,gapAfter:r.gapAfter,returns:r.returns as RollerCommonChoice["returns"],customWidth:r.customWidth}:null;
}
export type RollerCommonDraft={key:string;base:RollerCommonChoice;record:RollerCommonChoice;submitted:RollerCommonChoice|null};
const equal=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
export const newRollerCommonDraft=(key:string,record:RollerCommonChoice):RollerCommonDraft=>({key,base:record,record,submitted:null});
export const rollerCommonDirty=(s:RollerCommonDraft)=>!equal(s.record,s.submitted??s.base);
export function syncRollerCommonDraft(s:RollerCommonDraft,key:string,incoming:RollerCommonChoice):RollerCommonDraft {
 if(s.key!==key||equal(s.record,incoming))return newRollerCommonDraft(key,incoming);
 if(s.submitted&&equal(s.submitted,incoming))return {...s,base:incoming,submitted:null};
 return s.submitted||!equal(s.base,s.record)?s:newRollerCommonDraft(key,incoming);
}
