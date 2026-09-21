import { normanBypassPages,normanBypassPanelMaxWidth } from '../quote/norman-shutter-bypass';
import { normanShutterProgram } from '../quote/norman-shutter-assortment';
import type { NormanShutterPanelRecord } from '../quote/norman-shutter-panels';
import type { SelectionContext,ValidationIssue } from './core';
import { sourceProvenance } from './source-manifest';
export function validateNormanShutterBypass(s:SelectionContext,record:NormanShutterPanelRecord):ValidationIssue[]{
 if(!['bypass_closed','bypass_open'].includes(record.application))return [];
 const program=normanShutterProgram(s.programId);if(!program)return [];
 const r=record.bypass,issues:ValidationIssue[]=[];
 const add=(id:string,explanation:string)=>issues.push({severity:'hard_block',ruleId:`norman.shutter.bypass.${id}`,source:sourceProvenance(program.sourceId,{pages:normanBypassPages(program.id)}),selectedValues:{record,programId:program.id},explanation});
 if(!r){add('record_required','Record the bypass panel arrangement, mounting, side frames, window measurements and bottom guide.');return issues;}
 if(r.layout!=='two_single_side_open')add('layout_geometry','Combi-joined, center-open, multi-panel and additional-track layouts need their exact factory panel and hardware schedule.');
 if(record.application==='bypass_open'&&r.layout==='two_single_side_open'&&!r.frontPanel)add('front_panel','Choose Left over Right or Right over Left for the two-panel Open Bypass arrangement.');
 if(r.layout==='two_single_side_open'&&record.panels.length!==2)add('panel_count','The two-single-panel side-open bypass schedule must contain exactly two panels.');
 const selectedMount=String(s.configuration.mount_type??'').toLowerCase().replace(/[-_]/g,' ').replace(/ mount$/,'').trim();
 if(!r.mount||selectedMount!==r.mount.toLowerCase().replace(/-/g,' ').replace(/ mount$/,''))add('mount','The bypass mounting record must match the selected Inside, Semi-Inside or Outside Mount.');
 if(r.leftSideFrame===null||r.rightSideFrame===null)add('side_frames','Record the left and right side-frame choices separately.');
 if(r.windowWidthInches===null||r.windowWidthInches<=0||r.windowHeightInches===null||r.windowHeightInches<=0)add('measurement','Enter actual window width and height separately from finished panel dimensions.');
 if(r.mount==='Outside Mount'&&r.leftSideFrame!==null&&r.rightSideFrame!==null&&(!r.leftSideFrame||!r.rightSideFrame))add('outside_width_geometry','The source width-addition formula covers both side frames. Outside Mount with fewer side frames needs factory dimensions.');
 if(r.interlockingBottomGuide===null||(record.application==='bypass_closed'&&!r.interlockingBottomGuide))add('bottom_guide','Closed Bypass includes the interlocking bottom guide; Open Bypass requires an explicit optional-guide choice.');
 const max=normanBypassPanelMaxWidth(program.id,s.configuration.louver_size);
 if(max===null)add('louver','Choose a louver documented for this exact shutter program; AquaShield does not offer 1⅞-inch louvers.');
 if(r.layout==='two_single_side_open'&&max!==null)record.panels.forEach((panel,index)=>{if(panel.widthInches==null||panel.widthInches<6||panel.widthInches>max)add('panel_width',`Panel ${index+1} finished width must be from 6 to ${max} inches for this program and louver.`);});
 return issues;
}
