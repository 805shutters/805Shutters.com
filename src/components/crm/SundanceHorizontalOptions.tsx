"use client";
import { SundanceHorizontalConfiguration } from "./SundanceHorizontalConfiguration";
import type { SalesQuoteDesign } from "@mts/types/quote";
import { sundanceHorizontalColors, sundanceHorizontalColorPatch, sundanceHorizontalSource, sundanceHorizontalValances } from "@/lib/quote/sundance/horizontal-assortment";

export function SundanceHorizontalOptions({productId, options, onUpdateFields, widthInches=0,heightInches=0}: {
  productId: string; widthInches?:number;heightInches?:number; options: Record<string, unknown>; onUpdateFields: (fields: Partial<SalesQuoteDesign>) => void;
}) {
  const rows = sundanceHorizontalColors.filter(row => row.productId === productId && row.available);
  const selected = sundanceHorizontalSource.rows.find(row => row.id === options.fabric_color_id && row.productId === productId);
  const valances = sundanceHorizontalValances(selected?.id);
  const classes = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";
  return <>
    <label className="block text-sm">Blind color<select aria-label="Sundance blind color" className={classes} value={String(options.fabric_color_id ?? "")} onChange={e => {
      const row = rows.find(row => row.id === e.target.value);
      const patch = sundanceHorizontalColorPatch(options,productId,e.target.value);
      if (row && patch) onUpdateFields({fabric:row.colorName,options_json:patch});
    }}><option value="">Select color</option>{rows.map(row => <option key={row.id} value={row.id}>{row.colorCode} · {row.colorName} · {row.collection}</option>)}</select></label>
    {rows.length === 0 && <p className="text-sm text-amber-900">The current guide lists this product, but its exact dealer ordering destination is unresolved. Confirm availability and the material code before entering a manual quote.</p>}
    {selected && <p className="text-sm">Cordless · {selected.slatSize}-inch slats{selected.variant ? ` · ${selected.variant}` : ""}</p>}
    {Boolean(selected?.retailSurchargePercent) && <p className="text-sm text-amber-900">The guide adds {selected!.retailSurchargePercent}% to retail for this color or slat variant before the dealer factor. Include the confirmed charge in the manual price.</p>}
    {selected?.nameConflict && <p className="text-sm text-amber-900">Code 2189 is Arctic Ice in the guide and ARTIC WHITE in the dealer menu. Confirm the intended finish before ordering.</p>}
    {selected?.trapezoidBottomrail && <p className="text-sm">Trapezoid bottomrail.</p>}
    {valances.length > 0 && <label className="block text-sm">Valance<select aria-label="Sundance blind valance" className={classes} value={String(options.sundance_blind_valance ?? "")} onChange={e => onUpdateFields({options_json:{...options,sundance_blind_valance:e.target.value || null}})}><option value="">Select valance</option>{valances.map(value => <option key={value}>{value}</option>)}</select></label>}
    {productId === "sundance_premium_ii_2_5" && <p className="text-sm text-amber-900">The specification caps height at 84 inches, although the price grid includes a 92-inch row. Confirm any greater height with the dealer.</p>}
    <SundanceHorizontalConfiguration productId={productId} options={options} onUpdateFields={onUpdateFields} widthInches={widthInches} heightInches={heightInches} />
  </>;
}
