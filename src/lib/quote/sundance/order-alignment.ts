import type{SelectionRecord,ValidationIssue}from'@/lib/quote-v2/core';
import{sourceProvenance}from'@/lib/quote-v2/source-manifest';
import{readSundanceAssembly,SUNDANCE_ASSEMBLY_KEY,sundanceAssemblyMatches,sundanceAssemblySpec}from'./assembly-records';
import{type SundanceOrderLine}from'./order-power';
import{sundanceShadeColors}from'./shade-fabrics';
import{sundanceZebraSourceId}from'./zebra-configuration';
export const SUNDANCE_ORDER_ALIGNMENT_KEY='sundance_order_alignment_v1';
const key='sundance_zebra_alignment_group';
type Member={line:SundanceOrderLine;componentId:string|null;fabricId:string;width:number;height:number;quantity:number};
/** The selected quote can prove matching identities and measurements, never factory order timing. */
export function deriveSundanceOrderAlignment(lines:readonly SundanceOrderLine[]):ValidationIssue[]{
 const issues:ValidationIssue[]=[],groups=new Map<string,Member[]>(),invalid=new Set<string>();
 const add=(line:SundanceOrderLine,name:string,message:string)=>issues.push({severity:'hard_block',ruleId:`sundance.order_alignment.${name}`,source:sourceProvenance(sundanceZebraSourceId,{page:5}),selectedValues:{lineId:line.lineId},explanation:message});
 for(const line of lines){
  if(!line.selection.productId.startsWith('sundance_'))continue;
  const c={...line.selection.configuration};delete c[SUNDANCE_ORDER_ALIGNMENT_KEY];line.selection.configuration=c;
  const assembly=readSundanceAssembly(c[SUNDANCE_ASSEMBLY_KEY]),spec=sundanceAssemblySpec(line.selection.productId,c);
  const rawGroups=[c,...(assembly?.components.map(x=>x.configuration)??[])].map(x=>x[key]).filter(x=>x!=null&&x!=='');
  if(!rawGroups.length)continue;
  const fail=(message:string)=>{rawGroups.filter(x=>typeof x==='string').forEach(x=>invalid.add(x as string));add(line,'member',message);};
  if(!['sundance_zebra','sundance_louvolite_zebra'].includes(line.selection.productId)){fail('Zebra alignment groups require the exact documented Zebra or Vision family.');continue;}
  if(!Number.isSafeInteger(line.selection.quantity)||line.selection.quantity<1){fail('Alignment member quantities must be positive whole numbers.');continue;}
  if(spec&&(!assembly||!sundanceAssemblyMatches(assembly,line.selection.productId,c)||new Set(assembly.components.map(x=>x.id)).size!==assembly.components.length||assembly.components.some(x=>x.productId!==line.selection.productId))){fail('Complete matching independent component records before checking an alignment group.');continue;}
  if(!spec&&c[SUNDANCE_ASSEMBLY_KEY]!=null){fail('Clear stale component records before checking an alignment group.');continue;}
  if(spec&&c[key]){fail('Assign alignment names to the actual component shades, then clear the parent alignment name.');continue;}
  const candidates=spec&&assembly?assembly.components.map(x=>({componentId:x.id,c:x.configuration,width:x.widthInches,height:x.heightInches})):[{componentId:null,c,width:line.selection.widthInches,height:line.selection.heightInches}];
  for(const member of candidates){
   const group=member.c[key];if(group==null||group==='')continue;
   if(typeof group!=='string'||!group.trim()||group!==group.trim()||group.length>80){fail('Use a nonblank alignment group name of at most80 characters without surrounding spaces.');continue;}
   const row=sundanceShadeColors.find(r=>r.productId===line.selection.productId&&r.id===member.c.fabric_color_id);
   if(!row||!Number.isFinite(member.width)||!Number.isFinite(member.height)||Number(member.width)<=0||Number(member.height)<=0){invalid.add(group);add(line,'member','Every aligned shade requires its exact fabric/color identity and independent positive dimensions.');continue;}
   groups.set(group,[...(groups.get(group)??[]),{line,componentId:member.componentId,fabricId:row.id,width:Number(member.width),height:Number(member.height),quantity:line.selection.quantity}]);
  }
 }
 const records=new Map<string,SelectionRecord[]>();
 for(const[group,members]of groups){
  const uniqueLines=[...new Map(members.map(x=>[x.line.lineId,x.line])).values()];
  const first=members[0],same=members.every(x=>x.line.selection.productId===first.line.selection.productId&&x.fabricId===first.fabricId&&x.width===first.width&&x.height===first.height),total=members.reduce((n,x)=>n+x.quantity,0);
  if(invalid.has(group)||!same||total<2){for(const line of uniqueLines)add(line,'group',invalid.has(group)?'Resolve every invalid member before deriving alignment evidence.':!same?'Every shade in an alignment group must have the identical product, fabric/color and width/height.':'An alignment group requires at least two actual shades.');continue;}
  const record:SelectionRecord={version:1,group,shadeQuantity:total,members:members.map(x=>({lineId:x.line.lineId,componentId:x.componentId,quantity:x.quantity})),productId:first.line.selection.productId,fabricId:first.fabricId,widthInches:first.width,heightInches:first.height,publishedToleranceInches:0.375,orderedTogetherConfirmed:false,sourceId:sundanceZebraSourceId,sourcePage:5,customerPriceEligible:false};
  for(const line of uniqueLines)records.set(line.lineId,[...(records.get(line.lineId)??[]),record]);
 }
 for(const line of lines)if(records.has(line.lineId))line.selection.configuration={...line.selection.configuration,[SUNDANCE_ORDER_ALIGNMENT_KEY]:{version:1,groups:records.get(line.lineId)!}};
 return issues;
}
