import type {SelectionContext,SelectionRecord,ValidationIssue} from "./core";
import {canonicalMotorizationSelectionsFromConfiguration,rollerBaseMotorUnitsForConfiguration,type RollerMotorizationContractResult,type CanonicalMotorizationSelection} from "./roller-motor-contract";
import {sourceProvenance} from "./source-manifest";
const norm=(v:unknown)=>String(v??"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
export const currentRollerPanel=(s:SelectionContext)=>s.productId==="roller"&&s.catalogAsOf>="2026-09-20"&&!/-pg4-2026-09-r2$|-hardware-2026-09-20-r3$|-common-2026-09-20-r4$/.test(s.catalogVersion);
export function rollerPhysicalMotorCount(s:SelectionContext):number|null {
 const c=s.configuration,count=rollerBaseMotorUnitsForConfiguration({application:c.roller_application,couplingArrangement:c.coupling_arrangement,componentCount:c.roller_coupling_count??c.coupled_shade_count??c.lightguard_360_shade_count});
 return count===null?null:count*(/dual/.test(norm(c.roller_application))?2:1)*s.quantity;
}
/** Allocated panel is once per owner line in the existing published catalog engine. */
export function rollerMotorizationForSelection(s:SelectionContext):RollerMotorizationContractResult|null {
 const base=canonicalMotorizationSelectionsFromConfiguration(s.configuration);if(!currentRollerPanel(s))return base;
 const c=s.configuration,panelRequested=/distribution panel/.test(norm(c.dc_power_supply));
 const explicitPanel=base?.selections.some(v=>/^(dc_)?power_distribution_panel$/.test(v.optionId));
 if(!panelRequested&&!explicitPanel)return base;
 const issues:ValidationIssue[]=[...(base?.issues??[])];const add=(id:string,message:string)=>issues.push({severity:"hard_block",ruleId:`roller.panel.${id}`,source:sourceProvenance("norman-motorization-guide-2026-09-16",{page:75}),selectedValues:{...c},explanation:message});
 if(!panelRequested)add("membership","Select a shared panel for the Roller shade; an unallocated panel accessory cannot establish its connected motors.");
 if(norm(c.roller_power_configuration)!=="automate low voltage dc motor"||!/motor/.test(norm(c.lift_system)))add("motor_family","This Roller shared-panel implementation requires Automate Low Voltage DC Motor. Other power families retain their existing explicit pricing holds.");
 const raw=c.norman_order_record_v1,r=raw&&typeof raw==="object"&&!Array.isArray(raw)?raw as SelectionRecord:null;
 const count=rollerPhysicalMotorCount(s);
 const valid=r?.version===1&&r.family==="automate_home"&&typeof r.panelId==="string"&&r.panelId===String(c.shared_power_panel_id??"").trim()&&typeof r.ownerLineId==="string"&&Array.isArray(r.connectedLineIds)&&r.connectedLineIds.includes(r.ownerLineId)&&r.connections===count&&typeof r.totalConnections==="number"&&r.totalConnections>=Number(count)&&r.totalConnections<=18;
 if(panelRequested&&!valid)add("allocation","A valid server-derived shared panel is required, with at most 18 connected Automate motors including both Dual Roller motors.");
 const selections:CanonicalMotorizationSelection[]=(base?.selections??[]).filter(v=>! /^(dc_)?power_distribution_panel$/.test(v.optionId));
 if(panelRequested&&valid&&r?.chargePanel===true)selections.push({groupId:"automate_home",optionId:"power_distribution_panel",role:"power_supply",units:1});
 return {source:base?.source??"canonical",selections,issues};
}
