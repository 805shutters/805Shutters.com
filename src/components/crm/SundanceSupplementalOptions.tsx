"use client";
import type { SalesQuoteDesign } from "@mts/types/quote";
import { sundanceStockVerticalPatch, sundanceWaldenChoices, sundanceWaldenLinerColors, sundanceWaldenSelectionPatch, type SundanceWaldenOptionKind } from "@/lib/quote/sundance/supplemental-configuration";

export function SundanceSupplementalOptions({productId, options, onUpdateFields}: {
  productId: string; options: Record<string, unknown>; onUpdateFields: (fields: Partial<SalesQuoteDesign>) => void;
}) {
  const classes = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";
  const update = (key: string, value: string) => onUpdateFields({options_json: {...options, [key]: value || null}});
  const select = (key: string, label: string, values: string[]) => <label key={key} className="block text-sm">{label}
    <select aria-label={`Sundance ${label}`} className={classes} value={String(options[key] ?? "")} onChange={e => update(key,e.target.value)}>
      <option value="">Select</option>{values.map(value => <option key={value}>{value}</option>)}
    </select></label>;
  if (productId === "sundance_vertical_essence") return <>
    <label className="block text-sm">Vertical offering<select aria-label="Sundance vertical offering" className={classes} value={options.sundance_vertical_type === "Stock" ? "Stock" : ""} onChange={e => onUpdateFields({fabric: null, options_json: sundanceStockVerticalPatch(options, e.target.value === "Stock")})}>
      <option value="">Custom / not selected</option><option>Stock</option>
    </select></label>
    {options.sundance_vertical_type === "Stock" && <>
      {select("stock_vertical_color","Stock vertical color",["White","Off-White"])}
      {select("stock_vertical_valance","Stock vertical valance",["None","Square corner valance"])}
      {select("stock_vertical_width_cut_down","Width cut-down",["No","Yes"])}
      {select("stock_vertical_height_cut_down","Height cut-down",["No","Yes"])}
      <p className="text-sm">Wand control · One-way draw · Soft White extruded aluminum reversible headrail.</p>
      <p className="text-sm text-amber-900">Stock blinds are pickup only, FOB Arcadia, California; no delivery. Square valance and each requested cut-down require a confirmed charge in the manual price.</p>
    </>}
  </>;
  const colors = sundanceWaldenLinerColors(productId, options.catalog_sundance_liner_grid_id);
  return <>
    {(["liner","edge_binding"] as SundanceWaldenOptionKind[]).map(kind => <label key={kind} className="block text-sm">{kind === "liner" ? "Liner" : "Edge binding"}
      <select aria-label={`Sundance Walden ${kind === "liner" ? "liner" : "edge binding"}`} className={classes} value={String(options[`catalog_sundance_${kind}_grid_id`] ?? "")} onChange={e => {
        const patch = sundanceWaldenSelectionPatch(options,productId,kind,e.target.value);
        if (patch) onUpdateFields({options_json: patch});
      }}><option value="">None / not selected</option>{sundanceWaldenChoices(productId,kind).map(option => <option key={option.id} value={option.id}>{option.name}</option>)}</select>
    </label>)}
    {colors.length > 0 && select("walden_liner_color","Walden liner color",colors)}
    {colors.length > 0 && productId === "sundance_walden_premier" && select("walden_movable_liner","Movable liner (twin shade)",["No","Yes"])}
    <p className="text-sm text-amber-900">Confirm the fabric, control and liner or binding compatibility before ordering. Liner, binding and movable-liner charges must be included in the confirmed manual price. Valance-only pricing is separate.</p>
    {productId === "sundance_walden_select" && <p className="text-sm">No edge-binding surcharge applies to fabrics that require edge binding.</p>}
  </>;
}
