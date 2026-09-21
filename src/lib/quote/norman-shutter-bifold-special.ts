/** Exact subtype facts; never substitutes opening dimensions for manufactured panels. */
export type NormanFloating90 = {version:1; sideBoards: boolean|null; optionalStopperPositionsInches:number[]};
export type NormanFrameHinged = {version:1; frame:'Vintage L Frame'|''; buildoutInches:0|0.5|1|null; bottom:''|'light_block'|'deco_sill_3'; hinge:''|'self_mortise_2_3_8'|'invisible'; usedAsDoor:boolean|null; ringPull:boolean|null; ringPullHeightInches:number|null};
export const emptyNormanFloating90=():NormanFloating90=>({version:1,sideBoards:null,optionalStopperPositionsInches:[]});
export const emptyNormanFrameHinged=():NormanFrameHinged=>({version:1,frame:'',buildoutInches:null,bottom:'',hinge:'',usedAsDoor:null,ringPull:null,ringPullHeightInches:null});
const wood=(p:string)=>['brightwood','normandy_painted','normandy_stained'].includes(p);
export function normanSpecialBifoldLayouts(p:string,kind:string):string[]{
 if(kind==='floating_90')return [2,...(wood(p)?[4]:[])].flatMap(size=>Array.from({length:64/size},(_,i)=>Array(i+1).fill('F'.repeat(size)).join('/')));
 if(kind==='frame_hinged')return p==='woodlore_aquashield'?[]:['LL','RR','LLRR',...(wood(p)?['LLLL','RRRR','LLLLRRRR']:[])];
 return [];
}
export const normanBifoldMountKey=(value:unknown)=>String(value??'').toLowerCase().replace(/[-_]/g,' ').replace(/ mount$/,'').trim();
export const validNormanFloatingLayout=(p:string,layout:string)=>layout.length>0&&normanBifoldPanelCount(layout)<=64&&layout.split('/').every(group=>group==='FF'||wood(p)&&group==='FFFF');
export const normanBifoldPanelCount=(layout:string)=>layout.replace(/\//g,'').length;
export function normanSpecialBifoldPages(p:string){return p==='woodlore'?[32,65,66,67,68,69,70,71,72,73,74]:p.startsWith('woodlore_')?[38,82,83,84,85,86,87,88,89,90]:p==='brightwood'?[32,75,76,77,78,79,80,81,82,83,84,85,86]:[32,77,78,79,80,81,82,83,84,85,86,87,88];}
export function parseNormanFloating90(value:unknown):NormanFloating90|null{
 if(!value||typeof value!=='object'||Array.isArray(value))return null;const r=value as Record<string,unknown>;
 return r.version===1&&[true,false,null].includes(r.sideBoards as boolean|null)&&Array.isArray(r.optionalStopperPositionsInches)&&r.optionalStopperPositionsInches.every(v=>typeof v==='number'&&Number.isFinite(v))?r as NormanFloating90:null;
}
export function parseNormanFrameHinged(value:unknown):NormanFrameHinged|null{
 if(!value||typeof value!=='object'||Array.isArray(value))return null;const r=value as Record<string,unknown>;
 return r.version===1&&['','Vintage L Frame'].includes(String(r.frame))&&[null,0,0.5,1].includes(r.buildoutInches as number|null)&&['','light_block','deco_sill_3'].includes(String(r.bottom))&&['','self_mortise_2_3_8','invisible'].includes(String(r.hinge))&&[true,false,null].includes(r.usedAsDoor as boolean|null)&&[true,false,null].includes(r.ringPull as boolean|null)&&(r.ringPullHeightInches===null||typeof r.ringPullHeightInches==='number'&&Number.isFinite(r.ringPullHeightInches))?r as NormanFrameHinged:null;
}
export function normanFrameHingedWidthReferences(layout:string,hinge:NormanFrameHinged['hinge'],widths:readonly (number|null|undefined)[]){
 const offset=hinge==='self_mortise_2_3_8'?34.5:hinge==='invisible'?29.5:null;
 if(offset===null||!/^L{2,4}$|^R{2,4}$|^L{2,4}R{2,4}$/.test(layout)||widths.length!==layout.length)return null;
 return [...layout].map((side,i)=>{const anchor=side==='L'?0:layout.length-1,a=widths[anchor];return a==null?null:{anchorPanel:anchor+1,widthMm:a*25.4+(i===anchor?0:offset),offsetMm:i===anchor?0:offset};});
}
