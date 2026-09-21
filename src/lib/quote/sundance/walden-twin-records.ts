export const SUNDANCE_WALDEN_TWIN_KEY='sundance_walden_twin_v1';
export type SundanceWaldenTwin={version:1;productId:string;front:{id:string;fabricId:string;programId:string;widthInches:number|null;heightInches:number|null;control:string};liner:{id:string;gridId:string;material:string;color:string;widthInches:number|null;heightInches:number|null;control:string;controlSide:string;chain:string;accessoryQuantities:Record<string,number>};frontControlSide:string};
export function createSundanceWaldenTwin(p:string,c:Record<string,unknown>,w:number,h:number,ids:[string,string]):SundanceWaldenTwin|null{
 if(!['sundance_walden_premier','sundance_walden_select'].includes(p)||c.walden_movable_liner!=='Yes'||ids.some(id=>!id)||ids[0]===ids[1])return null;
 return{version:1,productId:p,front:{id:ids[0],fabricId:String(c.fabric_color_id??''),programId:String(c.catalog_program_id??''),widthInches:w||null,heightInches:h||null,control:String(c.sundance_walden_control??'')},liner:{id:ids[1],gridId:String(c.catalog_sundance_liner_grid_id??''),material:String(c.walden_liner??''),color:String(c.walden_liner_color??''),widthInches:null,heightInches:null,control:'',controlSide:'',chain:'',accessoryQuantities:{}},frontControlSide:''};
}
function record(v:unknown):v is Record<string,unknown>{return v!=null&&typeof v==='object'&&!Array.isArray(v);}
export function readSundanceWaldenTwin(v:unknown):SundanceWaldenTwin|null{
 if(!record(v)||v.version!==1||typeof v.productId!=='string'||!record(v.front)||!record(v.liner)||typeof v.frontControlSide!=='string')return null;
 for(const part of [v.front,v.liner])if(typeof part.id!=='string'||!part.id||typeof part.control!=='string'||![part.widthInches,part.heightInches].every(n=>n===null||typeof n==='number'))return null;
 if(['fabricId','programId'].some(k=>typeof (v.front as Record<string,unknown>)[k]!=='string')||['gridId','material','color','controlSide','chain'].some(k=>typeof (v.liner as Record<string,unknown>)[k]!=='string')||!record(v.liner.accessoryQuantities)||Object.values(v.liner.accessoryQuantities).some(q=>typeof q!=='number'))return null;
 return v as SundanceWaldenTwin;
}
export function sundanceWaldenTwinDescriptions(v:unknown):string[]{
 const t=readSundanceWaldenTwin(v);if(!t)return[];
 const size=(p:SundanceWaldenTwin['front']|SundanceWaldenTwin['liner'])=>Number(p.widthInches)>0&&Number(p.heightInches)>0?`${p.widthInches} × ${p.heightInches} inches`:'dimensions incomplete';
 return[`Twin front shade: ${size(t.front)}; ${t.front.control}; control ${t.frontControlSide||'not selected'}`,`Twin movable liner: ${size(t.liner)}; ${t.liner.material}; ${t.liner.color}; ${t.liner.control||'control not selected'}; control ${t.liner.controlSide||'not selected'}`];
}
