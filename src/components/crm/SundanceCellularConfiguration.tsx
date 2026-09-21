'use client';
import { nonNormanQuoteIssues } from "@/lib/quote/non-norman-ordering-only";
import { QuoteChoiceButtons } from "./QuoteChoiceButtons";
import { SundanceCellularAccessories } from './SundanceCellularAccessories';
import type { SelectionRecord } from '@/lib/quote-v2/core';
import type { SalesQuoteDesign } from '@mts/types/quote';
import { sundanceCellularColors } from '@/lib/quote/sundance/cellular-assortment';
import { sundanceCellularShapes, sundanceCellularShapePatch, sundanceCellularSystems, sundanceCellularSystemPatch, sundanceCellularBottomPatch, validateSundanceCellularConfiguration } from '@/lib/quote/sundance/cellular-configuration';
export function SundanceCellularConfiguration({ options, widthInches = 0, heightInches = 0, onUpdateFields, pricingOnly = true }: { pricingOnly?: boolean;
  options: Record<string, unknown>; widthInches?: number; heightInches?: number; onUpdateFields: (fields: Partial<SalesQuoteDesign>) => void;
}) {
  const classes = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm';
  const field = (key: string, value: string) => onUpdateFields({ options_json: { ...options, [key]: value || null } });
  const issues = nonNormanQuoteIssues(validateSundanceCellularConfiguration({ widthInches, heightInches, programId: String(options.catalog_program_id ?? ''), configuration: options as SelectionRecord }), pricingOnly);
  return <>
    <div className="block text-sm">Operating system<QuoteChoiceButtons aria-label="Sundance cellular operating system" value={String(options.sundance_cellular_system ?? '')} onChange={value => { const patch = sundanceCellularSystemPatch(options, value); onUpdateFields({ ...(patch.fabric_color_id == null ? { fabric: null } : {}), options_json: patch }); }}><option value="">Select operating system</option>{sundanceCellularSystems.map(system => <option key={system.name}>{system.name}</option>)}</QuoteChoiceButtons></div>
    <div className="block text-sm">Mount<QuoteChoiceButtons aria-label="Sundance cellular mount" value={String(options.mount_type ?? '')} onChange={value => onUpdateFields({ mount_type: value, options_json: { ...options, mount_type: value, sundance_cellular_mount_depth: null, sundance_cellular_recess: null } })}><option value="">Select mount</option><option>Inside</option><option>Outside</option></QuoteChoiceButtons></div>
    {options.sundance_cellular_system === 'Specialty Shape' && <>
      <div className="block text-sm">Specialty shape<QuoteChoiceButtons aria-label="Sundance cellular specialty shape" value={String(options.sundance_cellular_shape ?? '')} onChange={value => onUpdateFields({ options_json: sundanceCellularShapePatch(options, value) })}><option value="">Select shape</option>{sundanceCellularShapes.map(shape => <option key={shape}>{shape}</option>)}</QuoteChoiceButtons></div>
      {['Standard Arch','Quarter Arch','Circle'].includes(String(options.sundance_cellular_shape)) && <div className="block text-sm">Geometry<QuoteChoiceButtons aria-label="Sundance cellular shape geometry" value={String(options.sundance_cellular_shape_geometry ?? '')} onChange={value => field('sundance_cellular_shape_geometry',value)}><option value="">Select geometry</option><option>Perfect</option><option>Non-perfect</option></QuoteChoiceButtons></div>}
      {['Hexagon','Octagon'].includes(String(options.sundance_cellular_shape)) && Array.from({length:options.sundance_cellular_shape==='Hexagon'?6:8},(_,index)=><label key={index} className="block text-sm">Side {index+1}, clockwise from top (inches)<input type="number" step="0.0625" className={classes} aria-label={`Sundance cellular shape side ${index+1}`} value={String(options[`sundance_cellular_shape_side_${index+1}`]??'')} onChange={e=>field(`sundance_cellular_shape_side_${index+1}`,e.target.value)}/></label>)}
      {(['Hexagon','Octagon'].includes(String(options.sundance_cellular_shape))||options.sundance_cellular_shape_geometry==='Non-perfect')&&<label className="block text-sm">Template file reference<input type="text" className={classes} aria-label="Sundance cellular template reference" value={String(options.sundance_cellular_template_reference??'')} onChange={e=>field('sundance_cellular_template_reference',e.target.value)}/></label>}
      <p className="text-sm text-amber-900">Quarter arches and circles are non-movable. Non-perfect shapes and all polygons require an actual template; the file reference does not verify that it is attached or approved. Confirm geometry, fabric availability and final charge before ordering.</p>
    </>}
    {options.sundance_cellular_system === 'Cordless Day/Night'  && <>
      <p className="text-sm text-amber-900">The primary fabric above is the light-filtering top. Select blackout fabric for the bottom; both fabrics retain their own price groups. The source prices both fabrics plus the $500 retail TDBU surcharge. Pair compatibility and account conversion require confirmation.</p>
      <div className="block text-sm">Bottom blackout fabric<QuoteChoiceButtons aria-label="Sundance cellular bottom fabric" value={String(options.sundance_cellular_bottom_fabric_id ?? '')} onChange={value => { const patch = sundanceCellularBottomPatch(options, value); if (patch) onUpdateFields({ options_json: patch }); }}><option value="">Select bottom fabric</option>{sundanceCellularColors.filter(row => row.automaticDetails.light_control === 'Blackout').map(row => <option key={row.id} value={row.id}>{row.colorCode} · {row.collection} · {row.colorName}</option>)}</QuoteChoiceButtons></div>
    </>}
    {options.sundance_cellular_system === 'Verticell' && <>
      <div className="block text-sm">Stack<QuoteChoiceButtons aria-label="Sundance cellular stack" value={String(options.sundance_cellular_stack ?? '')} onChange={value => field('sundance_cellular_stack', value)}><option value="">Select stack</option><option>Left Stack</option><option>Right Stack</option><option>Center Split</option></QuoteChoiceButtons></div>
      {!pricingOnly && <label className="block text-sm">{options.mount_type === 'Outside' ? 'Flat vertical surface' : 'Available mounting depth'} (inches)<input type="number" step="0.0625" className={classes} aria-label="Sundance cellular mount depth" value={String(options.sundance_cellular_mount_depth ?? '')} onChange={e => field('sundance_cellular_mount_depth', e.target.value)} /></label>}
      {!pricingOnly && options.mount_type === 'Inside' && <div className="block text-sm">Recess<QuoteChoiceButtons aria-label="Sundance cellular recess" value={String(options.sundance_cellular_recess ?? '')} onChange={value => field('sundance_cellular_recess', value)}><option value="">Select recess</option><option>Flush</option><option>Partial recess</option></QuoteChoiceButtons></div>}
      <p className="text-sm text-amber-900">Off White aluminum rails; integrated headrail without separate valance. Minimum stack width 6 inches. Factory inside deductions are ¼-inch width and ½-inch height; do not subtract them twice. Verticell pricing must be confirmed.</p>
    </>}
    {options.sundance_cellular_system === 'Skylight' && <p className="text-sm text-amber-900">White #001 side rails. Enter finished size; the factory takes no deductions. The source specialty/skylight surcharge is $116 net, separate from retail fabric pricing.</p>}
    {String(options.sundance_cellular_system ?? '').startsWith('Simphony') && <p className="text-sm text-amber-900">The motor page states minimum width and a 96×96-inch maximum, but no minimum height. Confirm minimum height and required power/accessories before ordering.</p>}
    <div className="block text-sm">Assembly<QuoteChoiceButtons aria-label="Sundance cellular assembly" value={String(options.sundance_cellular_assembly ?? '')} onChange={value => field('sundance_cellular_assembly', value)}><option value="">Select assembly</option><option>Single</option><option>Two on one</option></QuoteChoiceButtons></div>
    <SundanceCellularAccessories options={options} widthInches={widthInches} onChange={field} />
    {issues.length > 0 && <div role="alert" className="space-y-1 text-sm text-amber-900">{issues.map(issue => <p key={issue.ruleId}>{issue.explanation}</p>)}</div>}
  </>;
}
