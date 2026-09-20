"use client";

import { LOTUS_ROLLER_VERSION, lotusRollerOpacity } from "@/lib/quote/lotus-roller";
import { LotusRollerOptions } from "./LotusRollerOptions";
import { LOTUS_AMX_PROGRAM, LOTUS_AMX_VERSION } from "@/lib/quote/lotus-amx";
import { getProduct, getProgram } from "@/lib/quote/catalog";
import { lotusProductId } from "@/lib/quote/lotus-selection";
import { LOTUS_COLOR_CONFIGURATION_VERSION, LOTUS_COLOR_PRODUCTS, lotusColorsForSelection } from "@/lib/quote/lotus-colors";
import { lotusFauxWoodConfigurationForProgram } from "@/lib/quote-v2/lotus-faux-wood";
import type { SalesQuoteDesign } from "@mts/types/quote";

export function lotusProgramSelectionPatch(
  current: Record<string, unknown>, productType: string, programId: string,
): Partial<SalesQuoteDesign> | null {
  const product = getProduct(lotusProductId(productType) ?? "");
  const program = product && getProgram(product, programId);
  if (!product || !program) return null;
  const metadata = Object.fromEntries(
    ["quote_v2_backend", "quote_v2_catalog_version", "quote_v2_catalog_as_of", "discount_percent"].flatMap(
      key => current[key] === undefined ? [] : [[key, current[key]]],
    ),
  );
  return {
    supplier: "Lotus", material: program.name, unit_price: 0,
    mount_type: null, fabric: null, shade_type: null, lift_system: program.id === LOTUS_AMX_PROGRAM ? "Cordless" : lotusRollerOpacity(program.id) ? "Cordless Spring Roller" : null,
    motor_type: null, remote_type: null, valance: program.id === LOTUS_AMX_PROGRAM ? "None" : lotusRollerOpacity(program.id) ? "Smooth valance" : null,
    options_json: {
      ...metadata, catalog_product_id: product.id, quote_lab_product_id: product.id,
      catalog_program_id: program.id, quote_lab_program_id: program.id,
      catalog_manufacturer: "Lotus", catalog_product_type: productType,
      surcharges: [], motorization_selections: [],
      ...((LOTUS_COLOR_PRODUCTS as readonly string[]).includes(product.id) ? { lotus_color_configuration_version: LOTUS_COLOR_CONFIGURATION_VERSION, color: null } : {}),
      ...lotusFauxWoodConfigurationForProgram(program.id),
      ...(lotusRollerOpacity(program.id) ? {lotus_roller_configuration_version:LOTUS_ROLLER_VERSION,lotus_roller_opacity:lotusRollerOpacity(program.id),color:"White",lotus_roller_shade_count:1} : {}),
      ...(program.id === LOTUS_AMX_PROGRAM ? { lotus_amx_configuration_version: LOTUS_AMX_VERSION, lotus_measurement_basis: "inside_opening" } : {}),
    },
  };
}

/** Only controls supported by the selected Lotus program; never Norman controls. */
export function LotusDesignOptions({ design, productType, widthInches, heightInches, onUpdateFields }: {
  design: SalesQuoteDesign | undefined;
  productType: string;
  widthInches?: number;
  heightInches?: number;
  onUpdateFields: (fields: Partial<SalesQuoteDesign>) => void;
}) {
  const product = getProduct(lotusProductId(productType) ?? "");
  if (!product) return null;
  const options = (design?.options_json ?? {}) as Record<string, unknown>;
  const programId = String(options.catalog_program_id ?? options.quote_lab_program_id ?? "");
  const program = getProgram(product, programId);
  const isFaux = product.id === "lotus_faux_wood_blinds";
  const hasColorChoice = (LOTUS_COLOR_PRODUCTS as readonly string[]).includes(product.id);
  const colors = lotusColorsForSelection(product.id, programId, widthInches, heightInches);
  const selectClass = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";
  const updateOptions = (patch: Record<string, unknown>) => onUpdateFields({ options_json: { ...options, ...patch } });
  return <section className="space-y-3 rounded-lg border border-slate-200 p-3" data-testid="lotus-design-options">
    <div className="font-semibold">{product.name}</div>
    <label className="block text-sm">Lotus program
      <select aria-label="Lotus program" className={selectClass} value={program ? programId : ""} onChange={event => {
        const patch = lotusProgramSelectionPatch(options, productType, event.target.value);
        if (patch) onUpdateFields(patch);
      }}>
        <option value="">Select program</option>
        {product.programs.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
    </label>
    {program && hasColorChoice && <label className="block text-sm">Color
      <select aria-label="Lotus color" className={selectClass} value={colors.includes(String(options.color ?? "")) ? String(options.color) : ""} onChange={event => updateOptions({ color: event.target.value || null, lotus_color_configuration_version: LOTUS_COLOR_CONFIGURATION_VERSION })}>
        <option value="">Select color</option>
        {colors.map(color => <option key={color}>{color}</option>)}
      </select>
      {!colors.length && <span className="text-sm text-amber-800">No source-backed color is available at these dimensions.</span>}
    </label>}
    <label className="block text-sm">Mount
      <select aria-label="Lotus mount" className={selectClass} value={design?.mount_type ?? ""} onChange={event => onUpdateFields({ mount_type: event.target.value })}>
        <option value="">Select mount</option><option>Inside Mount</option>{programId !== LOTUS_AMX_PROGRAM && <option>Outside Mount</option>}
      </select>
    </label>
    {programId === LOTUS_AMX_PROGRAM && <p className="text-sm text-slate-600">Cordless lift · Standard headrail · No valance. Enter inside-opening dimensions; the factory deducts ½ inch from the ordered width. Custom widths use ¼-inch increments and heights use whole inches. Outside mounting requires dimension confirmation.</p>}
    {lotusRollerOpacity(programId) && <LotusRollerOptions design={design} programId={programId} onUpdateFields={onUpdateFields} />}
    {isFaux && <>
      <label className="block text-sm">Blinds in this opening
        <select aria-label="Lotus blind count" className={selectClass} value={Number(options.lotus_blind_count) || 1} onChange={event => updateOptions({ lotus_blind_count: Number(event.target.value), lotus_blind_1_width_inches: null, lotus_blind_2_width_inches: null, lotus_blind_3_width_inches: null })}>
          <option value={1}>One blind</option><option value={3}>Three blinds</option>
        </select>
      </label>
      {Number(options.lotus_blind_count) === 3 && [1, 2, 3].map(index => <label key={index} className="block text-sm">Blind {index} measured width (inches)
        <input aria-label={`Lotus blind ${index} width`} className={selectClass} type="number" min="0" step="0.0625" value={String(options[`lotus_blind_${index}_width_inches`] ?? "")} onChange={event => updateOptions({ [`lotus_blind_${index}_width_inches`]: event.target.value === "" ? null : Number(event.target.value) })} />
      </label>)}
    </>}
    {program && <p className="text-sm text-slate-600">Measurements use the next available cell in the selected Lotus grid. {program.priceAxis === "width" ? "This program prices a headrail by width." : program.priceAxis === "height" ? "Vane quantity basis requires manufacturer confirmation before customer delivery." : "Enter the actual opening width and height above."}</p>}
  </section>;
}
