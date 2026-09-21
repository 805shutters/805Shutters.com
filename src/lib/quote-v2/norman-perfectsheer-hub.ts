import type {SelectionContext,SelectionRecord,ValidationIssue} from './core';
import {sourceProvenance} from './source-manifest';

export const PERFECTSHEER_HUB_ID='perfectsheer_shared_hub_id';
const norm=(v:unknown)=>String(v??'').trim().toLowerCase();
export const currentPerfectsheerHub=(s:SelectionContext)=>s.productId==='perfectsheer'&&s.catalogAsOf>='2026-09-20'&&s.catalogVersion.endsWith('-norman-perfectsheer-hubs-2026-09-20-r10');
const active=(s:SelectionContext)=>/motor/i.test(String(s.configuration.lift_system))&&/automate/i.test(String(s.configuration.motor_type))&&['true','yes','1'].includes(norm(s.configuration.hub_required));
export function perfectsheerHub(s:SelectionContext):SelectionRecord|null {
 if(!currentPerfectsheerHub(s)||!active(s))return null;
 const a=s.configuration.norman_assembly_v1 as SelectionRecord|undefined;
 const r=a?.sharedHub as SelectionRecord|undefined;
 return r?.version===1&&r.hubId===norm(s.configuration[PERFECTSHEER_HUB_ID])?r:null;
}
/** Explicit PerfectSheer Automate membership only; never infer other-product sharing. */
export function derivePerfectsheerHubs(lines:readonly {lineId:string;selection:SelectionContext}[]):ValidationIssue[]{
 const groups=new Map<string,typeof lines[number][]>(),issues:ValidationIssue[]=[];
 const add=(row:typeof lines[number],id:string,explanation:string,values:SelectionRecord={})=>issues.push({severity:'hard_block',ruleId:`perfectsheer.motorization.hub_${id}`,source:sourceProvenance('norman-motorization-guide-2026-09-16',{page:76}),selectedValues:{lineId:row.lineId,...values},explanation});
 for(const row of lines){
  const s=row.selection;if(!currentPerfectsheerHub(s))continue;
  const assembly={...(s.configuration.norman_assembly_v1 as SelectionRecord??{})};delete assembly.sharedHub;
  s.configuration={...s.configuration,norman_assembly_v1:assembly};
  const raw=s.configuration[PERFECTSHEER_HUB_ID],id=norm(raw);
  if(!active(s)){if(id&&['true','yes','1'].includes(norm(s.configuration.hub_required)))add(row,'compatibility','A shared Automate hub identifier requires motorized PerfectSheer with Automate Home and Hub Required set to Yes.');continue;}
  if(typeof raw!=='string'||!id||id.length>80){add(row,'id','Enter a shared Automate hub identifier (1–80 characters) for every shade connected to this hub. Use another identifier for a separate physical hub.');continue;}
  groups.set(id,[...(groups.get(id)??[]),row]);
 }
 for(const [hubId,members]of groups){
  const connectedLineIds=members.map(m=>m.lineId).sort(),motors=members.reduce((n,m)=>n+m.selection.quantity,0),owner=connectedLineIds[0];
  const valid=members.every(m=>Number.isSafeInteger(m.selection.quantity)&&m.selection.quantity>0)&&motors<=30;
  for(const row of members){
   if(!valid)add(row,'capacity','One Automate Wi-Fi hub supports at most 30 motors. Split the connected shades between separately identified hubs.',{hubId,motorQuantity:motors,capacity:30});
   row.selection.configuration={...row.selection.configuration,norman_assembly_v1:{...(row.selection.configuration.norman_assembly_v1 as SelectionRecord),sharedHub:{version:1,family:'automate_home',hubId,ownerLineId:owner,connectedLineIds,motorQuantity:motors,capacity:30,maximumAccounts:5,valid,chargeHub:valid&&row.lineId===owner,orderQuantity:1,fulfillmentQuantity:valid&&row.lineId===owner?1:0,color:'White',includedPower:'5V 1A charging box, charging cable and adapter',sourceId:'norman-motorization-guide-2026-09-16',sourcePage:76}}};
  }
 }
 return issues;
}
