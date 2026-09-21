/** Order-outline measurements, distinct from net finished-panel dimensions.
 * Source: WLP128,136–139; BW126,134–137; ND136,144–147.
 * A submission reference records evidence identity; it never means factory acceptance.
 */
export const NORMAN_SPECIALTY_QUARTER_LEG_SHAPES=['YS57','YS58','YS68','YS69'];
export const NORMAN_SPECIALTY_TWO_LEG_SHAPES=['YS10','YS51','YS05'];
export const NORMAN_SPECIALTY_T_POST_SHAPES=['YS65','YS66','YS67'];
export const NORMAN_SPECIALTY_ARCH_SHAPES=['YS01','YS02','YS03','YS04','YS05','YS06','YS09','YS10','YS51','YS52','YS53','YS56','YS57','YS58','YS63','YS64','YS65','YS66','YS67','YS68','YS69'];
export type NormanSpecialtyGeometryRecord={
 version:1; widthInches:number|null; heightInches:number|null;
 outline:''|'not_arch'|'perfect'|'imperfect'; existingMolding:boolean|null;
 legHeightInches:number|null; middleHeightInches:number|null; leftLegHeightInches:number|null; rightLegHeightInches:number|null;
 verticalTPostCount:number|null; verticalTPostLocationsInches:number[];
 centeredPeak:boolean|null; peakWidthAInches:number|null; templateReference:string;
};
export const emptyNormanSpecialtyGeometry=():NormanSpecialtyGeometryRecord=>({version:1,widthInches:null,heightInches:null,outline:'',existingMolding:null,legHeightInches:null,middleHeightInches:null,leftLegHeightInches:null,rightLegHeightInches:null,verticalTPostCount:null,verticalTPostLocationsInches:[],centeredPeak:null,peakWidthAInches:null,templateReference:''});
export function parseNormanSpecialtyGeometry(value:unknown):NormanSpecialtyGeometryRecord|null{
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const r=value as Record<string,unknown>;
 if(r.version!==1||!['','not_arch','perfect','imperfect'].includes(String(r.outline))||typeof r.templateReference!=='string')return null;
 if(['existingMolding','centeredPeak'].some(k=>![null,true,false].includes(r[k] as never)))return null;
 if(['widthInches','heightInches','legHeightInches','middleHeightInches','leftLegHeightInches','rightLegHeightInches','verticalTPostCount','peakWidthAInches'].some(k=>r[k]!==null&&(typeof r[k]!=='number'||!Number.isFinite(r[k]))))return null;
 if(!Array.isArray(r.verticalTPostLocationsInches)||r.verticalTPostLocationsInches.some(n=>typeof n!=='number'||!Number.isFinite(n)))return null;
 return r as NormanSpecialtyGeometryRecord;
}
