import evidence from './onyx-portal-20260920.json';

/** Current visible portal availability. This never changes selling rates or authorizes pricing. */
export const ONYX_PORTAL_OBSERVED_DATE = evidence.observedDate;
export const ONYX_PORTAL_ASSORTMENT = evidence.materials;
const aliases: Record<string, string> = {
  'Painted Basswood': 'painted_basswood', 'Stained Basswood': 'stained_basswood',
  Basswood: 'painted_basswood', 'Basswood Stain': 'stained_basswood', Bassia: 'painted_basswood',
  Secamore: 'secamore', Sycamore: 'secamore', Vinyl: 'vinyl',
  'VLO Hybrid': 'vlo_hybrid', 'MDF Hybrid': 'vlo_hybrid', VLO: 'vlo_hybrid',
  'Onyx US Made Vinyl': 'onyx_us_made_vinyl', 'Onyx U.S. Made Vinyl': 'onyx_us_made_vinyl',
};
export function onyxPortalAssortment(programOrMaterial: string, asOf = ONYX_PORTAL_OBSERVED_DATE) {
  if (asOf < ONYX_PORTAL_OBSERVED_DATE) return null;
  const program = aliases[programOrMaterial] ?? programOrMaterial;
  return ONYX_PORTAL_ASSORTMENT.find(row => row.programIds.includes(program)) ?? null;
}
export function onyxPortalColors(programOrMaterial: string) {
  const row = onyxPortalAssortment(programOrMaterial);
  if (!row) return null;
  const program = aliases[programOrMaterial] ?? programOrMaterial;
  if (program === 'painted_basswood') return row.colors.filter(c => !/^(2\d\d|4\d\d|901)_/.test(c));
  if (program === 'stained_basswood') return row.colors.filter(c => /^(2\d\d|4\d\d|901)_/.test(c));
  return row.colors;
}
export function onyxPortalLouverLabels(programOrMaterial: string) {
  return onyxPortalAssortment(programOrMaterial)?.louverSizes.map(n => `${Math.floor(n)} 1/2"`) ?? null;
}
export function onyxPortalTiltLabels(programOrMaterial: string) {
  const labels: Record<string, string> = {
    C: 'C - Front Center Tiltrod', H1: 'H1 - Hidden Tiltrod Notch On Stile',
    H2: 'H2 - Hidden Tiltrod Notch On Louver', H3: 'H3 - Hidden Tiltrod In Stile', O: 'Offset Tilt Rod',
  };
  return onyxPortalAssortment(programOrMaterial)?.tiltCodes.map(code=>labels[code]) ?? null;
}
export function onyxCanonicalColor(value: string): string {
  const aliases: Record<string,string> = {White:'101_White', Snow:'105_Snow', 'Swiss Coffee':'107_Swiss Coffee', Creamy:'110_Creamy', Butter:'120_Butter',Nature:'200_Nature',Honey:'201_Honey',Java:'215_Java',Rose:'216_Rose',Mahogany:'220_Mahogany','Black Walnut':'230_Black Walnut'};
  return aliases[value] ?? ONYX_PORTAL_ASSORTMENT.flatMap(row => row.colors).find(color => color.replace(/^\d+_/, "").replaceAll("_", " ") === value) ?? value;
}
