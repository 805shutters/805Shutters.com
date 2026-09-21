import {sundanceWaldenAccessoryIssues} from './walden-option-schedules';
import type {SelectionContext,ValidationIssue} from '@/lib/quote-v2/core';
import {sourceProvenance} from '@/lib/quote-v2/source-manifest';
import {sundanceWaldenSource} from './walden-assortment';
import {sundanceWaldenChoices,sundanceWaldenLinerColors} from './supplemental-configuration';
import {lookupSundanceValanceSource} from './valance-schedules';
export function sundanceWaldenControls(product:string){return ['Cordless','Cordless TDBU','Clutch and Loop','Pro Wand','Standard LI Motor',...(product==='sundance_walden_premier'?['Power Lift LI Motor']:[]),'Somfy Sonesse Ultra 30'];}
export function sundanceWaldenControlLimits(product:string,control:string){
 const premier=product==='sundance_walden_premier';
 return {minWidth:control==='Cordless'?15:control==='Cordless TDBU'?18:control==='Clutch and Loop'?14:['Power Lift LI Motor','Somfy Sonesse Ultra 30'].includes(control)?29.5:23,
 maxWidth:control==='Cordless TDBU'?(premier?60:70):96,minHeight:18,maxHeight:control==='Cordless TDBU'?(premier?72:96):control==='Cordless'?96:108,
 flushDepth:['Cordless','Cordless TDBU','Clutch and Loop'].includes(control)?2.5:premier||control==='Somfy Sonesse Ultra 30'?3.75:3.5};
}
export function validateSundanceWaldenConfiguration(s:Pick<SelectionContext,'productId'|'programId'|'widthInches'|'heightInches'|'configuration'>):ValidationIssue[]{
 const c=s.configuration,p=s.productId,premier=p==='sundance_walden_premier',page=premier?15:14,issues:ValidationIssue[]=[];
 const source=sundanceWaldenSource.sources.find(row=>row.file.includes(premier?'Premier':'Select'))!;
 const add=(key:string,sourcePage:number,explanation:string)=>issues.push({severity:'hard_block',ruleId:`sundance.walden.${key}`,source:sourceProvenance(source.sourceId,{page:sourcePage}),selectedValues:{...c,widthInches:s.widthInches,heightInches:s.heightInches},explanation});
 const row=sundanceWaldenSource.rows.find(row=>row.productId===p&&row.id===c.fabric_color_id),control=String(c.sundance_walden_control??''),style=String(c.sundance_walden_style??'');
 if(!row||row.programId!==s.programId||row.code!==c.fabric_color_code||row.name!==c.fabric_color_name)add('material',3,'Select the exact Walden material code and its own family price group.');
 if(row?.portalStatus==='source_only_exception')add('availability',row.sourcePage,'This guide-only material still requires current dealer availability confirmation.');
 if(!['Standard','Waterfall','Valance Only'].includes(style))add('style',5,'Choose standard, waterfall or valance-only style.');
 const valanceOnly=style==='Valance Only',bounds=sundanceWaldenControlLimits(p,control);
 if(valanceOnly){if(!lookupSundanceValanceSource(`${p}_valance_${row?.priceGroup.toLowerCase()}`,s.widthInches,s.heightInches))add('valance_size',premier?14:13,'Valance-only requires positive width up to 96 inches and length up to 18 inches with a matching fabric-group schedule.');}
 else{
  if(!sundanceWaldenControls(p).includes(control))add('control',page,'Choose an operating system documented for this Walden family.');
  if(!Number.isFinite(s.widthInches)||!Number.isFinite(s.heightInches)||s.widthInches<bounds.minWidth||s.widthInches>bounds.maxWidth||s.heightInches<18||s.heightInches>bounds.maxHeight)add('size',page,`The selected Walden control requires width ${bounds.minWidth}–${bounds.maxWidth} and height 18–${bounds.maxHeight} inches.`);
 }
 const liner=Boolean(c.catalog_sundance_liner_grid_id),binding=Boolean(c.catalog_sundance_edge_binding_grid_id),twin=c.walden_movable_liner==='Yes';
 for(const kind of ['liner','edge_binding'] as const){const id=c[`catalog_sundance_${kind}_grid_id`];if(id&&!sundanceWaldenChoices(p,kind).some(o=>o.id===id))add(kind,premier?20:19,'The selected liner/binding schedule belongs to another family or is unavailable.');}
 if(liner&&!sundanceWaldenLinerColors(p,c.catalog_sundance_liner_grid_id).includes(String(c.walden_liner_color)))add('liner_color',premier?20:19,'Select a color documented for this exact liner.');
 if(row?.edgeBindingRequired&&!binding)add('required_binding',3,'This exact fabric requires edge binding.');
 if(row?.edgeBindingSourceConflict)add('binding_conflict',3,'Dealer and guide differ on this material’s required edge binding; confirm the current requirement.');
 if(!valanceOnly&&control==='Cordless TDBU'){
  if(!row?.cordlessTdBu)add('tdbu_fabric',3,'This exact Premier material is not available with cordless TDBU.');
  if(style==='Waterfall'||twin||c.sundance_walden_assembly==='Three on one')add('tdbu_combination',premier?6:6,'TDBU is unavailable with waterfall, twin shades or three-on-one.');
  if(c.mount_type==='Inside'&&c.sundance_walden_returns!=='None')add('tdbu_returns',6,'Inside-mount TDBU cannot be ordered with returns. Do not automatically resize the opening to the alternate outside-mount recommendation.');
 }
 if(!valanceOnly&&control==='Clutch and Loop'&&!(premier?['Metal standard']:['Nickel-plated standard','Stainless Steel']).includes(String(c.sundance_walden_chain)))add('chain',7,'Select a chain specified for this exact Walden family.');
 if(!valanceOnly&&style==='Waterfall'){
  if(!['None','Shade fabric',...(liner?['Liner fabric']:[])].includes(String(c.sundance_walden_back_valance)))add('back_valance',5,'Choose no back valance, shade fabric, or the selected liner fabric.');
  if(!['Standard when unlined or light-filtering','Requested interior valance'].includes(String(c.sundance_walden_interior_valance)))add('interior_valance',5,'Record the standard interior-valance treatment or explicitly request an interior valance; its price is not established by the back-valance specification.');
 }
 if(!valanceOnly&&control==='Pro Wand'){
  if(style==='Waterfall'||twin)add('wand_combination',8,'Pro Wand is unavailable with waterfall or movable liners.');
  if(!['24','36','48','60'].includes(String(c.sundance_walden_wand_length)))add('wand_length',8,'Select a 24-, 36-, 48- or 60-inch White Pro Wand.');
 }
 if(!valanceOnly&&premier&&row&&['Pro Wand','Standard LI Motor','Somfy Sonesse Ultra 30'].includes(control)){
  const max=liner?row.motorMaxSqftWithLiner:row.motorMaxSqftWithoutLiner;
  if(max!=null&&s.widthInches*s.heightInches/144>max)add('motor_area',row.sourcePage,`This fabric's motorized area limit is ${max} square feet with the selected liner condition. Only Premier Power Lift is exempt.`);
 }
 if(!['Inside','Outside'].includes(String(c.mount_type)))add('mount',page,'Choose inside or outside mounting.');
 if(c.sundance_walden_returns==='Extended'&&c.mount_type!=='Outside')add('returns',premier?14:13,'Extended returns are available only for outside mounting.');
 if(!['None','Standard','Extended'].includes(String(c.sundance_walden_returns)))add('returns_selection',premier?12:12,'Choose none, standard or extended returns.');
 if(c.sundance_walden_returns!=='None'&&!['Shade fabric','Edge binding fabric'].includes(String(c.sundance_walden_return_material)))add('return_material',12,'Select shade fabric or edge-binding fabric for returns.');
 if(valanceOnly&&!premier&&(liner||binding))add('valance_surcharge',20,'Select valance-only liner/binding charges require an explicit source schedule; full-shade grid charges cannot be substituted.');
 if(!valanceOnly&&c.mount_type==='Inside'){
  const depth=Number(c.sundance_walden_depth),min=c.sundance_walden_flush==='Yes'?bounds.flushDepth:0.75;
  if(!['Yes','No'].includes(String(c.sundance_walden_flush))||!Number.isFinite(depth)||depth<min)add('depth',page,`Inside mounting requires at least ${min} inches for this flush/control choice; twin headrails require separate review.`);
 }
 if(twin){if(!liner)add('twin_liner',premier?13:6,'A movable liner requires an exact liner selection.');add('twin_components',premier?13:6,'Twin shades require two persisted control/dimension allocations and a compatible deeper headrail. The $309 surcharge is not the complete assembly price.');}
 const assembly=String(c.sundance_walden_assembly??'');if(!['Single','Two on one','Three on one'].includes(assembly))add('assembly',premier?14:6,'Identify single or multiple shades on one headrail.');
 else if(assembly!=='Single'){add('components',premier?14:6,'Each common-headrail shade requires its own dimensions and base price; total width max108, common valance max96 before sections.');if(twin)add('twin_multi',premier?14:6,'Multiple shades with a movable liner require explicit source/dealer approval; these cannot be represented as one blind.');}
 const cut=Number(c.sundance_walden_cutout_qty??0),spacers=Number(c.sundance_walden_spacers??0);
 if(!Number.isSafeInteger(cut)||cut<0)add('cutout_qty',premier?22:20,'Cut-out quantity must be a nonnegative whole number.');
 else if(cut>0)add('cutout',premier?12:13,binding&&!premier?'Cut-outs are unavailable with edge binding.':'Cut-out dimensions, positions and binding compatibility require factory approval.');
 if(!Number.isSafeInteger(spacers)||spacers<0||spacers>2)add('spacers',premier?14:13,'The source recommends at most two 3/8-inch spacers per bracket; verify any other stack.');
 if(valanceOnly&&!['Loose','1','1.5','2.5','3.5','5'].includes(String(c.sundance_walden_valance_headrail)))add('valance_headrail',premier?14:13,'Choose loose valance or a documented 1, 1½, 2½, 3½ or 5-inch headrail.');
 sundanceWaldenAccessoryIssues(c).forEach((issue,index)=>add(`accessory_${index}`,premier?22:20,issue));
 return issues;
}
