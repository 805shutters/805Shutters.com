import source from "./valance-schedules.source.json";
export const sundanceValanceSchedules = source.rows;
/** Independent retail evidence only; never an approved customer or account price. */
export function lookupSundanceValanceSource(id:string,width:number,height?:number,blackout=false) {
 if(!Number.isFinite(width)||width<=0)return null;
 const row=source.rows.find(row=>row.id===id);if(!row)return null;
 if(row.maxHeight!=null&&(height==null||!Number.isFinite(height)||height<=0||height>row.maxHeight))return null;
 if(blackout&&row.blackoutMultiplier==null)return null;
 const index=row.widths.findIndex(value=>value>=width);if(index<0)return null;
 return {sourceRetail:Math.round(row.sourceRetailPrices[index]*(blackout?row.blackoutMultiplier!:1)*100)/100,
  gridWidth:row.widths[index],priceBasis:'suggested_retail' as const,customerPriceEligible:false as const};
}
