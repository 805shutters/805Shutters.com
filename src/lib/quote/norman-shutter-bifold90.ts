export type NormanBifold90Record={version:1;kind:''|'standard_90'|'multifold_90'|'floating_90'|'frame_hinged';layout:string;mount:''|'Inside Mount'|'Semi-Inside Mount'|'Outside Mount';casing:''|'none'|'existing';referenceWidthInches:number|null;referenceHeightInches:number|null;headerInches:3|3.5|null;fascia:''|'plain'|'deco';headerExtensionInches:number|null;flatMountingSurface:boolean};
export const emptyNormanBifold90=():NormanBifold90Record=>({version:1,kind:'',layout:'',mount:'',casing:'',referenceWidthInches:null,referenceHeightInches:null,headerInches:null,fascia:'',headerExtensionInches:null,flatMountingSurface:false});
export const normanBifold90Wood=(p:string)=>['brightwood','normandy_painted','normandy_stained'].includes(p);
export function normanBifold90Layouts(p:string,kind:string):readonly string[]{return kind==='standard_90'?['LL','RR','LLRR']:kind==='multifold_90'&&normanBifold90Wood(p)?['LLLL','RRRR','LLLLRRRR']:[];}
export function normanBifold90Pages(p:string){return p==='woodlore'?[61,62,63,64,65,66,67]:p.startsWith('woodlore_')?[78,79,80,81,82,83]:p==='brightwood'?[71,72,73,74,75,76,77]:[73,74,75,76,77,78,79];}
export function parseNormanBifold90(value:unknown):NormanBifold90Record|null{
 if(!value||typeof value!=='object'||Array.isArray(value))return null;const r=value as Record<string,unknown>;
 if(r.version!==1||!['','standard_90','multifold_90','floating_90','frame_hinged'].includes(String(r.kind))||typeof r.layout!=='string'||!['','Inside Mount','Semi-Inside Mount','Outside Mount'].includes(String(r.mount))||!['','none','existing'].includes(String(r.casing))||![null,3,3.5].includes(r.headerInches as number|null)||!['','plain','deco'].includes(String(r.fascia))||typeof r.flatMountingSurface!=='boolean')return null;
 for(const k of ['referenceWidthInches','referenceHeightInches','headerExtensionInches'])if(r[k]!==null&&(typeof r[k]!=='number'||!Number.isFinite(r[k])))return null;
 return r as NormanBifold90Record;
}
/** Source reference geometry is not a price-grid or manufactured cut-size substitution. */
export function normanBifold90Geometry(r:NormanBifold90Record){
 const w=r.referenceWidthInches,h=r.referenceHeightInches;
 if(!['standard_90','multifold_90'].includes(r.kind)||!r.mount||!r.casing||w===null||h===null||w<=0||h<=0)return null;
 if(r.casing==='existing')return r.mount==='Outside Mount'?{widthInches:w+1.25,heightInches:h,standardTrackCount:1}:null;
 return {widthInches:w+(r.mount==='Outside Mount'?3.5:-.125),heightInches:h+(r.mount==='Outside Mount'?4.5:r.mount==='Semi-Inside Mount'?1.375:-.125),standardTrackCount:1};
}
