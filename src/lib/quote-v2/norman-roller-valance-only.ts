import { deriveRollerGroupHardware } from "./norman-roller-group-hardware";
import { rollerValancePieceLimit } from "../quote/norman-roller-fabric-widths";
import { normanRollerFabricColors } from '../quote/norman-roller-fabrics';
import { ROLLER_VALANCE_KEY as KEY, ROLLER_VALANCE_DERIVED as DERIVED, ROLLER_VALANCE_SOURCE as SOURCE, ROLLER_SEPARATE_VALANCE as SEPARATE, ROLLER_VALANCE_HOLD, ROLLER_VALANCE_STYLES, ROLLER_FASCIA_COLORS, ROLLER_CAP_COLORS, isRollerValance, parseRollerValance } from '../quote/norman-roller-valance-only';
import { rollerHardware } from './norman-roller-hardware';
import type { SelectionContext, ValidationIssue, SelectionRecord, SelectionValue } from './core';
import { sourceProvenance } from './source-manifest';
const norm=(v:unknown)=>String(v??'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const issue=(s:SelectionContext,id:string,explanation:string,page=37):ValidationIssue=>({severity:'hard_block',ruleId:`roller.valance_only.${id}`,source:sourceProvenance(SOURCE,{page}),selectedValues:{productId:s.productId,record:s.configuration[KEY]??null},explanation});
export const hasRollerValanceUnits=(id:string,c:Record<string,unknown>)=>isRollerValance(id)&&parseRollerValance(c[KEY])!==null;
export function validateRollerValance(s:SelectionContext):ValidationIssue[]{
 if(!isRollerValance(s.productId))return[];
 const issues=[issue(s,'price_approval',ROLLER_VALANCE_HOLD)],add=(id:string,text:string,page=37)=>issues.push(issue(s,id,text,page)),r=parseRollerValance(s.configuration[KEY]);
 if(s.catalogAsOf<'2026-09-20')add('effective_date','This destination was introduced September 20, 2026.');
 if(s.manufacturerId.toLowerCase()!=='norman'||s.programId!==`${s.productId}_source`)add('program','Choose the exact Norman Roller valance source program.');
 if(s.widthInches!==0||s.heightInches!==0)add('natural_units','Record the explicit valance width; window opening dimensions do not apply to this line.');
 if(!Number.isSafeInteger(s.quantity)||s.quantity<1)add('quantity','Quantity counts complete valances and must be a positive whole number.');
 if(!r){add('record','Save the complete typed Roller valance selection.');return issues;}
 if(!ROLLER_VALANCE_STYLES.includes(r.style as never))add('style','Choose a documented 4.5-inch fascia or 4.5-, 6- or 8-inch Fabric Valance. The 3.5-inch styles, Modern Wood and Cassette are unavailable here.');
 if(r.width===null||r.width<8)add('width','Valance width must be at least 8 inches. Specify end-to-end width including any returns.');
 if(!r.mount)add('mount','Specify Inside or Outside mount.');
 if(r.returnLength===null||r.returnLength<0)add('return_length','Specify return length explicitly. There is no default; use zero only when ordering no returns.');
 const fabric=/Fabric/.test(r.style),wrapped=/with Fabric/.test(r.style),color=normanRollerFabricColors.find(c=>c.available&&c.colorCode===r.fabricCode);
 if(fabric&&!color)add('fabric','Choose an exact current Roller fabric/color identity for the valance; no default fabric is assumed.',38);
 if(!fabric&&r.fabricCode)add('stale_fabric','Clear fabric selection for plain fascia.',38);
 if(!fabric&&!ROLLER_FASCIA_COLORS.includes(r.fasciaColor as never))add('fascia_color','Specify a listed fascia color.',38);
 if(fabric&&r.fasciaColor)add('stale_fascia_color','Clear the plain fascia color for a fabric-wrapped treatment.',38);
 if(wrapped&&!ROLLER_CAP_COLORS.includes(r.endCapColor as never))add('end_cap','Specify a listed wrapped-fascia end-cap color.',38);
 if(!wrapped&&r.endCapColor)add('stale_end_cap','Clear the wrapped-fascia end-cap choice for this treatment.',38);
 const material=rollerValancePieceLimit(r.style,r.fabricCode),pieceMaximum=material.maximum??95;
 if(fabric&&material.maximum===null)add('material_width','No exact source fabric width exists for this valance fabric. Confirm it before deriving splice limits.',39);
 if(r.joinery==='Connector'&&(r.keystoneCount!==0||r.locations.length||r.layout!=='Equally Centered'||r.keystoneShape))add('connector','Connectors split equally. Clear all keystone-only choices.',39);
 let points:number[]=[];
 if(r.joinery==='Keystone'){
  if(!Number.isInteger(r.keystoneCount)||r.keystoneCount<1||r.keystoneCount>5)add('keystone_count','Select one through five keystones.',39);
  if(!r.keystoneShape)add('keystone_shape','Select V-Shape or Square keystones.',40);
  const n=Math.max(0,Math.min(5,r.keystoneCount));
  if(r.layout==='Custom'&&(r.locations.length!==n||r.locations.some(v=>v===null)))add('locations','Specify each keystone center from the left end of the end-to-end valance width.',40);
  if(r.layout==='Equally Centered'&&r.locations.length)add('stale_locations','Clear custom positions when selecting equal spacing.',40);
  points=Array.from({length:n},(_,i)=>r.layout==='Custom'?r.locations[i]??NaN:(r.width??NaN)*(i+1)/(n+1));
  if(points.some((p,i)=>!Number.isFinite(p)||p<18||p>(r.width??0)-18||i>0&&p-points[i-1]<18))add('spacing','Keystone centers require at least 18 inches from each end and from one another.',40);
 }
 const split=r.width!==null&&r.width>pieceMaximum?(r.joinery==='Keystone'?points:Array.from({length:Math.min(1000,Math.ceil(r.width/pieceMaximum))-1},(_,i)=>r.width!*(i+1)/Math.ceil(r.width!/pieceMaximum))):[];
 const pieces=r.width===null?[]:[...split,r.width].map((v,i)=>v-(i?split[i-1]:0));
 if(pieces.some(p=>!Number.isFinite(p)||p<=0||p>pieceMaximum))add('piece_length',`Every splice section must be positive and no longer than ${pieceMaximum} inches for the selected material.`,39);
 if(s.productId!==SEPARATE&&(r.associatedLineIds.length||r.controlClearanceConfirmed))add('association','Valance Only is independent. Use Separate Valance to associate shades.');
 if(s.productId===SEPARATE&&!s.configuration[DERIVED])add('associated_shades','Select the associated Roller shade lines in this quote so their compatibility can be validated.');
 const c:Record<string,SelectionValue>={...s.configuration,[KEY]:r};
 c.valance=r.style;c.mount_type=r.mount;c.fabric_color_code=color?.colorCode??null;c.fabric_color_name=color?.colorName??null;
 c.roller_valance_width=r.width;c.roller_valance_return_length=r.returnLength;c.roller_valance_fascia_color=r.fasciaColor;c.roller_valance_end_cap_color=r.endCapColor;c.roller_valance_joinery=r.joinery;c.roller_valance_keystone_centers=points.filter(Number.isFinite).join(', ');
 c[DERIVED]={...((c[DERIVED] as SelectionRecord)??{}),version:1,type:'roller_separate_or_only_valance',sourceId:SOURCE,sourcePages:[37,38,39,40],raceway:false,valanceBracketSize:'large',endToEndWidth:r.width,returnLength:r.returnLength,splitLocations:split.filter(Number.isFinite),pieceLengths:pieces.filter(Number.isFinite),materialWidthStatus:fabric?material.maximum===null?'exact_source_mapping_pending':'exact_color_source_width':'95_inch_maximum_piece',fabricCode:r.fabricCode,fabricWidth:material.fabricWidth,fabricWidthSourcePage:material.sourcePage,maximumPieceWidth:material.maximum,quantity:s.quantity,pricingStatus:'standalone_separate_price_unverified'};
 s.configuration=c;return issues;
}
/** Membership is reconstructed exclusively from selected quote lines. */
export function deriveRollerSeparateValances(lines:readonly {lineId:string;selection:SelectionContext}[]):ValidationIssue[]{
 const issues:ValidationIssue[]=[],byId=new Map(lines.map(l=>[l.lineId,l])),owners=new Map<string,string[]>();
 for(const row of lines){const c={...row.selection.configuration};delete c[DERIVED];row.selection.configuration=c;}
 for(const row of lines.filter(l=>l.selection.productId===SEPARATE)){
  const s=row.selection,r=parseRollerValance(s.configuration[KEY]);if(!r)continue;
  const add=(id:string,text:string)=>issues.push(issue(s,id,text));
  const members=r.associatedLineIds.flatMap(id=>byId.has(id)?[byId.get(id)!]:[]);
  if(!r.associatedLineIds.length||new Set(r.associatedLineIds).size!==r.associatedLineIds.length||members.length!==r.associatedLineIds.length||members.some(l=>l.selection.productId!=='roller'||l.selection.manufacturerId.toLowerCase()!=='norman'||l.selection.catalogAsOf<'2026-09-20')){add('members','Select unique current Norman Roller shade lines from the active quote.');continue;}
  for(const m of members)owners.set(m.lineId,[...(owners.get(m.lineId)??[]),row.lineId]);
  if(members.some(l=>l.selection.quantity!==s.quantity))add('quantity_matching','Each associated shade line must have the same assembly quantity as its separate valance.');
  const mounts=members.map(l=>norm(l.selection.configuration.mount_type));
  if(mounts.some(v=>r.mount==='Inside'?!['inside','inside mount','im','ib'].includes(v):r.mount==='Outside'?!['outside','outside mount','om','ob'].includes(v):true))add('mount_matching','Associated shades and separate valance must use the same Inside or Outside mount.');
  const apps=members.map(l=>norm(l.selection.configuration.roller_application??l.selection.configuration.shade_type));
  if(apps.some(a=>/cassette|lightguard|common/.test(a)))add('application','Separate valance cannot reuse a Cassette, LightGuard360 or existing common-valance assembly.');
  if(new Set(apps.map(a=>/dual/.test(a))).size>1)add('single_dual','Single/coupled and Dual shades cannot share a separate valance.');
  if(apps.some(a=>/dual/.test(a))&&r.style!=='8-inch Fabric Valance')add('dual_valance','Dual shades require the 8-inch Fabric Valance.');
  if(members.some(l=>rollerHardware(l.selection)?.record.raceway!==true))add('raceway','Every associated shade requires raceway. The separate valance itself has no raceway.');
  const small=members.some(l=>/cordless/.test(norm(l.selection.configuration.lift_system))&&l.selection.widthInches<=20);
  const large=members.some(l=>/large|2 5|3 inch/.test(norm(l.selection.configuration.roller_tube))||/cordless/.test(norm(l.selection.configuration.lift_system))&&l.selection.widthInches>20);
  if(small&&large)add('cordless_upgrade','Cordless shades 20 inches or narrower cannot upgrade to the larger tube required by another associated shade.');
  const control=members.some(l=>/cord.*loop|smart ?release|autowand/.test(norm(l.selection.configuration.lift_system)+' '+norm(l.selection.configuration.roller_power_configuration)));
  if(control&&!r.controlClearanceConfirmed)add('control_clearance','Confirm that the installation provides space for each Cord Loop/SmartRelease tension device or AutoWand hook.');
  const width=members.reduce((n,l)=>n+l.selection.widthInches,0),fascia=/Fascia/.test(r.style),minimum=width+(r.mount==='Outside'&&fascia?.25:0),maximum=width+12*(members.length-1);
  const hardware=s.catalogVersion.endsWith('-2026-09-20-r2')?deriveRollerGroupHardware(members,'separate'):null;if(hardware)issues.push(...hardware.issues);
  add('hardware_matching','Large valance and associated mounting brackets are required. The guide p70 lists shade-bracket applicability without a complete factory size-selection threshold; exact shade bracket and applicable SmartRelease clutch selection remain unverified.');
  s.configuration={...s.configuration,[DERIVED]:{version:1,type:'roller_separate_valance',groupHardware:hardware?.record??null,sourceId:SOURCE,sourcePages:[37],ownerLineId:row.lineId,associatedLineIds:r.associatedLineIds,associatedOrderWidths:members.map(l=>l.selection.widthInches),associatedApplications:apps,associatedLiftSystems:members.map(l=>String(l.selection.configuration.lift_system??'')),recommendedMinimumWidth:minimum,recommendedMaximumWidth:maximum,recommendedWidthStatus:r.width!==null&&r.width>=minimum&&r.width<=maximum?'within_recommended_range':'outside_recommended_range',mount:r.mount,valanceBracketSize:'large',associatedMountingBracketSize:'large',tubeUpgradeRequired:large,pricingStatus:'standalone_separate_price_unverified'}};
 }
 for(const [lineId,ids] of owners)if(ids.length>1)for(const id of ids)issues.push(issue(byId.get(id)!.selection,'duplicate_membership',`Shade ${lineId} belongs to more than one separate valance. Select it in only one assembly.`));
 return issues;
}

/** Client summary of saved local specifications only. Full membership/price validation remains server-owned. */
export function savedRollerValanceSpecificationIssues(productId:string,options:Record<string,unknown>):ValidationIssue[]{
 const record=parseRollerValance(options[KEY]);if(!record)return [];
 return validateRollerValance({manufacturerId:'Norman',productId,programId:`${productId}_source`,catalogAsOf:'2026-09-20',catalogVersion:'805-v2-norman-roller-valance-2026-09-20-r2',widthInches:0,heightInches:0,quantity:1,options:{},configuration:{[KEY]:record}}).filter(issue=>!['roller.valance_only.price_approval','roller.valance_only.associated_shades'].includes(issue.ruleId));
}
