import {normanRollerFabricWidths} from './norman-roller-fabric-widths.generated';
const byCode=new Map<string,typeof normanRollerFabricWidths[number]>(normanRollerFabricWidths.map(r=>[r.colorCode,r]));
/** Exact source code only. Unknown or discontinued codes never inherit a collection default. */
export const rollerFabricWidthSource=(code:unknown)=>typeof code==='string'?byCode.get(code.trim().toUpperCase())??null:null;
export function rollerValancePieceLimit(style:string,code:unknown):{maximum:number|null;fabricWidth:number|null;sourcePage:number|null}{
 const fabric=/fabric valance/i.test(style),wrapped=/curved.*fabric/i.test(style);
 if(!fabric&&!wrapped)return {maximum:95,fabricWidth:null,sourcePage:39};
 const row=rollerFabricWidthSource(code);return row?{maximum:Math.min(95,row.fabricWidthInches-(fabric?7:0)),fabricWidth:row.fabricWidthInches,sourcePage:row.sourcePage}:{maximum:null,fabricWidth:null,sourcePage:null};
}
