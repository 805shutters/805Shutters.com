import {parseNormanSpecialtyGeometry,type NormanSpecialtyGeometryRecord} from './norman-shutter-specialty-geometry';
import {normanShutterFrames} from './norman-shutter-assortment';
/** Exact shape identities in WLP128–136, BW126–134 and ND136–144. */
export const NORMAN_SPECIALTY_SHAPES = [
 ['YS01','Half Round Sunburst'],['YS02','Left Quarter Round Sunburst'],['YS03','Eyebrow Sunburst'],['YS04','Elongated Eyebrow Sunburst'],['YS05','Louvered Arch'],['YS06','Right Quarter Round Sunburst'],
 ['YS09','Sunburst on Top with Divider Strip'],['YS10','Sunburst on Top with Continuous Frame'],['YS11','Hexagon with Horizontal Louvers'],['YS12','Octagon with Horizontal Louvers'],['YS13','Circle with Horizontal Louvers'],['YS14','Hexagon Straight Sides with Horizontal Louvers'],['YS15','Circle Sunburst'],['YS16','Oval with Horizontal Louvers'],['YS17','Hexagon Sunburst'],['YS18','Hexagon Sunburst with Straight Sides'],['YS19','Octagon Sunburst'],['YS20','Oval Sunburst'],
 ['YS21','Left Angle Top / Left Rake'],['YS23','Right Angle Top / Right Rake'],['YS25','Upside Down Left Angle Top / Left Rake'],['YS26','Upside Down Right Angle Top / Right Rake'],['YS27','Left Triangle'],['YS28','Right Triangle'],
 ['YS51','Quarter Sunburst Panel with Continuous Frame'],['YS52','Sunburst on Top with T Post'],['YS53','Half Round with Horizontal Louvers'],['YS56','Solid Rail Arch'],['YS57','Left Quarter Arch'],['YS58','Right Quarter Arch'],['YS59','Triangle with Horizontal Louvers'],['YS60','Triangle Sunburst'],['YS62','Peak'],['YS63','Arch Top Picture Window with Sunburst'],['YS64','Standard Unit with Horizontal Arch Center'],['YS65','Arch Top Picture Window with Horizontal Louvers'],['YS66','Horizontal Louvers Center Arch with Quarter Round Side Panels'],['YS67','Sunburst Louvers Center Arch with Quarter Round Side Panels'],['YS68','Left Quarter Sunburst Panel with Continuous Frame'],['YS69','Right Quarter Sunburst Panel with Continuous Frame'],
 ['YS70','Mansard'],['YS71','Mansard Left'],['YS72','Mansard Right'],['YS73','Upside Down Mansard'],['YS74','Upside Down Mansard Left'],['YS75','Upside Down Mansard Right'],
] as const;
export const NORMAN_FRAME_IN_RAIL_SHAPES = ['YS01','YS02','YS03','YS04','YS06','YS09','YS15','YS20','YS17','YS18','YS19','YS60'];
export const NORMAN_CONTINUOUS_ARCH_SHAPES = ['YS05','YS65','YS66'];
export type NormanSpecialtyRecord = {
 version:1; shapeCode:string; archStyle:''|'standard'|'continuous';
 frameType:string; frameSides:''|'2'|'3'|'4'|'all'; frameIncludeInRail:boolean|null;
 hinges:boolean|null; magnets:boolean|null; hangStripBehind:boolean|null;
 sunburstHubInches:number|null; stileWidthInches:number|null; geometry?:NormanSpecialtyGeometryRecord;
};
export const emptyNormanSpecialtyRecord=():NormanSpecialtyRecord=>({version:1,shapeCode:'',archStyle:'',frameType:'',frameSides:'',frameIncludeInRail:null,hinges:null,magnets:null,hangStripBehind:null,sunburstHubInches:null,stileWidthInches:null});
export function parseNormanSpecialtyRecord(value:unknown):NormanSpecialtyRecord|null{
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const r=value as Record<string,unknown>;
 if(r.version!==1||typeof r.shapeCode!=='string'||typeof r.frameType!=='string'||!['','standard','continuous'].includes(String(r.archStyle))||!['','2','3','4','all'].includes(String(r.frameSides)))return null;
 if(['frameIncludeInRail','hinges','magnets','hangStripBehind'].some(k=>![null,true,false].includes(r[k] as never)))return null;
 if(['sunburstHubInches','stileWidthInches'].some(k=>r[k]!==null&&(typeof r[k]!=='number'||!Number.isFinite(r[k]))))return null;
 if(r.geometry!==undefined&&!parseNormanSpecialtyGeometry(r.geometry))return null;
 return r as NormanSpecialtyRecord;
}
export function normanSpecialtySupportedProgram(program:string){return ['woodlore_plus','woodlore_aquashield','brightwood','normandy_painted','normandy_stained'].includes(program);}
export function normanSpecialtyShapes(program:string){return normanSpecialtySupportedProgram(program)?NORMAN_SPECIALTY_SHAPES.filter(([code])=>program!=='woodlore_aquashield'||code!=='YS56'):[];}
export function normanSpecialtyIsSunburst(code:string){return NORMAN_SPECIALTY_SHAPES.find(s=>s[0]===code)?.[1].includes('Sunburst')??false;}
export function normanSpecialtyFrames(program:string,inRail:boolean|null){
 const frames=normanShutterFrames(program);
 if(!inRail)return frames;
 const labels=['3" Crown Z Frame','2" Bel Air Z Frame','2" Bullnose Z Frame','1 1/2" Bullnose Z Frame',program==='woodlore_aquashield'?'1 1/2" Deep Bullnose Z Frame *':'1 1/4" Beaded Z Frame'];
 return frames.filter(f=>labels.includes(f.label));
}
export function normanSpecialtySourcePages(program:string){return program.startsWith('woodlore_')?[124,125,126,127,128,129,130,131,132,133,134,135,136,137,138,139]:program==='brightwood'?[123,124,125,126,127,128,129,130,131,132,133,134,135,136,137]:[133,134,135,136,137,138,139,140,141,142,143,144,145,146,147];}
