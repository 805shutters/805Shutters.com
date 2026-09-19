import type {CatalogProgram} from "./catalog/types";

/** September retail guide PDF page 24: dollars for each additional foot past 184 inches. */
export const SMARTDRAPE_ADDITIONAL_FOOT_RATES:Readonly<Record<string,readonly number[]>>={
 smartdrape_smartdrape_light_filtering:[255,263,296,309,320,345,350,369],
 smartdrape_smartdrape_lakeshore_stripe:[217,224,252,264,273,293,304,321],
};
export function smartdrapeCurrentPriceProgram(program:CatalogProgram,asOf?:string):CatalogProgram {
 const rates=SMARTDRAPE_ADDITIONAL_FOOT_RATES[program.id];
 if(!rates||!asOf||asOf<"2026-09-19")return program;
 // Keep source cells immutable; expand only this lookup's verified over-width tiers.
 // Current V2 family validation applies the tighter operation/stack/area limits.
 const widths=Array.from({length:15},(_,i)=>184+12*(i+1));
 return {...program,maxWidth:354.375,grid:{...program.grid,widths:[...program.grid.widths,...widths],prices:program.grid.prices.map((row,i)=>[...row,...widths.map((_,j)=>row[row.length-1]==null?null:row[row.length-1]!+rates[i]*(j+1))])}};
}
