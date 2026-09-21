import type {SelectionContext,ValidationIssue} from '@/lib/quote-v2/core';
import {sourceProvenance} from '@/lib/quote-v2/source-manifest';
import {lookupSundanceSourceGrid} from './catalog';
import {sundanceCellularSource} from './cellular-assortment';
import {validateSundanceCellularConfiguration} from './cellular-configuration';
import {validateSundanceHorizontalConfiguration,sundanceHorizontalSourceId} from './horizontal-configuration';
import {validateSundancePortfolioConfiguration} from './portfolio-configuration';
import {validateSundanceSheerviewConfiguration} from './sheerview-configuration';
import {validateSundanceWaldenConfiguration} from './walden-configuration';
import {sundanceWaldenSource} from './walden-assortment';
import {validateSundanceZebraConfiguration,sundanceZebraSourceId} from './zebra-configuration';
import {validateSundanceShadeConfiguration,sundanceShadeSource} from './shade-configuration';
import {SUNDANCE_ASSEMBLY_KEY,readSundanceAssembly,sundanceAssemblySpec,sundanceAssemblyMatches,type SundanceAssemblyComponent} from './assembly-records';

type AssemblyContext=Pick<SelectionContext,'productId'|'widthInches'|'heightInches'|'configuration'>;
function assemblySource(productId:string) {
  if(productId==='sundance_cellular')return{sourceId:sundanceCellularSource.sourceId,page:7};
  if(productId==='sundance_sheerview')return{sourceId:'sundance-h-sheerview-pricing_aug2026-4a981c88776d',page:25};
  if(productId==='sundance_portfolio_roman')return{sourceId:'sundance-sundance-portfolio-roman-shade-product-price-guide-2026-421a4cba9a72',page:18};
  if(productId.startsWith('sundance_walden_'))return{sourceId:sundanceWaldenSource.sources.find(s=>s.file.includes(productId.endsWith('premier')?'Premier':'Select'))!.sourceId,page:productId.endsWith('premier')?14:6};
  if(['sundance_zebra','sundance_louvolite_zebra'].includes(productId))return{sourceId:sundanceZebraSourceId,page:9};
  if(['sundance_roller','sundance_louvolite_roller','sundance_flat_roman','sundance_louvolite_flat_roman'].includes(productId)){const source=sundanceShadeSource(productId);return{sourceId:source.sourceId,page:source.optionPage};}
  return{sourceId:sundanceHorizontalSourceId,page:productId.includes('aluminum')?10:productId==='sundance_chateau_woods'?17:3};
}
export function sundanceComponentSourceGrid(component:SundanceAssemblyComponent) {
  return lookupSundanceSourceGrid(component.productId,String(component.configuration.catalog_program_id??component.configuration.fabric_program_id??''),Number(component.widthInches),Number(component.heightInches));
}
export function validateSundanceAssembly(s:AssemblyContext):ValidationIssue[] {
  const spec=sundanceAssemblySpec(s.productId,s.configuration),stored=s.configuration[SUNDANCE_ASSEMBLY_KEY];
  if(!spec&&stored==null)return[];
  const issues:ValidationIssue[]=[],source=assemblySource(s.productId);
  const add=(key:string,explanation:string)=>issues.push({severity:'hard_block',ruleId:`sundance.assembly.${key}`,source:sourceProvenance(source.sourceId,{page:source.page}),selectedValues:{productId:s.productId},explanation});
  if(!spec){add('stale','Saved component records do not match an active multi-shade assembly. Remove them or restore their assembly selection.');return issues;}
  const assembly=readSundanceAssembly(stored);
  if(!assembly||!sundanceAssemblyMatches(assembly,s.productId,s.configuration)){add('records','Create versioned component records matching the selected product and assembly. Each shade needs its own dimensions, fabric and control.');return issues;}
  if(new Set(assembly.components.map(c=>c.id)).size!==assembly.components.length)add('duplicate_ids','Each assembly component needs a distinct saved identity.');
  if(spec.sharedMotor&&!assembly.components.some(c=>c.id===assembly.sharedMotorComponentId))add('motor_owner','Identify which component contains the single shared motor.');
  if(!spec.sharedMotor&&assembly.sharedMotorComponentId!==null)add('stale_motor','Independent shades cannot retain a shared motor allocation.');
  for(const[index,component]of assembly.components.entries()){
    const label=`Component ${index+1}`;
    if(component.productId!==s.productId){add('product',`${label} must retain this assembly's exact product family.`);continue;}
    if(component.configuration[SUNDANCE_ASSEMBLY_KEY]!=null||sundanceAssemblySpec(component.productId,component.configuration)){add('nested',`${label} cannot contain another assembly.`);continue;}
    const c={productId:component.productId,programId:String(component.configuration.catalog_program_id??component.configuration.fabric_program_id??''),widthInches:Number(component.widthInches),heightInches:Number(component.heightInches),configuration:component.configuration};
    const validator=c.productId==='sundance_cellular'?validateSundanceCellularConfiguration:c.productId==='sundance_sheerview'?validateSundanceSheerviewConfiguration:c.productId==='sundance_portfolio_roman'?validateSundancePortfolioConfiguration:c.productId.startsWith('sundance_walden_')?validateSundanceWaldenConfiguration:['sundance_zebra','sundance_louvolite_zebra'].includes(c.productId)?validateSundanceZebraConfiguration:['sundance_roller','sundance_louvolite_roller','sundance_flat_roman','sundance_louvolite_flat_roman'].includes(c.productId)?validateSundanceShadeConfiguration:validateSundanceHorizontalConfiguration;
    for(const issue of validator(c))issues.push({...issue,ruleId:`sundance.assembly.component_${index+1}.${issue.ruleId}`,explanation:`${label}: ${issue.explanation}`});
    if(!sundanceComponentSourceGrid(component))add('grid',`${label} has no source retail grid cell for its saved product, program and dimensions.`);
  }
  const widths=assembly.components.map(c=>Number(c.widthInches));
  if(spec.layout==='side-by-side'&&widths.every(w=>w>0&&Number.isFinite(w))&&widths.reduce((a,b)=>a+b,0)>s.widthInches+0.000001)add('width','The component widths exceed the complete assembly width. Retain the actual component measurements and review gaps/deductions separately.');
  if(spec.layout==='front-back'&&widths.some(w=>w>s.widthInches))add('width','A front/back component cannot be wider than the overall assembly.');
  if(s.productId==='sundance_portfolio_roman'){
    if(s.widthInches>112)add('headrail','Portfolio common headrails cannot exceed112 inches.');
    if(assembly.components.some(c=>c.configuration.sundance_portfolio_drop!=='Standard'||!['Flat','Knife Pleat','Front Slat'].includes(String(c.configuration.roman_style))))add('style','Portfolio common headrails support standard Flat, Knife Pleat or Front Slat shades only.');
  }
  if(s.productId.startsWith('sundance_walden_')&&s.widthInches>108)add('headrail','Walden common headrails cannot exceed108 inches. Common valance sections over96 inches require separate treatment.');
  // Components are now retained and independently checked. Factory geometry, combined
  // control compatibility and order pricing are not implied by a sum of base cells.
  return issues;
}

/** Sum only individually validated cited base cells. Retail/net options and common hardware retain their own evidence. */
export function sundanceAssemblyBaseEvidence(s:AssemblyContext){
 const assembly=readSundanceAssembly(s.configuration[SUNDANCE_ASSEMBLY_KEY]);
 const issues=validateSundanceAssembly(s);
 if(!assembly||!sundanceAssemblyMatches(assembly,s.productId,s.configuration)||issues.length)return{retailSubtotal:null,componentCount:assembly?.components.length??0,customerPriceEligible:false as const};
 const cells=assembly.components.map(sundanceComponentSourceGrid);
 return{retailSubtotal:cells.every(Boolean)?cells.reduce((sum,cell)=>sum+cell!.sourceRetail,0):null,componentCount:cells.length,customerPriceEligible:false as const};
}
