"use client";
import { getProduct } from "@/lib/quote/catalog";
import { sanClementeColors, SAN_CLEMENTE_HONEYCOMB } from "@/lib/quote/norman-san-clemente";
import { validateSanClemente } from "@/lib/quote-v2/norman-san-clemente-rules";
import { measurementToInches } from "@mts/lib/pricingEngine";
import type { SalesQuoteLineItem } from "@mts/types/quote";
import type { SalesQuoteDesign } from "@mts/types/quote";

/** Dedicated controls prevent Portrait and Ultimate options crossing this product boundary. */
export function SanClementeDesignOptions({ design, productId, lineItem, onUpdateFields }: {
  design: SalesQuoteDesign | undefined;
  productId: string;
  lineItem: SalesQuoteLineItem;
  onUpdateFields: (fields: Partial<SalesQuoteDesign>) => void;
}) {
  const options = (design?.options_json ?? {}) as Record<string, unknown>;
  const hc = productId === SAN_CLEMENTE_HONEYCOMB;
  const rows = sanClementeColors.filter(row => row.productId === productId);
  const inside = /inside/i.test(design?.mount_type ?? "");
  const update = (patch: Record<string, unknown>, fields: Partial<SalesQuoteDesign> = {}) => onUpdateFields({
    ...fields, options_json: { ...options, ...patch },
  });
  const validation = validateSanClemente({ productId, manufacturerId: "Norman", programId: String(options.catalog_program_id ?? options.quote_lab_program_id ?? ""), catalogVersion: "", catalogAsOf: "2026-09-19", quantity: lineItem.quantity,
    widthInches: measurementToInches(lineItem.width_whole, lineItem.width_fraction), heightInches: measurementToInches(lineItem.height_whole, lineItem.height_fraction), options: {},
    configuration: { ...options, mount_type: design?.mount_type ?? null, lift_system: design?.lift_system ?? null, valance: design?.valance ?? null } as import("@/lib/quote-v2/core").SelectionContext["configuration"],
  });
  const classes = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";
  const select = (label: string, value: unknown, choices: readonly string[], change: (v: string) => void) => <label className="block text-sm">{label}
    <select aria-label={label} className={classes} value={String(value ?? "")} onChange={e => change(e.target.value)}>
      <option value="">Select</option>{choices.map(v => <option key={v} value={v}>{v}</option>)}
    </select>
  </label>;
  return <section className="space-y-3 rounded-lg border border-slate-200 p-3" data-testid="san-clemente-design-options">
    <div className="font-semibold">{getProduct(productId)?.name}</div>
    <p role="status" className="text-sm text-amber-900">Selections can be saved. Pricing requires Norman’s current San Clemente price schedule.</p>
    <label className="block text-sm">San Clemente fabric / color
      <select aria-label="San Clemente fabric / color" className={classes} value={String(options.fabric_color_id ?? "")} onChange={e => {
        const color = rows.find(row => row.id === e.target.value);
        if (!color) return;
        update({ ...color.automaticDetails, fabric_product_id: productId, fabric_color_id: color.id,
          fabric_color_code: color.colorCode, fabric_color_name: color.colorName, fabric_color_collection: color.collection,
          catalog_program_id: color.programId, quote_lab_program_id: color.programId, application: "Standard",
        }, { fabric: color.collection, lift_system: hc ? design?.lift_system || "Cordless" : "Cordless", valance: hc ? null : "Standard" });
      }}>
        <option value="">Select fabric / color</option>{rows.map(row => <option key={row.id} value={row.id}>{row.colorCode} · {row.colorName} · {row.collection}</option>)}
      </select>
    </label>
    {select("San Clemente mount", design?.mount_type, ["Inside Mount", "Outside Mount"], mount_type => update({ san_clemente_mount_fit: null, mount_depth_inches: null, installation_method: null }, { mount_type }))}
    {hc ? select("San Clemente lift", design?.lift_system, ["Cordless", "Cordless TDBU"], lift_system => update({}, { lift_system })) : <p className="text-sm">2-inch embossed slats · Cordless lift · Left wand · Standard valance</p>}
    {inside && select("San Clemente mount fit", options.san_clemente_mount_fit, ["Flush", "Semi Inside"], v => update({ san_clemente_mount_fit: v }))}
    {inside && <label className="block text-sm">Recess depth (inches)<input type="number" aria-label="San Clemente recess depth" className={classes} min="0" step="0.0625" value={String(options.mount_depth_inches ?? "")} onChange={e => update({ mount_depth_inches: e.target.value === "" ? null : Number(e.target.value) })} /></label>}
    {!hc && select("San Clemente bracket mounting", options.installation_method, inside ? ["Top / Back", "Side Only", "Side With Top Support"] : ["Top / Back"], v => update({ installation_method: v }))}
    {validation.length > 0 && <ul role="alert" className="list-disc pl-5 text-sm text-amber-900">{validation.map(issue => <li key={issue.ruleId}>{issue.explanation}</li>)}</ul>}
    {hc && <div className="grid gap-3 sm:grid-cols-3">{[
      ["san_clemente_pole_36_quantity", '36-inch black pole with attachment'],
      ["san_clemente_pole_60_quantity", '60-inch black pole with attachment'],
      ["san_clemente_attachment_quantity", 'White attachment only'],
    ].map(([key,label]) => <div key={key}>{select(label, options[key] ?? 0, ["0","1","2"], v => update({ [key]: Number(v) }))}</div>)}</div>}
  </section>;
}
