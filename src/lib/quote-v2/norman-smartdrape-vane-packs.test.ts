import {describe,expect,it} from "vitest";
import {smartdrapeVanePacks,validateSmartdrapeVanePacks} from "./norman-smartdrape-vane-packs";
import type {SelectionContext} from "./core";
const shade=(c:SelectionContext["configuration"]={},width=72,height=84):SelectionContext=>({manufacturerId:"Norman",productId:"smartdrape",catalogVersion:"test",catalogAsOf:"2026-09-19",programId:"smartdrape_smartdrape_light_filtering",widthInches:width,heightInches:height,quantity:1,options:{},configuration:{control_type:"Manual",stack_option:"Stack Left",fabric_color_code:"F1124",smartdrape_extra_vane_packs:2,smartdrape_vane_pack_style:"A — First, Middle and Last Vanes",...c}});
describe("SmartDrape six-vane pack and extra wand ordering",()=>{
 it("derives first/middle/last contents, alternating parity and source height price tier",()=>{
  expect(smartdrapeVanePacks(shade())?.record.vanePacks).toMatchObject({quantity:2,first:{quantity:1,color:"F1124"},middle:[{quantity:4,color:"F1124"}],last:{quantity:1,color:"F1124"}});
  const c={vane_style:"Alternating",smartdrape_second_color:"F1128"};
  expect(smartdrapeVanePacks(shade(c,73.625))?.record.vanePacks?.last).toEqual({quantity:1,color:"F1124"});
  expect(smartdrapeVanePacks(shade(c,73.6875))?.record.vanePacks?.last).toEqual({quantity:1,color:"F1128"});
  expect(smartdrapeVanePacks(shade({...c,control_type:"Motorized",stack_option:"Center Opening"}))?.record.vanePacks).toMatchObject({first:{quantity:2},middle:[{quantity:1},{quantity:1}],last:{quantity:2}});
  expect(smartdrapeVanePacks(shade({...c,application:"Side by Side"}))?.record.vanePacks?.first.quantity).toBe(2);
  expect(smartdrapeVanePacks(shade({...c,smartdrape_vane_pack_style:"B — Middle Vanes Only"}))?.record.vanePacks).toMatchObject({first:{quantity:0},middle:[{quantity:3},{quantity:3}],last:{quantity:0}});
  expect(smartdrapeVanePacks(shade({smartdrape_extra_wands:3},72,84.0625))?.selections).toEqual([{id:"additional_vanes_pack_of_6_length_100",units:2},{id:"additional_wand",units:3}]);
 });
 it("requires whole quantities and a pack style and keeps motor charging wands separate",()=>{
  expect(validateSmartdrapeVanePacks(shade())).toEqual([]);
  for(const c of [{smartdrape_extra_vane_packs:1.5},{smartdrape_extra_wands:-1},{smartdrape_vane_pack_style:""},{control_type:"Motorized",smartdrape_extra_wands:1},{additional_wand:true}] as SelectionContext["configuration"][])expect(validateSmartdrapeVanePacks(shade(c)).length).toBeGreaterThan(0);
  const old=shade();old.catalogAsOf="2026-09-18";expect(smartdrapeVanePacks(old)).toBeNull();
 });
});
