/** WLP127 / BW125 / ND135 item9: smallest vertical stile straight height
 * (net panel leg) must be GREATER THAN 9¾ for Direct Mount 3-inch hinge.
 * Item8's RTL exception and conflicting 8⅛ wording for 2⅜ hinges are not
 * resolved here. This record is measured geometry, never factory approval. */
export type NormanSpecialtyHingeRecord={version:1;series:''|'direct_mount_3'|'standard_2_375';smallestNetLegInches:number|null;measurementReference:string};
export function parseNormanSpecialtyHinge(value:unknown):NormanSpecialtyHingeRecord|null{
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const r=value as Record<string,unknown>;
 if(r.version!==1||!['','direct_mount_3','standard_2_375'].includes(String(r.series))||typeof r.measurementReference!=='string'||(r.smallestNetLegInches!==null&&(typeof r.smallestNetLegInches!=='number'||!Number.isFinite(r.smallestNetLegInches))))return null;
 return r as NormanSpecialtyHingeRecord;
}
export function normanSpecialtyHingeProblems(r:NormanSpecialtyHingeRecord|undefined,hinges:boolean|null,frameType:string){
 const problems:Array<{id:string;explanation:string}>=[];
 if(!r)return problems; // Existing untyped records retain their original source hold.
 const add=(id:string,explanation:string)=>problems.push({id,explanation});
 if(hinges!==true)add('hinge_record','A measured specialty hinge record requires hinges selected.');
 if(!r.series)add('hinge_series','Choose the exact specialty hinge series.');
 if(r.smallestNetLegInches===null||r.smallestNetLegInches<=0||!r.measurementReference.trim())add('hinge_measurement','Record the actual smallest vertical stile straight height (net panel leg) and its measurement reference. Order leg height is not this measurement.');
 if(r.series==='direct_mount_3'){
  if(frameType!=='Direct Mount (No Frame)')add('hinge_frame','The 3-inch Direct Mount hinge record requires Direct Mount.');
  if(r.smallestNetLegInches!==null&&r.smallestNetLegInches<=9.75)add('hinge_direct_min','Direct Mount 3-inch hinges require the smallest net vertical stile straight height to be greater than 9¾ inches. Equality is not allowed by the pinned source.');
 }
 if(r.series==='standard_2_375')add('hinge_boundary_source','The 2⅜-inch hinge 8⅛-inch boundary and RTL/T-post exceptions require manufacturer confirmation; this measured record does not resolve the contradictory source wording.');
 return problems;
}
