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
