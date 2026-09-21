"use client";
import { SundanceStockVerticalConfiguration } from "./SundanceStockVerticalConfiguration";
import { SundanceWaldenConfiguration } from "./SundanceWaldenConfiguration";
import { SundanceVerticalOptions } from "./SundanceVerticalOptions";
import { sundanceWaldenColors, sundanceWaldenFabricPatch, sundanceWaldenSource } from "@/lib/quote/sundance/walden-assortment";
import type { SalesQuoteDesign } from "@mts/types/quote";
import { sundanceStockVerticalPatch, sundanceWaldenChoices, sundanceWaldenLinerColors, sundanceWaldenSelectionPatch, type SundanceWaldenOptionKind } from "@/lib/quote/sundance/supplemental-configuration";

export function SundanceSupplementalOptions({productId, options, onUpdateFields, widthInches=0, heightInches=0}: {
  productId: string; widthInches?: number; heightInches?: number; options: Record<string, unknown>; onUpdateFields: (fields: Partial<SalesQuoteDesign>) => void;
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
    {options.sundance_vertical_type !== "Stock" && <SundanceVerticalOptions options={options} onUpdateFields={onUpdateFields} widthInches={widthInches} heightInches={heightInches} />}
    {options.sundance_vertical_type === "Stock" && <SundanceStockVerticalConfiguration options={options} onUpdateFields={onUpdateFields} widthInches={widthInches} heightInches={heightInches} />}
  </>;
  const colors = sundanceWaldenLinerColors(productId, options.catalog_sundance_liner_grid_id);
  const fabric = sundanceWaldenSource.rows.find(row => row.id === options.fabric_color_id && row.productId === productId);
  return <>
    <label className="block text-sm">Fabric and color<select aria-label="Sundance Walden fabric and color" className={classes} value={String(options.fabric_color_id ?? "")} onChange={e => {
      const row = sundanceWaldenColors.find(row => row.id === e.target.value);
      const patch = sundanceWaldenFabricPatch(options,productId,e.target.value);
      if (row && patch) onUpdateFields({fabric:row.colorName,options_json:patch});
    }}><option value="">Select fabric and color</option>{sundanceWaldenColors.filter(row => row.productId === productId && row.available).map(row => <option key={row.id} value={row.id}>{row.colorCode} · {row.colorName}</option>)}</select></label>
    {fabric?.edgeBindingRequired && <p className="text-sm text-amber-900">This fabric requires edge binding. Confirm its coordinated color and any applicable charge before ordering.</p>}
    {fabric?.edgeBindingSourceConflict && <p className="text-sm text-amber-900">The dealer menu requires edge binding for this fabric, while the guide describes edge seal without binding. Confirm the current requirement before ordering.</p>}
    {fabric?.portalStatus === "duplicate_name_exception" && <p className="text-sm text-amber-900">The dealer menu lists this fabric more than once. Confirm the exact material code before ordering.</p>}
    {(["liner","edge_binding"] as SundanceWaldenOptionKind[]).map(kind => <label key={kind} className="block text-sm">{kind === "liner" ? "Liner" : "Edge binding"}
      <select aria-label={`Sundance Walden ${kind === "liner" ? "liner" : "edge binding"}`} className={classes} value={String(options[`catalog_sundance_${kind}_grid_id`] ?? "")} onChange={e => {
        const patch = sundanceWaldenSelectionPatch(options,productId,kind,e.target.value);
        if (patch) onUpdateFields({options_json: patch});
      }}><option value="">None / not selected</option>{sundanceWaldenChoices(productId,kind).map(option => <option key={option.id} value={option.id}>{option.name}</option>)}</select>
    </label>)}
    {colors.length > 0 && select("walden_liner_color","Walden liner color",colors)}
    {colors.length > 0 && select("walden_movable_liner","Movable liner (twin shade)",["No","Yes"])}
    <p className="text-sm text-amber-900">Confirm the fabric, control and liner or binding compatibility before ordering. Liner, binding and movable-liner charges must be included in the confirmed manual price. Valance-only pricing is separate.</p>
    <SundanceWaldenConfiguration productId={productId} options={options} onUpdateFields={onUpdateFields} widthInches={widthInches} heightInches={heightInches} />
    {productId === "sundance_walden_select" && <p className="text-sm">No edge-binding surcharge applies to fabrics that require edge binding.</p>}
  </>;
}
