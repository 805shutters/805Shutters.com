import type{SelectionContext,SelectionRecord,ValidationIssue}from'@/lib/quote-v2/core';
import{sourceProvenance}from'@/lib/quote-v2/source-manifest';
import{SUNDANCE_ASSEMBLY_KEY,readSundanceAssembly,sundanceAssemblyMatches,sundanceAssemblySpec}from'./assembly-records';
import{sundanceShadeSource}from'./shade-configuration';
export const SUNDANCE_ORDER_POWER_KEY='sundance_order_power_v1';
export const SUNDANCE_PANEL_ID_KEY='sundance_simphony_panel_id';
export type SundanceOrderLine={lineId:string;selection:SelectionContext};
const rollerIds=['sundance_roller','sundance_louvolite_roller'];
type Connection={line:SundanceOrderLine;componentId:string|null;quantity:number;panelId:string};
/** Derive from selected server designs. Never accept client-supplied capacity, owner or charge records. */
export function deriveSundanceOrderPower(lines:readonly SundanceOrderLine[]):ValidationIssue[]{
 const issues:ValidationIssue[]=[],connections:Connection[]=[],blocked=new Set<string>();
 const add=(line:SundanceOrderLine,key:string,message:string)=>{const source=sundanceShadeSource(line.selection.productId);blocked.add(line.lineId);issues.push({severity:'hard_block',ruleId:`sundance.order_power.${key}`,source:sourceProvenance(source.sourceId,{page:source.simphonyPage}),selectedValues:{lineId:line.lineId},explanation:message});};
 for(const line of lines){
  if(!line.selection.productId.startsWith('sundance_'))continue;
  const c={...line.selection.configuration};delete c[SUNDANCE_ORDER_POWER_KEY];line.selection.configuration=c;
  const assembly=readSundanceAssembly(c[SUNDANCE_ASSEMBLY_KEY]);
  const spec=sundanceAssemblySpec(line.selection.productId,c);
  const candidates:{componentId:string|null;c:SelectionRecord}[]=[];
  if(spec){
   if(!assembly||!sundanceAssemblyMatches(assembly,line.selection.productId,c)){if(c[SUNDANCE_PANEL_ID_KEY])add(line,'assembly','Shared panel connections require complete matching assembly component records.');continue;}
   if(c[SUNDANCE_PANEL_ID_KEY])add(line,'parent_connection','Assign panel connections to individual component motors; clear the parent panel connection.');
   if(assembly.components.some(x=>x.productId!==line.selection.productId)){add(line,'component_product','Shared panel components must belong to their selected product family.');continue;}
   if(new Set(assembly.components.map(x=>x.id)).size!==assembly.components.length){add(line,'component_ids','Panel connections require distinct component identities.');continue;}
   if(spec.sharedMotor){const owner=assembly.components.find(x=>x.id===assembly.sharedMotorComponentId);if(!owner){add(line,'motor_owner','Choose the one component containing the coupled assembly motor before assigning power.');continue;}candidates.push({componentId:owner.id,c:owner.configuration});for(const other of assembly.components.filter(x=>x.id!==owner.id))if(other.configuration[SUNDANCE_PANEL_ID_KEY])add(line,'duplicate_coupled_motor','A coupled assembly has one motor connection; only its motor-owning component can connect to a panel.');}
   else candidates.push(...assembly.components.map(x=>({componentId:x.id,c:x.configuration})));
  }else candidates.push({componentId:null,c});
  for(const candidate of candidates){
   const raw=candidate.c[SUNDANCE_PANEL_ID_KEY];if(raw==null||raw==='')continue;
   if(typeof raw!=='string'||!/^Panel (?:[1-9]|[1-4][0-9]|50)$/.test(raw)){add(line,'id','Choose a documented shared panel identifier from Panel 1 through Panel 50.');continue;}
   if(!rollerIds.includes(line.selection.productId)||candidate.c.sundance_shade_control!=='Simphony 24V DC'){add(line,'power','These 18-motor distribution boxes support the documented Sundance/Louvolite roller Simphony 24V DC control only.');continue;}
   if(!Number.isSafeInteger(line.selection.quantity)||line.selection.quantity<=0){add(line,'quantity','Connected shade quantities must be positive whole numbers.');continue;}
   if(Number(candidate.c.sundance_shade_accessory_simphony24_qty??0)>0||Number(candidate.c.sundance_shade_accessory_simphony_distribution_qty??0)>0){add(line,'duplicate_supply','A shared panel connection cannot also charge a per-line transformer or distribution-box quantity. Clear those quantities.');continue;}
   connections.push({line,componentId:candidate.componentId,quantity:line.selection.quantity,panelId:raw});
  }
 }
 const groups=new Map<string,Connection[]>();for(const connection of connections)groups.set(connection.panelId,[...(groups.get(connection.panelId)??[]),connection]);
 const records=new Map<string,SelectionRecord[]>();
 for(const[panelId,members]of groups){
  const count=members.reduce((sum,c)=>sum+c.quantity,0);
  if(count>18){for(const line of new Map(members.map(m=>[m.line.lineId,m.line])).values())add(line,'capacity',`${panelId} connects ${count} motors; the source distribution-box maximum is 18.`);continue;}
  if(members.some(m=>blocked.has(m.line.lineId)))continue;
  const owner=[...members].sort((a,b)=>a.line.lineId.localeCompare(b.line.lineId)||(a.componentId??'').localeCompare(b.componentId??''))[0];
  const connected=members.map(m=>({lineId:m.line.lineId,componentId:m.componentId,motorQuantity:m.quantity})).sort((a,b)=>a.lineId.localeCompare(b.lineId)||(a.componentId??'').localeCompare(b.componentId??''));
  for(const line of new Map(members.map(m=>[m.line.lineId,m.line])).values()){
   const source=sundanceShadeSource(line.selection.productId);
   const record:SelectionRecord={version:1,panelId,motorFamily:'Simphony 24V DC',capacity:18,totalMotors:count,connected,ownerLineId:owner.line.lineId,ownerComponentId:owner.componentId,sourceNetCharge:line.lineId===owner.line.lineId?800:0,sourceId:source.sourceId,sourcePage:source.simphonyPage,customerPriceEligible:false};
   records.set(line.lineId,[...(records.get(line.lineId)??[]),record]);
  }
 }
 for(const line of lines)if(records.has(line.lineId))line.selection.configuration={...line.selection.configuration,[SUNDANCE_ORDER_POWER_KEY]:{version:1,panels:records.get(line.lineId)!}};
 return issues;
}
