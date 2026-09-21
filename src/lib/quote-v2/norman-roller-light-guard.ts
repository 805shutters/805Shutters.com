import {ROLLER_LIGHT_GUARD_KEY as KEY,ROLLER_LIGHT_GUARD_GROUP_KEY as GROUP,ROLLER_BASIC_GUARD_COLORS,ROLLER_WOOD_GUARD_COLORS,emptyRollerLightGuard,parseRollerLightGuard} from '../quote/norman-roller-light-guard';
import {ROLLER_COMMON_RECORD_KEY as COMMON} from '../quote/norman-roller-common';
import type {SelectionContext,SelectionRecord,ValidationIssue} from './core';
import type {SurchargeSelection} from '../quote/pricing';
import {sourceProvenance} from './source-manifest';
const norm=(v:unknown)=>String(v??'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
export const currentRollerLightGuard=(s:SelectionContext)=>s.productId==='roller'&&s.catalogAsOf>='2026-09-20'&&s.catalogVersion.endsWith('-light-guard-2026-09-20-r11');
const issue=(s:SelectionContext,id:string,explanation:string):ValidationIssue=>({severity:'hard_block',ruleId:`roller.light_guard.${id}`,source:sourceProvenance('norman-roller-guide-2026-09-16',{page:45}),selectedValues:{...s.configuration},explanation});
export function rollerGuardSplice(length:number):SelectionRecord{
 if(length<=96)return {length,pieces:[length],spliceFromTop:null,joiningTape:false};
 const top=length<=102?6:length-96;return {length,pieces:[top,length-top],spliceFromTop:top,joiningTape:true};
}
export function rollerLightGuard(s:SelectionContext):{issues:ValidationIssue[];selections:SurchargeSelection[];record:SelectionRecord}|null{
 if(!currentRollerLightGuard(s))return null;
 const c=s.configuration,raw=c[KEY],r=raw==null?emptyRollerLightGuard():parseRollerLightGuard(raw),issues:ValidationIssue[]=[],selections:SurchargeSelection[]=[];
 const add=(id:string,text:string)=>issues.push(issue(s,id,text));
 if(!r){add('record','Save the Roller Light Guard type, exact finish and both requested channel lengths.');return {issues,selections,record:{version:1,status:'invalid'}};}
 const active=r.kind!=='None',app=norm(c.roller_application??c.shade_type),valance=norm(c.valance),cassette=/cassette/.test(valance+' '+norm(c.roller_top_treatment??c.top_treatment_class)),common=/common/.test(app);
 if(!active&&(r.color||r.leftLength!==null||r.rightLength!==null))add('stale','Clear color and channel lengths when selecting no Light Guard.');
 const legacy=norm(c.light_guard);if(raw==null&&(legacy&&!['none','no','false','lightguard 360','lightguard360'].includes(legacy)||c.basic_light_guard===true||c.premium_wood_light_guard===true))add('legacy','Save the exact Basic or Premium Wood Light Guard finish and channel lengths before pricing.');
 const group=c[GROUP] as SelectionRecord|undefined;
 if(active){
  if(!['inside','inside mount','im','ib'].includes(norm(c.mount_type)))add('mount','Basic and Premium Wood Light Guard are available only for Inside Mount.');
  if(/light ?guard ?360/.test(app+' '+valance))add('application','Basic/Premium Light Guard is a separate system and cannot be added to LightGuard360.');
  if(cassette&&r.kind!=='Basic')add('cassette','Cassette supports only Basic Light Guard and does not include a top block.');
  if(!(r.kind==='Basic'?ROLLER_BASIC_GUARD_COLORS:ROLLER_WOOD_GUARD_COLORS).includes(r.color as never))add('color','Choose an exact source color for the selected Light Guard material.');
  if(r.leftLength===null||r.leftLength<=0||r.rightLength===null||r.rightLength<=0)add('lengths','Record positive requested left and right channel lengths. No factory cutting deduction is assumed.');
  if(r.kind==='Premium Wood'&&[r.leftLength,r.rightLength].some(v=>v!==null&&v>96))add('wood_splice','The published splice diagram is in the Basic Light Guard row. Confirm Premium Wood channel splicing above 96 inches with Norman; the Basic splice rule is not assumed for wood.');
  if(common&&!group)add('common_membership','Save the full common-valance group to derive its single shared Light Guard set.');
  if(!common||group?.chargeThisLine===true)selections.push({id:r.kind==='Basic'?'basic_light_guard':'premium_wood_light_guard',units:1});
 }
 const wideWood=['049 Stone Gray','110 Limed White'].includes(r.color),dual=/dual/.test(app);
 return {issues,selections,record:{version:1,type:'roller_light_guard',sourceId:'norman-roller-guide-2026-09-16',sourcePage:45,retailSourceId:'norman-retail-guide-2026-09',retailSourcePage:20,kind:r.kind,color:r.color||null,setQuantity:active?1:0,quantityBasis:common?'per_common_valance_assembly':'per_shade_assembly',sideBlockQuantity:active?2:0,topBlock:!active||cassette?null:{material:dual?'white_room_darkening_fabric':'white_vane',nominalHeightInches:dual?8.5:4.5},leftChannel:active&&r.leftLength!==null?r.kind==='Basic'?rollerGuardSplice(r.leftLength):{length:r.leftLength,spliceStatus:'wood_splice_schedule_not_published'}:null,rightChannel:active&&r.rightLength!==null?r.kind==='Basic'?rollerGuardSplice(r.rightLength):{length:r.rightLength,spliceStatus:'wood_splice_schedule_not_published'}:null,sideChannelWidthMm:!active?null:r.kind==='Basic'||wideWood?35:30,woodRunningChange:r.kind==='Premium Wood'?wideWood?'already_larger_size':'current_smaller_size_other_colors_running_change_unconfirmed':null,cutLengthBasis:'explicit_requested_channel_lengths_no_inferred_deduction',sharedGroup:common?group??null:null}};
}
export function deriveRollerLightGuardGroups(lines:readonly {lineId:string;selection:SelectionContext}[]):ValidationIssue[]{
 const issues:ValidationIssue[]=[],current=lines.filter(row=>currentRollerLightGuard(row.selection));
 for(const row of current){const c={...row.selection.configuration};delete c[GROUP];row.selection.configuration=c;}
 const groups=new Map<string,typeof current>();
 for(const row of current){const common=row.selection.configuration[COMMON] as SelectionRecord|undefined;if(common?.assemblyId)groups.set(String(common.assemblyId),[...(groups.get(String(common.assemblyId))??[]),row]);}
 for(const [id,members] of groups){
  const records=members.map(row=>parseRollerLightGuard(row.selection.configuration[KEY])??emptyRollerLightGuard());if(records.every(r=>r.kind==='None'))continue;
  if(records.some(r=>JSON.stringify(r)!==JSON.stringify(records[0])))for(const row of members)issues.push(issue(row.selection,'common_matching','Every common-valance member must specify the same Light Guard type, finish and two channel lengths; only one set is provided.'));
  const owner=String((members[0].selection.configuration[COMMON] as SelectionRecord).ownerLineId);
  for(const row of members)row.selection.configuration={...row.selection.configuration,[GROUP]:{version:1,assemblyId:id,ownerLineId:owner,memberLineIds:members.map(m=>m.lineId),chargeThisLine:row.lineId===owner,setQuantityPerAssembly:1}};
 }
 return issues;
}
