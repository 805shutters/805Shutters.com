import { catalog } from './catalog';
import { getDetailFieldsForProduct, getMotorizationGroupsForProduct } from './product-options';
import { getProductColorOptions } from './product-color-options';
import { contractProductFamily } from './contract-product-family';
import { SPECIALTY_SHUTTER_SKETCHES } from './specialty-shutter-illustrations';
import * as quoteOptions from '@mts/lib/quoteConstants';
import { onyxBaselineProfiles, onyxBaselineFields, onyxBaselineLabels, onyxBaselineControl } from './onyx-baseline-options';
import { onyxWovenOptions } from './onyx-woven-options';
import { VALANCE_ARTWORK } from './valance-illustrations';

export type AnatomyChoice = { id: string; label: string; options: string[]; source?:string };
export type AnatomyChoiceGroup = { id: string; label: string; source: string; choices: AnatomyChoice[] };
export type AnatomyPreviewProduct = { id: string; name: string; productType: string; manufacturer: string; groups: AnatomyChoiceGroup[] };
const title = (s: string) => s.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
const prefixByFamily: Record<string, string[]> = { shutters: ['SHUTTER_', 'NORMAN_', 'ONYX_'], roller: ['ROLLER_'], roman: ['ROMAN_'], honeycomb: ['HONEYCOMB_'], sheer: ['SHEER_', 'SMARTFOLD_'], mini: ['MINI_BLIND_'], 'faux-wood': ['FAUX_WOOD_'], wood: ['WOOD_BLIND_'], vertical: ['VERTICAL_'], 'smart-drapes': ['SMARTDRAPE_'] };
const labels: Record<string, string> = { LIFT_SYSTEMS:'Lift System', TILT_TYPES:'Tilt Type', LOUVER_SIZES:'Louver Size', PANEL_CONFIGS:'Panel Config', VALANCES:'Valance', MOUNT_TYPES:'Mount Type', SHADE_TYPES:'Shade Type', ROLL_TYPES:'Roll Type', HEM_BARS:'Hem Bar', CONTROL_SIDES:'Control Side', CONTROL_TYPES:'Control Type', DRAW_OPTIONS:'Draw Direction', STACK_OPTIONS:'Stack', FOLD_STYLES:'Fold Style', SLAT_SIZES:'Slat Size', MATERIALS:'Material', HINGE_COLORS:'Hinge Color', APPLICATIONS:'Application', COLORS:'Color' };

/** Inventory only: choices are isolated render studies, not approved combinations.
 * No prices, customer records or manufacturer-order mutations are included. */
export function anatomyProductIndex() {
  const products = catalog.products.map(p => ({ id:p.id, name:p.name, productType:p.productType, manufacturer:p.manufacturer || 'Norman' }));
  for (const name of quoteOptions.PRODUCT_TYPES) if (!products.some(p => p.productType === name)) products.push({id:`type:${name}`,name,productType:name,manufacturer:''});
  return products;
}

export function anatomyPreviewProduct(id: string): AnatomyPreviewProduct | null {
  const summary = anatomyProductIndex().find(p => p.id === id);
  if (!summary) return null;
  const product = catalog.products.find(p => p.id === id);
  const groups: AnatomyChoiceGroup[] = [];
  const add = (id:string,label:string,source:string,entries:AnatomyChoice[]) => {
    if (!entries.length) return;
    entries=entries.map(entry=>({...entry,source:entry.source||source}));
    const previous = groups.find(g => g.label.toLowerCase() === label.toLowerCase());
    if (previous) {
      for (const entry of entries) if (!previous.choices.some(c => c.label.toLowerCase() === entry.label.toLowerCase())) previous.choices.push({...entry,id:`${id}:${entry.id}`});
    } else groups.push({id,label,source,choices:entries});
  };
  const choice = (id:string,label:string,field:string):AnatomyChoice => ({id,label,options:[`${field}: ${label.replace(/\*+$/,'').trim()}`]});
  if (product) {
    add('program','Product style','Product catalog', product.programs.map(p => choice(p.id,p.name,'Style')));
    for (const field of getDetailFieldsForProduct(product.id).filter(f => f.customerVisible !== false)) {
      add(`detail:${field.id}`, field.label, 'Product options', (field.type === 'checkbox' ? [{value:'yes',label:'Yes'},{value:'no',label:'No'}] : field.options ?? []).map(o => choice(o.value,o.label,field.label)));
    }
    add('fabric','Fabric','Product catalog',Object.keys(product.fabricRouting ?? {}).map(f => choice(f,f,'Fabric')));
    add('color','Fabric / color','Color catalog',getProductColorOptions(product.id).filter(c => c.available).map(c => choice(c.id,`${c.publicCollection || c.collection} · ${c.colorCode} ${c.publicColorName || c.colorName}`,'Color')));
    add('surcharge','Additional options','Product catalog',product.surcharges.map(s => choice(s.id,s.name,'Additional option')));
    for (const id of getMotorizationGroupsForProduct(product.id)) {
      const group = catalog.motorization[id];
      if (group) add(`motor:${id}`,group.name,'Motorization catalog',group.options.filter(o => !o.priceByProduct || product.id in o.priceByProduct || o.price != null).map(o => choice(o.id,o.name,'Motorization components')));
    }
    // These supplier menus live outside generic detail fields. Preserve their
    // observed context instead of silently omitting their visual options.
    for(const profile of onyxBaselineProfiles.filter(p=>p.productId===product.id)) {
      const source=`Onyx observed menu · ${profile.pattern} · ${profile.control} · 2026-09-20`;
      add(`onyx:${profile.id}:control`,'Lift System',source,[choice(profile.control,onyxBaselineControl(profile),'Lift System')]);
      for(const [key,values] of onyxBaselineFields(profile)) {
        const label=onyxBaselineLabels[key]||key;
        add(`onyx:${profile.id}:${key}`,label,source,(Array.isArray(values)?values:values?['Yes','No']:['No']).map(v=>choice(v,v,label)));
      }
    }
    if(product.id==='onyx_woven') {
      const source='Onyx woven menu observations · 2026-09-20 · collection compatibility applies';
      add('onyx:woven:control','Lift System',source,onyxWovenOptions.controls.map(o=>choice(o.id,o.label,'Lift System')));
      add('onyx:woven:assembly','Shade assembly',source,onyxWovenOptions.assemblies.map(o=>choice(o.id,o.label,'Shade assembly')));
      for(const profile of onyxWovenOptions.profiles) {
        add(`onyx:${profile.programId}:liner`,'Lining',source,profile.liners.map(o=>choice(o.id,o.label,'Lining')));
        add(`onyx:${profile.programId}:binding`,'Edge binding',source,profile.bindings.map(o=>choice(o.id,o.label,'Edge binding')));
      }
    }
    if(contractProductFamily(summary.name)==='valance') {
      const parent=/faux|smartprivacy/i.test(summary.name)?'faux wood blinds':'roller shades';
      add('valance:profiles','Valance profile','Existing supplier pencil artwork · profile availability requires product check',VALANCE_ARTWORK.filter(a=>a.manufacturer===summary.manufacturer.toLowerCase()&&(a.products as readonly string[]).includes(parent)).map(a=>choice(a.id,a.label,'Valance')));
    }
  }
  if(id==='type:SmartFold Shades') {
    const named=anatomyPreviewProduct('smartfold');
    if(named)return {...summary,groups:named.groups};
  }
  const family = contractProductFamily(summary.productType);
  const prefixes = /onyx/i.test(summary.manufacturer) && family === 'shutters' ? ['ONYX_'] : /norman/i.test(summary.manufacturer) || !summary.manufacturer ? (prefixByFamily[family] ?? []).filter(p => p !== 'ONYX_') : [];
  for (const [key, list] of Object.entries(quoteOptions)) {
    const prefix = prefixes.find(p => key.startsWith(p));
    if (!prefix || !Array.isArray(list) || !list.length || !list.every(v => typeof v === 'string')) continue;
    if (prefix === 'NORMAN_' && !/norman/i.test(summary.manufacturer) || prefix === 'ONYX_' && !/onyx/i.test(summary.manufacturer)) continue;
    const suffix = key.slice(prefix.length), label = /FABRICS$/.test(suffix) ? 'Fabric' : labels[suffix] || title(suffix);
    if(suffix==='SUPPLIERS'&&summary.manufacturer)continue;
    add(`builder:${key}`, label, 'Quote builder reference choices', [...new Set(list as string[])].map(v => choice(v,v,label)));
  }
  if (family === 'shutters') {
    add('split','Split tilt','Saved contract options',['No','Yes'].map(v => choice(v,v,'Split Tilt')));
    add('divider','Divider rail','Saved contract options',['No','Yes'].map(v => choice(v,v,'Divider Rail')));
    add('shape','Specialty shape','Sketch library · availability depends on supplier',SPECIALTY_SHUTTER_SKETCHES.map(([code,label]) => ({id:code,label,options:[`Specialty Shape: ${code}`]})));
  }
  return {...summary,groups};
}
