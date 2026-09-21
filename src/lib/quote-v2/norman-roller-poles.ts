import {ROLLER_POLE_KEY,ROLLER_POLE_ORDER_KEY,emptyRollerPole,parseRollerPole} from '../quote/norman-roller-poles';
import {rollerComponentOrderWidthsForPricing} from './roller-matrix';
import type {SelectionContext,SelectionRecord,ValidationIssue} from './core';
import type {SurchargeSelection} from '../quote/pricing';
import {sourceProvenance} from './source-manifest';
const norm=(v:unknown)=>String(v??'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
export const currentRollerPoles=(s:SelectionContext)=>s.productId==='roller'&&s.catalogAsOf>='2026-09-20'&&/-poles-2026-09-20-r10$|-light-guard-2026-09-20-r11$/.test(s.catalogVersion);
const eligible=(s:SelectionContext)=>/cordless/.test(norm(s.configuration.lift_system))&&!/light ?guard ?360/.test(norm(s.configuration.roller_application??s.configuration.shade_type)+' '+norm(s.configuration.valance));
const physicalCount=(s:SelectionContext)=>/coupled/.test(norm(s.configuration.roller_application??s.configuration.shade_type))?rollerComponentOrderWidthsForPricing(s)?.length??null:/dual/.test(norm(s.configuration.roller_application??s.configuration.shade_type))?2:1;
export function rollerPoles(s:SelectionContext):{issues:ValidationIssue[];selections:SurchargeSelection[];record:SelectionRecord}|null{
 if(!currentRollerPoles(s))return null;
 const raw=s.configuration[ROLLER_POLE_KEY],r=raw==null?emptyRollerPole():parseRollerPole(raw),issues:ValidationIssue[]=[],selections:SurchargeSelection[]=[];
 const add=(id:string,explanation:string)=>issues.push({severity:'hard_block',ruleId:`roller.poles.${id}`,source:sourceProvenance('norman-roller-guide-2026-09-16',{page:44}),selectedValues:{...s.configuration},explanation});
 if(!r){add('record','Save a listed Roller pole or attachment and a whole quantity.');return {issues,selections,record:{version:1,status:'invalid'}};}
 const count=physicalCount(s),selected=r.kind!=='None';
 if(selected&&!eligible(s))add('application','These poles and attachments are available only for PrecisionLift Cordless Roller shades and are incompatible with LightGuard360.');
 if(selected&&(r.quantityPerAssembly<1||count===null||r.quantityPerAssembly>count))add('quantity','Select at most one additional pole or one attachment per physical shade in the assembly.');
 if(!selected&&r.quantityPerAssembly!==0)add('stale_quantity','Clear extra pole quantity when None is selected.');
 const legacy=['additional_fiberglass_pole','pole_attachment_only','cordless_operating_pole_premium_hardware'].some(k=>s.configuration[k]===true||Number(s.configuration[`${k}_quantity`])>0);
 if(raw==null&&legacy)add('legacy','Save the exact Roller pole length, type and quantity before pricing extras.');
 if(selected&&r.quantityPerAssembly>0)selections.push({id:r.kind.includes('Fiberglass')?'additional_fiberglass_pole':r.kind.includes('Attachment')?'pole_attachment_only':'cordless_operating_pole_premium_hardware',units:r.quantityPerAssembly});
 return {issues,selections,record:{version:1,type:'roller_pole_extras',sourceId:'norman-roller-guide-2026-09-16',sourcePage:44,retailSourceId:'norman-retail-guide-2026-09',retailSourcePage:20,kind:r.kind,quantityPerAssembly:r.quantityPerAssembly,assemblyQuantity:s.quantity,totalExtraQuantity:r.quantityPerAssembly*s.quantity,physicalShadesPerAssembly:count,attachmentCompatibility:r.kind.includes('Attachment')?'screw_tip_poles_not_replacement_for_fixed_head_cordless_pole':null}};
}
export function deriveRollerPoleOrder(lines:readonly {lineId:string;selection:SelectionContext}[]):void{
 const current=lines.filter(row=>currentRollerPoles(row.selection));for(const row of current){const c={...row.selection.configuration};delete c[ROLLER_POLE_ORDER_KEY];row.selection.configuration=c;}
 const members=current.filter(row=>eligible(row.selection)&&row.selection.quantity>0).sort((a,b)=>a.lineId.localeCompare(b.lineId));if(!members.length)return;
 const pole=members.some(row=>row.selection.heightInches>96)?'58-inch Fiberglass Pole':'30-inch Fiberglass Pole';
 for(const row of members)row.selection.configuration={...row.selection.configuration,[ROLLER_POLE_ORDER_KEY]:{version:1,type:'roller_complimentary_order_pole',sourceId:'norman-roller-guide-2026-09-16',sourcePage:44,memberLineIds:members.map(v=>v.lineId),ownerLineId:members[0].lineId,pole,orderQuantity:1,fulfillmentQuantity:row.lineId===members[0].lineId?1:0,retailCharge:0,sizeBasis:'58_inch_when_any_eligible_shade_over_96_otherwise30',historicalCatalogs:'not_reinterpreted'}};
}
