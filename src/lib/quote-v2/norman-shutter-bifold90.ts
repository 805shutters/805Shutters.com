import {normanBifoldMountKey} from '../quote/norman-shutter-bifold-special';
import {validateNormanSpecialBifold} from './norman-shutter-bifold-special';
import {normanBifold90Layouts,normanBifold90Pages,normanBifold90Wood} from '../quote/norman-shutter-bifold90';
import {normanShutterProgram} from '../quote/norman-shutter-assortment';
import type {NormanShutterPanelRecord} from '../quote/norman-shutter-panels';
import type {SelectionContext,ValidationIssue} from './core';
import {sourceProvenance} from './source-manifest';
export function validateNormanBifold90(s:SelectionContext,record:NormanShutterPanelRecord):ValidationIssue[]{
 if(record.application!=='bifold_other')return [];const p=normanShutterProgram(s.programId);if(!p)return [];const r=record.bifold90,c=s.configuration,issues:ValidationIssue[]=[];
 const add=(id:string,explanation:string)=>issues.push({severity:'hard_block',ruleId:`norman.shutter.bifold90.${id}`,source:sourceProvenance(p.sourceId,{pages:normanBifold90Pages(p.id)}),selectedValues:{programId:p.id,record},explanation});
 if(!r){add('schedule_required','Choose the exact 90-degree track subtype and record its panel and mounting schedule.');return issues;}
 if(['floating_90','frame_hinged'].includes(r.kind))return validateNormanSpecialBifold(s,record);
 if(!['standard_90','multifold_90'].includes(r.kind)){add('subtype_geometry','Floating and frame-hinged tracks need their own carrier, frame and panel geometry; standard 90-degree formulas do not apply.');return issues;}
 const layouts=normanBifold90Layouts(p.id,r.kind);
 if(!layouts.includes(r.layout))add('layout','Choose a documented standard 90-degree layout; four-panel multi-fold stacks are available only in Brightwood and Normandy.');
 if(c.panel_config!==r.layout)add('layout_mismatch','The saved 90-degree layout must match the selected panel layout.');
 if(!r.mount||normanBifoldMountKey(c.mount_type)!==normanBifoldMountKey(r.mount))add('mount','Select the exact Inside, Semi-Inside or Outside mount and save it with the track record.');
 if(!r.casing||r.referenceWidthInches===null||r.referenceHeightInches===null||r.referenceWidthInches<=0||r.referenceHeightInches<=0)add('measurement_basis','Record measured window dimensions without casing, or outside casing width and directly measured max-frame height for outside mount.');
 if(r.casing==='existing'&&r.mount!=='Outside Mount')add('casing_basis','The existing-casing width formula is documented only for outside mount. Inside and semi-inside require measured window opening dimensions.');
 if(!r.flatMountingSurface)add('flat_surface','Confirm a flat support surface for the header, light blocks and pivot brackets.');
 if(r.headerInches===null||(r.mount!=='Outside Mount'&&r.headerInches!==3))add('header','Inside and semi-inside tracks use the documented 3-inch header; outside mount offers 3 or 3½ inches.');
 if(!r.fascia||(p.id==='woodlore_aquashield'&&r.fascia!=='plain'))add('fascia','Select the fascia; AquaShield permits only plain fascia.');
 if(r.headerExtensionInches===null||r.headerExtensionInches<0||r.headerExtensionInches>2)add('extension','Record header extension from 0 (none) through 2 inches.');
 if(!(p.id==='woodlore_aquashield'?['2"']:['2"','2 1/4"']).includes(String(c.stile_width))||!['Butt','Rabbet'].includes(String(c.stile_join)))add('stile','Use 2 or 2¼-inch Butt/Rabbet stiles; AquaShield uses only 2-inch. Center/Astragal stiles are unavailable.');
 if(layouts.includes(r.layout)&&record.panels.length!==r.layout.length)add('panel_count','Record each actual finished panel width and height in the selected layout.');
 const max=r.kind==='multifold_90'?20:normanBifold90Wood(p.id)||p.id==='woodlore_aquashield'?26:24;
 record.panels.forEach((panel,i)=>{if(panel.widthInches==null||panel.widthInches<6||panel.widthInches>max)add('panel_width',`Panel ${i+1} finished width must be between 6 and ${max} inches for this track subtype.`);});
 return issues;
}
