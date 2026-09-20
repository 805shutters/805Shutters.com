export const SMARTFOLD_CHARGING_KEY = "smartfold_charging_v1";
export type SmartfoldCharging = {version:1;extraChargingKits:number;extensionCables:number;extensionColor:""|"White"|"Black"};
export const emptySmartfoldCharging = ():SmartfoldCharging => ({version:1,extraChargingKits:0,extensionCables:0,extensionColor:""});
export function parseSmartfoldCharging(raw:unknown):SmartfoldCharging|null {
  if(!raw || typeof raw!=="object" || Array.isArray(raw))return null;
  const r=raw as Record<string,unknown>;
  if(r.version!==1 || !Number.isSafeInteger(r.extraChargingKits) || !Number.isSafeInteger(r.extensionCables) || Number(r.extraChargingKits)<0 || Number(r.extensionCables)<0 || !["","White","Black"].includes(String(r.extensionColor)))return null;
  return {version:1,extraChargingKits:r.extraChargingKits as number,extensionCables:r.extensionCables as number,extensionColor:r.extensionColor as SmartfoldCharging["extensionColor"]};
}
const equal=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
export type ChargingDraft={key:string;base:SmartfoldCharging;record:SmartfoldCharging;submitted:SmartfoldCharging|null};
export const newChargingDraft=(key:string,record:SmartfoldCharging):ChargingDraft=>({key,base:record,record,submitted:null});
export const chargingDraftDirty=(s:ChargingDraft)=>!equal(s.record,s.submitted??s.base);
export function syncChargingDraft(s:ChargingDraft,key:string,incoming:SmartfoldCharging):ChargingDraft {
  if(s.key!==key||equal(s.record,incoming))return newChargingDraft(key,incoming);
  if(s.submitted&&equal(s.submitted,incoming))return {...s,base:incoming,submitted:null};
  return s.submitted||!equal(s.base,s.record)?s:newChargingDraft(key,incoming);
}
