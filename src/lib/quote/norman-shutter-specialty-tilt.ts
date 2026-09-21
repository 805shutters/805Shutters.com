/** WLP126 (non-Aqua), BW124 and ND134: the illustrated YS05 curved
 * horizontal louvers cannot use Invisible Tilt. A separate rear Standard
 * Tilt rod operates that section; the diagram identifies the top louver fixed.
 * This bounded record does not infer control construction for other shapes. */
export type NormanSpecialtyCurvedTilt = {
 version:1;
 control:''|'rear_standard'|'invisible';
 topLouverFixed:boolean|null;
};
export function parseNormanSpecialtyCurvedTilt(value:unknown):NormanSpecialtyCurvedTilt|null{
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const r=value as Record<string,unknown>;
 return r.version===1&&['','rear_standard','invisible'].includes(String(r.control))&&[true,false,null].includes(r.topLouverFixed as never)?r as NormanSpecialtyCurvedTilt:null;
}
export function normanSpecialtyNeedsCurvedTilt(program:string,shape:string,tilt:unknown){
 return ['woodlore_plus','brightwood','normandy_painted','normandy_stained'].includes(program)&&shape==='YS05'&&/^invisible tilt$/i.test(String(tilt??'').trim());
}
