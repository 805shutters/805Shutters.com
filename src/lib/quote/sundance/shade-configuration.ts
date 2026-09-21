import {sundancePrivacyPieceEvidence} from './privacy-pieces';
import type {SelectionContext,ValidationIssue} from '@/lib/quote-v2/core';
import {sourceProvenance} from '@/lib/quote-v2/source-manifest';
import {lookupSundanceSourceGrid} from './catalog';
import {sundanceShadeColors,sundanceShadeFabricSource} from './shade-fabrics';
import schedules from './shade-option-schedules.source.json';
export const sundanceRollerFamilyIds=['sundance_roller','sundance_louvolite_roller','sundance_flat_roman','sundance_louvolite_flat_roman','sundance_europanels','sundance_louvolite_europanels'];
export const sundanceRollerChains=['White','Ivory','Gray','Bronze','Black','Nickel Plated','Stainless Steel'];
export const sundanceRollerFinishes=['White','Ivory','Silver','Bronze','Black'];
export function sundanceShadeKind(p:string){return p.includes('europanels')?'europanel':p.includes('flat_roman')?'roman':'roller';}
export function sundanceShadeSource(p:string){
 const roman=p.includes('flat_roman'),euro=p.includes('europanels'),lou=p.includes('louvolite');
 return{sourceId:roman?'sundance-sundance-product_price-guide-2026-1d87571a8af7':euro?lou?'sundance-f-louvolite-europanels-v2-f0895ea35026':'sundance-c-sundance-europanels-v2-4c998b29a4f1':lou?'sundance-d-louvolite-roller-shades-11-25-ccea3cc6ad47':'sundance-a-sundance-roller-shades-11-25-1b8b33838689',specPage:roman?lou?104:51:euro?lou?8:15:lou?14:26,
 optionPage:roman?lou?99:41:euro?5:lou?13:7,somfyPage:roman?lou?105:52:lou?19:31,alphaPage:roman?lou?107:54:lou?21:33,simphonyPage:roman?lou?108:55:lou?17:29};
}
export function sundanceShadeControls(p:string){
 const kind=sundanceShadeKind(p),s=sundanceShadeSource(p),roman=kind==='roman';
 if(kind==='europanel')return[{name:'Wand',net:0,minWidth:0,maxWidth:180,maxHeight:120,page:s.specPage,power:'manual',oversize:false}];
 return[
 {name:'Beaded Chain',net:0,minWidth:0,maxWidth:roman?96:118,maxHeight:roman?96:120,page:s.optionPage,power:'manual',oversize:false},
 {name:'Cordless',net:roman?0:38,minWidth:roman?0:12,maxWidth:96,maxHeight:96,page:s.specPage,power:'manual',oversize:false},
 ...(!roman?[{name:'Spring Assist Clutch',net:92,minWidth:0,maxWidth:118,maxHeight:120,page:s.optionPage,power:'manual',oversize:false},{name:'3-to-1 Clutch',net:43,minWidth:0,maxWidth:118,maxHeight:120,page:s.optionPage,power:'manual',oversize:false}]:[]),
 ...(!roman?[{name:'Somfy Roll Up 28 RTS V2',net:200,minWidth:17,maxWidth:72,maxHeight:72,page:s.somfyPage,power:'somfy12',oversize:false}]:[]),
 {name:'Somfy Sonesse Ultra 30 Li-ion',net:220,minWidth:roman?22:28,maxWidth:120,maxHeight:100,page:s.somfyPage,power:'somfyLi',oversize:false},
 {name:'Somfy Sonesse 30 RTS 24V DC',net:293,minWidth:21,maxWidth:120,maxHeight:120,page:s.somfyPage,power:'somfy24',oversize:false},
 {name:'Somfy Sonesse 40 Li-ion',net:308,minWidth:28,maxWidth:145,maxHeight:120,page:s.somfyPage,power:'somfyLi',oversize:!roman},
 {name:'Somfy Sonesse 40 110V',net:380,minWidth:23,maxWidth:160,maxHeight:120,page:s.somfyPage,power:'somfyAC',oversize:!roman},
 ...(!roman?[{name:'Somfy Sonesse 50 110V',net:420,minWidth:31,maxWidth:192,maxHeight:120,page:s.somfyPage,power:'somfyAC',oversize:true}]:[]),
 {name:'Alpha 30 2Nm Li-ion',net:165,minWidth:23,maxWidth:120,maxHeight:120,page:s.alphaPage,power:'alphaLi',oversize:false},
 {name:'Alpha 30 3Nm Li-ion',net:200,minWidth:23,maxWidth:120,maxHeight:150,page:s.alphaPage,power:'alphaLi',oversize:false},
 {name:'Alpha 40 5Nm Li-ion',net:250,minWidth:29,maxWidth:142,maxHeight:142,page:s.alphaPage,power:'alphaLi',oversize:!roman},
 {name:'Simphony 30 2Nm Li-ion',net:150,minWidth:17,maxWidth:120,maxHeight:120,page:s.simphonyPage,power:'simphonyLi',oversize:false},
 ...(!roman?[
 {name:'Simphony 40 3Nm Li-ion',net:250,minWidth:28,maxWidth:146,maxHeight:120,page:s.simphonyPage,power:'simphonyLi',oversize:true},
 {name:'Simphony 24V DC',net:175,minWidth:20,maxWidth:120,maxHeight:120,page:s.simphonyPage,power:'simphony24',oversize:false},
 {name:'Simphony 40 6Nm 110V',net:280,minWidth:30,maxWidth:146,maxHeight:120,page:s.simphonyPage,power:'simphonyAC',oversize:true},
 {name:'Simphony 50 20Nm 110V',net:320,minWidth:30,maxWidth:196,maxHeight:120,page:s.simphonyPage,power:'simphonyAC',oversize:true}]:[]),
 ];
}
export function sundanceShadeTopOptions(p:string,program:string){return schedules.rows.filter(r=>r.productId===p&&r.programIds.includes(program)&&r.name!=='Cassette Fabric Insert');}
export function sundanceShadeTopPrice(p:string,program:string,name:string,width:number){
 const row=schedules.rows.find(r=>r.productId===p&&r.programIds.includes(program)&&r.name===name);
 if(!row||!Number.isFinite(width)||width<=0)return null;const i=row.widths.findIndex(w=>w>=width);if(i<0||row.retail[i]==null)return null;
 return {retail:row.retail[i]!,sourcePage:row.sourcePage,sourceId:row.sourceId,gridWidth:row.widths[i],axisException:row.axisException};
}
export function validateSundanceShadeConfiguration(s:Pick<SelectionContext,'productId'|'programId'|'widthInches'|'heightInches'|'configuration'>):ValidationIssue[]{
 const p=s.productId,c=s.configuration,kind=sundanceShadeKind(p),source=sundanceShadeSource(p),issues:ValidationIssue[]=[];
 const add=(key:string,explanation:string,page=source.specPage)=>issues.push({severity:'hard_block',ruleId:`sundance.shade.${key}`,source:sourceProvenance(source.sourceId,{page}),selectedValues:{...c,widthInches:s.widthInches,heightInches:s.heightInches},explanation});
 const color=sundanceShadeColors.find(r=>r.productId===p&&r.id===c.fabric_color_id),collection=sundanceShadeFabricSource.collections.find(r=>r.productId===p&&r.id===c.catalog_sundance_shade_collection_id);
 if(!color||color.colorName!==c.fabric_color_name||color.programId!==s.programId||color.automaticDetails.catalog_sundance_shade_collection_id!==collection?.id)add('material','Select the exact dealer color and its own family collection/grid.');
 if(!lookupSundanceSourceGrid(p,s.programId??'',s.widthInches,s.heightInches))add('grid','No source retail base cell covers this exact configuration size. Motor capability does not create a missing shade price.');
 if(kind==='roman')add('roman_availability','The current dealer ordering menu has no dedicated flat Roman type; confirm current orderability.');
 const control=sundanceShadeControls(p).find(r=>r.name===c.sundance_shade_control);
 if(!control)add('control','Choose a control documented for this family.');
 const minHeight=kind==='roller'&&control?.name==='Cordless'?13:0;
 if(!Number.isFinite(s.widthInches)||!Number.isFinite(s.heightInches)||s.widthInches<=0||s.heightInches<=0||(control&&(s.widthInches<control.minWidth||s.widthInches>control.maxWidth||s.heightInches>control.maxHeight))||s.heightInches<minHeight)add('control_size','The selected control or product grid does not support these dimensions. Consult the displayed source limits.');
 if(kind==='roman'&&control?.name==='Cordless'&&/blackout|darkening/i.test(collection?.privacyType??'')&&(s.widthInches>84||s.heightInches>84))add('cordless_blackout','Flat Roman cordless blackout is limited to 84 × 84 inches.',source.optionPage);
 if(control?.oversize&&!['2½-inch','3¼-inch'].includes(String(c.sundance_shade_tube)))add('oversize_tube','This motor explicitly requires an oversized tube; motor size limits do not establish the tube surcharge for every smaller shade.');
 if(kind==='europanel'){
  if(c.mount_type!=='Outside')add('mount','Europanels are available as outside mount only. The order-form inside checkbox does not override the specification.',5);
  if(!['Left','Right'].includes(String(c.sundance_shade_wand)))add('wand','Choose left or right wand control.');
  if(!['Left','Right'].includes(String(c.sundance_shade_stack)))add('stack','Choose one-way left or right panel stack.');
  if(!['2','3','4','5'].includes(String(c.sundance_shade_panel_count)))add('panel_count','Documented panel stacks contain two to five panels.');
  if(!['4','5'].includes(String(c.sundance_shade_channels)))add('channels','Choose a documented four- or five-channel Soft White headrail.');
 }else if(!['Inside','Outside'].includes(String(c.mount_type)))add('mount','Choose inside or outside mounting.');
 if(kind!=='europanel'&&control?.power==='manual'&&control.name!=='Cordless'){
  if(!sundanceRollerChains.includes(String(c.sundance_shade_chain)))add('chain','Choose a documented chain finish.');
  if(!['Left','Right'].includes(String(c.sundance_shade_control_side)))add('side','Choose left or right chain control.');
 }
 const assembly=String(c.sundance_shade_assembly??'');
 if(!['Single','Two on one','Dual independent','Coupled motorized'].includes(assembly))add('assembly','Choose single or explicitly identify a multi-shade assembly.');
 else if(assembly!=='Single')add('components','Multiple shades require individual fabric, width, height, control and price records. A bracket/coupler charge is not the complete assembly price.');
 if(kind==='roller'){
  for(const message of sundancePrivacyPieceEvidence(c).issues)add('privacy_pieces',message,source.optionPage);
  if(!['None','Aluminum side channels','Solar bar'].includes(String(c.sundance_shade_privacy)))add('privacy','Choose none or a documented privacy accessory.');
  if(c.sundance_shade_fabric_insert!=null&&!['No','Yes'].includes(String(c.sundance_shade_fabric_insert)))add('insert_choice','Fabric insert must be Yes or No.');
  if(c.sundance_shade_hold_down!=null&&!['No','Yes'].includes(String(c.sundance_shade_hold_down)))add('hold_down','Hold-down brackets must be Yes or No.');
  if(control&&control.power!=='manual'&&!['Standard','2½-inch','3¼-inch'].includes(String(c.sundance_shade_tube)))add('tube','Choose a documented tube size; motor-specific oversized requirements remain mandatory.');
  if(!['Standard','Reverse'].includes(String(c.sundance_shade_roll)))add('roll','Choose standard or reverse roll.');
  const top=String(c.sundance_shade_top??'');
  if(top!=='Open roll'&&!sundanceShadeTopOptions(p,s.programId??'').some(r=>r.name===top))add('top','Choose a top treatment from this fabric-group source table.');
  if(top!=='Open roll'&&!sundanceShadeTopPrice(p,s.programId??'',top,s.widthInches))add('top_cell','Selected top treatment has no available width-band charge. N/A cells cannot be priced.');
  if(c.sundance_shade_roll==='Reverse'&&!['Open roll','Fascia 5"'].includes(top))add('reverse','This cassette or fascia supports standard roll only.');
  if(top!=='Open roll'&&!(top==='Contractor’s Box 5"'?['White','Silver']:sundanceRollerFinishes).includes(String(c.sundance_shade_finish)))add('finish','Choose a documented top-treatment finish; contractor boxes are White or Silver only.');
  if(c.sundance_shade_fabric_insert==='Yes'&&!['Small Round Cassette','Large Round Cassette'].includes(top))add('fabric_insert','Separate fabric-insert charge applies only to the small/large round cassette. Tuscany is already fabric wrapped.');
  if(c.sundance_shade_fabric_insert==='Yes'&&!sundanceShadeTopPrice(p,s.programId??'','Cassette Fabric Insert',s.widthInches))add('fabric_insert_cell','No source fabric-insert width-band charge is available.');
  if(!['Standard Hem Pocket','Exposed','Wrap-around','Enhanced Fabric-Wrapped'].includes(String(c.sundance_shade_bottomrail)))add('bottomrail','Choose a documented bottomrail.');
  if(c.sundance_shade_bottomrail==='Exposed'&&!sundanceRollerFinishes.includes(String(c.sundance_shade_bottomrail_color)))add('bottomrail_color','Choose a documented exposed-bottomrail finish.');
  if(c.sundance_shade_privacy==='Aluminum side channels'&&c.sundance_shade_bottomrail!=='Standard Hem Pocket')add('side_channel_hem','Aluminum side channels are for standard hembar only.');
  if(c.sundance_shade_privacy==='Aluminum side channels'&&!['White','Silver','Black'].includes(String(c.sundance_shade_privacy_color)))add('privacy_color','Side channels are White, Silver or Black.');
  if(c.sundance_shade_privacy==='Solar bar'&&!['White','Ivory','Gray','Bronze','Black'].includes(String(c.sundance_shade_privacy_color)))add('solar_color','Solar bars are White, Ivory, Gray, Bronze or Black.');
  if(['Aluminum side channels','Solar bar'].includes(String(c.sundance_shade_privacy)))add('privacy_length','Privacy accessories require separately persisted lengths, quantities and confirmed fractional-foot billing.');
  if(c.sundance_shade_dual_bracket==='Vertical'&&c.mount_type!=='Inside')add('dual_mount','Vertical open-roll dual brackets are inside mount only.');
 }
 if(kind==='roman'&&(c.sundance_shade_liner||c.liner))add('roman_liner','Lining is not available on flat Roman shades.');
 if(kind==='europanel'&&c.sundance_shade_top==='Rounded Corner Valance'){
  const valance=sundanceShadeTopPrice(p,s.programId??'','Rounded Corner Valance',s.widthInches);
  if(!valance)add('valance_cell','No rounded-valance source cell covers this width.');
  if(valance?.axisException&&s.widthInches>156)add('valance_axis',valance.axisException);
 }else if(kind==='europanel'&&c.sundance_shade_top!=='None')add('valance','Choose none or the rounded-corner valance.');
 if(kind!=='europanel'&&!['No','Yes'].includes(String(c.sundance_shade_railroad)))add('railroad_choice','Record whether this shade is railroaded.');
 if(collection&&kind!=='europanel'){
  const widths=collection.fabricWidth.match(/\d+(?:\.\d+)?/g)?.map(Number)??[];
  if(widths.length!==1)add('fabric_width','This fabric lists multiple or unverified roll widths; confirm the exact supplied roll and seam plan.');
  else if(s.widthInches>widths[0]&&(collection.railroaded!==true||c.sundance_shade_railroad!=='Yes'))add('railroad','Shade width exceeds the fabric roll. Only fabrics explicitly permitting railroading may be rotated, with the request saved.');
  if(c.sundance_shade_railroad==='Yes'&&collection.railroaded!==true)add('railroad_unavailable','This fabric is not documented as permitting railroading.');
  if(c.sundance_shade_railroad==='Yes'&&s.heightInches>widths[0])add('seam','Railroaded height exceeds roll width; factory-confirmed seam position and material feasibility are required.');
 }
 if(c.sundance_simphony_panel_id && (control?.name!=='Simphony 24V DC' || kind!=='roller')) add('panel_control','Shared Simphony 24V panel selection requires its exact roller DC control.');
 if(c.sundance_simphony_panel_id && (Number(c.sundance_shade_accessory_simphony24_qty??0)>0 || Number(c.sundance_shade_accessory_simphony_distribution_qty??0)>0)) add('panel_duplicate','A shared panel connection cannot also carry a transformer or distribution-box quantity.');
 sundanceShadeAccessoryIssues(p,c).forEach((r,i)=>add(`accessory_${i}`,r.explanation,r.page));
 return issues;
}
export function sundanceShadeConfigurationPatch(options:Record<string,unknown>,control:string){return{...Object.fromEntries(Object.entries(options).filter(([k])=>!k.startsWith('sundance_shade_accessory_'))),sundance_simphony_panel_id:null,sundance_order_power_v1:null,sundance_shade_control:control||null,sundance_shade_chain:null,sundance_shade_control_side:null};}
export function sundanceShadeOptionEvidence(p:string,program:string,c:Record<string,unknown>,width:number){
 const source=sundanceShadeSource(p),kind=sundanceShadeKind(p),control=sundanceShadeControls(p).find(r=>r.name===c.sundance_shade_control),entries:{label:string;amount:number;basis:'net'|'retail'|'unverified';page:number}[]=[],unresolved:string[]=[];
 const add=(label:string,amount:number,basis:'net'|'retail'|'unverified',page=source.optionPage)=>entries.push({label,amount,basis,page});
 if(control?.net)add(control.name,control.net,'net',control.page);
 if(control?.power==='manual'&&control.name!=='Cordless'&&c.sundance_shade_chain==='Stainless Steel')add('Stainless Steel chain',10,'net');
 for(const name of [String(c.sundance_shade_top??''),...(c.sundance_shade_fabric_insert==='Yes'?['Cassette Fabric Insert']:[])]){
  const r=sundanceShadeTopPrice(p,program,name,width);if(r)add(name,r.retail,'retail',r.sourcePage);
 }
 if(kind==='roller'){
  const rails:Record<string,number>={Exposed:8,'Wrap-around':8,'Enhanced Fabric-Wrapped':12};if(rails[String(c.sundance_shade_bottomrail)])add(String(c.sundance_shade_bottomrail),rails[String(c.sundance_shade_bottomrail)],'net');
  if(c.sundance_shade_assembly==='Dual independent'&&['Vertical','Small 45-degree','Large 45-degree'].includes(String(c.sundance_shade_dual_bracket)))add('Open-roll dual bracket set',30,'net');
  if(c.sundance_shade_assembly==='Coupled motorized')add('Motorized shade coupler',61,'unverified');
  if(c.sundance_shade_tube==='2½-inch'&&width>=120.125&&width<=144)add('Oversize 2½-inch tube',173,'net');
  else if(c.sundance_shade_tube==='3¼-inch'&&width>=145&&width<=196)add('Oversize 3¼-inch tube',290,'net');
  else if(c.sundance_shade_tube&&c.sundance_shade_tube!=='Standard')unresolved.push('The chosen oversized-tube charge is not defined for this width band, including the 144–145-inch gap.');
  const privacy=sundancePrivacyPieceEvidence(c);
  if(privacy.sourceNet!=null)add(`${c.sundance_shade_privacy}: ${privacy.feet} measured feet`,privacy.sourceNet,'net');
  unresolved.push(...privacy.issues);
 }
 for(const a of sundanceShadeAccessories(p)){const q=Number(c[sundanceShadeAccessoryKey(a.key)]??0);if(Number.isSafeInteger(q)&&q>0&&a.power.includes(control?.power??''))add(`${a.label} × ${q}`,q*a.net,'net',a.page);}
 unresolved.push(...sundanceShadeAccessoryIssues(p,c).map(r=>r.explanation));
 return{entries,unresolved,netSubtotal:entries.filter(r=>r.basis==='net').reduce((s,r)=>s+r.amount,0),retailSubtotal:entries.filter(r=>r.basis==='retail').reduce((s,r)=>s+r.amount,0),customerPriceEligible:false as const};
}

export function sundanceShadeAccessories(p:string){
 const s=sundanceShadeSource(p),roller=sundanceShadeKind(p)==='roller',rows:{key:string;label:string;net:number;page:number;power:string[];review?:string}[]=[];
 const add=(key:string,label:string,net:number,page:number,power:string[],review?:string)=>rows.push({key,label,net,page,power,...(review?{review}:{})});
 const somfy=['somfyLi','somfy24','somfyAC',...(roller?['somfy12']:[])],simphony=['simphonyLi',...(roller?['simphony24','simphonyAC']:[])];
 add('somfy_charger','Somfy Li-ion V2 charger,13-foot cable',36,s.somfyPage,['somfyLi',...(roller?['somfy12']:[])]);
 add('somfy24','Somfy 24V DC supply,6-foot cord',50,s.somfyPage,['somfy24']);
 if(roller){add('somfy12','Somfy 12V DC supply,10-foot cord',110,s.somfyPage,['somfy12']);add('somfy_battery','Somfy rechargeable external12V battery',50,s.somfyPage,['somfy12']);add('somfy_solar','Somfy WireFree solar charging kit',110,s.somfyPage,['somfyLi','somfy12']);}
 for(const [key,label,net] of [['situo1','Situo1-channel',66],['situo5','Situo5-channel',83],['telis16','Telis16-channel',290],['situo_variation','Situo5-Variation',154],['decoflex1','Decoflex1-channel wall',171],['decoflex5','Decoflex5-channel wall',182],['smoove1','Smoove1-channel wall',80],['smoove_multi','Smoove multi-channel (table5/image4)',100],['tahoma','TaHoma Switch',260],['tahoma_ethernet','TaHoma Ethernet adapter',22]] as const)add(key,label,net,s.somfyPage+1,somfy,key==='smoove_multi'?'Confirm Smoove channel model: source table5/image4 conflict.':undefined);
 for(const [key,label,net] of [['alpha_charger','Alpha charger,13-foot cord',28],['alpha_battery','Alpha external rechargeable battery',50],['alpha_remote1','Alpha1-channel remote',33],['alpha_remote5','Alpha5-channel remote',55],['alpha_remote16','Alpha16-channel remote',110],['alpha_wall8','Alpha8-channel wall',100],['alpha_hub','Alpha Neo Hub',300]] as const)add(key,label,net,s.alphaPage,['alphaLi']);
 add('simphony_charger','Simphony charger,12-foot cord',25,s.simphonyPage,['simphonyLi']);add('simphony_solar','Simphony solar charging kit',75,s.simphonyPage,['simphonyLi']);
 add('simphony_remote','Simphony15-channel remote',90,s.simphonyPage,simphony);add('simphony_wall','Simphony6-channel wall',75,s.simphonyPage,simphony);add('simphony_hub','Simphony Hub',125,s.simphonyPage+(roller?1:0),simphony);
 if(roller){add('simphony24','Simphony24V transformer,6-foot cord',50,s.simphonyPage,['simphony24']);add('simphony_distribution','Simphony24V distribution box,18-motor capacity',800,s.simphonyPage,['simphony24'],'Persist connected shades, capacity and a single order-level charge before approving this shared18-motor power box.');add('bond','Bond Bridge',192,s.simphonyPage+1,[...somfy,'alphaLi',...simphony],'Verify selected radio protocol and motor compatibility; generic RF range does not prove compatibility.');}
 return sundanceShadeKind(p)==='europanel'?[]:rows;
}
export function sundanceShadeAccessoryKey(key:string){return `sundance_shade_accessory_${key}_qty`;}
export function sundanceShadeAccessoryIssues(p:string,c:Record<string,unknown>){
 const control=sundanceShadeControls(p).find(r=>r.name===c.sundance_shade_control);
 return sundanceShadeAccessories(p).flatMap(r=>{
  const v=c[sundanceShadeAccessoryKey(r.key)];if(v==null||v==='')return[];const q=Number(v);
  if(!Number.isSafeInteger(q)||q<0)return[{page:r.page,explanation:`${r.label}: quantity must be a nonnegative whole number.`}];
  if(q>0&&!r.power.includes(control?.power??''))return[{page:r.page,explanation:`${r.label}: selected motor/voltage is incompatible.`}];
  return q>0&&r.review?[{page:r.page,explanation:r.review}]:[];
 });
}
