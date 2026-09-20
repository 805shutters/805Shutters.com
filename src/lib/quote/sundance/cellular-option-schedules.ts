import { sundanceCellularSource } from './cellular-assortment';
export const sundanceCellularAccessories = [
  { key: 'somfy_charger', label: "Somfy Li-ion charger V2, 13-foot cable", net: 36, page: 15, systems: ['Somfy Cord Lift WireFree TL25'] },
  { key: 'somfy_power_supply', label: 'Somfy 12V DC power supply, 10-foot cord', net: 110, page: 15, systems: ['Somfy Cord Lift WireFree TL25'] },
  { key: 'somfy_battery', label: 'Somfy 12V rechargeable square external battery', net: 50, page: 15, systems: ['Somfy Cord Lift WireFree TL25'] },
  { key: 'somfy_solar', label: 'Somfy WireFree charging solar panel kit', net: 110, page: 15, systems: ['Somfy Cord Lift WireFree TL25'] },
  { key: 'situo_1', label: 'Situo 1-Channel', net: 66, page: 16, systems: ['Somfy Cord Lift WireFree TL25'] },
  { key: 'situo_5', label: 'Situo 5-Channel', net: 83, page: 16, systems: ['Somfy Cord Lift WireFree TL25'] },
  { key: 'telis_16', label: 'Telis 16-Channel', net: 290, page: 16, systems: ['Somfy Cord Lift WireFree TL25'] },
  { key: 'situo_variation', label: 'Situo 5-Variation', net: 154, page: 16, systems: ['Somfy Cord Lift WireFree TL25'] },
  { key: 'decoflex_1', label: 'Decoflex WireFree 1-Channel wall switch', net: 171, page: 16, systems: ['Somfy Cord Lift WireFree TL25'] },
  { key: 'decoflex_5', label: 'Decoflex WireFree 5-Channel wall switch', net: 182, page: 16, systems: ['Somfy Cord Lift WireFree TL25'] },
  { key: 'smoove_1', label: 'Smoove 1-Channel wall switch', net: 80, page: 16, systems: ['Somfy Cord Lift WireFree TL25'] },
  { key: 'smoove_multi', label: 'Smoove multi-channel wall switch (table:5; image:4)', net: 100, page: 16, systems: ['Somfy Cord Lift WireFree TL25'], review: 'Smoove table says5-channel while the image says4-channel; confirm the exact orderable switch.' },
  { key: 'tahoma', label: 'TaHoma Switch', net: 260, page: 16, systems: ['Somfy Cord Lift WireFree TL25'] },
  { key: 'tahoma_ethernet', label: 'TaHoma Switch Ethernet Adapter', net: 22, page: 16, systems: ['Somfy Cord Lift WireFree TL25'] },
  { key: 'simphony_charger', label: 'Simphony Li-ion charger, 12-foot cord', net: 25, page: 17, systems: ['Simphony Cell Shade WireFree', 'Simphony Concerto TDBU'] },
  { key: 'simphony_solar', label: 'Simphony WireFree charging solar panel kit', net: 75, page: 17, systems: ['Simphony Cell Shade WireFree', 'Simphony Concerto TDBU'] },
  { key: 'simphony_battery', label: 'Simphony rechargeable external battery', net: 50, page: 17, systems: ['Simphony Cell Shade WireFree', 'Simphony Concerto TDBU'] },
  { key: 'simphony_transformer', label: 'Simphony 12V transformer (extension cord required)', net: 25, page: 17, systems: ['Simphony Cell Shade WireFree', 'Simphony Concerto TDBU'], review: 'Transformer requires an extension cord; length, compatibility and charge are not specified in this schedule.' },
  { key: 'concerto_remote', label: 'Concerto TDBU 16-Channel remote', net: 90, page: 17, systems: ['Simphony Concerto TDBU'] },
  { key: 'simphony_remote', label: 'Simphony 15-Channel remote', net: 90, page: 17, systems: ['Simphony Cell Shade WireFree'] },
  { key: 'simphony_wall', label: 'Simphony 6-Channel wall switch', net: 75, page: 17, systems: ['Simphony Cell Shade WireFree', 'Simphony Concerto TDBU'], review: 'Confirm wall-switch channel/function compatibility with the selected motor, especially TDBU.' },
  { key: 'simphony_hub', label: 'Simphony Hub/Interface', net: 125, page: 17, systems: ['Simphony Cell Shade WireFree', 'Simphony Concerto TDBU'] },
] as const;
const cordlessWidths = [24,30,36,42,48,54,60,66,72,78,84,96];
const cordlessRetail = [163,187,194,211,227,234,243,267,276,299,308,326];
const loopWidths = [24,30,36,42,48,54,60,66,72,78,84,90,96,102,108,114,120];
const loopRetail = [187,208,214,231,242,249,268,281,302,309,316,326,336,347,357,366,384];
export function sundanceCellularAccessoryKey(key: string) { return `sundance_cellular_accessory_${key}_qty`; }
export function clearSundanceCellularAccessories(options: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(options).filter(([key]) => !key.startsWith('sundance_cellular_accessory_')));
}
export function sundanceCellularAccessoryIssues(options: Record<string, unknown>): { explanation: string; page: number }[] {
  const issues: { explanation: string; page: number }[] = [], system = String(options.sundance_cellular_system ?? '');
  for (const accessory of sundanceCellularAccessories) {
    const raw = options[sundanceCellularAccessoryKey(accessory.key)];
    if (raw == null || raw === '') continue;
    const quantity = Number(raw);
    if (!Number.isSafeInteger(quantity) || quantity < 0) issues.push({ explanation: `${accessory.label} quantity must be a nonnegative whole number.`, page: accessory.page });
    else if (quantity > 0 && !(accessory.systems as readonly string[]).includes(system)) issues.push({ explanation: `${accessory.label} is not a documented accessory for ${system || 'the unselected system'}.`, page: accessory.page });
    else if (quantity > 0 && 'review' in accessory) issues.push({ explanation: accessory.review, page: accessory.page });
  }
  return issues;
}
export type CellularOptionEntry = { label: string; basis: 'retail' | 'net'; unitPrice: number; quantity: number; page: number; matchedWidth?: number };
/** Source evidence only. Retail and net never share a subtotal or get an assumed account factor. */
export function sundanceCellularOptionEvidence(options: Record<string, unknown>, width: number) {
  const entries: CellularOptionEntry[] = [], unresolved: string[] = sundanceCellularAccessoryIssues(options).map(issue => issue.explanation);
  const system = String(options.sundance_cellular_system ?? '');
  const retail = (label: string, value: number, page = 7, matchedWidth?: number) => entries.push({ label, unitPrice: value, basis: 'retail', page, quantity: 1, ...(matchedWidth == null ? {} : { matchedWidth }) });
  const net = (label: string, value: number, page: number) => entries.push({ label, unitPrice: value, basis: 'net', page, quantity: 1 });
  if (system === 'Cordless' || system === 'Cordloop') {
    const widths = system === 'Cordless' ? cordlessWidths : loopWidths, prices = system === 'Cordless' ? cordlessRetail : loopRetail;
    const index = Number.isFinite(width) && width > 0 ? widths.findIndex(limit => width <= limit) : -1;
    if (index < 0) unresolved.push('No control surcharge width band covers this dimension.');
    else retail(`${system} control surcharge`, prices[index], 7, widths[index]);
  } else if (system === 'Cordless Top Down/Bottom Up' || system === 'Cordless Day/Night') retail('Cordless Top Down/Bottom Up surcharge', 500);
  else if (system === 'Skylight') net('Specialty/skylight surcharge', 116, 7);
  else if (system === 'Somfy Cord Lift WireFree TL25') net('Somfy Cord Lift WireFree TL25 motor', 220, 15);
  else if (system === 'Simphony Cell Shade WireFree') net('Simphony Cell Shade WireFree motor', 150, 17);
  else if (system === 'Simphony Concerto TDBU') net('Simphony Concerto TDBU motor', 450, 17);
  else unresolved.push('The selected system has no verified option calculation in this schedule.');
  if (system === 'Cordless Day/Night') unresolved.push('Both fabrics are priced at retail in addition to the TDBU surcharge; the two base fabric prices are excluded here.');
  if (options.sundance_cellular_assembly === 'Two on one') unresolved.push('Price individual shade components; this option subtotal does not resolve the assembly.');
  for (const accessory of sundanceCellularAccessories) {
    const quantity = Number(options[sundanceCellularAccessoryKey(accessory.key)] ?? 0);
    if (Number.isSafeInteger(quantity) && quantity > 0 && (accessory.systems as readonly string[]).includes(system))
      entries.push({ label: accessory.label, basis: 'net', unitPrice: accessory.net, quantity, page: accessory.page });
  }
  return { sourceId: sundanceCellularSource.sourceId, effectiveDate: sundanceCellularSource.effectiveDate, entries, unresolved,
    retailSubtotal: entries.filter(e => e.basis === 'retail').reduce((sum,e) => sum + e.quantity * e.unitPrice,0),
    netSubtotal: entries.filter(e => e.basis === 'net').reduce((sum,e) => sum + e.quantity * e.unitPrice,0), customerPriceEligible: false as const };
}
