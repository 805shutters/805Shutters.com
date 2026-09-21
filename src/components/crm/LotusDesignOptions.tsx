"use client";

import { LOTUS_VINYL_VERSION, lotusVinylProfile, lotusVinylDonorSkus } from "@/lib/quote/lotus-vinyl";
import { LOTUS_ROLLER_VERSION, lotusRollerOpacity } from "@/lib/quote/lotus-roller";
import { LotusRollerOptions } from "./LotusRollerOptions";
import { LotusVerticalOptions } from "./LotusVerticalOptions";
import { LOTUS_VERTICAL_VERSION, lotusVerticalDefaults, lotusVerticalProfile } from "@/lib/quote/lotus-vertical";
import { LOTUS_AMX_PROGRAM, LOTUS_AMX_VERSION } from "@/lib/quote/lotus-amx";
import { getProduct, getProgram } from "@/lib/quote/catalog";
import { lotusProductId } from "@/lib/quote/lotus-selection";
import { LOTUS_COLOR_CONFIGURATION_VERSION, LOTUS_COLOR_PRODUCTS, lotusColorsForSelection } from "@/lib/quote/lotus-colors";
import { LOTUS_TWO_BLIND_VERSION, lotusFauxTwoBlindSupported, lotusFauxWoodConfigurationForProgram } from "@/lib/quote-v2/lotus-faux-wood";
import type { SalesQuoteDesign } from "@mts/types/quote";

export function lotusProgramSelectionPatch(
  current: Record<string, unknown>, productType: string, programId: string,
): Partial<SalesQuoteDesign> | null {
  const product = getProduct(lotusProductId(productType) ?? "");
  const program = product && getProgram(product, programId);
  if (!product || !program) return null;
  const vertical = lotusVerticalProfile(program.id);
  const metadata = Object.fromEntries(
    ["quote_v2_backend", "quote_v2_catalog_version", "quote_v2_catalog_as_of", "discount_percent"].flatMap(
      key => current[key] === undefined ? [] : [[key, current[key]]],
    ),
  );
  return {
    supplier: "Lotus", material: program.name, unit_price: 0,
    mount_type: null, fabric: null, shade_type: null, lift_system: vertical ? vertical.rail ? "Wand control" : "None" : (program.id === LOTUS_AMX_PROGRAM || lotusVinylProfile(program.id)) ? "Cordless" : lotusRollerOpacity(program.id) ? "Cordless Spring Roller" : null,
    motor_type: null, remote_type: null, valance: vertical ? vertical.valance : (program.id === LOTUS_AMX_PROGRAM || lotusVinylProfile(program.id)) ? "None" : lotusRollerOpacity(program.id) ? "Smooth valance" : null,
    options_json: {
      ...metadata, catalog_product_id: product.id, quote_lab_product_id: product.id,
      catalog_program_id: program.id, quote_lab_program_id: program.id,
      catalog_manufacturer: "Lotus", catalog_product_type: productType,
      surcharges: [], motorization_selections: [],
      ...((LOTUS_COLOR_PRODUCTS as readonly string[]).includes(product.id) ? { lotus_color_configuration_version: LOTUS_COLOR_CONFIGURATION_VERSION, color: null } : {}),
      ...lotusFauxWoodConfigurationForProgram(program.id),
      ...lotusVerticalDefaults(program.id),
      ...(lotusVinylProfile(program.id) ? {lotus_vinyl_configuration_version:LOTUS_VINYL_VERSION,lotus_measurement_basis:"inside_opening"} : {}),
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
  const vinyl = lotusVinylProfile(programId);
  const vinylDonors = vinyl ? lotusVinylDonorSkus(programId, widthInches ?? 0, heightInches ?? 0, String(options.color ?? "")) : [];
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
    {program && ((vinyl && options.lotus_vinyl_configuration_version !== LOTUS_VINYL_VERSION) || (programId === LOTUS_AMX_PROGRAM && options.lotus_amx_configuration_version !== LOTUS_AMX_VERSION) || (lotusRollerOpacity(programId) && options.lotus_roller_configuration_version !== LOTUS_ROLLER_VERSION) || (lotusVerticalProfile(programId) && options.lotus_vertical_configuration_version !== LOTUS_VERTICAL_VERSION)) && <p className="text-sm text-amber-800">This saved design uses earlier options. Reselect the Lotus program above to apply the current options, then complete its selections.</p>}
    {program && hasColorChoice && <label className="block text-sm">Color
      <select aria-label="Lotus color" className={selectClass} value={colors.includes(String(options.color ?? "")) ? String(options.color) : ""} onChange={event => updateOptions({ color: event.target.value || null, lotus_color_configuration_version: LOTUS_COLOR_CONFIGURATION_VERSION })}>
        <option value="">Select color</option>
        {colors.map(color => <option key={color}>{color}</option>)}
      </select>
      {!colors.length && <span className="text-sm text-amber-800">No source-backed color is available at these dimensions.</span>}
    </label>}
    {lotusVerticalProfile(programId)?.kind !== "Vanes only" && <label className="block text-sm">Mount
      <select aria-label="Lotus mount" className={selectClass} value={design?.mount_type ?? ""} onChange={event => onUpdateFields({ mount_type: event.target.value })}>
        <option value="">Select mount</option><option>Inside Mount</option>{programId !== LOTUS_AMX_PROGRAM && !vinyl && <option>Outside Mount</option>}
      </select>
    </label>
    }
    {programId === LOTUS_AMX_PROGRAM && <p className="text-sm text-slate-600">Cordless lift · Standard headrail · No valance. Enter inside-opening dimensions; the factory deducts ½ inch from the ordered width. Custom widths use ¼-inch increments and heights use whole inches. Outside mounting requires dimension confirmation.</p>}
    {vinyl && <div className="text-sm text-slate-600"><p>Cordless lift · Designer headrail · No valance. Enter nominal inside-opening dimensions; the factory deducts ½ inch from width. Width increments are ¼ inch, height increments are whole inches. Donors at or below 22 inches cannot be width-cut; wider donors allow {vinyl.minimumWidthCut === 0.5 ? "½" : "¼"}–6 inches removed. Height cuts are limited to 10 inches pending source clarification.</p><p>{vinylDonors.length ? `Source donor candidates: ${vinylDonors.join(", ")}. Stock and current price remain unverified.` : "No source donor candidate supports these dimensions/color. Complete the selection or obtain manufacturer confirmation."}</p></div>}
    {lotusRollerOpacity(programId) && <LotusRollerOptions design={design} programId={programId} onUpdateFields={onUpdateFields} />}
    {lotusVerticalProfile(programId) && <LotusVerticalOptions design={design} programId={programId} width={widthInches} height={heightInches} onUpdateFields={onUpdateFields} />}
    {isFaux && <>
      <label className="block text-sm">Blinds in this opening
        <select aria-label="Lotus blind count" className={selectClass} value={Number(options.lotus_blind_count) || 1} onChange={event => updateOptions({ lotus_blind_count: Number(event.target.value), lotus_split_configuration_version: Number(event.target.value) === 2 ? LOTUS_TWO_BLIND_VERSION : null, lotus_blind_widths_inches: null, lotus_blind_1_width_inches: null, lotus_blind_2_width_inches: null, lotus_blind_3_width_inches: null })}>
          <option value={1}>One blind</option>{lotusFauxTwoBlindSupported(programId) && <option value={2}>Two independent blinds</option>}<option value={3}>Three blinds</option>
        </select>
      </label>
      {[2, 3].includes(Number(options.lotus_blind_count)) && Array.from({ length: Number(options.lotus_blind_count) }, (_, index) => index + 1).map(index => <label key={index} className="block text-sm">Blind {index} measured width (inches)
        <input aria-label={`Lotus blind ${index} width`} className={selectClass} type="number" min="0" step="0.0625" value={String(options[`lotus_blind_${index}_width_inches`] ?? "")} onChange={event => updateOptions({ [`lotus_blind_${index}_width_inches`]: event.target.value === "" ? null : Number(event.target.value) })} />
      </label>)}
    </>}
    {program && <p className="text-sm text-slate-600">Measurements use the next available cell in the selected Lotus grid. {program.priceAxis === "width" ? "This program prices a headrail by width." : program.priceAxis === "height" ? "Vane quantity basis requires manufacturer confirmation before customer delivery." : product.id === "lotus_vertical_blinds" ? "Enter the exact finished width and height above; no automatic deduction applies." : "Enter the actual opening width and height above."}</p>}
  </section>;
}
