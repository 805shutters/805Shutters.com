import type {SalesQuoteDesign,SalesQuoteLineItem} from '@mts/types/quote';
import {isRollerValanceAssociationType} from './norman-roller-valance-only';
/** Same eligible line set for full and mobile builders; labels may differ by layout. */
export function quotePairingLineOptions(current:SalesQuoteLineItem,lines:SalesQuoteLineItem[],designs:SalesQuoteDesign[],label:(line:SalesQuoteLineItem,index:number)=>string=(line,index)=>`#${index+1} • ${line.room_name} • ID ${line.id}`){
 return lines.flatMap((candidate,index)=>{if(candidate.id===current.id||(current.product_type!=='Palladian Shelf'&&candidate.product_type!==current.product_type&&!isRollerValanceAssociationType(current.product_type,candidate.product_type)))return [];const design=designs.find(d=>d.line_item_id===candidate.id&&d.variant==='A');return design?[{lineId:candidate.id,label:label(candidate,index),design}]:[];});
}
/** Draft schema requires identity/room/dimensions, not finished order specifications.
 * Mount/size meaning is explicitly required by the agreed premeasurement workflow.
 */
export function mobileQuoteOptionRequirement(field:string,productType=''):'required'|'optional'{
 const shared=['supplier','catalog_product_id','json:catalog_product_id','mount_type','json:onyx_mount','json:size_type'];
 const shutter=['louver_size','json:frame_type','json:color','json:folding_direction','json:split_tilt','json:divider_rail'];
 const shade=['lift_system','tilt_type','json:control_system','json:control_type','json:control_side','json:chain_location'];
 const blind=['louver_size','json:slat_size'];
 return [...shared,...(productType==='Shutters'?shutter:shade),...(/Blinds$/.test(productType)?blind:[]),...(productType==='Roller Shades'?['fabric']:[])].includes(field)?'required':'optional';
}
