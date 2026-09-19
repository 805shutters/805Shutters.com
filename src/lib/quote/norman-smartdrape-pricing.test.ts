import {describe,expect,it} from "vitest";
import {priceDesign} from "./pricing";
import {getProduct,getProgram} from "./catalog";
import {smartdrapeCurrentPriceProgram} from "./norman-smartdrape-pricing";
const programs=[
 ['smartdrape_smartdrape_light_filtering',[3088,3408,4073,4255,4542,5042,5107,5285],[255,263,296,309,320,345,350,369]],
 ['smartdrape_smartdrape_lakeshore_stripe',[2626,2897,3463,3617,3861,4287,4442,4594],[217,224,252,264,273,293,304,321]],
] as const;
describe("SmartDrape September retail additional-foot column",()=>{
 it("checks both price programs at every height and whole-foot boundary",()=>{
  for(const [programId,base,rates] of programs)for(const [i,height] of [48,60,72,84,100,120,132,144].entries())for(const [width,feet] of [[184,0],[184.0625,1],[196,1],[196.0625,2],[352,14],[354.375,15]]){
   const p=priceDesign({productId:"smartdrape",programId,widthInches:width,heightInches:height},"2026-09-19");expect(p.ok,JSON.stringify(p)).toBe(true);if(p.ok)expect(p.base).toBe(base[i]+rates[i]*feet);
  }
 });
 it("preserves original grids and old catalogs, rounds height upward and rejects beyond the source maximum",()=>{
  const program=getProgram(getProduct("smartdrape")!,programs[0][0])!;
  expect(smartdrapeCurrentPriceProgram(program)).toBe(program);expect(smartdrapeCurrentPriceProgram(program,"2026-09-18")).toBe(program);
  expect(smartdrapeCurrentPriceProgram(program,"2026-09-19").grid.widths).toHaveLength(32);expect(program.grid.widths).toHaveLength(17);expect(program.maxWidth).toBe(184);
  const input={productId:"smartdrape",programId:program.id,widthInches:190,heightInches:48.0625};
  expect(priceDesign(input,"2026-09-19")).toMatchObject({ok:true,base:3671});
  expect(priceDesign(input,"2026-09-18")).toMatchObject({ok:false,code:"WIDTH_EXCEEDS_MAX"});
  expect(priceDesign({...input,widthInches:354.4375},"2026-09-19")).toMatchObject({ok:false,code:"WIDTH_EXCEEDS_MAX"});
 });
});
