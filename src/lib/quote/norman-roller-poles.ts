export const ROLLER_POLE_KEY='roller_pole_v1';
export const ROLLER_POLE_ORDER_KEY='roller_pole_order_v1';
export const ROLLER_POLES=['None','30-inch Fiberglass Pole','58-inch Fiberglass Pole','36-inch Black Cordless Operating Pole','60-inch Black Cordless Operating Pole','Black Pole Attachment Only'] as const;
export type RollerPole={version:1;kind:typeof ROLLER_POLES[number];quantityPerAssembly:number};
export const emptyRollerPole=():RollerPole=>({version:1,kind:'None',quantityPerAssembly:0});
export function parseRollerPole(raw:unknown):RollerPole|null{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;
 const r=raw as Record<string,unknown>;
 return r.version===1&&ROLLER_POLES.includes(r.kind as RollerPole['kind'])&&Number.isSafeInteger(r.quantityPerAssembly)&&Number(r.quantityPerAssembly)>=0?{version:1,kind:r.kind as RollerPole['kind'],quantityPerAssembly:Number(r.quantityPerAssembly)}:null;
}
