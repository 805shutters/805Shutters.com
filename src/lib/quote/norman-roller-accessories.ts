export const ROLLER_ACCESSORY_KEY='roller_accessories_v1';
export const ROLLER_ACCESSORY_DERIVED='roller_accessory_source_v1';
export const ROLLER_MAGNET_COLORS=['Nickel-Plated','Pure White','Silk White','Bisque','Pearl','Bright Brass','Antique Brass','Black','Crisp Linen','String','Sea Mist','Stone Gray','Brown Gray','Taupe Gray'] as const;
export type RollerAccessories={version:1;holdDown:'None'|'Traditional'|'Magnetic';magnetColor:string;leftClearance:number|null;rightClearance:number|null;bottomClearance:number|null};
export const emptyRollerAccessories=():RollerAccessories=>({version:1,holdDown:'None',magnetColor:'Nickel-Plated',leftClearance:null,rightClearance:null,bottomClearance:null});
export function parseRollerAccessories(raw:unknown):RollerAccessories|null{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;
 const r=raw as Record<string,unknown>;
 if(r.version!==1||!['None','Traditional','Magnetic'].includes(String(r.holdDown))||!ROLLER_MAGNET_COLORS.includes(r.magnetColor as typeof ROLLER_MAGNET_COLORS[number])||![r.leftClearance,r.rightClearance,r.bottomClearance].every(v=>v===null||typeof v==='number'&&Number.isFinite(v)))return null;
 return {version:1,holdDown:r.holdDown as RollerAccessories['holdDown'],magnetColor:r.magnetColor as string,leftClearance:r.leftClearance as number|null,rightClearance:r.rightClearance as number|null,bottomClearance:r.bottomClearance as number|null};
}
export type RollerAccessoryDraft={key:string;base:RollerAccessories;record:RollerAccessories;submitted:RollerAccessories|null};
const equal=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
export const newRollerAccessoryDraft=(key:string,record:RollerAccessories):RollerAccessoryDraft=>({key,base:record,record,submitted:null});
export const rollerAccessoryDirty=(s:RollerAccessoryDraft)=>!equal(s.record,s.submitted??s.base);
export function syncRollerAccessoryDraft(s:RollerAccessoryDraft,key:string,incoming:RollerAccessories):RollerAccessoryDraft{
 if(s.key!==key||equal(s.record,incoming))return newRollerAccessoryDraft(key,incoming);
 if(s.submitted&&equal(s.submitted,incoming))return {...s,base:incoming,submitted:null};
 return s.submitted||!equal(s.base,s.record)?s:newRollerAccessoryDraft(key,incoming);
}
