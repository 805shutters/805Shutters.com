"use client";
import { SundanceZebraConfiguration } from "./SundanceZebraConfiguration";
import type { SalesQuoteDesign } from "@mts/types/quote";
import { sundanceShadeColors, sundanceShadeColorPatch, sundanceShadeCollectionPatch, sundanceShadeFabricSource } from "@/lib/quote/sundance/shade-fabrics";

export function SundanceShadeOptions({productId, options, onUpdateFields, widthInches, heightInches}: {
  widthInches?:number; heightInches?:number; productId: string; options: Record<string, unknown>; onUpdateFields: (fields: Partial<SalesQuoteDesign>) => void;
}) {
  const collections = sundanceShadeFabricSource.collections.filter(row => row.productId === productId);
  const selected = collections.find(row => row.id === options.catalog_sundance_shade_collection_id);
  const colors = sundanceShadeColors.filter(row => row.productId === productId && (!selected || row.automaticDetails.catalog_sundance_shade_collection_id === selected.id));
  const classes = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";
  return <>
    <label className="block text-sm">Fabric collection<select aria-label="Sundance shade collection" className={classes} value={selected?.id ?? ""} onChange={e => {
      const patch = sundanceShadeCollectionPatch(options,productId,e.target.value);
      if (patch) onUpdateFields({fabric:null,options_json:patch});
    }}><option value="">Select collection</option>{collections.map(row => <option key={row.id} value={row.id}>{row.name} · Group {row.priceGroup}</option>)}</select></label>
    <label className="block text-sm">Dealer fabric and color<select aria-label="Sundance shade fabric and color" className={classes} value={String(options.fabric_color_id ?? "")} onChange={e => {
      const row = colors.find(row => row.id === e.target.value);
      const patch = sundanceShadeColorPatch(options,productId,e.target.value);
      if (row && patch) onUpdateFields({fabric:row.colorName,options_json:patch});
    }}><option value="">Select exact dealer fabric</option>{colors.map(row => <option key={row.id} value={row.id}>{row.colorName}</option>)}</select></label>
    {selected && <p className="text-sm">{selected.privacyType} · Fabric width {selected.fabricWidth} · Railroading {selected.railroaded === null ? "unverified" : selected.railroaded ? "available" : "not available"}. Final shade limits also depend on the control and top treatment.</p>}
    {colors.length === 0 && <p className="text-sm text-amber-900">The source collection has a pricing destination, but no unambiguous current dealer color is reconciled here. Confirm availability and exact material before quoting.</p>}
    {productId.includes("flat_roman") && <p className="text-sm text-amber-900">A dedicated current dealer ordering type for this flat Roman family was not found. Confirm current orderability before quoting.</p>}
    {["sundance_zebra","sundance_louvolite_zebra"].includes(productId)&&<SundanceZebraConfiguration productId={productId} options={options} onUpdateFields={onUpdateFields} widthInches={widthInches} heightInches={heightInches} />}
    <p className="text-sm text-amber-900">Source collection routes do not verify control, mounting, fabric-width, accessory or account-price compatibility. Confirm the complete configuration and charges with the dealer.</p>
  </>;
}
