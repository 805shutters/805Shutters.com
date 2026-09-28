import type { SelectionContext, ValidationIssue } from './core';
import type { SurchargeSelection } from '../quote/pricing';
import { BASE_CONFIGURATION_VERSION } from './base-configuration';
import { sourceProvenance } from './source-manifest';

const id = 'woodlore_invisible_tilt_per_panel';
/** Preserve the existing 805 Woodlore $15/panel policy on newly configured V2 lines. */
export function woodloreBaseTilt(s: SelectionContext) {
  if (s.configuration.base_configuration_version !== BASE_CONFIGURATION_VERSION ||
      s.productId !== 'norman_shutters' || s.programId !== 'woodlore' ||
      !/^invisible tilt$/i.test(String(s.configuration.tilt_type ?? ''))) return null;
  const layout = String(s.configuration.panel_config ?? s.configuration.panel_configuration ?? '');
  const count = /^[LRT]+$/i.test(layout) ? (layout.match(/[LR]/gi) ?? []).length : 0;
  const issues: ValidationIssue[] = count ? [] : [{
    severity: 'hard_block', ruleId: 'base.configuration.woodlore_tilt_panels',
    source: sourceProvenance('805-owner-woodlore-invisible-tilt-existing-policy'),
    selectedValues: {panel_config: layout},
    explanation: 'Woodlore InvisibleTilt is $15 per panel; select the actual panel configuration before pricing.',
  }];
  return {issues, selections: count ? [{id, units: count}] : []};
}
export function withBaseShutterTilt(s: SelectionContext, existing: SurchargeSelection[]): SurchargeSelection[] {
  const tilt = woodloreBaseTilt(s);
  return tilt ? [...existing.filter(x=> ![id, 'invisibletilt', 'clearview_tilt_rod'].includes(x.id)), ...tilt.selections] : existing;
}
