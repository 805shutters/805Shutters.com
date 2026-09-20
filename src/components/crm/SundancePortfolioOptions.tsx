"use client";
import type { SalesQuoteDesign } from "@mts/types/quote";
import { sundancePortfolioColors, sundancePortfolioColorMatchesContext, sundancePortfolioColorPatch, sundancePortfolioStylePatch, sundancePortfolioStyles, sundancePortfolioSource } from "@/lib/quote/sundance/portfolio-assortment";

export function SundancePortfolioOptions({options,onUpdateFields}: {
  options: Record<string,unknown>; onUpdateFields: (fields: Partial<SalesQuoteDesign>) => void;
}) {
  const rows = sundancePortfolioColors.filter(row => sundancePortfolioColorMatchesContext(row,options));
  const selected = sundancePortfolioSource.rows.find(row => row.code === options.fabric_color_code);
  const classes = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";
  return <>
    <label className="block text-sm">Shade style<select aria-label="Sundance Portfolio style" className={classes} value={String(options.roman_style??"")} onChange={e => onUpdateFields({fabric:null,options_json:sundancePortfolioStylePatch(options,e.target.value)})}>
      <option value="">All styles</option>{sundancePortfolioStyles.map(style=><option key={style}>{style}</option>)}
    </select></label>
    <label className="block text-sm">Fabric and color<select aria-label="Sundance Portfolio fabric and color" className={classes} value={String(options.fabric_color_id??"")} onChange={e => {
      const row=rows.find(row=>row.id===e.target.value);const patch=sundancePortfolioColorPatch(options,e.target.value);
      if(row&&patch)onUpdateFields({fabric:`${row.colorCode} · ${row.collection} ${row.colorName}`,options_json:patch});
    }}><option value="">Select fabric and color</option>{rows.map(row=><option key={row.id} value={row.id}>{row.colorCode} · {row.collection} {row.colorName} · {row.fabricType}</option>)}</select></label>
    {selected?.portalStatus==="current_guide_only"&&<p className="text-sm text-amber-900">This exact material is in the current guide but absent from the captured dealer menu. Confirm ordering availability and price with Sundance.</p>}
    {selected&&!selected.tdbuAvailable&&<p className="text-sm text-amber-900">This material is not available with top-down/bottom-up.</p>}
    {options.roman_style==="Hobbled"&&<p className="text-sm text-amber-900">Hobbled shades have a 72-inch maximum height and are waterfall only.</p>}
    <p className="text-sm text-amber-900">The selected grid includes light-filtering liner and cordless or clutch control. Blackout liner adds 10% to source retail. Motor, valance, size and assembly requirements still need confirmation in the manual quote.</p>
  </>;
}
