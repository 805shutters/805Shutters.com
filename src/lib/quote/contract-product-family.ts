/** Lightweight artwork routing. Never imports pricing or changes order selections. */
export type ContractProductFamily =
  | 'shutters' | 'roller' | 'roman' | 'honeycomb' | 'vertical-honeycomb'
  | 'sheer' | 'faux-wood' | 'wood' | 'mini' | 'vinyl' | 'vertical' | 'smart-drapes'
  | 'woven' | 'fabric-blind' | 'valance' | 'fabric' | 'pillow' | 'vanes'
  | 'shelf' | 'track' | 'tension' | 'screen' | 'awning' | 'parts' | 'custom';

const normalize = (value: string) => value.replace(/([a-z])([A-Z])/g, '$1 $2')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Match product nouns, including full catalog names and customer-facing aliases.
 * Accessories and vertical cellular products must precede the parent treatment. */
export function contractProductFamily(productType: string): ContractProductFamily {
  const name = normalize(productType);
  if (/\bvalances?\b/.test(name)) return 'valance';
  if (/\bfabric by yard\b/.test(name)) return 'fabric';
  if (/\bpillow\b/.test(name)) return 'pillow';
  if (/\bvane packs?\b/.test(name)) return 'vanes';
  if (/\bshelf\b/.test(name)) return 'shelf';
  if (/\bparts\b|\baccessor(y|ies)\b/.test(name)) return 'parts';
  if (/\bdrapery.*track|\btracks?\b/.test(name)) return 'track';
  if (/\btension\b/.test(name)) return 'tension';
  if (/\bawnings?\b/.test(name)) return 'awning';
  if (/retractable screen|all seasons/.test(name)) return 'screen';
  if (/vertical (honeycomb|cellular)|verticell/.test(name)) return 'vertical-honeycomb';
  if (/\bshutters?\b/.test(name)) return 'shutters';
  if (/\bfaux wood\b/.test(name)) return 'faux-wood';
  if (/\bwood blinds?\b|premium ii.*wood|chateau woods/.test(name)) return 'wood';
  if (/\bmini\b|\baluminum\b|\baluminium\b/.test(name)) return 'mini';
  if (/\bvinyl blinds?\b/.test(name)) return 'vinyl';
  if (/\bvertical\b|\beuropanels\b/.test(name)) return 'vertical';
  if (/\bwoven\b/.test(name)) return 'woven';
  if (/\bfabric blinds?\b/.test(name)) return 'fabric-blind';
  if (/\bhoneycomb\b|\bcellular\b/.test(name)) return 'honeycomb';
  if (/\broman\b/.test(name)) return 'roman';
  if (/\bsheer\b|\bperfect sheer\b|\bsmart ?fold\b|\bsheerview\b|\bzebra\b/.test(name)) return 'sheer';
  if (/\bsmart drapes?\b|\bdrapery\b/.test(name)) return 'smart-drapes';
  if (/\broller\b|\bsunscreen\b|\bpatio\b|\bexterior\b|\bzip screen\b/.test(name)) return 'roller';
  return 'custom';
}

export function contractProductType(productType: string): string {
  const canonical: Partial<Record<ContractProductFamily, string>> = {
    shutters: 'Shutters', roller: 'Roller Shades', roman: 'Roman Shades',
    honeycomb: 'Honeycomb Shades', sheer: 'Sheer Shades', 'faux-wood': 'Faux Wood Blinds',
    wood: 'Wood Blinds', mini: 'Mini Blinds', vertical: 'Vertical Blinds', 'smart-drapes': 'Smart Drapes',
  };
  return canonical[contractProductFamily(productType)] ?? productType;
}
