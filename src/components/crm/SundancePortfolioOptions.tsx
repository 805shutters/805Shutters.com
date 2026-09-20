"use client";
import type { SelectionRecord } from "@/lib/quote-v2/core";
import { sundancePortfolioControls, sundancePortfolioLiners, validateSundancePortfolioConfiguration } from "@/lib/quote/sundance/portfolio-configuration";
import type { SalesQuoteDesign } from "@mts/types/quote";
import { sundancePortfolioColors, sundancePortfolioColorMatchesContext, sundancePortfolioColorPatch, sundancePortfolioStylePatch, sundancePortfolioStyles, sundancePortfolioSource } from "@/lib/quote/sundance/portfolio-assortment";

export function SundancePortfolioOptions({options,onUpdateFields,widthInches=0,heightInches=0}: {
  options: Record<string,unknown>; widthInches?:number; heightInches?:number; onUpdateFields: (fields: Partial<SalesQuoteDesign>) => void;
}) {
  const rows = sundancePortfolioColors.filter(row => sundancePortfolioColorMatchesContext(row,options));
  const selected = sundancePortfolioSource.rows.find(row => row.code === options.fabric_color_code);
  const classes = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";
  const valanceOnly=options.roman_style==="Valance Only";
  const issues=validateSundancePortfolioConfiguration({widthInches,heightInches,programId:options.catalog_program_id?String(options.catalog_program_id):null,configuration:options as SelectionRecord});
  const field=(key:string,value:string)=>onUpdateFields({options_json:{...options,[key]:value||null}});
  return <>
    <label className="block text-sm">Shade style<select aria-label="Sundance Portfolio style" className={classes} value={String(options.roman_style??"")} onChange={e => onUpdateFields({fabric:null,options_json:sundancePortfolioStylePatch(options,e.target.value)})}>
      <option value="">All styles</option>{sundancePortfolioStyles.map(style=><option key={style}>{style}</option>)}
    </select></label>
    <label className="block text-sm">Fabric and color<select aria-label="Sundance Portfolio fabric and color" className={classes} value={String(options.fabric_color_id??"")} onChange={e => {
      const row=rows.find(row=>row.id===e.target.value);const patch=sundancePortfolioColorPatch(options,e.target.value);
      if(row&&patch)onUpdateFields({fabric:`${row.colorCode} · ${row.collection} ${row.colorName}`,options_json:patch});
    }}><option value="">Select fabric and color</option>{rows.map(row=><option key={row.id} value={row.id}>{row.colorCode} · {row.collection} {row.colorName} · {row.fabricType}</option>)}</select></label>
    <label className="block text-sm">Liner<select aria-label="Sundance Portfolio liner" className={classes} value={String(options.sundance_portfolio_liner??"")} onChange={e=>field("sundance_portfolio_liner",e.target.value)}><option value="">Select liner</option>{sundancePortfolioLiners.map(liner=><option key={liner}>{liner}</option>)}</select></label>
    {valanceOnly ? <>
      <label className="block text-sm">Mount<select aria-label="Sundance Portfolio valance mount" className={classes} value={String(options.mount_type??"")} onChange={e=>onUpdateFields({mount_type:e.target.value,options_json:{...options,mount_type:e.target.value,sundance_portfolio_returns:null}})}><option value="">Select mount</option><option>Inside</option><option>Outside</option></select></label>
      <label className="block text-sm">Headrail depth<select aria-label="Sundance Portfolio valance depth" className={classes} value={String(options.sundance_portfolio_valance_depth??"")} onChange={e=>field("sundance_portfolio_valance_depth",e.target.value)}><option value="">Select depth</option><option value="1.5">1½ inches</option><option value="2.5">2½ inches</option></select></label>
      <label className="block text-sm">Returns<select aria-label="Sundance Portfolio valance returns" className={classes} value={String(options.sundance_portfolio_returns??"")} onChange={e=>field("sundance_portfolio_returns",e.target.value)}><option value="">Select returns</option><option>Standard</option>{options.mount_type==="Outside"&&<option>Extended</option>}</select></label>
      <p className="text-sm text-amber-900">Standalone valance: maximum width 96 inches and length 18 inches. Its separate material-group schedule includes light-filtering liner; blackout adds 10% to source retail.</p>
    </> : <>
      <label className="block text-sm">Control<select aria-label="Sundance Portfolio control" className={classes} value={String(options.sundance_portfolio_control??"")} onChange={e=>field("sundance_portfolio_control",e.target.value)}><option value="">Select control</option>{sundancePortfolioControls.filter(control=>control!=="Cordless TDBU"||(options.roman_style==="Knife Pleat"&&selected?.tdbuAvailable)).map(control=><option key={control}>{control}</option>)}</select></label>
      <label className="block text-sm">Shade drop<select aria-label="Sundance Portfolio drop" className={classes} value={String(options.sundance_portfolio_drop??"")} onChange={e=>field("sundance_portfolio_drop",e.target.value)}><option value="">Select drop</option>{options.roman_style!=="Hobbled"&&<option>Standard</option>}{options.sundance_portfolio_control!=="Cordless TDBU"&&<option>Waterfall</option>}</select></label>
      <label className="block text-sm">Assembly<select aria-label="Sundance Portfolio assembly" className={classes} value={String(options.sundance_portfolio_assembly??"")} onChange={e=>field("sundance_portfolio_assembly",e.target.value)}><option value="">Select assembly</option><option>Single</option><option>Two on one</option></select></label>
    </>}
    {issues.length>0&&<div role="alert" className="space-y-1 text-sm text-amber-900">{issues.map(issue=><p key={issue.ruleId}>{issue.explanation}</p>)}</div>}
    {selected?.portalStatus==="current_guide_only"&&<p className="text-sm text-amber-900">This exact material is in the current guide but absent from the captured dealer menu. Confirm ordering availability and price with Sundance.</p>}
    {selected&&!selected.tdbuAvailable&&<p className="text-sm text-amber-900">This material is not available with top-down/bottom-up.</p>}
    {options.roman_style==="Hobbled"&&<p className="text-sm text-amber-900">Hobbled shades have a 72-inch maximum height and are waterfall only.</p>}
    {!valanceOnly&&<p className="text-sm text-amber-900">The selected grid includes light-filtering liner and cordless or clutch control. Blackout liner adds 10% to source retail. Motor, valance, size and assembly requirements still need confirmation in the manual quote.</p>}
  </>;
}
