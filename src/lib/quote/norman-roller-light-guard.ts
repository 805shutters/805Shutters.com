export const ROLLER_LIGHT_GUARD_KEY='roller_light_guard_v1';
export const ROLLER_LIGHT_GUARD_GROUP_KEY='roller_light_guard_group_v1';
export const ROLLER_BASIC_GUARD_COLORS=['3058 White','3094 Cottage White','3578 Sahara','3463 Chocolate','3129 Silver','3212 Black Ink','3012 Bianca'] as const;
export const ROLLER_WOOD_GUARD_COLORS=['049 Stone Gray','053 Clay','110 Limed White','212 Dark Teak','109 Weathered Teak','237 Wenge','221 Black Walnut'] as const;
export type RollerLightGuard={version:1;kind:'None'|'Basic'|'Premium Wood';color:string;leftLength:number|null;rightLength:number|null};
export const emptyRollerLightGuard=():RollerLightGuard=>({version:1,kind:'None',color:'',leftLength:null,rightLength:null});
export function parseRollerLightGuard(raw:unknown):RollerLightGuard|null{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;
 const r=raw as Record<string,unknown>;
 if(r.version!==1||!['None','Basic','Premium Wood'].includes(String(r.kind))||typeof r.color!=='string'||![r.leftLength,r.rightLength].every(v=>v===null||typeof v==='number'&&Number.isFinite(v)))return null;
 return {version:1,kind:r.kind as RollerLightGuard['kind'],color:r.color,leftLength:r.leftLength as number|null,rightLength:r.rightLength as number|null};
}
