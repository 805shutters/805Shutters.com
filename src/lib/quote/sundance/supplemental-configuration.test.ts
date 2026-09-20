import { expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SundanceDesignOptions } from "@/components/crm/SundanceDesignOptions";
import { sundanceStockVerticalPatch, sundanceWaldenSelectionPatch, sundanceWaldenLinerColors } from "./supplemental-configuration";
import { priceDesign } from "../pricing";

it("retains source option IDs but clears liner-dependent choices on a liner change", () => {
  const options = {walden_liner_color:'Bright White',walden_movable_liner:'Yes',unrelated:'keep'};
  const patch = sundanceWaldenSelectionPatch(options,'sundance_walden_select','liner','sundance_walden_select_option_p19_t2')!;
  expect(patch).toMatchObject({catalog_sundance_liner_grid_id:'sundance_walden_select_option_p19_t2',walden_liner:'Black-out liner',walden_liner_color:null,walden_movable_liner:null,unrelated:'keep'});
  expect(sundanceWaldenLinerColors('sundance_walden_select',patch.catalog_sundance_liner_grid_id)).toEqual(['Beige','White','Espresso']);
  expect(sundanceWaldenSelectionPatch(options,'sundance_walden_select','liner','sundance_walden_premier_option_p20_t1')).toBeNull();
  expect(sundanceWaldenSelectionPatch(options,'sundance_walden_select','liner','sundance_walden_select_option_p19_t3')).toBeNull();
  expect(sundanceWaldenLinerColors('sundance_walden_select','sundance_walden_premier_option_p20_t1')).toEqual([]);
});

it("routes stock separately and removes that route and identity when returning to custom", () => {
  const stock = sundanceStockVerticalPatch({unrelated:'keep',fabric_color_id:'old',catalog_program_id:'custom'},true);
  expect(stock).toMatchObject({catalog_program_id:'sundance_vertical_essence_p12_t1',quote_lab_program_id:'sundance_vertical_essence_p12_t1',fabric_color_id:null,stock_vertical_control:'Wand',stock_vertical_draw:'One-way'});
  expect(sundanceStockVerticalPatch({...stock,stock_vertical_color:'White'},false)).toMatchObject({catalog_program_id:null,quote_lab_program_id:null,fabric_program_id:null,stock_vertical_color:null,unrelated:'keep'});
});

it("renders only the source-specific choices while keeping all pricing manual", () => {
  const render = (productId:string,options_json:Record<string,unknown>) => renderToStaticMarkup(createElement(SundanceDesignOptions,{productId,design:{options_json},onUpdateFields:()=>{}}));
  const select = render('sundance_walden_select',{catalog_sundance_liner_grid_id:'sundance_walden_select_option_p19_t2'});
  expect(select).toContain('Espresso');
  expect(select).not.toContain('Bright White');
  expect(select).not.toContain('Wide twill');
  expect(select).not.toContain('Movable liner');
  const premier = render('sundance_walden_premier',{catalog_sundance_liner_grid_id:'sundance_walden_premier_option_p20_t1'});
  expect(premier).toContain('Wide twill tape');
  expect(premier).toContain('Movable liner');
  expect(premier).toContain('Chocolate');
  const stock = render('sundance_vertical_essence',{sundance_vertical_type:'Stock'});
  expect(stock).toContain('Off-White');
  expect(stock).toContain('no delivery');
  for (const productId of ['sundance_walden_select','sundance_walden_premier','sundance_vertical_essence'])
    expect(priceDesign({productId,widthInches:36,heightInches:60})).toMatchObject({ok:false,code:'MANUAL_PRICE_REQUIRED'});
});
