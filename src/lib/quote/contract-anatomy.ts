import { quoteProductDetails, type QuoteProductDetail } from '@/lib/crm/customer-quote-details';
import { contractProductFamily, type ContractProductFamily } from './contract-product-family';
import { contractIllustration } from './contract-illustrations';
import { specialtyShutterSketch } from './specialty-shutter-illustrations';
import { anatomyShutterStudy } from './anatomy-shutter-study';
import { anatomyShadeStudy } from './anatomy-shade-study';
import { anatomyControlAnchor } from './anatomy-control-anchor';

export type AnatomyPart = 'top' | 'surface' | 'slat' | 'control' | 'remote' | 'roll' | 'bottom' | 'frame';
export type AnatomyCallout = { part: AnatomyPart; title: string; details: QuoteProductDetail[]; point: [number, number]; side: 'left' | 'right'; anchor?: 'remote' | 'pull-tab' | 'cord-loop' };
const slatted = new Set<ContractProductFamily>(['shutters', 'wood', 'faux-wood', 'mini', 'vinyl', 'fabric-blind', 'vertical', 'vanes']);
const titles: Record<AnatomyPart, string> = { top: 'Top treatment', surface: 'Fabric & finish', slat: 'Slats', control: 'Operation', remote: 'Remote control', roll: 'Roll direction', bottom: 'Bottom rail', frame: 'Frame & mounting' };
const points: Record<AnatomyPart, [number, number]> = { top: [50, 25], surface: [47, 49], slat: [54, 39], control: [82, 58], remote: [50, 48], roll: [82, 27], bottom: [52, 81], frame: [20, 64] };
const norm = (s: string) => s.toLowerCase().replace(/[_-]/g, ' ').replace(/\s+/g, ' ').trim();

export const ANATOMY_SELECTION_GROUPS = ['Valance', 'Design & color', 'Operation', 'Construction & fit', 'Additional details'] as const;
export function anatomySelectionGroup(label: string): typeof ANATOMY_SELECTION_GROUPS[number] {
  const key = norm(label);
  if (/colou?r|finish/.test(key)) return 'Design & color';
  if (/valance|cassette|fascia|top treatment|head pocket/.test(key)) return 'Valance';
  if (/fabric|material|opacity|light control|lining|texture|weave|banding|binding/.test(key)) return 'Design & color';
  if (/tilt|lift|control|cord|chain|wand|motor|remote|power|battery|charger|draw|stack|roll type|roll direction/.test(key)) return 'Operation';
  if (/frame|mount|hinge|track|panel|louver|slat|vane|cell|fold|rail|hem|cutout|handle|guide|return|bracket|recess|shape|shutter type|shade type|application|tube|width|height/.test(key)) return 'Construction & fit';
  return 'Additional details';
}

/** Part identity is a presentation concern, not a supplier availability rule. */
export function anatomyPart(label: string, family: ContractProductFamily): AnatomyPart | null {
  const key = norm(label);
  if (/^(supplier|manufacturer|installation|shipping|freight|quantity|order|notes|room|style|program|application)/.test(key)) return null;
  if (/valance|cassette|fascia|head ?rail|top treatment|head pocket/.test(key)) return 'top';
  if (/louver|slat|vane size|cell size|fold style|fold type/.test(key)) return slatted.has(family) ? 'slat' : 'surface';
  if (/divider|bottom rail|hem/.test(key)) return 'bottom';
  if (/light control/.test(key)) return 'surface';
  if (/remote/.test(key)) return 'remote';
  if (/roll type|roll direction/.test(key)) return 'roll';
  if (/tilt|lift|control|cord|chain|wand|motor|remote|power|battery|charger|draw|stack|roll type|roll direction/.test(key)) return 'control';
  if (/frame|mount|hinge|track|cutout|handle|panel|guide|return|bracket|recess/.test(key)) return 'frame';
  if (/fabric|color|colour|finish|material|opacity|light control|lining|texture|weave/.test(key)) return 'surface';
  return null;
}

export type ContractAnatomy = {
  family: ContractProductFamily;
  callouts: AnatomyCallout[];
  specifications: QuoteProductDetail[];
  reference: boolean;
  coverageNote: string;
};

/** Retain the same customer-safe selection values as the existing contract.
 * Unknown and nonvisual options always remain in the specification list. */
export function contractAnatomy(productType: string, options: readonly string[], styleName = ''): ContractAnatomy {
  const family = contractProductFamily(productType);
  const specifications = quoteProductDetails(styleName, [...options]).filter(detail => !(family === 'roller' && /^(roll type|roll direction|fabric roll)$/i.test(detail.label) && /^(standard|standard roll)$/i.test(detail.value.replace(/\*/g, '').trim())));
  // Explicit absence is useful in an anatomy contract (no divider/no split).
  for (const option of options) {
    const colon = option.indexOf(':');
    if (colon < 0) continue;
    const label = option.slice(0, colon).trim(), value = option.slice(colon + 1).trim();
    if (/^(split tilt|divider rail|valance|top treatment)$/i.test(label) && /^(no|none)$/i.test(value) && !specifications.some(d => norm(d.label) === norm(label))) specifications.push({ label, value });
  }
  const shade = anatomyShadeStudy(productType, options);
  const art = shade || contractIllustration(productType, options);
  const specialty = specialtyShutterSketch(productType, options) || anatomyShutterStudy(productType, options);
  const reference = !specialty && (!art || !!art.referenceNote);
  const callouts: AnatomyCallout[] = [];
  const controlAnchor = anatomyControlAnchor(productType, options, art);
  for (const part of ['top', 'slat', 'surface', 'roll', 'control', 'remote', 'frame', 'bottom'] as const) {
    if (part === 'remote' && !art?.remote) continue;
    if (part === 'control' && controlAnchor?.kind === 'remote') continue;
    const details = specifications.filter(d => (anatomyPart(d.label, family) === part || (part === 'remote' && controlAnchor?.kind === 'remote' && anatomyPart(d.label, family) === 'control')) && !/^(no|none|0)$/i.test(d.value));
    if (part === 'remote' && art?.remote && !details.length) details.push({ label: 'Motorized operation', value: 'Remote control' });
    if (!details.length) continue;
    let point: [number, number] = [...points[part]];
    if(shade){
      if(part==='top'){point[0]=50;point[1]=12;}
      if(part==='surface'){point[0]=48;point[1]=44;}
      if(part==='control'&&shade.loopSide){point[0]=shade.loopSide==='left'?11:90;point[1]=53;}
    }
    if (part === 'control') {
      if (family === 'shutters') { point[0] = 50; point[1] = 42; }
      else if (art?.remote) { point[0] = 82; point[1] = 27; }
      else if (!shade && options.some(o => /^(control side|chain location|chain side|wand side|tilt side):\s*(left|l)$/i.test(o))) point[0] = 18;
    }
    if (part === 'control' && controlAnchor) point = controlAnchor.kind === 'pull-tab' ? [50, 55] : controlAnchor.point;
    if (part === 'bottom' && details.some(d => /divider/i.test(d.label))) point[1] = 53;
    callouts.push({ part, title: part === 'slat' && family === 'shutters' ? 'Louvers' : part === 'surface' && slatted.has(family) ? 'Material & finish' : titles[part], details, point, ...(part === 'remote' ? { anchor: 'remote' as const } : part === 'control' && controlAnchor ? { anchor: controlAnchor.kind } : {}), side: ['top', 'surface', 'frame'].includes(part) ? 'left' : 'right' });
  }
  return { family, callouts, specifications, reference,
    coverageNote: reference ? 'Product reference · selected details appear in the labels. Exact configuration artwork is not yet available.' : 'Pencil illustration · selected details shown in the labels. Finish names identify the ordered color; artwork remains graphite.' };
}

export const isFinishDetail = (detail: { label: string }) => /fabric|colou?r|finish|material|opacity|light control|lining|texture|weave/i.test(detail.label);
export const isMountDetail = (detail: { label: string; value: string }) => /mount/i.test(detail.label) || /^(inside|outside) mount$/i.test(detail.value);

/** Complete label-only model shared by saved contracts and the catalogue review. */
export function contractAnatomyLabels(productType: string, options: readonly string[], styleName = '', layout = 'grouped') {
    const source = contractAnatomy(productType, options, styleName);
    const isNote = (detail: QuoteProductDetail) => /\bnotes?\b/i.test(detail.label);
    const notes = source.specifications.filter(isNote);
    const anatomy = { ...source, specifications: source.specifications.filter(detail => !isNote(detail)),
      callouts: source.callouts.map(callout => ({ ...callout, details: callout.details.filter(detail => !isNote(detail)) })).filter(callout => callout.details.length) };
    const callouts: (AnatomyCallout & { noLeader?: boolean })[] = anatomy.callouts.map(callout => ({
      ...callout,
      point: callout.part === 'surface' ? [50, 55] as [number, number] : callout.point,
      details: callout.details.filter(detail => !isMountDetail(detail) && (callout.part === 'surface' || !isFinishDetail(detail))),
    })).filter(callout => callout.details.length);
    if (layout === 'grouped') {
      // In the label-only view every selection must survive without a footer.
      for (const detail of anatomy.specifications) {
        if (isMountDetail(detail) && /^(inside|outside) mount$/i.test(detail.value)) {
          const construction = callouts.find(c => anatomySelectionGroup(c.details[0].label) === 'Construction & fit');
          if (construction) construction.details.push(detail);
          else callouts.push({part:'frame',title:'Construction & fit',details:[detail],point:[50,50],side:'right',noLeader:true});
          continue;
        }
        if (callouts.some(c => c.details.some(d => d.label === detail.label && d.value === detail.value))) continue;
        const group = anatomySelectionGroup(detail.label);
        const part = isFinishDetail(detail) ? 'surface' : anatomyPart(detail.label, anatomy.family);
        const existing = callouts.find(c => !c.noLeader && c.part === part && anatomySelectionGroup(c.details[0].label) === group);
        if (existing) existing.details.push(detail);
        else {
          const extra = callouts.find(c => c.noLeader && anatomySelectionGroup(c.details[0].label) === group);
          if (extra) extra.details.push(detail);
          else callouts.push({ part: part || 'frame', title: group, details: [detail], point: [50, 50], side: group === 'Design & color' || group === 'Valance' ? 'left' : 'right', noLeader: true });
        }
      }
      // A physical part may carry selections from different categories (e.g. cell size and fabric).
      const separated = callouts.flatMap(c => ANATOMY_SELECTION_GROUPS.flatMap(group => {
        const details = c.details.filter(d => anatomySelectionGroup(d.label) === group);
        return details.length ? [{...c, details, side: (group === 'Design & color' || group === 'Valance' ? 'left' : 'right') as 'left' | 'right'}] : [];
      }));
      callouts.splice(0, callouts.length, ...separated);
    }
    return { ...anatomy, callouts, notes };
}
