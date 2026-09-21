import type {SelectionContext,SelectionRecord,ValidationIssue} from './core';
import {rollerBaseMotorUnitsForConfiguration,type RollerMotorizationContractResult} from './roller-motor-contract';
import {sourceProvenance} from './source-manifest';

export const SHARED_AUTOMATE_HUB_ID='shared_automate_hub_id';
export const PERFECTSHEER_HUB_ID='perfectsheer_shared_hub_id';
const norm=(v:unknown)=>String(v??'').trim().toLowerCase();
export const currentSharedAutomateHub=(s:SelectionContext)=>s.catalogAsOf>='2026-09-20'&&(['roller','roman','perfectsheer'].includes(s.productId)&&Boolean(String(s.configuration[SHARED_AUTOMATE_HUB_ID]??'').trim())||s.productId==='perfectsheer'&&s.catalogVersion.endsWith('-norman-perfectsheer-hubs-2026-09-20-r10'));
const idValue=(s:SelectionContext)=>s.configuration[SHARED_AUTOMATE_HUB_ID] || (s.productId==='perfectsheer'?s.configuration[PERFECTSHEER_HUB_ID]:null);
export function sharedAutomateMotorCount(s:SelectionContext):number|null {
 if(s.productId==='roller'){
  const c=s.configuration,count=rollerBaseMotorUnitsForConfiguration({application:c.roller_application,couplingArrangement:c.coupling_arrangement,componentCount:c.roller_coupling_count??c.coupled_shade_count??c.lightguard_360_shade_count});
  return count===null?null:count*(/dual/i.test(String(c.roller_application))?2:1)*s.quantity;
 }
 return s.quantity*(s.productId==='roman'&&/day night|common valance/.test(String(s.configuration.shade_type??'').toLowerCase().replace(/[^a-z0-9]+/g,' '))?2:1);
}
const active=(s:SelectionContext)=>/motor/i.test(String(s.configuration.lift_system))&&/automate/i.test(String(s.productId==='roller'?s.configuration.roller_power_configuration:s.configuration.motor_type))&&['true','yes','1'].includes(norm(s.configuration.hub_required));
export function sharedAutomateHub(s:SelectionContext):SelectionRecord|null {
 if(!currentSharedAutomateHub(s)||!active(s))return null;
 const a=s.configuration.norman_assembly_v1 as SelectionRecord|undefined;
 const r=a?.sharedHub as SelectionRecord|undefined;
 return r?.version===1&&r.hubId===norm(idValue(s))?r:null;
}
/** Explicit hub IDs join only the three Automate product families listed on Motor Guide p76. */
export function deriveSharedAutomateHubs(lines:readonly {lineId:string;selection:SelectionContext}[]):ValidationIssue[]{
 const groups=new Map<string,typeof lines[number][]>(),issues:ValidationIssue[]=[];
 const add=(row:typeof lines[number],id:string,explanation:string,values:SelectionRecord={})=>issues.push({severity:'hard_block',ruleId:`${row.selection.productId}.motorization.hub_${id}`,source:sourceProvenance('norman-motorization-guide-2026-09-16',{page:76}),selectedValues:{lineId:row.lineId,...values},explanation});
 for(const row of lines){
  const s=row.selection;if(!currentSharedAutomateHub(s))continue;
  const assembly={...(s.configuration.norman_assembly_v1 as SelectionRecord??{})};delete assembly.sharedHub;
  s.configuration={...s.configuration,norman_assembly_v1:assembly};
  const raw=idValue(s),id=norm(raw);
  if(!active(s)){if(id&&['true','yes','1'].includes(norm(s.configuration.hub_required)))add(row,'compatibility','A shared Automate hub identifier requires a compatible motorized Roller, Roman or PerfectSheer with Automate Home and Hub Required set to Yes.');continue;}
  if(typeof raw!=='string'||!id||id.length>80){add(row,'id','Enter a shared Automate hub identifier (1–80 characters) for every shade connected to this hub. Use another identifier for a separate physical hub.');continue;}
  groups.set(id,[...(groups.get(id)??[]),row]);
 }
 for(const [hubId,members]of groups){
  const connectedLineIds=members.map(m=>m.lineId).sort(),motors=members.reduce((n,m)=>n+(sharedAutomateMotorCount(m.selection)??0),0),owner=connectedLineIds[0];
  const valid=members.every(m=>Number.isSafeInteger(m.selection.quantity)&&m.selection.quantity>0&&Number(sharedAutomateMotorCount(m.selection))>0)&&motors<=30;
  for(const row of members){
   if(!valid)add(row,'capacity','One Automate Wi-Fi hub supports at most 30 motors. Split the connected shades between separately identified hubs.',{hubId,motorQuantity:motors,capacity:30});
   row.selection.configuration={...row.selection.configuration,norman_assembly_v1:{...(row.selection.configuration.norman_assembly_v1 as SelectionRecord),sharedHub:{version:1,family:'automate_home',networkScope:'explicit_hub_id',wifiBandGHz:2.4,hubId,ownerLineId:owner,connectedLineIds,connectedProducts:[...new Set(members.map(m=>m.selection.productId))].sort(),connectedMotorCounts:members.map(m=>({lineId:m.lineId,productId:m.selection.productId,motors:sharedAutomateMotorCount(m.selection)})),motorQuantity:motors,capacity:30,maximumAccounts:5,valid,chargeHub:valid&&row.lineId===owner,orderQuantity:1,fulfillmentQuantity:valid&&row.lineId===owner?1:0,color:'White',includedPower:'5V 1A charging box, charging cable and adapter',sourceId:'norman-motorization-guide-2026-09-16',sourcePage:76}}};
  }
 }
 return issues;
}

/** Rewrite only an explicitly shared Roller hub; all other selections retain existing billing. */
export function sharedAutomateRollerContract(s:SelectionContext,base:RollerMotorizationContractResult|null):RollerMotorizationContractResult|null {
 if(s.productId!=="roller"||!currentSharedAutomateHub(s))return base;
 const r=sharedAutomateHub(s),issues=[...(base?.issues??[])],selections=(base?.selections??[]).filter(c=>c.role!=="hub");
 if(!r||!r.valid)issues.push({severity:"hard_block",ruleId:"roller.motorization.hub_allocation",source:sourceProvenance("norman-motorization-guide-2026-09-16",{page:76}),selectedValues:{sharedHubId:idValue(s)??null},explanation:"Connect this Roller shade to an identified compatible Automate hub with at most 30 motors before pricing."});
 else if(r.chargeHub)selections.push({groupId:"automate_home",optionId:"hub",role:"hub",units:1,billingScope:"once_per_line"});
 return {source:base?.source??"canonical",selections,issues};
}
