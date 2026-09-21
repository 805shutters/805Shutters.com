import { normanShutterProgram, normanShutterLouvers } from './norman-shutter-assortment';
/** 2020 Bypass binder sections: WL pp77–85, WLP pp93–101, BW pp90–98, ND pp92–100.
 * Dimensions below are manufacturer frame references, not pricing dimensions.
 * Outside mounting with fewer than two side frames has no formula on these pages.
 */
export const NORMAN_BYPASS_MOUNTS = ['Inside Mount','Semi-Inside Mount','Outside Mount'] as const;
export type NormanBypassRecord = {
 version:1; layout:''|'two_single_side_open'|'other';
 frontPanel:''|'left'|'right';
 mount:''|typeof NORMAN_BYPASS_MOUNTS[number];
 leftSideFrame:boolean|null;rightSideFrame:boolean|null;
 windowWidthInches:number|null;windowHeightInches:number|null;
 interlockingBottomGuide:boolean|null;
};
export function emptyNormanBypassRecord():NormanBypassRecord{return {version:1,layout:'',frontPanel:'',mount:'',leftSideFrame:null,rightSideFrame:null,windowWidthInches:null,windowHeightInches:null,interlockingBottomGuide:null};}
export function parseNormanBypassRecord(value:unknown):NormanBypassRecord|null{
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const r=value as Record<string,unknown>;
 if(!['','left','right'].includes(String(r.frontPanel)))return null;
 if(r.version!==1||!['','two_single_side_open','other'].includes(String(r.layout))||!['',...NORMAN_BYPASS_MOUNTS].includes(String(r.mount)))return null;
 if(['leftSideFrame','rightSideFrame','interlockingBottomGuide'].some(k=>r[k]!==null&&typeof r[k]!=='boolean'))return null;
 if(['windowWidthInches','windowHeightInches'].some(k=>r[k]!==null&&(typeof r[k]!=='number'||!Number.isFinite(r[k]))))return null;
 return r as NormanBypassRecord;
}
export function normanBypassPages(programId:string){return programId==='woodlore'?[77,78,79,81,85]:programId.startsWith('woodlore_')?[93,94,95,97,101]:programId==='brightwood'?[90,91,92,94,98]:[92,93,94,96,100];}
export function normanBypassPanelMaxWidth(programId:string,louver:unknown):number|null{
 const program=normanShutterProgram(programId);if(!program||!normanShutterLouvers(programId).includes(String(louver) as never))return null;
 if(program.material==='Wood')return louver==='1 7/8"'?30:['2 1/2"','3"'].includes(String(louver))?36:42;
 if(programId==='woodlore')return louver==='1 7/8"'?24:louver==='2 1/2"'?30:36;
 if(programId==='woodlore_aquashield')return ['2 1/2"','3"'].includes(String(louver))?31:36;
 return louver==='1 7/8"'?24:36;
}
export function normanBypassFrameReference(r:NormanBypassRecord):{width:number|null;height:number}|null{
 if(!r.mount||r.windowWidthInches===null||r.windowWidthInches<=0||r.windowHeightInches===null||r.windowHeightInches<=0||r.leftSideFrame===null||r.rightSideFrame===null)return null;
 const w=r.windowWidthInches,h=r.windowHeightInches;
 if(r.mount==='Outside Mount')return {width:r.leftSideFrame&&r.rightSideFrame?w+3:null,height:h+4.5};
 return {width:w-(r.leftSideFrame||r.rightSideFrame?0.125:0),height:h+(r.mount==='Semi-Inside Mount'?1.125:-0.125)};
}
