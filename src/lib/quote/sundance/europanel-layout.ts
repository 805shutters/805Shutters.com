import type {SelectionContext,ValidationIssue} from '@/lib/quote-v2/core';
import {sourceProvenance} from '@/lib/quote-v2/source-manifest';
export const SUNDANCE_EUROPANEL_LAYOUT_KEY='sundance_europanel_layout_v1';
export type SundanceEuropanelLayout={version:1;productId:string;fabricId:string;openingWidth:number;openingHeight:number;panels:{id:string;width:number|null;height:number|null;channel:number|null}[];notes:string};
export function readSundanceEuropanelLayout(v:unknown):SundanceEuropanelLayout|null{
 if(!v||typeof v!=='object'||Array.isArray(v))return null;const r=v as SundanceEuropanelLayout;
 return r.version===1&&typeof r.productId==='string'&&typeof r.fabricId==='string'&&typeof r.openingWidth==='number'&&typeof r.openingHeight==='number'&&typeof r.notes==='string'&&Array.isArray(r.panels)&&r.panels.length<=5&&r.panels.every(p=>p&&typeof p.id==='string'&&['width','height','channel'].every(k=>{const x=p[k as 'width'|'height'|'channel'];return x===null||typeof x==='number';}))?r:null;
}
export function createSundanceEuropanelLayout(productId:string,c:Record<string,unknown>,width:number,height:number,ids:string[]):SundanceEuropanelLayout|null{
 const count=Number(c.sundance_shade_panel_count);if(!['sundance_europanels','sundance_louvolite_europanels'].includes(productId)||![2,3,4,5].includes(count)||ids.length!==count||ids.some(id=>!id)||new Set(ids).size!==ids.length)return null;
 return{version:1,productId,fabricId:String(c.fabric_color_id??''),openingWidth:width,openingHeight:height,panels:ids.map(id=>({id,width:null,height:null,channel:null})),notes:''};
}
export function sundanceEuropanelLayoutIssues(s:Pick<SelectionContext,'productId'|'configuration'|'widthInches'|'heightInches'>):string[]{
 const raw=s.configuration[SUNDANCE_EUROPANEL_LAYOUT_KEY];if(raw==null)return[];const r=readSundanceEuropanelLayout(raw);if(!r)return['The saved Europanel layout has an unsupported version or malformed panel measurements.'];
 const issues:string[]=[];
 if(!['sundance_europanels','sundance_louvolite_europanels'].includes(s.productId)||r.productId!==s.productId||r.fabricId!==s.configuration.fabric_color_id||r.openingWidth!==s.widthInches||r.openingHeight!==s.heightInches)issues.push('The saved panel layout belongs to a different product, fabric or opening. Reconfirm every panel measurement against the current selection.');
 if(r.panels.length!==Number(s.configuration.sundance_shade_panel_count)||r.panels.length<2)issues.push('The measured panel layout must contain the selected two to five panels.');
 if(r.panels.some(p=>!p.id)||new Set(r.panels.map(p=>p.id)).size!==r.panels.length)issues.push('Each panel must have its own saved identity.');
 const channels=Number(s.configuration.sundance_shade_channels);
 for(const[pIndex,p]of r.panels.entries()){
  if(![p.width,p.height].every(n=>typeof n==='number'&&Number.isFinite(n)&&n>0))issues.push(`Panel ${pIndex+1} requires its own positive measured width and height.`);
  if(p.channel!==null&&(!Number.isInteger(p.channel)||p.channel<1||p.channel>channels||![4,5].includes(channels)))issues.push(`Panel ${pIndex+1} must use a channel within the selected four- or five-channel track.`);
 }
 return issues;
}
export function validateSundanceEuropanelLayout(s:Pick<SelectionContext,'productId'|'configuration'|'widthInches'|'heightInches'>):ValidationIssue[]{
 const lou=s.productId==='sundance_louvolite_europanels';
 return sundanceEuropanelLayoutIssues(s).map((explanation,i)=>({severity:'hard_block',ruleId:`sundance.europanel.layout_${i}`,source:sourceProvenance(lou?'sundance-f-louvolite-europanels-v2-f0895ea35026':'sundance-c-sundance-europanels-v2-4c998b29a4f1',{page:lou?8:15}),selectedValues:{productId:s.productId},explanation}));
}
export function sundanceEuropanelLayoutDescriptions(v:unknown):string[]{const r=readSundanceEuropanelLayout(v);return r?r.panels.map((p,i)=>`Panel ${i+1}: ${p.width??'unconfirmed'} × ${p.height??'unconfirmed'} inches${p.channel===null?'':`; track channel ${p.channel}`}`):[];}
