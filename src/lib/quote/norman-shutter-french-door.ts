import {normanShutterFrames} from './norman-shutter-assortment';
/** WLP118–119, BW116–117, ND118–119. Type identity is retained from the
 * manufacturer's diagrams; measurements/templates remain a separate authority. */
export type NormanFrenchDoorRecord = {
 version:1;
 panelDirection:''|'L'|'R';
 cutoutType:''|'A'|'B'|'C'|'D'|'E'|'F';
 topShape:''|'rectangular'|'arch'|'quarter_arch';
 lFrameCode:string;
 measurementFormReference:string;
};
export function normanFrenchDoorTypes(program:string):readonly string[]{
 return program==='woodlore_aquashield'?['A','B','C','D']:['woodlore_plus','brightwood','normandy_painted','normandy_stained'].includes(program)?['A','B','C','D','E','F']:[];
}
export function normanFrenchDoorBattenType(type:unknown){return type==='E'||type==='F';}
export function normanFrenchDoorFrames(program:string){return normanShutterFrames(program).filter(f=>/\bL Frame\b/i.test(f.label)&&!(/1\/4/.test(f.label)&&/Light Block/i.test(f.label)));}
export function normanFrenchDoorBatten(louver:unknown){
 const thickness=louver==='1 7/8"'||louver==='2 1/2"'?1:louver==='3"'||louver==='3 1/2"'?1.375:louver==='4 1/2"'?1.875:null;
 return thickness===null?null:{widthInches:0.75,thicknessInches:thickness};
}
export function parseNormanFrenchDoorRecord(value:unknown):NormanFrenchDoorRecord|null{
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const r=value as Record<string,unknown>;
 if(r.version!==1||!['','L','R'].includes(String(r.panelDirection))||!['','A','B','C','D','E','F'].includes(String(r.cutoutType))||!['','rectangular','arch','quarter_arch'].includes(String(r.topShape))||typeof r.lFrameCode!=='string'||typeof r.measurementFormReference!=='string')return null;
 return r as NormanFrenchDoorRecord;
}
export function normanFrenchDoorPages(program:string){return program==='brightwood'?[116,117]:[118,119];}
