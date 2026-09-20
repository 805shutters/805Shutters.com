import { expect,it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SundanceDesignOptions } from "@/components/crm/SundanceDesignOptions";
import { getMtsProductColorRows } from "@mts/lib/productColorCatalog";
import { getMtsProductColorRows as legacyRows } from "@/mts-quote-v1/lib/productColorCatalog";
import { sundanceCatalog,lookupSundanceSourceGrid } from "./catalog";
import { sundancePortfolioColors,sundancePortfolioColorPatch,sundancePortfolioStylePatch,sundancePortfolioSource } from "./portfolio-assortment";
import { priceDesign } from "../pricing";

it("accounts for every source material and discloses dealer discrepancies",()=>{
 expect(sundancePortfolioSource.rows).toHaveLength(102);
 expect(sundancePortfolioSource.rows.filter(row=>row.portalStatus==='matched_name')).toHaveLength(84);
 expect(sundancePortfolioSource.rows.filter(row=>row.portalStatus==='current_guide_only')).toHaveLength(18);
 expect(sundancePortfolioSource.unmatchedPortalLabels).toHaveLength(29);
 expect(sundancePortfolioColors).toHaveLength(487);
 expect(new Set(sundancePortfolioColors.map(row=>row.id)).size).toBe(487);
 for(const row of sundancePortfolioColors.filter(row=>row.programId))expect(sundanceCatalog.products.find(p=>p.id===row.productId)?.fabricRouting?.[`${row.colorCode}:${row.fabricType}`]).toBe(row.programId);
 expect(priceDesign({productId:'sundance_portfolio_roman',widthInches:24,heightInches:36})).toMatchObject({ok:false,code:'MANUAL_PRICE_REQUIRED'});
});
it.each([
 ['ASE01','Knife Pleat',496],['CLL01','Flat',538],['AND01','Knife Pleat',553],['CSS01','Flat',623],
 ['ASE01','Hobbled',518],['CLL01','Front Slat',553],['AND01','Hobbled',576],['CSS01','Front Slat',674],
] as const)("uses independent first grid cell for %s %s",(code,style,retail)=>{
 const row=sundancePortfolioColors.find(row=>row.colorCode===code&&row.fabricType===style)!;
 expect(lookupSundanceSourceGrid(row.productId,row.programId!,24,24)?.sourceRetail).toBe(retail);
});
it("rejects forbidden fabric styles and mismatched style context",()=>{
 expect(sundancePortfolioColorPatch({},'sundance_portfolio_roman:ASE01:Flat')).toBeNull();
 expect(sundancePortfolioColorPatch({},'sundance_portfolio_roman:ORI06:Hobbled')).toBeNull();
 expect(sundancePortfolioColorPatch({roman_style:'Flat'},'sundance_portfolio_roman:ASE01:Knife Pleat')).toBeNull();
 expect(sundancePortfolioColorPatch({},'sundance_portfolio_roman:CRV01:Hobbled')).toMatchObject({catalog_sundance_td_available:'false',catalog_program_id:'sundance_portfolio_roman_p23_t2'});
 expect(sundancePortfolioStylePatch({fabric_color_id:'old',catalog_program_id:'old'},'Flat')).toMatchObject({roman_style:'Flat',fabric_color_id:null,catalog_program_id:null});
});
it.each([getMtsProductColorRows,legacyRows])("filters both saved editors to valid exact style routes",getRows=>{
 const flat=getRows('Roman Shades',{catalog_product_id:'sundance_portfolio_roman',quote_v2_backend:true,roman_style:'Flat'});
 expect(flat).toHaveLength(82);expect(flat.some(row=>row.colorCode==='ASE01')).toBe(false);
 const hobbled=getRows('Roman Shades',{catalog_product_id:'sundance_portfolio_roman',quote_v2_backend:true,roman_style:'Hobbled'});
 expect(hobbled).toHaveLength(99);expect(hobbled.some(row=>row.colorCode==='ORI06')).toBe(false);
});
it("shows source-only availability and hobbled height holds",()=>{
 const html=renderToStaticMarkup(createElement(SundanceDesignOptions,{productId:'sundance_portfolio_roman',design:{options_json:sundancePortfolioColorPatch({},'sundance_portfolio_roman:AND03:Hobbled')!},onUpdateFields:()=>{}}));
 expect(html).toContain('absent from the captured dealer menu');expect(html).toContain('72-inch maximum height');expect(html).toContain('waterfall only');
});
