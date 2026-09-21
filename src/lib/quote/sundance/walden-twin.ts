import type{SelectionContext,ValidationIssue}from'@/lib/quote-v2/core';
import{sourceProvenance}from'@/lib/quote-v2/source-manifest';
import{SUNDANCE_WALDEN_TWIN_KEY,readSundanceWaldenTwin,type SundanceWaldenTwin}from'./walden-twin-records';
import{sundanceWaldenControls,sundanceWaldenControlLimits}from'./walden-configuration';
import{sundanceWaldenSource}from'./walden-assortment';
import{sundanceWaldenAccessories,sundanceWaldenAccessoryKey,sundanceWaldenAccessoryIssues,sundanceWaldenOptionEvidence}from'./walden-option-schedules';
import{sundanceWaldenChoices,sundanceWaldenLinerColors}from'./supplemental-configuration';
import{lookupSundanceOptionSourceGrid}from'./option-grids';
export function sundanceWaldenTwinControls(p:string){return sundanceWaldenControls(p).filter(c=>!['Cordless TDBU','Pro Wand'].includes(c));}
export function sundanceWaldenTwinFlushDepth(p:string,t:SundanceWaldenTwin):number|null{
 const a=t.front.control,b=t.liner.control;if(a==='Cordless'&&b==='Cordless')return p.endsWith('premier')?4.5:4.375;
 if(a==='Clutch and Loop'&&b==='Clutch and Loop')return 4.5;
 const motor=(c:string)=>['Standard LI Motor','Power Lift LI Motor','Somfy Sonesse Ultra 30'].includes(c);
 return motor(a)&&motor(b)?p.endsWith('premier')?5.5:6.5:null;
}
export function sundanceWaldenTwinLinerOptions(t:SundanceWaldenTwin){return{sundance_walden_style:'Standard',sundance_walden_control:t.liner.control,sundance_walden_chain:t.liner.chain,...Object.fromEntries(Object.entries(t.liner.accessoryQuantities).map(([k,q])=>[sundanceWaldenAccessoryKey(k),q]))};}
export function sundanceWaldenTwinLinerEvidence(t:SundanceWaldenTwin){return{liner:lookupSundanceOptionSourceGrid(t.productId,t.liner.gridId,Number(t.liner.widthInches),Number(t.liner.heightInches)),options:sundanceWaldenOptionEvidence(t.productId,sundanceWaldenTwinLinerOptions(t),Number(t.liner.widthInches),Number(t.liner.heightInches))};}
export function validateSundanceWaldenTwin(s:Pick<SelectionContext,'productId'|'widthInches'|'heightInches'|'configuration'>):ValidationIssue[]{
 const c=s.configuration,p=s.productId,stored=c[SUNDANCE_WALDEN_TWIN_KEY];if(c.walden_movable_liner!=='Yes'&&stored==null)return[];
 const premier=p.endsWith('premier'),source=sundanceWaldenSource.sources.find(s=>s.file.includes(premier?'Premier':'Select'))!,issues:ValidationIssue[]=[];
 const add=(key:string,message:string,page=premier?15:14)=>issues.push({severity:'hard_block',ruleId:`sundance.walden.twin_${key}`,source:sourceProvenance(source.sourceId,{page}),selectedValues:{productId:p},explanation:message});
 if(c.walden_movable_liner!=='Yes'){add('stale','Stored twin component records require an active movable liner.');return issues;}
 const t=readSundanceWaldenTwin(stored);if(!t||t.productId!==p||t.front.id===t.liner.id){add('records','Retain distinct versioned woven-front and movable-liner records for this exact Walden family.');return issues;}
 if(t.front.fabricId!==c.fabric_color_id||t.front.programId!==c.catalog_program_id||t.front.control!==c.sundance_walden_control||t.front.widthInches!==s.widthInches||t.front.heightInches!==s.heightInches)add('front_snapshot','Refresh the twin front record to the current shade dimensions, material and control.');
 if(t.liner.gridId!==c.catalog_sundance_liner_grid_id||t.liner.color!==c.walden_liner_color||t.liner.material!==c.walden_liner||!sundanceWaldenChoices(p,'liner').some(r=>r.id===t.liner.gridId)||!sundanceWaldenLinerColors(p,t.liner.gridId).includes(t.liner.color))add('liner_identity','The movable liner must preserve the exact selected family liner grid and color.');
 for(const [role,part,side]of [['Front',t.front,t.frontControlSide],['Liner',t.liner,t.liner.controlSide]] as const){
  if(!sundanceWaldenTwinControls(p).includes(part.control)){add('control',`${role}: twins support cordless, clutch or documented remote motors; TDBU and Pro Wand are unavailable.`);continue;}
  const lim=sundanceWaldenControlLimits(p,part.control),w=Number(part.widthInches),h=Number(part.heightInches);
  if(!Number.isFinite(w)||!Number.isFinite(h)||w<lim.minWidth||w>lim.maxWidth||h<lim.minHeight||h>lim.maxHeight)add('dimensions',`${role}: ${part.control} requires width ${lim.minWidth}–${lim.maxWidth} and height ${lim.minHeight}–${lim.maxHeight} inches.`);
  if(part.control==='Cordless'?side!=='Not applicable':!['Left','Right'].includes(side))add('side',`${role}: record the control side, or Not applicable for cordless. Rear cord loops remain behind the woven shade.`);
 }
 if(!lookupSundanceOptionSourceGrid(p,t.liner.gridId,Number(t.liner.widthInches),Number(t.liner.heightInches)))add('liner_grid','No source liner cell covers the separately saved movable-liner dimensions.');
 if(t.liner.control==='Clutch and Loop'&&!(premier?['Metal standard']:['Nickel-plated standard','Stainless Steel']).includes(t.liner.chain))add('chain','Choose the documented liner clutch-chain finish.');
 for(const key of Object.keys(t.liner.accessoryQuantities))if(!sundanceWaldenAccessories.some(a=>a.key===key))add('accessory_key','An unrecognized movable-liner accessory cannot be priced.');
 for(const message of sundanceWaldenAccessoryIssues(sundanceWaldenTwinLinerOptions(t)))add('accessory',`Movable liner: ${message}`);
 const depth=sundanceWaldenTwinFlushDepth(p,t);
 if(depth==null)add('mixed_depth','Mixed twin controls are permitted, but the exact mixed-control headrail/mounting depth requires manufacturer confirmation.');
 if(c.mount_type==='Inside'&&c.sundance_walden_flush==='Yes'&&depth!=null&&(!Number.isFinite(Number(c.sundance_walden_depth))||Number(c.sundance_walden_depth)<depth))add('depth',`This twin control pair requires at least ${depth} inches for flush inside mounting; fabric thickness can increase the requirement.`);
 if(c.sundance_walden_assembly!=='Single')add('multi','Common-headrail twin combinations still require separate manufacturer approval.');
 return issues;
}
