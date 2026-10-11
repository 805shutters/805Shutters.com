import type { MobileQuoteDraft, MobileQuoteWindow } from './mobile-quote-draft';
import { MOBILE_QUOTE_FRACTIONS, validateMobileQuoteMeasurement,retainMobileManualPrice } from './mobile-quote-draft';
import type { QuoteLabCatalogProduct } from '@/lib/quote-lab/types';

export const MOBILE_PRODUCT_FAMILIES = ['Shutters', 'Faux Wood Blinds', 'Wood Blinds', 'Roman Shades', 'Sheer Shades', 'Vertical Blinds', 'Roller Shades', 'Honeycomb Shades', 'Drapery'] as const;
export type MobileProductFamily = typeof MOBILE_PRODUCT_FAMILIES[number];
export const COST_MULTIPLIERS = ['1.75', '2', '2.25', '2.5', '2.75', '3', '3.25', '3.5'] as const;
export type CostMultiplier = typeof COST_MULTIPLIERS[number];
export type ShippingBasis = 'line' | 'opening' | 'physical_unit';
export type FeeOverride = {installationAmount:string|null;shippingAmount:string|null;instruction:string};
export type SupplierLineInputs = { feeOverride?:FeeOverride; family: MobileProductFamily | null; manufacturer: string | null; colorFabric: string; mount: string; control: string; controlSide: string; shippingBasis: ShippingBasis | null; openingCount: number };
export type DraftJobSettings = { version: number; multiplier: CostMultiplier | null; requestId: string; jobId: string | null; submittedSpec: SupplierQuoteSpec | null; tax: { treatment: 'unresolved' | 'excluded_confirmed' | 'included_confirmed'; amount: string | null; instruction: string }; comparisonMode: 'mixed_lines' };
export type SupplierSpecLine = {
  id: string; manufacturer: string; family: MobileProductFamily; productId: string; productType: string;
  room: string; position: string; widthWhole: number; widthFraction: string; heightWhole: number; heightFraction: string;
  quantity: number; openingCount: number; colorFabric: string; mount: string; control: string; controlSide: string;
  shippingBasis: ShippingBasis | null; notes: string; designNotes: string; configuration: Record<string, unknown>;
  feeOverride?:FeeOverride; manualAllInPrice: string | null; photos: { id: string; name: string }[];
};
export type SupplierQuoteSpec = { schemaVersion: '805-mobile-supplier-draft/v1'; draftId: string; version: number; multiplier: CostMultiplier; comparisonMode: 'mixed_lines'; customer: MobileQuoteDraft['customer']; lines: SupplierSpecLine[]; tax: DraftJobSettings['tax'] };

export function mobileFamily(productType: string): MobileProductFamily | null {
  if (productType === 'Drapery Tracks' || productType === 'Smart Drapes') return 'Drapery';
  return MOBILE_PRODUCT_FAMILIES.includes(productType as MobileProductFamily) ? productType as MobileProductFamily : null;
}
export function productsInMobileFamily(products: QuoteLabCatalogProduct[], family: MobileProductFamily | null) {
  return products.filter(product => mobileFamily(product.productType) === family);
}
export function lineInputs(line: MobileQuoteWindow): SupplierLineInputs {
  const design = line.activeProductId ? line.families[line.activeProductId]?.design : null;
  const defaults:SupplierLineInputs = { family: mobileFamily(design?.product_type || ''), manufacturer: design?.supplier || null,
    colorFabric: design?.fabric || '', mount: design?.mount_type || '', control: design?.lift_system || design?.tilt_type || '',
    controlSide: typeof design?.options_json?.control_side === 'string' ? design.options_json.control_side : '', shippingBasis: null, openingCount: 1 };
  const explicit=line.supplierInputs;
  if(!explicit)return defaults;
  const value=(key:string)=>typeof design?.options_json?.[key]==='string'?String(design.options_json[key]):'';
  return {...explicit,colorFabric:explicit.colorFabric||value('fabric_color_code')||value('color')||defaults.colorFabric,mount:explicit.mount||defaults.mount,control:explicit.control||defaults.control,controlSide:explicit.controlSide||defaults.controlSide};
}
export function jobSettings(draft: MobileQuoteDraft): DraftJobSettings {
  return draft.draftJob || { version: 1, multiplier: null, requestId: `mobile-supplier:${draft.id}:1`, jobId: null, submittedSpec: null,
    tax: { treatment: 'unresolved', amount: null, instruction: '' }, comparisonMode: 'mixed_lines' };
}
export function patchSupplierInputs(draft: MobileQuoteDraft, id: string, patch: Partial<SupplierLineInputs>): MobileQuoteDraft {
  if (jobSettings(draft).submittedSpec || draft.submission.snapshot) return draft;
  const next = structuredClone(draft); const line = next.windows.find(line => line.id === id);
  if (!line) return draft;
  const base=line.supplierInputs??{...lineInputs(line),colorFabric:"",mount:"",control:"",controlSide:""};
  line.supplierInputs = { ...base, ...patch }; line.price = null; line.saved = false; next.quotePrice = null;
  next.updatedAt = new Date().toISOString(); return next;
}
/** Repeat configuration only after explicitly choosing the same family; all dimensions remain blank. */
export function selectSupplierFamily(draft: MobileQuoteDraft, id: string, family: MobileProductFamily): MobileQuoteDraft {
  if (jobSettings(draft).submittedSpec || draft.submission.snapshot) return draft;
  const index = draft.windows.findIndex(line => line.id === id); if (index < 0) return draft;
  const next = structuredClone(draft); const line = next.windows[index]; const previous = draft.windows[index - 1];
  if (lineInputs(line).family === family) return draft;
  const repeat = !line.activeProductId && previous && lineInputs(previous).family === family && previous.activeProductId;
  retainMobileManualPrice(line);line.families = {}; line.activeProductId = null;
  line.supplierInputs = { family, manufacturer: null, colorFabric: '', mount: '', control: '', controlSide: '', shippingBasis: null, openingCount: 1 };
  if (repeat) {
    const configuration = structuredClone(previous.families[previous.activeProductId!]);
    configuration.design.id = crypto.randomUUID(); configuration.design.line_item_id = line.id;
    // A hand-set price belongs to its original line, never to the next opening.
    configuration.design.unit_price = 0; delete configuration.design.options_json.manual_price_override;
    for(const key of Object.keys(configuration.design))if(key!=='unit_price'&&computedQuoteField(key))delete (configuration.design as unknown as Record<string,unknown>)[key];
    const clearMeasurements = (value:Record<string,unknown>) => {
      for(const key of Object.keys(value)) {
        if(/width|height|length|measurement|dimension/i.test(key))delete value[key];
        else if(value[key] && typeof value[key]==='object') {
          if(Array.isArray(value[key])) { for(const item of value[key] as unknown[])if(item&&typeof item==='object')clearMeasurements(item as Record<string,unknown>); }
          else clearMeasurements(value[key] as Record<string,unknown>);
        }
      }
    };
    clearMeasurements(configuration.design.options_json);stripComputedQuoteFields(configuration.design.options_json);
    line.activeProductId = previous.activeProductId; line.families = { [line.activeProductId!]: configuration };
    line.supplierInputs = { ...line.supplierInputs,...(previous.supplierInputs??{}),family,manufacturer:lineInputs(previous).manufacturer,openingCount:1,feeOverride:undefined };
  }
  // Existing measurements are preserved when correcting a family on this SAME opening.
  // A next-line placeholder has zero measurements and never receives prior dimensions.
  line.price = null; line.saved = false; next.quotePrice = null; next.updatedAt = new Date().toISOString(); return next;
}
export function selectSupplierManufacturer(draft: MobileQuoteDraft, id: string, manufacturer: string): MobileQuoteDraft {
  const current = draft.windows.find(line => line.id === id); if (!current || lineInputs(current).manufacturer === manufacturer) return draft;
  const next = patchSupplierInputs(draft, id, { manufacturer, colorFabric: '', mount: '', control: '', controlSide: '' });
  if (next === draft) return draft;
  const line = next.windows.find(line => line.id === id)!; retainMobileManualPrice(line);line.families = {}; line.activeProductId = null;
  return next;
}
export function missingSupplierFields(line: SupplierSpecLine): string[] {
  const missing: string[] = [];
  for (const [key, label] of [['manufacturer','manufacturer'], ['productId','exact product'], ['room','room'], ['colorFabric','color / fabric'], ['mount','mount'], ['control','control system'], ['controlSide','control side or explicit Not applicable']] as const) if (!line[key]?.trim()) missing.push(label);
  if (line.family === 'Shutters') for (const field of ['material', 'louver_size', 'tilt_type', 'panel_config']) if (!line.configuration[field]) missing.push(field.replaceAll('_', ' '));
  return missing;
}
// Preserve supplier price-group/program identities; remove only computed quote data.
const computedQuoteField=(key:string)=>/^(quote_v2_|authoritative_|current_v2_snapshot|manual_price_override$|manual_merchandise_unit_price$|manual_customer_charge|customer_charges$|price_status$|unit_price$|manufacturer_cost$|internal_cost|landed_cost|selection_fingerprint$)/i.test(key);
function stripComputedQuoteFields(value:Record<string,unknown>) {
  for(const [key,child] of Object.entries(value)) {
    if(computedQuoteField(key))delete value[key];
    else if(child&&typeof child==='object') {
      if(Array.isArray(child)){for(const item of child)if(item&&typeof item==='object')stripComputedQuoteFields(item as Record<string,unknown>);}
      else stripComputedQuoteFields(child as Record<string,unknown>);
    }
  }
}
function hasComputedQuoteFields(value:Record<string,unknown>):boolean {
  return Object.entries(value).some(([key,child])=>computedQuoteField(key)||(child&&typeof child==='object'&&(Array.isArray(child)?child.some(item=>item&&typeof item==='object'&&hasComputedQuoteFields(item)):hasComputedQuoteFields(child as Record<string,unknown>))));
}
export function buildSupplierSpec(draft: MobileQuoteDraft): SupplierQuoteSpec {
  const settings = jobSettings(draft);
  if (!settings.multiplier) throw new Error('Choose a product-cost multiplier.');
  const lines = draft.windows.map(line => {
    const input = lineInputs(line); const design = line.activeProductId ? line.families[line.activeProductId]?.design : null;
    if (!input.family || !input.manufacturer || !line.activeProductId || !design) throw new Error(`${line.room || 'Opening'}: choose a family, manufacturer and exact product.`);
    const issue = validateMobileQuoteMeasurement(line); if (issue) throw new Error(`${line.room || 'Opening'}: ${issue}`);
    const config = structuredClone(design.options_json || {});
    for (const key of ['supplier','material','louver_size','tilt_type','hinge_color','panel_config','mount_type','shade_type','lift_system','valance','fabric','motor_type','remote_type'] as const) if (design[key] != null) config[key] = design[key];
    // Explicit structured entries take precedence over inherited configurator values.
    config.mount_type = input.mount; config.fabric = input.colorFabric; config.control_system = input.control; config.control_side = input.controlSide;
    stripComputedQuoteFields(config);
    return { id: line.id, manufacturer: input.manufacturer, family: input.family, productId: line.activeProductId, productType: line.families[line.activeProductId].productType,
      room: line.room, position: line.position, widthWhole: line.widthWhole, widthFraction: line.widthFraction, heightWhole: line.heightWhole, heightFraction: line.heightFraction,
      quantity: 1, openingCount: input.openingCount, colorFabric: input.colorFabric, mount: input.mount, control: input.control, controlSide: input.controlSide,
      ...(input.feeOverride?{feeOverride:structuredClone(input.feeOverride)}:{}),shippingBasis: input.shippingBasis, notes: line.notes, designNotes: design.notes || '', configuration: config,
      manualAllInPrice: line.manualAllInPrice??(design.options_json.manual_price_override === true ? design.unit_price.toFixed(2) : null),
      photos: line.photos.map(photo => ({ id: photo.id, name: photo.name })) };
  });
  return { schemaVersion: '805-mobile-supplier-draft/v1', draftId: draft.id, version: settings.version, multiplier: settings.multiplier,
    comparisonMode: 'mixed_lines', customer: structuredClone(draft.customer), lines, tax: structuredClone(settings.tax) };
}
/** Program identity that reaches the existing SQL fee helper after CRM handoff. */
export function supplierSourceFeeProgram(configuration: Record<string, unknown>): string {
  return [configuration.catalog_program_id ?? (configuration.quote_lab_program_id == null ? configuration.program_id : undefined), configuration.quote_lab_program_id]
    .filter(value => value != null).map(String).join(' ');
}
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,value])=>`${JSON.stringify(key)}:${canonicalJson(value)}`).join(',')}}`;
  return JSON.stringify(value);
}
export function validateSupplierSpec(raw: unknown): SupplierQuoteSpec {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Submitted specification must be an object.');
  const spec = raw as SupplierQuoteSpec;
  const keys = (value:Record<string,unknown>,allowed:string[],label:string) => { if(Object.keys(value).some(key=>!allowed.includes(key)))throw new Error(`${label} contains an unexpected field.`); };
  keys(raw as Record<string,unknown>,['schemaVersion','draftId','version','multiplier','comparisonMode','customer','lines','tax'],'Specification');
  if (spec.schemaVersion !== '805-mobile-supplier-draft/v1' || !COST_MULTIPLIERS.includes(spec.multiplier) || spec.comparisonMode !== 'mixed_lines') throw new Error('Use the supported cost multiplier and mixed-line draft schema. Alternate-vendor comparisons need a separate explicit comparison instruction.');
  const uuid=(value:unknown)=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  if (!uuid(spec.draftId) || !Number.isSafeInteger(spec.version) || spec.version < 1) throw new Error('A valid draft identity and version are required.');
  if (!spec.customer || !['existing','new'].includes(spec.customer.kind) || typeof spec.customer.name !== 'string' || !spec.customer.name.trim()) throw new Error('Correct customer identity is required.');
  keys(spec.customer as unknown as Record<string,unknown>,['kind','jobId','sourceId','name','phone','email','address','appointmentDate'],'Customer');
  for(const key of ['phone','email','address'] as const)if(typeof spec.customer[key]!=='string')throw new Error(`Customer ${key} must be text.`);
  for(const key of ['jobId','sourceId'] as const)if(spec.customer[key]!=null&&!uuid(spec.customer[key]))throw new Error(`Customer ${key} must be an exact UUID.`);
  if(spec.customer.kind==='new'&&(spec.customer.jobId||spec.customer.sourceId))throw new Error('A new customer cannot relink an existing appointment or job.');
  if(spec.customer.appointmentDate!==null&&(typeof spec.customer.appointmentDate!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(spec.customer.appointmentDate)))throw new Error('Appointment date must be preserved as a local calendar date.');
  if (spec.customer.kind === 'existing' && !spec.customer.jobId && !spec.customer.sourceId) throw new Error('An existing customer needs the source job or appointment identity.');
  if (!Array.isArray(spec.lines) || spec.lines.length < 1 || spec.lines.length > 100 || new Set(spec.lines.map(line=>line.id)).size !== spec.lines.length) throw new Error('Provide 1–100 uniquely identified lines.');
  for (const line of spec.lines) {
    if(line && typeof line==='object')keys(line as unknown as Record<string,unknown>,['id','manufacturer','family','productId','productType','room','position','widthWhole','widthFraction','heightWhole','heightFraction','quantity','openingCount','colorFabric','mount','control','controlSide','shippingBasis','notes','designNotes','configuration','manualAllInPrice','photos','feeOverride'],'Line');
    if (!line || !uuid(line.id) || !MOBILE_PRODUCT_FAMILIES.includes(line.family) || typeof line.manufacturer !== 'string' || !line.manufacturer.trim() || typeof line.productId!=='string' || !line.productId) throw new Error('Every line needs its exact family, manufacturer and product identity.');
    if (!Number.isInteger(line.widthWhole) || !Number.isInteger(line.heightWhole) || !MOBILE_QUOTE_FRACTIONS.includes(line.widthFraction as never) || !MOBILE_QUOTE_FRACTIONS.includes(line.heightFraction as never)) throw new Error('Dimensions must retain whole inches and exact supported fractions.');
    const fraction = (s:string) => s === '0' ? 0 : Number(s.split('/')[0])/Number(s.split('/')[1]);
    if (!(line.widthWhole+fraction(line.widthFraction)>0 && line.heightWhole+fraction(line.heightFraction)>0 && line.widthWhole>=0 && line.heightWhole>=0 && line.widthWhole<=1000 && line.heightWhole<=1000)) throw new Error('Fresh width and height are required for every opening.');
    if (!Number.isSafeInteger(line.quantity) || line.quantity<1 || !Number.isSafeInteger(line.openingCount) || line.openingCount<1 || ![null,'line','opening','physical_unit'].includes(line.shippingBasis)) throw new Error('Opening quantity and explicit shipping basis are invalid.');
    if (!line.configuration || typeof line.configuration !== 'object' || Array.isArray(line.configuration) || typeof line.notes !== 'string' || typeof line.designNotes !== 'string') throw new Error('Structured configuration and preserved line notes are required.');
    if(hasComputedQuoteFields(line.configuration))throw new Error('Supplier configuration cannot set protected quote pricing fields.');
    for(const key of ['room','position','colorFabric','mount','control','controlSide','productType'] as const)if(typeof line[key]!=='string')throw new Error(`Structured ${key} must be text.`);
    if(line.feeOverride){
      keys(line.feeOverride as unknown as Record<string,unknown>,['installationAmount','shippingAmount','instruction'],'Fee override');
      if(typeof line.feeOverride.instruction!=='string'||!line.feeOverride.instruction.trim()||[line.feeOverride.installationAmount,line.feeOverride.shippingAmount].some(value=>value!==null&&(typeof value!=='string'||!/^\d{1,10}\.\d{2}$/.test(value))))throw new Error('Specific fee overrides need exact cents and a recorded user instruction.');
    }
    if(!Array.isArray(line.photos)||line.photos.some(photo=>!photo||!uuid(photo.id)||typeof photo.name!=='string'||Object.keys(photo).some(key=>!['id','name'].includes(key))))throw new Error('Photo references must preserve exact identities and names.');
    if (line.manualAllInPrice !== null && !/^\d{1,10}\.\d{2}$/.test(line.manualAllInPrice)) throw new Error('Saved manual price must be exact nonnegative cents.');
  }
  if (!spec.tax || !['unresolved','excluded_confirmed','included_confirmed'].includes(spec.tax.treatment)) throw new Error('Tax treatment must be explicit or unresolved.');
  keys(spec.tax as unknown as Record<string,unknown>,['treatment','amount','instruction'],'Tax');
  if(typeof spec.tax.instruction!=='string'||(spec.tax.amount!==null&&typeof spec.tax.amount!=='string'))throw new Error('Tax decision fields must be text or an unresolved amount.');
  if (spec.tax.treatment !== 'unresolved' && (!spec.tax.instruction?.trim() || !/^\d{1,10}\.\d{2}$/.test(spec.tax.amount || '') || (spec.tax.treatment==='excluded_confirmed' && spec.tax.amount!=='0.00'))) throw new Error('Confirmed tax requires a recorded decision and amount.');
  if (canonicalJson(spec).length>900_000) throw new Error('Submitted specification is too large.');
  return structuredClone(spec);
}
