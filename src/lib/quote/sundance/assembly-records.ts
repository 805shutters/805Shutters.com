import type {SelectionRecord} from '@/lib/quote-v2/core';

export const SUNDANCE_ASSEMBLY_KEY = 'sundance_assembly_v1';
export type SundanceAssemblyComponent = {
  id: string;
  productId: string;
  widthInches: number | null;
  heightInches: number | null;
  configuration: SelectionRecord;
};
export type SundanceAssembly = {
  version: 1;
  productId: string;
  selectionKey: string;
  selection: string;
  components: SundanceAssemblyComponent[];
  sharedMotorComponentId: string | null;
};
const assemblyKeys = [
  'sundance_cellular_assembly', 'sundance_sheerview_assembly', 'sundance_portfolio_assembly',
  'sundance_blind_assembly', 'sundance_walden_assembly', 'sundance_zebra_assembly', 'sundance_shade_assembly',
];
export function sundanceAssemblySpec(productId: string, configuration: Record<string, unknown>) {
  const selectionKey = productId === 'sundance_cellular' ? assemblyKeys[0]
    : productId === 'sundance_sheerview' ? assemblyKeys[1]
    : productId === 'sundance_portfolio_roman' ? assemblyKeys[2]
    : productId.startsWith('sundance_walden_') ? assemblyKeys[4]
    : ['sundance_zebra', 'sundance_louvolite_zebra'].includes(productId) ? assemblyKeys[5]
    : ['sundance_roller', 'sundance_louvolite_roller', 'sundance_flat_roman', 'sundance_louvolite_flat_roman'].includes(productId) ? assemblyKeys[6]
    : ['sundance_advantage_ii_2','sundance_advantage_ii_2_5','sundance_premium_ii_2','sundance_premium_ii_2_5','sundance_basicvue','sundance_aluminum_1','sundance_aluminum_2','sundance_chateau_woods'].includes(productId) ? assemblyKeys[3] : null;
  const selection = selectionKey ? configuration[selectionKey] : null;
  if (!selectionKey || typeof selection !== 'string' || !['Two on one','Three on one','Dual independent','Coupled motorized'].includes(selection)) return null;
  return {selectionKey, selection, count: selection === 'Three on one' ? 3 : 2,
    layout: selection === 'Dual independent' ? 'front-back' as const : 'side-by-side' as const,
    sharedMotor: selection === 'Coupled motorized'};
}
/** Explicit copy into a new component: never multiply line-level accessories or financial metadata. */
export function sundanceComponentConfiguration(configuration: Record<string, unknown>): SelectionRecord {
  const next: Record<string, unknown> = {...configuration};
  delete next[SUNDANCE_ASSEMBLY_KEY];
  delete next.sundance_walden_twin_v1;
  delete next.sundance_privacy_pieces_v1;
  delete next.sundance_order_power_v1;
  delete next.sundance_shared_accessories_v1;
  delete next.sundance_order_accessories_v1;
  delete next.sundance_simphony_panel_id;
  for (const key of Object.keys(next)) {
    if (/qty$|quantity$|^manual_|^quote_v2_|^pricing_|^price_|^dealer_|^cost_|^unit_price|^surcharges$|^motorization$/i.test(key)) delete next[key];
  }
  for (const key of assemblyKeys) if (key in next) next[key] = 'Single';
  return JSON.parse(JSON.stringify(next)) as SelectionRecord;
}
export function createSundanceAssembly(productId: string, configuration: Record<string, unknown>, ids: string[]): SundanceAssembly | null {
  const spec = sundanceAssemblySpec(productId, configuration);
  if (!spec || ids.length !== spec.count || ids.some(id=>!id) || new Set(ids).size !== ids.length) return null;
  return {version:1, productId, selectionKey:spec.selectionKey, selection:spec.selection,
    components:ids.map(id=>({id, productId, widthInches:null, heightInches:null, configuration:sundanceComponentConfiguration(configuration)})),
    sharedMotorComponentId:null};
}
function record(value: unknown): value is Record<string, unknown> {return value != null && typeof value === 'object' && !Array.isArray(value);}
export function readSundanceAssembly(value: unknown): SundanceAssembly | null {
  if (!record(value) || value.version !== 1 || typeof value.productId !== 'string' || typeof value.selectionKey !== 'string' || typeof value.selection !== 'string' || !Array.isArray(value.components) || value.components.length < 2 || value.components.length > 3 || !(value.sharedMotorComponentId === null || typeof value.sharedMotorComponentId === 'string')) return null;
  if (value.components.some(c=>!record(c) || typeof c.id !== 'string' || !c.id || typeof c.productId !== 'string' || !(c.widthInches === null || typeof c.widthInches === 'number') || !(c.heightInches === null || typeof c.heightInches === 'number') || !record(c.configuration))) return null;
  return value as SundanceAssembly;
}
export function sundanceAssemblyMatches(assembly: SundanceAssembly, productId: string, configuration: Record<string, unknown>) {
  const spec = sundanceAssemblySpec(productId, configuration);
  return Boolean(spec && assembly.productId === productId && assembly.selectionKey === spec.selectionKey && assembly.selection === spec.selection && assembly.components.length === spec.count);
}
/** Customer-safe dimension/fabric/control summary; never expose source or financial records. */
export function sundanceAssemblyDescriptions(value: unknown): string[] {
  const assembly = readSundanceAssembly(value);
  if (!assembly) return [];
  return assembly.components.map((component,index)=>{
    const c = component.configuration;
    const material = [c.fabric_color_code,c.fabric_color_name].filter(v=>typeof v === 'string' && v.trim()).join(' · ');
    const control = [c.sundance_cellular_system,c.sundance_sheerview_control,c.sundance_portfolio_control,c.sundance_walden_control,c.sundance_zebra_control,c.sundance_shade_control,c.lift_system].find(v=>typeof v==='string'&&v);
    const size = Number.isFinite(component.widthInches) && Number.isFinite(component.heightInches) && Number(component.widthInches)>0 && Number(component.heightInches)>0 ? `${component.widthInches} × ${component.heightInches} inches` : 'dimensions incomplete';
    return `Assembly component ${index+1}: ${[size,material,control,assembly.sharedMotorComponentId===component.id?'shared motor located here':null].filter(Boolean).join('; ')}`;
  });
}
