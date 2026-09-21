import type {SelectionContext,SelectionRecord,ValidationIssue} from '@/lib/quote-v2/core';
import {sourceProvenance} from '@/lib/quote-v2/source-manifest';
import {sundanceSharedAccessoryCatalog,type SundanceSharedAccessory} from './order-accessory-catalog';
import {readSundanceAssembly,sundanceAssemblyMatches,sundanceAssemblySpec,SUNDANCE_ASSEMBLY_KEY} from './assembly-records';
import {readSundanceWaldenTwin,SUNDANCE_WALDEN_TWIN_KEY} from './walden-twin-records';
export const SUNDANCE_SHARED_ACCESSORIES_KEY='sundance_shared_accessories_v1';
export const SUNDANCE_ORDER_ACCESSORIES_KEY='sundance_order_accessories_v1';
export type SundanceAccessoryAssignments={version:1;assignments:{deviceId:string;targetId:string;accessoryKey:string}[]};
type Target={id:string;label:string;configuration:Record<string,unknown>};
export function sundanceAccessoryTargets(productId:string,c:Record<string,unknown>):Target[]{
 const spec=sundanceAssemblySpec(productId,c),assembly=readSundanceAssembly(c[SUNDANCE_ASSEMBLY_KEY]);
 if(spec){
  if(!assembly||!sundanceAssemblyMatches(assembly,productId,c)||assembly.components.some(x=>x.productId!==productId)||new Set(assembly.components.map(x=>x.id)).size!==assembly.components.length)return[];
  return assembly.components.map((x,i)=>({id:x.id,label:`Component ${i+1}`,configuration:x.configuration})).filter(x=>!spec.sharedMotor||x.id===assembly.sharedMotorComponentId);
 }
 const twin=readSundanceWaldenTwin(c[SUNDANCE_WALDEN_TWIN_KEY]);
 if(c.walden_movable_liner==='Yes'){
  if(!twin||twin.productId!==productId||twin.front.id===twin.liner.id||twin.front.control!==c.sundance_walden_control)return[];
  const rear={...c,sundance_walden_control:twin.liner.control};
  for(const key of Object.keys(rear))if(key.startsWith('sundance_walden_accessory_'))delete (rear as Record<string,unknown>)[key];
  for(const[key,value]of Object.entries(twin.liner.accessoryQuantities))(rear as Record<string,unknown>)[`sundance_walden_accessory_${key}_qty`]=value;
  return[{id:twin.front.id,label:'Woven front',configuration:c},{id:twin.liner.id,label:'Movable liner',configuration:rear}];
 }
 return[{id:'line',label:'Line motor',configuration:c}];
}
export function readSundanceAccessoryAssignments(value:unknown):SundanceAccessoryAssignments|null{
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const r=value as SundanceAccessoryAssignments;
 return r.version===1&&Array.isArray(r.assignments)&&r.assignments.every(a=>a&&typeof a==='object'&&[a.deviceId,a.targetId,a.accessoryKey].every(v=>typeof v==='string'))?r:null;
}
export function sundanceSharedAccessoryInputIssues(productId:string,c:Record<string,unknown>){
 const raw=c[SUNDANCE_SHARED_ACCESSORIES_KEY];if(raw==null)return[];
 const r=readSundanceAccessoryAssignments(raw),issues:string[]=[];
 if(!r)return['Shared accessory assignments have an unsupported version or incomplete device/target identity.'];
 const targets=sundanceAccessoryTargets(productId,c),seen=new Set<string>();
 for(const a of r.assignments){
  if(!a.deviceId.trim()||a.deviceId.length>80||a.deviceId!==a.deviceId.trim())issues.push('Shared device names must be 1–80 characters without leading or trailing spaces.');
  const target=targets.find(t=>t.id===a.targetId),row=target&&sundanceSharedAccessoryCatalog(productId,target.configuration).find(x=>x.key===a.accessoryKey);
  if(!row||!row.compatible){issues.push(`${a.deviceId}: the accessory is not documented for its saved motor target.`);continue;}
  if(row.review)issues.push(`${a.deviceId}: ${row.review}`);
  if(Number(target!.configuration[row.quantityKey]??0)>0)issues.push(`${a.deviceId}: clear the separate line/component quantity for this shared accessory to avoid duplication.`);
  const key=`${a.deviceId}\0${a.targetId}`;if(seen.has(key))issues.push(`${a.deviceId}: a motor target cannot be connected twice to the same physical accessory.`);seen.add(key);
 }
 return issues;
}
type OrderLine={lineId:string;selection:SelectionContext};
/** One saved device ID denotes one physical accessory; rebuild selected-order ownership. */
export function deriveSundanceOrderAccessories(lines:readonly OrderLine[]):ValidationIssue[]{
 const invalidDeviceIds=new Set<string>();
 const issues:ValidationIssue[]=[],groups=new Map<string,{line:OrderLine;targetId:string;row:SundanceSharedAccessory}[]>();
 const add=(line:OrderLine,key:string,message:string,row?:SundanceSharedAccessory)=>issues.push({severity:'hard_block',ruleId:`sundance.order_accessory.${key}`,source:sourceProvenance(row?.sourceId??'sundance-a-sundance-roller-shades-11-25-1b8b33838689',row?{page:key==='capacity'?row.capacityPage??row.page:row.page}:{}),selectedValues:{lineId:line.lineId},explanation:message});
 for(const line of lines){
  if(!line.selection.productId.startsWith('sundance_'))continue;
  const c={...line.selection.configuration};delete c[SUNDANCE_ORDER_ACCESSORIES_KEY];line.selection.configuration=c;
  const inputIssues=sundanceSharedAccessoryInputIssues(line.selection.productId,c);
  if(inputIssues.length){for(const a of readSundanceAccessoryAssignments(c[SUNDANCE_SHARED_ACCESSORIES_KEY])?.assignments??[])invalidDeviceIds.add(a.deviceId);inputIssues.forEach(m=>add(line,'input',m));continue;}
  if(!Number.isSafeInteger(line.selection.quantity)||line.selection.quantity<1){for(const a of readSundanceAccessoryAssignments(c[SUNDANCE_SHARED_ACCESSORIES_KEY])?.assignments??[])invalidDeviceIds.add(a.deviceId);if(c[SUNDANCE_SHARED_ACCESSORIES_KEY])add(line,'quantity','Shared accessory motor quantities must be positive whole numbers.');continue;}
  const r=readSundanceAccessoryAssignments(c[SUNDANCE_SHARED_ACCESSORIES_KEY]);if(!r)continue;
  for(const a of r.assignments){const target=sundanceAccessoryTargets(line.selection.productId,c).find(t=>t.id===a.targetId)!;const row=sundanceSharedAccessoryCatalog(line.selection.productId,target.configuration).find(x=>x.key===a.accessoryKey)!;groups.set(a.deviceId,[...(groups.get(a.deviceId)??[]),{line,targetId:a.targetId,row}]);}
 }
 const records=new Map<string,SelectionRecord[]>();
 for(const[deviceId,members]of groups){
  if(invalidDeviceIds.has(deviceId)){for(const m of members)add(m.line,'incomplete_group',`${deviceId}: another connected motor has an invalid or duplicate accessory assignment. Resolve every connection before deriving a charge.`,m.row);continue;}
  const reference=members[0],signature=(m:typeof reference)=>`${m.line.selection.productId}|${m.row.key}|${m.row.unitSource}|${m.row.basis}`;
  if(members.some(m=>signature(m)!==signature(reference))){for(const m of members)add(m.line,'identity',`${deviceId}: one physical device cannot combine different product-family/accessory identities or source prices. Cross-family compatibility requires manufacturer confirmation.`,m.row);continue;}
  const totalMotors=members.reduce((sum,m)=>sum+m.line.selection.quantity,0);
  if(reference.row.maxMotors&&totalMotors>reference.row.maxMotors){for(const m of members)add(m.line,'capacity',`${deviceId}: ${totalMotors} motors exceed the documented ${reference.row.maxMotors}-shade capacity.`,m.row);continue;}
  const owner=[...members].sort((a,b)=>a.line.lineId.localeCompare(b.line.lineId)||a.targetId.localeCompare(b.targetId))[0];
  const connected=members.map(m=>({lineId:m.line.lineId,targetId:m.targetId,motorQuantity:m.line.selection.quantity})).sort((a,b)=>a.lineId.localeCompare(b.lineId)||a.targetId.localeCompare(b.targetId));
  for(const line of new Map(members.map(m=>[m.line.lineId,m.line])).values()){
   const record:SelectionRecord={version:1,deviceId,accessoryKey:reference.row.key,accessoryLabel:reference.row.label,connected,totalMotors,capacity:reference.row.maxMotors??null,capacitySourcePage:reference.row.capacityPage??null,ownerLineId:owner.line.lineId,ownerTargetId:owner.targetId,sourceUnitPrice:reference.row.unitSource,sourceBasis:reference.row.basis,sourceCharge:line.lineId===owner.line.lineId?reference.row.unitSource:0,sourceId:reference.row.sourceId,sourcePage:reference.row.page,customerPriceEligible:false,configurationReview:reference.row.maxMotors?'Range, placement, pairing and commissioning still require review.':'The source does not establish complete per-device connection/channel capacity; verify before ordering.'};
   records.set(line.lineId,[...(records.get(line.lineId)??[]),record]);
  }
 }
 for(const line of lines)if(records.has(line.lineId))line.selection.configuration={...line.selection.configuration,[SUNDANCE_ORDER_ACCESSORIES_KEY]:{version:1,devices:records.get(line.lineId)!}};
 return issues;
}

export function validateSundanceSharedAccessories(s:Pick<SelectionContext,'productId'|'configuration'>):ValidationIssue[]{
 const source=sundanceSharedAccessoryCatalog(s.productId,s.configuration)[0];
 return sundanceSharedAccessoryInputIssues(s.productId,s.configuration).map((message,i)=>({severity:'hard_block',ruleId:`sundance.shared_accessory.input_${i}`,source:sourceProvenance(source?.sourceId??'sundance-a-sundance-roller-shades-11-25-1b8b33838689',source?{page:source.page}:{}),selectedValues:{productId:s.productId},explanation:message}));
}
