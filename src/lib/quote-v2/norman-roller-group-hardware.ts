import type { SelectionContext, SelectionRecord, ValidationIssue } from './core';
import { resolveRollerMatrixProfile, rollerComponentOrderWidthsForPricing, validateRollerMatrix } from './roller-matrix';
import { sourceProvenance } from './source-manifest';

const norm = (value: unknown) => String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const liftKind = (s: SelectionContext) => {
  const value = norm(s.configuration.lift_system);
  return /cordless/.test(value) ? 'cordless' : /smart ?release/.test(value) ? 'smart_release' : /cord.*loop/.test(value) ? 'cord_loop' : /motor/.test(value) ? 'motorized' : 'unknown';
};
/** Diameter is parsed only from explicit source tube identities, never the ambiguous label "Large". */
export function rollerTubeDiameter(value: unknown): number | null {
  const text = String(value ?? '').trim().toLowerCase();
  if (/1\s*(?:3\s*\/\s*4|¾)|43\s*mm/.test(text)) return 1.75;
  if (/1\s*(?:1\s*\/\s*8|⅛)/.test(text)) return 1.125;
  if (/^2\s*(?:["”]|inch|tube|$)|52\s*mm/.test(text)) return 2;
  return null;
}
const tubeLabel = (diameter: number) => diameter === 2 ? '2" (52mm) Tube' : diameter === 1.75 ? '1 3/4" (43mm) Tube' : '1 1/8" Tube';
const memberWidths = (s: SelectionContext) => rollerComponentOrderWidthsForPricing(s) ?? [s.widthInches];
/** Guide p41 applies to each physical shade width, not the overall coupled unit width. */
export function rollerMinimumFasciaSize(s: SelectionContext): 3.5 | 4.5 | null {
  const kind = liftKind(s), height = s.heightInches;
  if (kind === 'unknown') return null;
  return memberWidths(s).some(width => {
    if (kind === 'smart_release') return width > 96 || height > 96;
    if (kind === 'cordless') return height > (width > 24 && width <= 96 ? 96 : 72);
    return height > (width <= 96 ? 96 : 72) || kind === 'cord_loop' && height / width > 5 && height > 72;
  }) ? 4.5 : 3.5;
}

/** Deterministic requirements and candidate compatibility, not a fabricated factory hardware selection.
 * The selected tube is never silently changed. A mismatch must be corrected in the saved shade.
 */
export function deriveRollerGroupHardware(
  members: readonly { lineId: string; selection: SelectionContext }[],
  kind: 'common' | 'separate',
): { record: SelectionRecord; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = [];
  const add = (row: typeof members[number], id: string, page: number, explanation: string) => issues.push({
    severity: 'hard_block', ruleId: `roller.group_hardware.${id}`,
    source: sourceProvenance('norman-roller-guide-2026-09-16', { page }),
    selectedValues: { lineId: row.lineId, groupType: kind }, explanation,
  });
  const diameters = members.map(row => rollerTubeDiameter(row.selection.configuration.roller_tube ?? row.selection.configuration.tube_class));
  const known = diameters.every(value => value !== null);
  const requiredTube = known && diameters.length ? Math.max(...diameters as number[]) : null;
  const minima = members.map(row => rollerMinimumFasciaSize(row.selection));
  let minimumFascia = minima.every(value => value !== null) && minima.length ? Math.max(...minima as number[]) : null;
  // Guide p46 says another shade: use different physical members, not max width × max height of one shade.
  const physical = members.flatMap(row => memberWidths(row.selection).map(width => ({ row, width, height: row.selection.heightInches })));
  const crossMember = kind === 'common' && physical.some((a, i) =>
    (a.width > 96 || liftKind(a.row.selection) === 'cord_loop' && a.height / a.width > 5) &&
    physical.some((b, j) => i !== j && b.height > 72));
  if (crossMember) minimumFascia = 4.5;
  const records: SelectionRecord[] = members.map((row, index) => {
    const s = row.selection, lift = liftKind(s), selectedTube = diameters[index];
    if (selectedTube === null) add(row, 'tube_identity', 37, 'Choose the exact source tube diameter for every associated shade; an unqualified size label cannot establish the largest tube.');
    if (requiredTube !== null && selectedTube !== requiredTube) add(row, 'tube_matching', 37, `The largest selected tube in this group is ${requiredTube} inches. Select that exact tube on every shade after checking its fabric-specific limits.`);
    if (requiredTube === 2 && lift === 'cordless' && memberWidths(s).some(width => width <= 20)) add(row, 'cordless_upgrade', 37, 'PrecisionLift Cordless shades 20 inches or narrower cannot upgrade to the 2-inch group tube.');
    let candidate = requiredTube === null ? null : { ...s, configuration: { ...s.configuration, roller_tube: tubeLabel(requiredTube), tube_class: tubeLabel(requiredTube) } };
    let resolved = candidate ? resolveRollerMatrixProfile(candidate) : null;
    // Some operating-system source profiles explicitly cover all tubes. Use that
    // complete source profile only when a diameter-specific profile is absent.
    if (candidate && resolved && !resolved.ok && resolved.code === 'PROFILE_NOT_FOUND') {
      const allTubes = { ...candidate, configuration: { ...candidate.configuration, roller_tube: 'All Tubes', tube_class: 'All Tubes' } };
      const allResolved = resolveRollerMatrixProfile(allTubes);
      if (allResolved.ok && (!allResolved.definition.tube || norm(allResolved.definition.tube) === 'all tubes')) { candidate = allTubes; resolved = allResolved; }
    }
    const matrixIssues = candidate ? validateRollerMatrix(candidate).filter(issue => issue.severity === 'hard_block') : [];
    if (candidate && matrixIssues.length) add(row, 'tube_compatibility', 37, `The ${requiredTube}-inch group tube is not verified for this exact fabric/configuration: ${matrixIssues.map(issue => issue.explanation).join(' ')}`);
    const explicitSize = String(s.configuration.valance ?? '').match(/^\s*3(?:\.5|½|\s+1\/2)(?=[\s"”-])/);
    if (minimumFascia === 4.5 && explicitSize) add(row, 'fascia_size', crossMember ? 46 : 41, 'This group requires at least a 4.5-inch fascia/Fabric Valance. A selected 3.5-inch treatment is unavailable.');
    // p51: raceway/valance CCL uses 1.75-inch clutch for both 1.75- and 2-inch tubes.
    const clutch = lift === 'cord_loop' && !/coupled|dual/.test(norm(s.configuration.roller_application ?? s.configuration.shade_type)) && requiredTube !== null ? requiredTube === 1.125 ? 1.125 : 1.75 : null;
    return {
      lineId: row.lineId, physicalWidths: memberWidths(s), height: s.heightInches, liftSystem: lift,
      selectedTubeInches: selectedTube, requiredTubeInches: requiredTube,
      tubeStatus: candidate && matrixIssues.length === 0 ? 'source_dimension_profile_compatible' : 'not_verified',
      tubeSourceProfile: resolved?.ok ? resolved.profile.id : null,
      tubeSourceScope: resolved?.ok ? resolved.definition.tube || 'not_split_by_tube' : null,
      tubeCompatibilityIssues: matrixIssues.map(issue => issue.ruleId),
      minimumFasciaInches: minima[index], clutchInches: clutch,
      clutchStatus: lift === 'cord_loop' && clutch !== null ? 'documented_raceway_ccl' : lift === 'cordless' || lift === 'motorized' ? 'not_applicable' : 'factory_selection_required',
    };
  });
  return { issues, record: {
    version: 1, type: 'roller_group_hardware_requirements', groupType: kind,
    sourceId: 'norman-roller-guide-2026-09-16', sourcePages: [37, 41, 46, 51, 70, 73],
    requiredTubeInches: requiredTube, minimumFasciaInches: minimumFascia,
    crossMemberFasciaRestriction: crossMember, members: records,
    associatedMountingBracketSize: kind === 'separate' ? 'large' : null,
    valanceBracketSize: kind === 'separate' ? 'large' : null,
    factoryConfirmationRequired: kind === 'separate'
      ? ['Exact shade bracket and SmartRelease clutch selection where applicable; p70 gives bracket applicability without the selection threshold.']
      : ['Largest shade bracket and SmartRelease clutch selection where applicable; p70 gives bracket applicability without the selection threshold.'],
    mountingBracketChartStatus: 'p73_reference_only_not_factory_selection',
    pricingStatus: 'existing_shared_or_separate_valance_price_hold_retained',
  } };
}
