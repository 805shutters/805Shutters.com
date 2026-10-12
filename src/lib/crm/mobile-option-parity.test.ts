// @vitest-environment happy-dom
import {createElement} from 'react';
import {it,expect} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {mkdirSync,writeFileSync} from 'node:fs';
import {DesignCard,buildCatalogSelectionPatch,buildMobileCatalogProgramPatch,normalizeCrmQuoteCatalog} from '@mts/components/crm/quote-builder/DesignCard';
import {buildUiCatalog} from '@/lib/quote/ui-catalog';
import type {QuoteLabCatalogProduct} from '@/lib/quote-lab/types';
const COSTING_SUPPLIERS=['Norman','Onyx','Sundance','Lotus','Polar'] as const;
import {mobileFamily,buildSupplierSpec} from './mobile-supplier-spec';
import {syntheticDraft} from './mobile-supplier-test-fixture';
import {emptyMobileQuoteDesign,mobileQuoteLine,updateMobileQuoteDesign,updateMobileQuoteQuantity,validateMobileQuoteMeasurement,type MobileQuoteDraft} from './mobile-quote-draft';
import {mobileQuoteDraftOperations} from './mobile-quote-save';
import {withMobileManualPrices} from './mobile-quote-preview-state';
import {mobileQuoteOptionRequirement,quotePairingLineOptions} from '@/lib/quote/quote-option-parity';
import {mobileRequiredQuoteIssues,allowsNoOperatingSide,sourceShutterFoldingChoices} from './mobile-quote-requirements';

it('audits actual full/mobile field values for every supported catalog product/program baseline',()=>{
 const products=normalizeCrmQuoteCatalog({catalog:buildUiCatalog()}).products.filter(p=>mobileFamily(p.productType)&&COSTING_SUPPLIERS.some(m=>m===p.manufacturer)) as unknown as QuoteLabCatalogProduct[],rows:unknown[]=[],gaps:unknown[]=[];
 const draft=syntheticDraft(),line=mobileQuoteLine(draft,draft.windows[0]),noop=()=>{};
 const manifest=(product:QuoteLabCatalogProduct,design:ReturnType<typeof emptyMobileQuoteDesign>,mobile:boolean)=>{
  const client=new QueryClient({defaultOptions:{queries:{retry:false}}});const html=renderToStaticMarkup(createElement(QueryClientProvider,{client},createElement(DesignCard,{lineItem:{...line,product_type:product.productType},lineNumber:1,designs:[design],authoritativeV2:true,mobilePresentation:mobile,catalogProducts:products,onUpdateDesign:noop,onSaveLinePrice:async()=>{},onCopyAll:noop,onCopySome:noop,onStack:noop,copyMode:'none',isCopyTarget:false,isSelectedTarget:false,onToggleCopyTarget:noop})));client.clear();const root=document.createElement('div');root.innerHTML=html;const fields=new Map([...root.querySelectorAll('[data-option-field],[data-confirmed-option-field]')].map(n=>[(n.getAttribute('data-option-field')??n.getAttribute('data-confirmed-option-field'))!,{label:n.getAttribute('data-option-label'),values:n.getAttribute('data-option-values')}]));for(const n of root.querySelectorAll('select,input,textarea')){const label=n.getAttribute('aria-label')||n.getAttribute('data-testid')||n.closest('label')?.textContent?.trim()||[...root.querySelectorAll('label')].find(l=>l.getAttribute('for')===n.id)?.textContent?.trim();if(!label)continue;const canonicalLabel=/^Search fabric$/i.test(label)?'Fabric search':label;const options=n instanceof HTMLSelectElement?[...n.options].map(o=>({value:o.value,label:o.label,disabled:o.disabled})):undefined;fields.set('native:'+canonicalLabel,{label:canonicalLabel,values:JSON.stringify({type:n.getAttribute('type')==='search'?'text':n.tagName==='INPUT'?(n as HTMLInputElement).type:n.getAttribute('type'),options,disabled:(n as HTMLInputElement).disabled,readOnly:(n as HTMLInputElement).readOnly})});}return fields;
 };
 for(const product of products)for(const program of product.programs.length?product.programs:[{id:''}]){
  let design={...emptyMobileQuoteDesign(line.id,product.productType),...buildCatalogSelectionPatch({},product),supplier:product.manufacturer??null};if(program.id)design={...design,...buildMobileCatalogProgramPatch(design,product,program.id)};
  const full=manifest(product,design,false),mobile=manifest(product,design,true),missing=[...full].filter(([field,record])=>field!=='material'&&record.label!=='Program'&&(!mobile.has(field)||mobile.get(field)!.values!==record.values));
  rows.push({manufacturer:product.manufacturer,productId:product.id,family:mobileFamily(product.productType),programId:program.id,fullFields:[...full.keys()],mobileFields:[...mobile.keys()],missing});if(missing.length)gaps.push({productId:product.id,programId:program.id,missing});
 }
 mkdirSync('reports',{recursive:true});writeFileSync('reports/mobile-option-parity-baselines.json',JSON.stringify({scope:'source-backed product/program baseline states only; conditional combinations require separate checks',products:products.length,cases:rows.length,rows,gaps},null,2));expect(products.length).toBeGreaterThan(20);expect(gaps).toEqual([]);
},60000);

it('preserves quantity, nested options, notes and manual prices through serialization and both handoffs',()=>{
 let draft=syntheticDraft();draft.windows[0].manualAllInPrice='123.45';draft=updateMobileQuoteQuantity(draft,draft.windows[0].id,3);draft=updateMobileQuoteDesign(draft,draft.windows[0].id,{notes:'SYNTHETIC design note',options_json:{...draft.windows[0].families.roller.design.options_json,custom_nested:{enabled:false,values:['x','y']}}});draft=JSON.parse(JSON.stringify(draft)) as MobileQuoteDraft;
 expect(mobileQuoteLine(draft,draft.windows[0]).quantity).toBe(3);expect(buildSupplierSpec(draft).lines[0]).toMatchObject({quantity:3,manualAllInPrice:'123.45',designNotes:'SYNTHETIC design note',configuration:{custom_nested:{enabled:false,values:['x','y']}}});expect(mobileQuoteDraftOperations({customer:draft.customer,windows:draft.windows,createdAt:draft.updatedAt,requiresManualPricing:true})[0]).toMatchObject({patch:{quantity:3}});
 const frozen=structuredClone(draft);frozen.draftJob!.submittedSpec=buildSupplierSpec(draft);expect(updateMobileQuoteQuantity(frozen,frozen.windows[0].id,4)).toBe(frozen);expect(updateMobileQuoteQuantity(draft,draft.windows[0].id,0)).toBe(draft);
});
it('same full/mobile pairing helper excludes the current or incompatible lines and keeps actual design identities',()=>{
 const draft=syntheticDraft(),line=mobileQuoteLine(draft,draft.windows[0]),design=draft.windows[0].families.roller.design;const match={...line,id:'SYNTHETIC-SECOND'},wrong={...line,id:'SYNTHETIC-WRONG',product_type:'Wood Blinds'};expect(quotePairingLineOptions(line,[line,match,wrong],[design,{...design,line_item_id:match.id},{...design,line_item_id:wrong.id}]).map(p=>p.lineId)).toEqual([match.id]);
});
it('uses explicit user requirements while leaving motor accessories and installation details optional',()=>{
 for(const family of ['Faux Wood Blinds','Wood Blinds','Roman Shades','Sheer Shades','Vertical Blinds','Roller Shades','Honeycomb Shades','Smart Drapes','Shutters']){expect(mobileQuoteOptionRequirement('mount_type',family)).toBe('required');for(const field of ['motor_type','remote_type','json:hard_surface_install','json:divider_rail_location'])expect(mobileQuoteOptionRequirement(field,family)).toBe('optional');}
 expect(mobileQuoteOptionRequirement('fabric','Roller Shades')).toBe('required');expect(mobileQuoteOptionRequirement('fabric','Roman Shades')).toBe('optional');for(const field of ['louver_size','json:frame_type','json:color','json:folding_direction','json:split_tilt'])expect(mobileQuoteOptionRequirement(field,'Shutters')).toBe('required');
});
it('requires explicit controls without silently supplying hardware or an inapplicable side',()=>{
 const draft=syntheticDraft(),line=draft.windows[0];line.supplierInputs!.mount='Inside Mount';line.supplierInputs!.control='Motorized';line.supplierInputs!.controlSide='Not applicable';expect(mobileRequiredQuoteIssues(line)).toEqual([]);expect(allowsNoOperatingSide('Wood Blinds','Cordless')).toBe(false);line.supplierInputs!.family='Shutters';const design=line.families.roller.design;design.louver_size='SYNTHETIC';Object.assign(design.options_json,{frame_type:'SYNTHETIC',color:'SYNTHETIC',folding_direction:'SYNTHETIC'});expect(mobileRequiredQuoteIssues(line)).toContain('explicit split-tilt or divider-rail choice');design.options_json.split_tilt='No';expect(mobileRequiredQuoteIssues(line)).toEqual([]);expect(design.options_json.divider_rail).toBeUndefined();
});
it('a configurator mount correction invalidates exact dimensions and retains saved manual prices',()=>{
 const draft=syntheticDraft();draft.windows[0].families.roller.design.mount_type='Inside Mount';draft.windows[0].manualAllInPrice='123.45';const next=updateMobileQuoteDesign(draft,draft.windows[0].id,{mount_type:'Outside Mount'});expect(next.windows[0]).toMatchObject({widthWhole:0,heightWhole:0,manualAllInPrice:'123.45'});expect(validateMobileQuoteMeasurement(next.windows[0])).not.toBeNull();
});
it('only exposes manufacturer-backed general folding choices and does not invent Norman directions',()=>{
 const design=emptyMobileQuoteDesign('SYNTHETIC','Shutters');design.supplier='Norman';expect(sourceShutterFoldingChoices(design)).toBeNull();design.supplier='Onyx';design.options_json.shutter_type='Tracked Shutter';expect(sourceShutterFoldingChoices(design)).toEqual(['Center Open','Side Open']);design.options_json.shutter_type='Standard Shutter';expect(sourceShutterFoldingChoices(design)).toBeNull();
});
it('native control edits supersede supplemental entries without losing other exact selections',()=>{
 const draft=syntheticDraft(),line=draft.windows[0];line.supplierInputs!.controlSide='Left';line.families.roller.design.options_json.control_side='Left';const next=updateMobileQuoteDesign(draft,line.id,{options_json:{...line.families.roller.design.options_json,control_side:'Right'}},true);expect(buildSupplierSpec(next).lines[0].controlSide).toBe('Right');expect(next.windows[0].notes).toBe(line.notes);
});
it('legacy manual preview keeps the stored unit price and uses the actual line quantity',()=>{
 const draft=syntheticDraft(),line=draft.windows[0];line.quantity=3;line.families.roller.design.unit_price=12.34;line.families.roller.design.options_json.manual_price_override=true;const preview=withMobileManualPrices(draft,{lines:[{lineItemId:line.id,price:{unitPrice:0,quantity:1,total:0},status:'blocked'}],status:'blocked',total:null,authoritativeSubtotal:0} as any);expect(preview.lines[0].price).toEqual({unitPrice:12.34,quantity:3,total:37.02});expect(line.families.roller.design.unit_price).toBe(12.34);
});
it('vertical vane size remains missing until an explicit known size is recorded',()=>{
 const draft=syntheticDraft(),line=draft.windows[0];line.supplierInputs!.family='Vertical Blinds';line.supplierInputs!.mount='Inside Mount';line.supplierInputs!.control='SYNTHETIC operating system';line.supplierInputs!.controlSide='Left';expect(mobileRequiredQuoteIssues(line)).toContain('louver/slat size');line.families.roller.design.options_json.slat_size='SYNTHETIC confirmed supplier size';expect(mobileRequiredQuoteIssues(line)).toEqual([]);
});
