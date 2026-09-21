import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { getProduct } from "@/lib/quote/catalog";
import { LOTUS_VINYL_VERSION, lotusVinylDonorSkus, lotusVinylProfile } from "@/lib/quote/lotus-vinyl";
import { LotusDesignOptions, lotusProgramSelectionPatch } from "@/components/crm/LotusDesignOptions";
import type { SalesQuoteDesign } from "@mts/types/quote";
import type { SelectionContext } from "./core";
import { productRuleStatusForSelection, validateSelection } from "./rules";
import { validateLotusVinyl } from "./lotus-vinyl";

const mlx="lotus_mlx_1in_vinyl_custom", rlx="lotus_rlx_1in_vinyl_plus_custom";
function context(programId=mlx,width=48,height=60): SelectionContext {
 const patch=lotusProgramSelectionPatch({},"Vinyl Blinds",programId)!;
 return {manufacturerId:"lotus",productId:"lotus_vinyl_blinds",programId,catalogVersion:"test",catalogAsOf:"2026-09-20",widthInches:width,heightInches:height,quantity:1,configuration:{...patch.options_json,color:"White",mount_type:"Inside Mount",lift_system:patch.lift_system ?? null,valance:patch.valance ?? null},options:{}};
}
const hard=(c:SelectionContext)=>validateLotusVinyl(c).filter(i=>i.severity==="hard_block");
describe("MLX/RLX nominal cut schedules remain price-held",()=>{
 it.each([mlx,rlx])("initializes %s and retains exact same-family donor identity",program=>{
  const c=context(program);
  expect(hard(c)).toEqual([]);
  const derived=validateLotusVinyl(c).find(i=>i.ruleId==="lotus.vinyl.eligible_stock_donors");
  expect(derived?.derivedValues?.eligible_donor_skus).toContain(program===mlx?"MLX4860WH":"RLX4860WH");
  expect(productRuleStatusForSelection(c)).toBe("restriction_source_incomplete");
  expect(c.configuration.lotus_vinyl_configuration_version).toBe(LOTUS_VINYL_VERSION);
 });
 it("distinguishes half-inch MLX from quarter-inch RLX cuts",()=>{
  expect(lotusVinylDonorSkus(mlx,22.75,36,"White")).not.toContain("MLX2336WH");
  expect(lotusVinylDonorSkus(mlx,22.5,36,"White")).toContain("MLX2336WH");
  expect(lotusVinylDonorSkus(rlx,22.75,36,"White")).toContain("RLX2336WH");
 });
 it.each([mlx,rlx])("enforces exact short donor, height and increment boundaries for %s",program=>{
  expect(lotusVinylDonorSkus(program,17,36,"White")).toContain(program===mlx?"MLX1736WH":"RLX1736WH");
  expect(lotusVinylDonorSkus(program,16.75,36,"White")).toEqual([]);
  expect(lotusVinylDonorSkus(program,17,26,"White")).not.toEqual([]);
  expect(lotusVinylDonorSkus(program,17,25,"White")).toEqual([]);
  expect(lotusVinylDonorSkus(program,23.0625,60,"White")).toEqual([]);
  expect(lotusVinylDonorSkus(program,23,60.5,"White")).toEqual([]);
  expect(lotusVinylDonorSkus(program,48,60,"Invented")).toEqual([]);
  expect(lotusVinylDonorSkus(program,100,60,"White")).toEqual([]);
 });
 it("checks every returned candidate against exact program/color and all physical inequalities",()=>{
  const stock=getProduct("lotus_vinyl_blinds")!.stockItems!;
  for(const program of [mlx,rlx]) for(const width of [16.5,17,22,22.25,22.5,22.75,23,27,30,35,48,59,69,72]) for(const height of [26,36,50,60,62,72,74,84]) for(const color of ["White","Alabaster"]){
   const profile=lotusVinylProfile(program)!;
   for(const sku of lotusVinylDonorSkus(program,width,height,color)){
    const donor=stock.find(i=>i.sku===sku)!;
    expect(donor.programId).toBe(profile.stockProgramId);expect(donor.color).toBe(color);
    const cut=donor.width!-width;
    expect(cut===0||(donor.width!>22&&cut>=profile.minimumWidthCut&&cut<=6)).toBe(true);
    expect(donor.height!-height).toBeGreaterThanOrEqual(0);expect(donor.height!-height).toBeLessThanOrEqual(10);
   }
  }
 });
 it("rejects forged unsupported controls and preserves old saved behavior",()=>{
  const c=context();
  for(const [key,value] of [["mount_type","Outside Mount"],["lotus_measurement_basis","finished_blind"],["lift_system","Motorized"],["valance","Crown"],["motor_type","Battery"]]) expect(hard({...c,configuration:{...c.configuration,[key]:value}}).length).toBeGreaterThan(0);
  expect(hard({...c,options:{motorization_selections:["battery"]}}).length).toBeGreaterThan(0);
  expect(validateLotusVinyl({...c,configuration:{}})).toEqual([]);
  expect(validateLotusVinyl({...c,catalogAsOf:"2026-09-19"})).toEqual([]);
  expect(hard({...c,programId:"lotus_rtx_2in_vinyl_plus_custom"}).map(i=>i.ruleId)).toContain("lotus.vinyl.program");
  expect(validateSelection(context(mlx,16.75,36)).map(i=>i.ruleId)).toContain("lotus.vinyl.donor_required");
 });
 it("filters current mount choices and shows physical candidates without claiming price authority",()=>{
  const patch=lotusProgramSelectionPatch({},"Vinyl Blinds",mlx)!;
  const design={...patch,mount_type:"Inside Mount",options_json:{...patch.options_json,color:"White"}} as SalesQuoteDesign;
  const html=renderToStaticMarkup(createElement(LotusDesignOptions,{design,productType:"Vinyl Blinds",widthInches:48,heightInches:60,onUpdateFields:()=>{}}));
  expect(html).toContain("MLX4860WH");expect(html).toContain("Stock and current price remain unverified");
  expect(html).not.toContain(">Outside Mount</option>");
 });
});
