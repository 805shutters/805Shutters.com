import {sundanceVerticalSource}from'./vertical-assortment';
export const SUNDANCE_VERTICAL_COMPONENT_KEY='sundance_vertical_component_v1';
export const sundanceVanePriceHeights=[36,48,60,72,84,97.5,108,120,132,144];
// K-Vertical-Essence-V2.pdf, PDF4–10, final Vanes column; preserve basis review separately.
export const sundanceVaneSchedules=[
 {group:'1',page:4,prices:[11,12,14,15,16,18,19,20,23,24]},
 {group:'1A',page:5,prices:[12,14,15,16,18,20,23,24,27,28]},
 {group:'2',page:6,prices:[14,15,18,19,23,26,27,30,32,34]},
 {group:'3',page:7,prices:[15,18,20,23,27,28,31,34,39,42]},
 {group:'4',page:8,prices:[15,18,20,24,27,30,32,35,42,43]},
 {group:'5',page:9,prices:[19,24,28,32,39,43,45,50,54,58]},
 {group:'6',page:10,prices:[23,27,32,39,45,50,53,59,63,70]},
];
// K PDF11 explicitly calls these approximate stacks at listed blind widths.
export const sundanceVerticalStackRows=[
 [18,6,4.5],[22,7,5],[26,9,5.75],[30,10,6.25],[34,11,6.75],[38,13,7.5],[42,14,8],[46,15,8.5],[50,16,9],[54,18,9.75],[58,19,10.25],[62,20,10.75],[66,22,11.5],[70,23,12],[74,24,12.5],[78,25,13],[82,27,13.5],[86,28,14],[90,29,14.5],[94,31,15.5],[98,32,16],[102,33,16.5],[106,34,17],
 [110,36,17.5],[114,37,18],[118,38,18.5],[122,39,19],[126,41,19.75],[130,42,20.25],[134,43,20.75],[138,45,21.5],[142,46,22],[146,47,22.5],[150,48,23],[154,50,23.75],[158,51,24.25],[162,52,24.5],[166,53,25],[170,55,25.5],[174,56,26.5],[178,57,27],[182,59,27.5],[186,60,28],[190,61,29],[192,62,29],
].map(([width,vanes,approximateStack])=>({width,vanes,approximateStack}));
export function lookupSundanceVaneSource(group:string,length:number){
 const schedule=sundanceVaneSchedules.find(s=>s.group===group),index=Number.isFinite(length)&&length>0?sundanceVanePriceHeights.findIndex(h=>h>=length):-1;
 return schedule&&index>=0?{unitSource:schedule.prices[index],gridHeight:sundanceVanePriceHeights[index],page:schedule.page}:null;
}
export function sundanceVerticalStackReference(width:number){return sundanceVerticalStackRows.find(r=>r.width===width)??null;}
export type SundanceVerticalComponent={version:1;kind:'Track only'|'Vanes only';fabricId:string;sizeBasis:'Net component size'|'Opening size — factory deduction required'|'';lengthInches:number|null;quantity:number|null};
export function readSundanceVerticalComponent(v:unknown):SundanceVerticalComponent|null{
 if(!v||typeof v!=='object'||Array.isArray(v))return null;const r=v as SundanceVerticalComponent;
 return r.version===1&&['Track only','Vanes only'].includes(r.kind)&&typeof r.fabricId==='string'&&['Net component size','Opening size — factory deduction required',''].includes(r.sizeBasis)&&[r.lengthInches,r.quantity].every(x=>x===null||typeof x==='number')?r:null;
}
export function sundanceVerticalComponentEvidence(c:Record<string,unknown>){
 const r=readSundanceVerticalComponent(c[SUNDANCE_VERTICAL_COMPONENT_KEY]),kind=c.sundance_vertical_fulfillment,issues:string[]=[];
 const empty={issues,sourceAmount:null as number|null,sourceUnitPrice:null as number|null,sourceBasis:'unverified' as 'net'|'unverified',gridHeight:null as number|null,page:11,customerPriceEligible:false};
 if(!['Track only','Vanes only'].includes(String(kind))){if(c[SUNDANCE_VERTICAL_COMPONENT_KEY]!=null)issues.push('Clear the component-only record when selecting a complete blind.');return empty;}
 if(!r||r.kind!==kind){issues.push('Record the exact component length, quantity and net-size/deduction instructions.');return empty;}
 if(r.kind==='Vanes only'&&r.fabricId!==c.fabric_color_id)issues.push('The saved vane record belongs to a different material. Reconfirm the exact vane material.');
 if(!r.sizeBasis)issues.push('Specify net component size or opening size requiring factory deduction.');
 if(typeof r.lengthInches!=='number'||!Number.isFinite(r.lengthInches)||r.lengthInches<=0||r.lengthInches>(r.kind==='Track only'?192:144))issues.push('Enter a positive component length within the published maximum.');
 if(typeof r.quantity!=='number'||!Number.isSafeInteger(r.quantity)||r.quantity<1)issues.push('Enter the actual positive whole number of tracks or vanes for this line.');
 if(r.sizeBasis==='Opening size — factory deduction required')issues.push('Obtain the confirmed component size after factory deductions before deriving a component amount.');
 if(issues.length)return empty;
 if(r.kind==='Track only'){const unit=Math.max(36,r.lengthInches!)*0.95;return{...empty,sourceAmount:unit*r.quantity!,sourceUnitPrice:unit,sourceBasis:'net' as const,page:4};}
 const material=sundanceVerticalSource.rows.find(row=>row.id===r.fabricId&&row.programId===c.catalog_program_id),vane=lookupSundanceVaneSource(material?.priceGroup??'',r.lengthInches!);
 if(!vane){issues.push('The exact material does not resolve to a published vane schedule.');return empty;}
 return{...empty,sourceAmount:vane.unitSource*r.quantity!,sourceUnitPrice:vane.unitSource,gridHeight:vane.gridHeight,page:vane.page};
}
export function sundanceVerticalComponentDescription(v:unknown){const r=readSundanceVerticalComponent(v);return r?`${r.kind}: ${r.quantity??'unconfirmed'} × ${r.lengthInches??'unconfirmed'} inches; ${r.sizeBasis||'size basis unconfirmed'}`:null;}
