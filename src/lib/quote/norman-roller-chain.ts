export const ROLLER_CHAIN_KEY='roller_chain_v1';
export const ROLLER_CHAIN_COLORS=['White','Cottage White','Black','Nature','Sahara','Terra','Silver','Chocolate'] as const;
export type RollerChain={version:1;material:'Plastic'|'Stainless Steel';color:string;lengthMode:'Default'|'Custom';customLength:number|null;unobstructedBelow:boolean;deviceClearance:number|null;safetyDeviceConfirmed:boolean};
export const emptyRollerChain=():RollerChain=>({version:1,material:'Plastic',color:'White',lengthMode:'Default',customLength:null,unobstructedBelow:false,deviceClearance:null,safetyDeviceConfirmed:false});
export function parseRollerChain(raw:unknown):RollerChain|null{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;
 const r=raw as Record<string,unknown>;
 if(r.version!==1||!['Plastic','Stainless Steel'].includes(String(r.material))||!ROLLER_CHAIN_COLORS.includes(r.color as typeof ROLLER_CHAIN_COLORS[number])||!['Default','Custom'].includes(String(r.lengthMode))||typeof r.unobstructedBelow!=='boolean'||typeof r.safetyDeviceConfirmed!=='boolean'||![r.customLength,r.deviceClearance].every(v=>v===null||typeof v==='number'&&Number.isFinite(v)))return null;
 return {version:1,material:r.material as RollerChain['material'],color:r.color as string,lengthMode:r.lengthMode as RollerChain['lengthMode'],customLength:r.customLength as number|null,unobstructedBelow:r.unobstructedBelow,deviceClearance:r.deviceClearance as number|null,safetyDeviceConfirmed:r.safetyDeviceConfirmed};
}
export type RollerChainDraft={key:string;base:RollerChain;record:RollerChain;submitted:RollerChain|null};
const equal=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
export const newRollerChainDraft=(key:string,record:RollerChain):RollerChainDraft=>({key,base:record,record,submitted:null});
export const rollerChainDirty=(s:RollerChainDraft)=>!equal(s.record,s.submitted??s.base);
export function syncRollerChainDraft(s:RollerChainDraft,key:string,incoming:RollerChain):RollerChainDraft{
 if(s.key!==key||equal(s.record,incoming))return newRollerChainDraft(key,incoming);
 if(s.submitted&&equal(s.submitted,incoming))return {...s,base:incoming,submitted:null};
 return s.submitted||!equal(s.base,s.record)?s:newRollerChainDraft(key,incoming);
}
