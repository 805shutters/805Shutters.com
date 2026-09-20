import type { CatalogProduct } from './catalog/types';
import romanFrontRows from './norman-roman-front-2026-09.json';
export type RomanAncillaryFabric = typeof romanFrontRows[number];

export const ROMAN_YARDAGE = 'norman_roman_fabric_by_yard';
export const ROMAN_PILLOWS = 'norman_roman_pillow_covers';
export const ROMAN_ANCILLARY_RECORD = 'norman_roman_ancillary_v1';
export const ROMAN_ANCILLARY_VERSION = '805-v2-norman-roman-ancillary-2026-09-20-r1';
export const ROMAN_ANCILLARY_HOLD = 'Suggested-retail reference only. Current ancillary availability, dealer pricing, freight and selling treatment require verification before a customer price is approved.';
export const isRomanAncillary = (id: string) => id === ROMAN_YARDAGE || id === ROMAN_PILLOWS;
export const pillowSizes = ['14x14','16x16','18x18','20x20','24x24','10x14','10x16','10x18','12x22','14x24','14x18'] as const;
export const pillowInsertSizes = ['16x16','18x18','20x20','22x22','26x26','12x16','12x18','12x20','14x24','16x26','16x20'] as const;
export type PillowSize = typeof pillowSizes[number];
export type PillowGroup = 'A' | 'B' | 'C';
/** September retail PDF absolute page 27 (printed 26); USD suggested retail, not dealer cost. */
export const pillowRetail: Record<PillowGroup, readonly number[]> = {
  A: [83,90,98,107,130,75,83,86,90,102,90],
  B: [147,154,202,226,258,122,139,150,154,189,154],
  C: [179,218,243,306,338,147,162,170,186,221,186],
};
const groupA = ['Alma','Caroline','Windsor','Lakeside','Lorraine','Seabreeze','Taylor','Patterns','Francis','Valencia','Ella','Solids','Sierra','Ashley','Whispering Willow','Impressions','Louise'];
export function pillowGroup(row: RomanAncillaryFabric): PillowGroup | null {
  // Roman Guide p50 exclusions override the broader retail collection list.
  if (row.pillow !== 'Yes' || row.clothCode === 'AB0608') return null;
  if (groupA.includes(row.collection)) return 'A';
  if (['Rochelle','Breeze','Ellie'].includes(row.collection)) return 'B';
  if (row.collection === 'Libeco Belgian Linen') {
    if (['F1055','F1057','F1058'].includes(row.colorCode)) return 'B';
    if (['F1050','F1051','F1061'].includes(row.colorCode)) return 'C';
  }
  return null;
}
export function romanAncillaryFabrics(productId: string) {
  return romanFrontRows.filter(row => productId === ROMAN_YARDAGE || productId === ROMAN_PILLOWS && pillowGroup(row) !== null);
}
export type RomanAncillaryRecord = { version: 1; colorCode: string; kind: 'yardage'; yards: number | null } |
  { version: 1; colorCode: string; kind: 'pillow_cover'; size: PillowSize | ''; edge: 'knife' | 'piping' | ''; pattern: 'standard' };
export function parseRomanAncillary(value: unknown): RomanAncillaryRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (v.version !== 1 || typeof v.colorCode !== 'string') return null;
  if (v.kind === 'yardage' && (v.yards === null || typeof v.yards === 'number' && Number.isFinite(v.yards))) return {version:1,colorCode:v.colorCode,kind:v.kind,yards:v.yards};
  if (v.kind === 'pillow_cover' && (v.size === '' || pillowSizes.includes(v.size as PillowSize)) && ['', 'knife', 'piping'].includes(String(v.edge)) && v.pattern === 'standard') return {version:1,colorCode:v.colorCode,kind:v.kind,size:v.size as PillowSize|'',edge:v.edge as 'knife'|'piping'|'',pattern:'standard'};
  return null;
}
/** A source comparison, deliberately not a price-engine authorization. */
export function romanAncillaryRetailReference(record: RomanAncillaryRecord): number | null {
  const row = romanFrontRows.find(r => r.colorCode === record.colorCode);
  if (!row) return null;
  if (record.kind === 'yardage') {
    if (record.yards === null || !Number.isInteger(record.yards) || record.yards < 1 || record.yards > 10) return null;
    // September pp25–26 omit PG2 yardage. Do not reuse the July $150 without evidence.
    const rate = row.priceGroup === 1 ? 115 : row.priceGroup === 3 ? 173 : null;
    return rate === null ? null : rate * record.yards;
  }
  const group = pillowGroup(row), index = pillowSizes.indexOf(record.size as PillowSize);
  if (!group || index < 0 || !record.edge) return null;
  return Math.round(pillowRetail[group][index] * (record.edge === 'piping' ? 1.15 : 1) * 100) / 100;
}
export function romanAncillaryUnitLabel(productId: string, raw: unknown): string {
  const r = parseRomanAncillary(raw);
  return productId === ROMAN_YARDAGE ? `${r?.kind === 'yardage' && r.yards !== null ? r.yards : '—'} yards per cut` : r?.kind === 'pillow_cover' && r.size ? `${r.size.replace('x',' × ')} inch cover` : 'Cover size not selected';
}
export const romanAncillaryProducts: CatalogProduct[] = [
  [ROMAN_YARDAGE, 'Centerpiece Roman Fabric by Yard', 'Fabric by Yard'],
  [ROMAN_PILLOWS, 'Centerpiece Decorative Pillow Covers', 'Decorative Pillow Covers'],
].map(([id,name,productType]) => ({
  id,name,productType,manufacturer:'Norman',priceBasis:'manual_required',customerRetailStatus:'unverified',provisional:true,
  source:'Roman Shade Guide pp34,46,50; 2026Sep Retail Price Guide printed pp25–26',pages:[26,27],fabricRouting:null,
  programs:[{id:`${id}_source`,name:id===ROMAN_YARDAGE?'Fabric cut · yards':'Pillow cover · each',priceGroup:null,priceAxis:'wh',priceBasis:'manual_required',sourceId:'norman-roman-guide-2026-09',grid:{widths:[],heights:[],prices:[]},minWidth:null,maxWidth:null,minHeight:null,maxHeight:null,maxAreaSqft:null,fabricCollections:[],sourcePages:[26,27],notes:[ROMAN_ANCILLARY_HOLD]}],
  surcharges:[],fabricByYard:[],freightStatus:'unresolved',notes:[ROMAN_ANCILLARY_HOLD, id===ROMAN_YARDAGE?'Maximum 10 yards. Ordering increments not specified; fractional requests remain held.':'Cover only; pillow insert not included. Knife edge or piping (+15% suggested retail).'],
}));
