import { validateNormanShutterBifold180 } from './norman-shutter-bifold180';
import { NORMAN_SHUTTER_PANEL_RECORD, normanPanelMaxHeight, normanDividerThreshold, parseNormanPanelRecord } from '../quote/norman-shutter-panels';
import { normanShutterProgram } from '../quote/norman-shutter-assortment';
import { normanRegularPanelCount } from '../quote/norman-shutter-construction';
import type { SelectionContext,ValidationIssue } from './core';
import { sourceProvenance } from './source-manifest';

/** Bounded documented constraints; does not authorize shutter pricing or track geometry. */
export function validateNormanShutterPanels(s:SelectionContext):ValidationIssue[]{
  if(s.productId!=='norman_shutters'||s.catalogAsOf<'2026-09-20')return [];
  const program=normanShutterProgram(s.programId);if(!program)return [];
  const p=program.id,c=s.configuration,issues:ValidationIssue[]=[];
  const specs=p.startsWith('woodlore_')?38:32;
  const dividerPage=p.startsWith('woodlore_')?44:38;
  const add=(id:string,explanation:string,pages:number[]=[specs])=>issues.push({severity:'hard_block',ruleId:`norman.shutter.panels.${id}`,source:sourceProvenance(program.sourceId,{pages}),selectedValues:{programId:p,record:c[NORMAN_SHUTTER_PANEL_RECORD]??null},explanation});
  const record=parseNormanPanelRecord(c[NORMAN_SHUTTER_PANEL_RECORD]);
  if(!record){add('record_required','Record the exact shutter application, motor generation and finished panel heights before construction can be verified.');return issues;}
  if(!record.application||!record.motor)add('application_required','Choose the exact application and motor generation.');
  if(record.motor&&record.motor!=='none')add('motor_geometry','Motor generation is saved; its panel, louver and accessory restrictions require separate verification.');
  if(p==='woodlore_aquashield'&&record.application==='bypass_open')add('aquashield_open_bypass','Woodlore AquaShield does not offer Open Bypass.',[93]);
  // These subtypes need independent shape/track dimensions and construction rules.
  if(record.application&&record.application!=='regular')add('application_geometry','This application is saved; its specialized dimensions and construction remain subject to manufacturer verification.');
  const expected=normanRegularPanelCount(c.panel_config);
  if(record.panels.length===0||record.panels.length>64||(record.application==='regular'&&(expected===null||expected!==record.panels.length)))add('panel_count','Record one finished panel height and divider choice for every panel in the exact layout.');
  const max=normanPanelMaxHeight(p),threshold=normanDividerThreshold(p,record);
  record.panels.forEach((panel,index)=>{
    if(panel.heightInches===null||panel.heightInches<10||panel.heightInches>max)add('height',`Panel ${index+1} finished height must be from 10 to ${max} inches; do not use opening height.`,[specs]);
    if(!panel.divider)add('divider_choice',`Record whether panel ${index+1} has a divider rail.`,[dividerPage]);
    if(panel.heightInches!==null&&panel.heightInches>threshold&&panel.divider!=='present')add('divider_required',`Panel ${index+1} exceeds the ${threshold}-inch no-divider limit for this program/application.`,[specs,dividerPage]);
    if(panel.divider==='present')add('divider_geometry',`Panel ${index+1} divider presence is saved. Exact positions, measurement basis and louver spacing still require verification.`,[dividerPage]);
  });
  issues.push(...validateNormanShutterBifold180(s,record));
  return issues;
}
