import type { AnatomyChoice, AnatomyChoiceGroup, AnatomyPreviewProduct } from './contract-anatomy-catalog';
import { catalogueChoiceKey, type ProductRenderSelection } from './anatomy-catalogue-selection';
import { contractProductFamily } from './contract-product-family';
import { contractIllustration } from './contract-illustrations';
import { specialtyShutterSketch } from './specialty-shutter-illustrations';
import { valanceIllustration, rollerValanceLayout } from './valance-illustrations';
import { anatomyReferenceArtwork } from './anatomy-reference-artwork';
import { anatomyShutterStudy } from './anatomy-shutter-study';
import { sketchInches } from './shutter-illustration-geometry';
import { anatomyShadeStudy } from './anatomy-shade-study';

const clean = (value: string) => value.toLowerCase().replace(/[_*-]/g, ' ').replace(/\s+/g, ' ').trim();
const aliases: Record<string, string> = {
  'lift / control':'Lift System', lift:'Lift System', 'operating system':'Lift System',
  'operating systems':'Lift System', 'panel configuration':'Panel Config',
  tilt:'Tilt Type', louver:'Louver Size', 'louver sizes':'Louver Size',
  'slat':'Slat Size', 'slat sizes':'Slat Size', 'cell sizes':'Cell Size',
  'chain locations':'Control Side', 'chain location':'Control Side', 'wand side':'Control Side',
  'fabric roll':'Roll Type', 'roll types':'Roll Type', 'fold styles':'Fold Style',
  'roman style':'Fold Style', 'legacy valances':'Valance',
  'fold styles limited':'Fold Style',
  'top treatment classes':'Top Treatment', 'frame':'Frame Type', mount:'Mount Type',
  'specialty shapes':'Specialty Shape', 'shutter types':'Shutter Type',
  'track types':'Track Type', 'frame side options':'Frame Sides',
  'woodlore frame types':'Frame Type', 'frame types':'Frame Type', 'wood frame types':'Frame Type', 'poly frame types':'Frame Type',
  'cell':'Cell Size','control':'Control Type',
};

/** Presentation adapter only. Keep raw selections on the quote; never infer order defaults. */
export function renderStudyOption(option: string): string {
  const colon=option.indexOf(':');
  if(colon<0)return option;
  const raw=option.slice(0,colon).trim(), value=option.slice(colon+1).trim();
  const field=aliases[clean(raw)] || raw;
  const panels:Record<string,string>={'single panel left':'L','single panel right':'R','left / right pair':'LR'};
  return `${field}: ${clean(field)==='panel config'?(panels[clean(value)]||value):value}`;
}
export const renderStudyKey=(option:string)=>clean(renderStudyOption(option).split(':')[0]);

/** Replace only competing selections for the same visible property. */
export function applyRenderStudy(base:readonly string[], replacement:readonly string[]):string[] {
  const normalized=replacement.map(renderStudyOption);
  const keys=new Set(normalized.map(renderStudyKey));
  return [...base.map(renderStudyOption).filter(o=>!keys.has(renderStudyKey(o))),...normalized];
}

export function scopedRenderProduct(product:AnatomyPreviewProduct, scope?:ProductRenderSelection):AnatomyPreviewProduct {
  if(!scope || scope.scope==='all')return product;
  return {...product,groups:product.groups.map(g=>({...g,choices:g.choices.filter(c=>scope.choices.includes(catalogueChoiceKey(g.id,c.id)))})).filter(g=>g.choices.length)};
}

export function renderStudyDefaults(product:AnatomyPreviewProduct):string[] {
  const family=contractProductFamily(product.name);
  const common=product.manufacturer?[`Manufacturer: ${product.manufacturer}`]:[];
  // These are visibly identified sample settings, never saved order selections.
  if(family==='shutters')return [...common,'Panel Config: LR','Tilt Type: Standard Tilt','Split Tilt: No','Divider Rail: No'];
  if(['roller','roman','honeycomb','sheer'].includes(family))return [...common,'Lift System: Cordless','Control Side: Right'];
  if(['wood','faux-wood','mini'].includes(family))return [...common,'Lift System: Cordless','Control Side: Left'];
  return common;
}

export function renderOptionsFromSelection(product:AnatomyPreviewProduct, selected:Record<string,string>):string[] {
  let options=product.manufacturer?[`Manufacturer: ${product.manufacturer}`]:[];
  for(const group of product.groups) {
    const choice=group.choices.find(c=>c.id===selected[group.id]);
    if(choice)options=applyRenderStudy(options,choice.options);
  }
  return options;
}

/** Identity uses drawn properties, deliberately excluding alt text and labels. */
export function renderDrawingIdentity(product:string,options:readonly string[]):string {
  if(contractProductFamily(product)==='valance') {
    const profile=anatomyReferenceArtwork(product,options);
    if(profile&&'configured' in profile&&profile.configured)return profile.src;
  }
  const specialty=specialtyShutterSketch(product,options)||anatomyShutterStudy(product,options);
  if(specialty)return JSON.stringify({specialty:{...specialty,label:undefined,referenceNote:undefined},louver:options.find(o=>/^louver size:/i.test(o))});
  const shade=anatomyShadeStudy(product,options);
  if(shade)return JSON.stringify({src:shade.src,loopSide:shade.loopSide,remote:shade.remote,valance:valanceIllustration(product,options)});
  const art=contractIllustration(product,options);
  if(!art)return 'reference';
  const valance=valanceIllustration(product,options);
  return JSON.stringify({src:art.src,mirror:art.mirror,remote:art.remote,panels:art.panels,layout:art.shutterLayout,operation:art.operationReference?.src,valance,valanceLayout:valance&&art.src.includes('/roller-open-roll')?rollerValanceLayout(valance,options):undefined});
}

export type RenderStudyCoverage='drawing'|'named-detail'|'needs-artwork';
export type RenderStudy={options:string[];coverage:RenderStudyCoverage;note:string;source:string;identity:string};

/** Conservative coverage: a generic image or a changed caption is not a new drawing. */
export function optionRenderStudy(product:AnatomyPreviewProduct, group:AnatomyChoiceGroup, choice:AnatomyChoice, base:readonly string[]=renderStudyDefaults(product)):RenderStudy {
  const source=choice.source||group.source;
  const options=applyRenderStudy(base,choice.options);
  const identity=renderDrawingIdentity(product.name,options);
  const fields=choice.options.map(o=>renderStudyKey(o));
  const key=fields.join(' '), family=contractProductFamily(product.name);
  const art=contractIllustration(product.name,options),specialty=specialtyShutterSketch(product.name,options)||anatomyShutterStudy(product.name,options);
  const standalone=family==='valance'?anatomyReferenceArtwork(product.name,options):null;
  const shade=anatomyShadeStudy(product.name,options);
  if(shade && (fields.every(f=>f==='fold style') || (shade.controlDrawn && fields.every(f=>['lift system','control type','control side'].includes(f)))))return {options,identity,source,coverage:'drawing',note:'Custom pencil fold and control components shown. Supplier combination rules still apply.'};
  if(standalone&&'configured' in standalone&&standalone.configured&&fields.every(f=>f==='valance'))return {options,identity,source,coverage:'drawing',note:'Selected valance profile shown.'};
  const named=fields.every(f=>/color|colour|fabric|material|finish|lining|opacity|light control/.test(f)) && !/fold|size|pattern orientation/.test(key);
  if(named)return {options,identity,source,coverage:'named-detail',note:'Exact fabric and color names accompany the custom pencil sketch.'};
  const changed=identity!==renderDrawingIdentity(product.name,base);
  const validLouver=!fields.includes('louver size')||choice.options.every(o=>renderStudyKey(o)!=='louver size'||sketchInches(o.slice(o.indexOf(':')+1))!==null);
  const supportedShape=fields.every(f=>['specialty shape','tilt type','split tilt','divider rail','panel config','louver size'].includes(f)) && specialty && !specialty.referenceNote && validLouver;
  const supportedShutter=family==='shutters' && fields.every(f=>['panel config','tilt type','split tilt','divider rail'].includes(f)) && art && !art.referenceNote;
  const supportedControl=['roller','roman','honeycomb','sheer','wood','faux-wood','mini'].includes(family) && fields.every(f=>['lift system','control type','control side'].includes(f)) && art && !art.referenceNote;
  const valance=fields.every(f=>['valance','top treatment'].includes(f)) && valanceIllustration(product.name,options);
  const noValance=fields.every(f=>['valance','top treatment'].includes(f)) && /^(none|no|open roll|no valance(?: \/ open roll)?)$/i.test(choice.label.trim()) && family==='roller' && art;
  if(supportedShape || supportedShutter || supportedControl || valance || noValance)return {options,identity,source,coverage:'drawing',note:changed?'This selection changes the drawing.':'This selection uses the displayed base drawing.'};
  return {options,identity,source,coverage:'needs-artwork',note:'The current picture is a product reference. This selection still needs a verified drawing.'};
}

export function productRenderCoverage(product:AnatomyPreviewProduct) {
  const counts={drawing:0,'named-detail':0,'needs-artwork':0};
  for(const group of product.groups)for(const choice of group.choices)counts[optionRenderStudy(product,group,choice).coverage]++;
  return counts;
}
