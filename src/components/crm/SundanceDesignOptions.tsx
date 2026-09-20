"use client";
import { sundanceCellularColors, sundanceCellularColorMatchesContext } from "@/lib/quote/sundance/cellular-assortment";
import { sundanceDraperyTrackFields } from "@/lib/quote/sundance/drapery-track";
import { sundanceCellularFilterPatch, sundanceCellularSelectionPatch } from "@/lib/quote/sundance/configuration";
import { SundanceSupplementalOptions } from "./SundanceSupplementalOptions";
import type { SalesQuoteDesign } from "@mts/types/quote";

/** Source-backed identity capture while the manufacturer's full pricing rules remain gated. */
export function SundanceDesignOptions({ design, productId, onUpdateFields }: {
  design: Pick<SalesQuoteDesign, "options_json"> | undefined;
  productId: string;
  onUpdateFields: (fields: Partial<SalesQuoteDesign>) => void;
}) {
  const options = (design?.options_json ?? {}) as Record<string, unknown>;
  const cellular = productId === "sundance_cellular";
  const rows = sundanceCellularColors.filter(row => sundanceCellularColorMatchesContext(row, options));
  const classes = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";
  const filter = (field: "cell_size" | "light_control", value: string) =>
    onUpdateFields({fabric: null, options_json: sundanceCellularFilterPatch(options, field, value)});
  return <section className="space-y-3 rounded-lg border border-slate-200 p-3" data-testid="sundance-design-options">
    <p className="text-sm text-amber-900">Save these Sundance selections with a dealer-confirmed manual price. Configuration compatibility, accessory charges and freight still require confirmation.</p>
    {cellular ? <>
      <label className="block text-sm">Cell size<select aria-label="Sundance cell size" className={classes} value={String(options.cell_size ?? "")} onChange={e => filter("cell_size", e.target.value)}>
        <option value="">All cell sizes</option>{[...new Set(sundanceCellularColors.map(row => row.automaticDetails.cell_size))].map(value => <option key={value} value={value}>{value}</option>)}
      </select></label>
      <label className="block text-sm">Light control<select aria-label="Sundance light control" className={classes} value={String(options.light_control ?? "")} onChange={e => filter("light_control", e.target.value)}>
        <option value="">All light controls</option><option>Light Filtering</option><option>Blackout</option>
      </select></label>
      <label className="block text-sm">Fabric and color<select aria-label="Sundance fabric and color" className={classes} value={String(options.fabric_color_id ?? "")} onChange={e => {
        const patch = sundanceCellularSelectionPatch(options, e.target.value);
        const row = rows.find(candidate => candidate.id === e.target.value);
        if (patch && row) onUpdateFields({fabric: `${row.collection} · ${row.colorName}`, options_json: patch});
      }}>
        <option value="">Select fabric and color</option>{rows.map(row => <option key={row.id} value={row.id}>{row.colorCode} · {row.collection} · {row.colorName} · {row.fabricType}</option>)}
      </select></label>
    </> : ["sundance_vertical_essence", "sundance_walden_premier", "sundance_walden_select"].includes(productId) ? <SundanceSupplementalOptions productId={productId} options={options} onUpdateFields={onUpdateFields} /> : sundanceDraperyTrackFields.map(field => <label key={field.id} className="block text-sm">{field.label}
      <select aria-label={`Sundance ${field.label}`} className={classes} value={String(options[field.id] ?? "")} onChange={e => onUpdateFields({options_json: {...options, [field.id]: e.target.value || null}})}>
        <option value="">Select</option>{field.options?.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>)}
  </section>;
}
