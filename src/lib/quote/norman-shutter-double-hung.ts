/** WL101, WLP117, BW115, ND117. Upper row left-to-right, then lower row. */
export type NormanDoubleHungRecord = {
 version:1;
 rowLayout:string;
 divisionMode:''|'center'|'custom';
 customDivisionPointInches:number|null;
 customReference:string;
 horizontalTPost:boolean|null;
 tPostSectionLengthsInches:(number|null)[];
};
export function normanDoubleHungLayouts(program:string):string[]{
 return ['woodlore','woodlore_plus','woodlore_aquashield'].includes(program)?['L','R','LR']:['brightwood','normandy_painted','normandy_stained'].includes(program)?['L','R','LR','LL','RR','LLR','LRR','LLRR']:[];
}
export function parseNormanDoubleHungRecord(value:unknown):NormanDoubleHungRecord|null{
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const r=value as Record<string,unknown>;
 if(r.version!==1||typeof r.rowLayout!=='string'||typeof r.divisionMode!=='string'||!['','center','custom'].includes(r.divisionMode)||typeof r.customReference!=='string'||![null,true,false].includes(r.horizontalTPost as boolean|null)||!Array.isArray(r.tPostSectionLengthsInches))return null;
 const numeric=(n:unknown)=>n===null||typeof n==='number'&&Number.isFinite(n);
 if(!numeric(r.customDivisionPointInches)||r.tPostSectionLengthsInches.some(n=>!numeric(n)))return null;
 return r as NormanDoubleHungRecord;
}
export function normanDoubleHungSourcePage(program:string){return program==='woodlore'?101:program==='brightwood'?115:117;}
