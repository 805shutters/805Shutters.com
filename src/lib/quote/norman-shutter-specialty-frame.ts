import {normanShutterFrame} from './norman-shutter-assortment';
import type {NormanSpecialtyRecord} from './norman-shutter-specialty';
/** Manufacturing construction, not a retail option or approval of shape geometry.
 * WLP124–125, BW123, ND133. Unlisted combinations stay explicitly unresolved.
 */
export const NORMAN_SPECIALTY_FRAME_CONSTRUCTIONS=[['solid','Solid frame'],['inserts','Regular frame with inserts'],['curved_solid_straight_inserts','Curved top solid; straight bottom/sides with inserts']] as const;
export type NormanSpecialtyFrameConstruction={version:1;eyebrowCurve:boolean|null;style:''|typeof NORMAN_SPECIALTY_FRAME_CONSTRUCTIONS[number][0]};
export function parseNormanSpecialtyFrameConstruction(value:unknown):NormanSpecialtyFrameConstruction|null{
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const r=value as Record<string,unknown>;
 return r.version===1&&[null,true,false].includes(r.eyebrowCurve as never)&&['',...NORMAN_SPECIALTY_FRAME_CONSTRUCTIONS.map(x=>x[0])].includes(String(r.style))?r as NormanSpecialtyFrameConstruction:null;
}
export function normanSpecialtyFrameConstruction(programId:string,r:NormanSpecialtyRecord):NormanSpecialtyFrameConstruction['style']|null{
 const frame=normanShutterFrame(programId,r.frameType)?.label.toLowerCase();if(!frame)return null;
 const aqua=programId==='woodlore_aquashield',vintage=frame.includes('vintage l frame')||(!aqua&&frame.includes('vintage hang strip'));
 const aquaInsert=vintage||frame.includes('deep bullnose z')||frame.includes('deep plain l');
 const deco=frame.includes('deco frame'),mission=frame.includes('mission deco');
 if(aqua&&frame.includes('camber deco'))return 'solid';
 const polygon=['YS11','YS12','YS14','YS17','YS18','YS19','YS21','YS23','YS25','YS26','YS27','YS28','YS59','YS60','YS62'].includes(r.shapeCode);
 const round=['YS13','YS15','YS16','YS20'].includes(r.shapeCode);
 if(polygon)return !aqua||aquaInsert?'inserts':null;
 if(round)return !aqua||aquaInsert?'solid':null;
 if(r.shapeCode==='YS09')return !aqua||aquaInsert?'curved_solid_straight_inserts':null;
 const curvedSunburst=['YS01','YS02','YS03','YS04','YS06'].includes(r.shapeCode);
 const namedOtherArch=['YS63','YS64','YS65','YS66','YS67'].includes(r.shapeCode);
 if(r.shapeCode==='YS05'){
  if(r.frameConstruction?.eyebrowCurve===null||r.frameConstruction?.eyebrowCurve===undefined)return null;
  if(aqua)return aquaInsert?'curved_solid_straight_inserts':null;
  if(r.frameConstruction.eyebrowCurve&&mission)return 'curved_solid_straight_inserts';
 }
 if(curvedSunburst||namedOtherArch||r.shapeCode==='YS05'){
  if(aqua)return aquaInsert?'curved_solid_straight_inserts':null;
  if(deco)return 'solid';
  if(vintage)return 'curved_solid_straight_inserts';
 }
 return null;
}
