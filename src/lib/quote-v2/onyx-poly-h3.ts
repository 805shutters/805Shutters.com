import { sourceProvenance } from './source-manifest';
import type { SurchargeSelection } from '../quote/pricing';
import type { SelectionContext, ValidationIssue } from './core';

export const ONYX_POLY_H3_SURCHARGE_ID = 'poly_composite_h3_per_panel';
export const ONYX_POLY_H3_SOURCE = sourceProvenance('805-owner-poly-composite-h3-existing-policy');

/** Exact owner-authorized selling option, independent of supplier H3 charges. */
export function onyxPolyH3(selection: SelectionContext) {
  const c = { ...selection.options, ...selection.configuration };
  const tilt = String(c.tilt_source_code ?? c.tilt_type ?? '').trim();
  if (selection.productId !== 'onyx_shutters' || selection.programId !== 'poly_composite' ||
      !/^H3(?:\s*-\s*Hidden Tiltrod In Stile)?$/i.test(tilt)) return null;
  const layout = String(c.panel_configuration ?? c.panel_config ?? '').trim();
  // Count actual L/R panels. Never derive the panel count from opening width.
  const count = /^[LR]+$/i.test(layout) ? layout.length : 0;
  const issues: ValidationIssue[] = count ? [] : [{
    severity: 'hard_block', ruleId: 'onyx.price.poly_h3_panel_count', source: ONYX_POLY_H3_SOURCE,
    selectedValues: { panel_configuration: layout, tilt_source_code: tilt },
    explanation: 'Poly Composite H3 is priced at $10 per panel; select the exact L/R panel layout before quoting.',
  }];
  return { issues, selections: count ? [{ id: ONYX_POLY_H3_SURCHARGE_ID, units: count }] : [] };
}

/** Replace legacy tilt aliases with one program-specific per-panel charge. */
export function withOnyxPolyH3Surcharges(selection: SelectionContext, existing: readonly SurchargeSelection[]): SurchargeSelection[] {
  const h3 = onyxPolyH3(selection);
  if (!h3) return [...existing];
  return [...existing.filter(s => ![ONYX_POLY_H3_SURCHARGE_ID, 'hidden_tilt_rod'].includes(s.id)), ...h3.selections];
}
