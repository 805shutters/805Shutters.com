import type {NormanShutterPanelRecord} from './norman-shutter-panels';
import {normanDoubleHungLayouts} from './norman-shutter-double-hung';
/** Site facts, not an inferred consequence of selecting a frame. */
export type NormanShutterBottomSupport = {
 version:1;
 support:''|'bottom_frame'|'existing_sill'|'none';
 gapInches:number|null;
 frequentlyOpen:boolean|null;
};
export function parseNormanShutterBottomSupport(value:unknown):NormanShutterBottomSupport|null{
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const r=value as Record<string,unknown>;
 if(r.version!==1||!['','bottom_frame','existing_sill','none'].includes(String(r.support))||![null,true,false].includes(r.frequentlyOpen as boolean|null)||(r.gapInches!==null&&(typeof r.gapInches!=='number'||!Number.isFinite(r.gapInches))))return null;
 return r as NormanShutterBottomSupport;
}
export function normanShutterUsesSillSupport(application:string){return ['regular','french_door','double_hung'].includes(application);}

/** A typed two-row schedule puts the window sill below the lower row only.
 * WL101/WLP117/BW115/ND117 allow optional horizontal posts; upper division
 * support must not be mislabeled as an existing sill. Final geometry stays held. */
export function normanShutterPanelUsesSillSupport(record:NormanShutterPanelRecord,index:number,programId:string){
 if(!normanShutterUsesSillSupport(record.application))return false;
 const d=record.application==='double_hung'?record.doubleHung:undefined;
 if(d&&normanDoubleHungLayouts(programId).includes(d.rowLayout)&&record.panels.length===d.rowLayout.length*2)return index>=d.rowLayout.length;
 return true;
}
