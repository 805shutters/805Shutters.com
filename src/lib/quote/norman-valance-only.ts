import type { CatalogProduct } from './catalog/types';
import { SMARTPRIVACY_SOURCE, SMARTPRIVACY_VALANCES } from './norman-smartprivacy';
import { ULTIMATE_FAUX_SOURCE, ULTIMATE_FAUX_VALANCES } from './norman-ultimate-faux';

export const ULTIMATE_VALANCE = 'norman_ultimate_faux_valance_only';
export const SMARTPRIVACY_VALANCE = 'norman_smartprivacy_valance_only';
export const VALANCE_ONLY_KEY = 'norman_valance_only_v1';
export const VALANCE_ONLY_VERSION = '805-v2-norman-valance-only-2026-09-20-r1';
export const VALANCE_ONLY_HOLD = 'Standalone valance specifications are documented. Current standalone price, availability, freight and selling treatment require Norman confirmation before customer pricing.';
export const isNormanValanceOnly = (id: string) => id === ULTIMATE_VALANCE || id === SMARTPRIVACY_VALANCE;
export const valanceSourceProduct = (id: string) => id === ULTIMATE_VALANCE ? 'faux_wood' : id === SMARTPRIVACY_VALANCE ? 'smartprivacy_faux' : null;
export const valanceSource = (id: string) => id === ULTIMATE_VALANCE ? ULTIMATE_FAUX_SOURCE : SMARTPRIVACY_SOURCE;
export const valanceStyles = (id: string) => (id === ULTIMATE_VALANCE ? ULTIMATE_FAUX_VALANCES : SMARTPRIVACY_VALANCES).filter(v => v !== 'None');
export type ValanceOnlyRecord = {
  version: 1;
  sourceProductId: 'faux_wood' | 'smartprivacy_faux';
  sourceColorId: string;
  style: string;
  innerLengthInches: number | null;
  returns: '' | 'None' | 'Left' | 'Right' | 'Both';
  returnLengthInches: number | null;
  joinery: 'Connector' | 'Keystone';
  layout: 'Equally Spaced' | 'Custom';
  keystoneCount: number;
  keystoneLocations: (number | null)[];
};
export const emptyValanceOnly = (id: string): ValanceOnlyRecord => ({version:1,sourceProductId:id === ULTIMATE_VALANCE ? 'faux_wood' : 'smartprivacy_faux',sourceColorId:'',style:'',innerLengthInches:null,returns:'',returnLengthInches:null,joinery:'Connector',layout:'Equally Spaced',keystoneCount:0,keystoneLocations:[]});
export function parseValanceOnly(raw: unknown): ValanceOnlyRecord | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const numberOrNull = (v: unknown) => v === null || typeof v === 'number' && Number.isFinite(v);
  if (r.version !== 1 || !['faux_wood','smartprivacy_faux'].includes(String(r.sourceProductId)) || typeof r.sourceColorId !== 'string' || typeof r.style !== 'string' || !numberOrNull(r.innerLengthInches) || !numberOrNull(r.returnLengthInches) || !['','None','Left','Right','Both'].includes(String(r.returns)) || !['Connector','Keystone'].includes(String(r.joinery)) || !['Equally Spaced','Custom'].includes(String(r.layout)) || typeof r.keystoneCount !== 'number' || !Number.isFinite(r.keystoneCount) || !Array.isArray(r.keystoneLocations) || r.keystoneLocations.length > 3 || !r.keystoneLocations.every(numberOrNull)) return null;
  return {version:1,sourceProductId:r.sourceProductId as ValanceOnlyRecord['sourceProductId'],sourceColorId:r.sourceColorId,style:r.style,innerLengthInches:r.innerLengthInches as number|null,returns:r.returns as ValanceOnlyRecord['returns'],returnLengthInches:r.returnLengthInches as number|null,joinery:r.joinery as ValanceOnlyRecord['joinery'],layout:r.layout as ValanceOnlyRecord['layout'],keystoneCount:r.keystoneCount,keystoneLocations:[...r.keystoneLocations] as (number|null)[]};
}
export function valanceOnlyUnitLabel(raw: unknown): string {
  const r = parseValanceOnly(raw);
  return r?.innerLengthInches == null ? 'Inner length not selected' : `${r.innerLengthInches} inches inner length`;
}
export const valanceOnlyProducts: CatalogProduct[] = [
  [ULTIMATE_VALANCE,'Ultimate Faux Wood Standalone Valance'],
  [SMARTPRIVACY_VALANCE,'SmartPrivacy Standalone Valance'],
].map(([id,name]) => ({id,name,manufacturer:'Norman',productType:'Valances',priceBasis:'manual_required',customerRetailStatus:'unverified',provisional:true,
  source:id===ULTIMATE_VALANCE?'Ultimate Faux Wood Guide September 2026 pp10–11':'SmartPrivacy Guide October 2024 pp10–11',pages:[10,11],fabricRouting:null,
  programs:[{id:`${id}_source`,name:'Standalone valance · each',priceGroup:null,priceAxis:'width',priceBasis:'manual_required',sourceId:valanceSource(id),grid:{widths:[],heights:[],prices:[]},minWidth:null,maxWidth:null,minHeight:null,maxHeight:null,maxAreaSqft:null,fabricCollections:[],sourcePages:[10,11],notes:[VALANCE_ONLY_HOLD]}],
  surcharges:[],fabricByYard:[],freightStatus:'unresolved',notes:[VALANCE_ONLY_HOLD,'Explicit inner length, maximum 384 inches. Quote quantity counts complete valances; source finish identities are retained.'],
}));

export type ValanceDraft = {key:string;base:ValanceOnlyRecord;record:ValanceOnlyRecord;submitted:ValanceOnlyRecord|null};
const equal = (a: unknown,b: unknown) => JSON.stringify(a) === JSON.stringify(b);
export const newValanceDraft = (key:string,record:ValanceOnlyRecord):ValanceDraft => ({key,base:record,record,submitted:null});
export const valanceDraftDirty = (s:ValanceDraft) => !equal(s.record,s.submitted??s.base);
export function syncValanceDraft(s:ValanceDraft,key:string,incoming:ValanceOnlyRecord):ValanceDraft {
  if (s.key!==key || equal(s.record,incoming)) return newValanceDraft(key,incoming);
  if (s.submitted && equal(s.submitted,incoming)) return {...s,base:incoming,submitted:null};
  return s.submitted || !equal(s.base,s.record) ? s : newValanceDraft(key,incoming);
}
