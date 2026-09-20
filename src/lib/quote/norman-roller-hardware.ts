export const ROLLER_HARDWARE_KEY="roller_hardware_v1";
export const ROLLER_INSTALLATIONS=["Top Mount","Back / Wall Mount","Side Mount"] as const;
export type RollerHardwareChoice={version:1;installation:""|typeof ROLLER_INSTALLATIONS[number];shimLayers:number;raceway:boolean};
export const emptyRollerHardware=():RollerHardwareChoice=>({version:1,installation:"",shimLayers:0,raceway:false});
export function parseRollerHardware(raw:unknown):RollerHardwareChoice|null {
 if(!raw||typeof raw!=="object"||Array.isArray(raw))return null;
 const r=raw as Record<string,unknown>;
 return r.version===1&&["",...ROLLER_INSTALLATIONS].includes(String(r.installation))&&Number.isSafeInteger(r.shimLayers)&&Number(r.shimLayers)>=0&&Number(r.shimLayers)<=3&&typeof r.raceway==="boolean"?{version:1,installation:r.installation as RollerHardwareChoice["installation"],shimLayers:r.shimLayers as number,raceway:r.raceway}:null;
}
export type RollerHardwareDraft={key:string;base:RollerHardwareChoice;record:RollerHardwareChoice;submitted:RollerHardwareChoice|null};
const equal=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
export const newRollerHardwareDraft=(key:string,record:RollerHardwareChoice):RollerHardwareDraft=>({key,base:record,record,submitted:null});
export const rollerHardwareDirty=(s:RollerHardwareDraft)=>!equal(s.record,s.submitted??s.base);
export function syncRollerHardwareDraft(s:RollerHardwareDraft,key:string,incoming:RollerHardwareChoice):RollerHardwareDraft {
 if(s.key!==key||equal(s.record,incoming))return newRollerHardwareDraft(key,incoming);
 if(s.submitted&&equal(s.submitted,incoming))return {...s,base:incoming,submitted:null};
 return s.submitted||!equal(s.base,s.record)?s:newRollerHardwareDraft(key,incoming);
}
