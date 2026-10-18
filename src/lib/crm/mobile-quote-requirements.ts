import {mobileControlSidePolicy} from '@/lib/quote/mobile-control-side';
import type {MobileQuoteWindow} from './mobile-quote-draft';
import {validateMobileQuoteMeasurement} from './mobile-quote-draft';
import {lineInputs} from './mobile-supplier-spec';
import type {SalesQuoteDesign} from '@mts/types/quote';
import {ONYX_FOLDING_DIRECTIONS} from '@mts/lib/quoteConstants';
import {parseNormanPanelRecord,NORMAN_SHUTTER_PANEL_RECORD} from '@/lib/quote/norman-shutter-panels';
import {normanBifold180Layouts} from '@/lib/quote/norman-shutter-bifold180';
import {normanBifold90Layouts} from '@/lib/quote/norman-shutter-bifold90';
const text=(...values:unknown[])=>values.find(v=>typeof v==='string'&&v.trim()) as string|undefined;
export function allowsNoOperatingSide(family:string|null,system:string){return family!=='Shutters'&&(/motor/i.test(system)||!['Faux Wood Blinds','Wood Blinds','Vertical Blinds'].includes(family??'')&&/cordless/i.test(system));}
/** Only the tracked Onyx source provides these general direction labels. */
export function sourceShutterFoldingChoices(design:SalesQuoteDesign){return design.supplier==='Onyx'&&design.options_json.shutter_type==='Tracked Shutter'?ONYX_FOLDING_DIRECTIONS:null;}
export function sourceNormanFoldingLayout(design:SalesQuoteDesign){
 if(design.supplier!=='Norman')return null;const record=parseNormanPanelRecord(design.options_json[NORMAN_SHUTTER_PANEL_RECORD]),program=String(design.options_json.catalog_program_id??'');
 if(record?.application==='bifold_180'&&record.bifold180?.layout&&normanBifold180Layouts(program).includes(record.bifold180.layout))return record.bifold180.layout;
 if(record?.application==='bifold_other'&&record.bifold90?.layout&&normanBifold90Layouts(program,record.bifold90.kind).includes(record.bifold90.layout))return record.bifold90.layout;
 return null;
}
/** Mike's explicit quote requirements. Additional supplier-order checks remain separate. */
export function mobileRequiredQuoteIssues(line:MobileQuoteWindow):string[]{
 const design=line.activeProductId?line.families[line.activeProductId]?.design:undefined,input=lineInputs(line),o=design?.options_json??{},missing:string[]=[];
 if(validateMobileQuoteMeasurement(line))missing.push('valid width, height and quantity');
 if(!design)return ['exact product'];
 const required=(label:string,value:unknown)=>{if(value==null||value===''||typeof value==='string'&&!value.trim())missing.push(label);};
 const mount=text(input.mount,design.mount_type,o.onyx_mount);if(!mount||!/inside|outside|^(?:IM|OM)(?:\b|\s|-)/i.test(mount))missing.push('inside/outside mount');
 if(input.family==='Shutters'){
  required('louver size',design.louver_size);required('frame',o.frame_type);required('color',text(o.color,input.colorFabric,design.fabric));required('folding direction',text(o.folding_direction,sourceNormanFoldingLayout(design)));
  const panelChoice=design.supplier==='Norman'&&parseNormanPanelRecord(o[NORMAN_SHUTTER_PANEL_RECORD])?.panels.some(panel=>panel.divider==='none'||panel.divider==='present');
  if(!panelChoice&&![o.split_tilt,o.divider_rail].some(v=>v===true||v===false||v==='Yes'||v==='No'))missing.push('explicit split-tilt or divider-rail choice');
 }else{
  if(['Faux Wood Blinds','Wood Blinds','Vertical Blinds'].includes(input.family??''))required('louver/slat size',text(o.slat_size,design.louver_size));
  if(input.family==='Roller Shades')required('fabric',text(input.colorFabric,design.fabric,o.fabric_color_code));
  const system=text(input.control,design.lift_system,design.tilt_type,o.control_type,o.operating_system)??'';required('operating system',system);
  const side=text(input.controlSide,o.control_side,o.chain_location)??'';const sidePolicy=mobileControlSidePolicy(design,system);if(sidePolicy.required){required('operating/control side',side);if(side&&sidePolicy.choices.length&&!sidePolicy.choices.some(choice=>choice.toLowerCase()===side.toLowerCase()))missing.push('manufacturer-supported control side');}
  if(/^(?:not applicable|n\/?a)$/i.test(side)&&!allowsNoOperatingSide(input.family,system))missing.push('applicable operating/control side');
 }
 return missing;
}
