import { describe,it,expect } from 'vitest';
import { addMobileQuoteWindow,createMobileQuoteDraft,emptyMobileQuoteDesign,selectMobileQuoteProduct,updateMobileQuoteDesign,setMobileQuoteLinePrice,selectMobileQuoteRoom } from './mobile-quote-draft';
import { COST_MULTIPLIERS,MOBILE_PRODUCT_FAMILIES,buildSupplierSpec,jobSettings,prepareMobileSupplierDraft,lineInputs,patchSupplierInputs,selectSupplierFamily,selectSupplierManufacturer,validateSupplierSpec,canonicalJson } from './mobile-supplier-spec';

import { syntheticDraft } from './mobile-supplier-test-fixture';
describe('mobile supplier spec',()=>{
  it('resumes an older editable device draft in the current design without altering saved content',()=>{
    const draft=syntheticDraft();delete draft.draftJob;draft.workflowMode='measure-first';
    draft.windows[0].manualAllInPrice='123.45';draft.windows[0].families.roller.design.options_json.manual_price_override=true;
    draft.windows[0].families.roller.design.unit_price=123.45;
    const before=structuredClone(draft),next=prepareMobileSupplierDraft(draft);
    expect(draft).toEqual(before);expect(next).toEqual({...before,workflowMode:'full-design',draftJob:jobSettings(before)});
    expect(next.windows).toBe(draft.windows);expect(prepareMobileSupplierDraft(next)).toBe(next);
  });
  it('preserves the original path for existing CRM quotes and frozen supplier or legacy snapshots',()=>{
    const quote=syntheticDraft();delete quote.draftJob;quote.submission.quoteId='55555555-5555-4555-8555-555555555555';
    expect(prepareMobileSupplierDraft(quote)).toBe(quote);
    const submitted=syntheticDraft();submitted.draftJob!.submittedSpec=buildSupplierSpec(submitted);
    expect(prepareMobileSupplierDraft(submitted)).toBe(submitted);
    const frozen=syntheticDraft();delete frozen.draftJob;
    frozen.submission.snapshot={customer:frozen.customer,windows:structuredClone(frozen.windows),createdAt:frozen.updatedAt,requiresManualPricing:true};
    expect(prepareMobileSupplierDraft(frozen)).toBe(frozen);
  });
  it('keeps existing supplier job identity, multiplier and tax decisions when opening a draft',()=>{
    const draft=syntheticDraft();draft.workflowMode='measure-first';draft.draftJob!.jobId='SYNTHETIC JOB';
    const next=prepareMobileSupplierDraft(draft);expect(next.draftJob).toBe(draft.draftJob);
    expect(next.draftJob!.multiplier).toBe('2');expect(next.draftJob!.requestId).toBe(draft.draftJob!.requestId);
  });
  it('offers exactly nine unique families and eight cost factors',()=>{
    expect(MOBILE_PRODUCT_FAMILIES).toEqual(['Shutters','Faux Wood Blinds','Wood Blinds','Roman Shades','Sheer Shades','Vertical Blinds','Roller Shades','Honeycomb Shades','Drapery']);
    expect(new Set(MOBILE_PRODUCT_FAMILIES).size).toBe(9);expect(COST_MULTIPLIERS).toEqual(['1.75','2','2.25','2.5','2.75','3','3.25','3.5']);
  });
  it('serializes actual fractional dimensions, structured options and both note fields',()=>{
    const draft=syntheticDraft();draft.windows[0].families.roller.design.notes='SYNTHETIC supplier note';
    const spec=validateSupplierSpec(buildSupplierSpec(draft));expect(spec.lines[0]).toMatchObject({widthWhole:36,widthFraction:'3/16',heightFraction:'15/16',notes:'Do not discard this note.',designNotes:'SYNTHETIC supplier note'});
    expect(spec.lines[0].configuration.control_side).toBe('Not applicable');expect(spec.customer).toEqual(draft.customer);
  });
  it('does not copy anything until the next family is explicitly selected',()=>{
    const draft=addMobileQuoteWindow(syntheticDraft());expect(draft.windows[1].activeProductId).toBeNull();expect(draft.windows[1].widthWhole).toBe(0);
  });
  it('same-family repeat copies configuration but leaves every measurement and room fresh',()=>{
    let draft=addMobileQuoteWindow(syntheticDraft());const id=draft.windows[1].id;
    draft=selectSupplierFamily(draft,id,'Roller Shades');const line=draft.windows[1];
    expect(line.activeProductId).toBe('roller');expect(lineInputs(line)).toMatchObject({manufacturer:'Norman',colorFabric:'SYNTHETIC'});
    expect([line.widthWhole,line.heightWhole,line.widthFraction,line.heightFraction,line.room]).toEqual([0,0,'0','0','']);
    expect(line.families.roller.design.options_json.nested).toEqual({lift:'SYNTHETIC'});
    expect(()=>buildSupplierSpec(draft)).toThrow(/width and height/);
  });
  it('new-family selection clears incompatible hidden configuration',()=>{
    const source=syntheticDraft(),id=source.windows[0].id;const next=selectSupplierFamily(source,id,'Shutters');
    expect(next.windows[0].families).toEqual({});expect(next.windows[0].activeProductId).toBeNull();expect(lineInputs(next.windows[0]).manufacturer).toBeNull();
    expect(next.windows[0].widthFraction).toBe('3/16');expect(source.windows[0].activeProductId).toBe('roller');
  });
  it('manufacturer changes discard stale selections without discarding notes or measurements',()=>{
    const d=syntheticDraft(),next=selectSupplierManufacturer(d,d.windows[0].id,'Sundance');
    expect(next.windows[0].families).toEqual({});expect(lineInputs(next.windows[0]).colorFabric).toBe('');expect(next.windows[0].notes).toBe(d.windows[0].notes);expect(next.windows[0].heightFraction).toBe('15/16');
  });
  it('changing first-line configuration cannot overwrite mixed supplier later lines',()=>{
    let d=addMobileQuoteWindow(syntheticDraft());const id=d.windows[1].id;d=selectSupplierFamily(d,id,'Shutters');d=selectSupplierManufacturer(d,id,'Onyx');
    d=selectMobileQuoteProduct(d,id,{productId:'onyx_shutters',productType:'Shutters',design:{...emptyMobileQuoteDesign(id,'Shutters'),supplier:'Onyx',options_json:{color:'SYNTHETIC-ONYX'}}});
    const untouched=structuredClone(d.windows[1]);d=updateMobileQuoteDesign(d,d.windows[0].id,{fabric:'SYNTHETIC NEW'});expect(d.windows[1]).toEqual(untouched);
  });
  it('manual prices belong to the original opening and are never repeated',()=>{
    let d=syntheticDraft();d.windows[0].families.roller.design.unit_price=87;d.windows[0].families.roller.design.options_json.manual_price_override=true;
    expect(buildSupplierSpec(d).lines[0].manualAllInPrice).toBe('87.00');d=addMobileQuoteWindow(d);d=selectSupplierFamily(d,d.windows[1].id,'Roller Shades');
    expect(d.windows[1].families.roller.design.unit_price).toBe(0);expect(d.windows[1].families.roller.design.options_json.manual_price_override).toBeUndefined();
  });
  it('frozen submissions do not change with earlier selector edits',()=>{
    const d=syntheticDraft();d.draftJob!.submittedSpec=buildSupplierSpec(d);expect(selectSupplierFamily(d,d.windows[0].id,'Shutters')).toBe(d);expect(selectSupplierManufacturer(d,d.windows[0].id,'Onyx')).toBe(d);
  });
  it('blocks missing dimensions, malformed fractions, wrong cost multipliers and comparison ambiguity',()=>{
    for(const change of [(s:any)=>s.lines[0].widthWhole=0,(s:any)=>s.lines[0].widthFraction='1/17',(s:any)=>s.multiplier='50%',(s:any)=>s.comparisonMode='duplicate_vendors',(s:any)=>s.lines[0].control=42]){
      const spec=buildSupplierSpec(syntheticDraft()) as any;change(spec);if(spec.lines[0].widthWhole===0)spec.lines[0].widthFraction='0';expect(()=>validateSupplierSpec(spec)).toThrow();
    }
  });
  it('preserves price-group supplier choices but strips computed costs and pricing at every depth',()=>{
    const d=syntheticDraft();d.windows[0].families.roller.design.options_json={fabric_price_group:'SYNTHETIC PG',nested:{authoritative_price_breakdown:{total:12},quote_v2_backend:true,control:'SYNTHETIC'}};
    expect(buildSupplierSpec(d).lines[0].configuration).toMatchObject({fabric_price_group:'SYNTHETIC PG',nested:{control:'SYNTHETIC'}});
    expect(buildSupplierSpec(d).lines[0].configuration.nested).toEqual({control:'SYNTHETIC'});
    const spec=buildSupplierSpec(d);spec.lines[0].configuration.nested={manual_price_override:true};expect(()=>validateSupplierSpec(spec)).toThrow(/protected/);
  });
  it('shipping edits do not pin an old live configurator selection',()=>{
    let d=syntheticDraft(),id=d.windows[0].id;d.windows[0].supplierInputs!.colorFabric='';d.windows[0].families.roller.design.fabric='SYNTHETIC OLD';
    d=patchSupplierInputs(d,id,{shippingBasis:'opening'});d=updateMobileQuoteDesign(d,id,{fabric:'SYNTHETIC NEW'});
    expect(lineInputs(d.windows[0]).colorFabric).toBe('SYNTHETIC NEW');expect(buildSupplierSpec(d).lines[0].colorFabric).toBe('SYNTHETIC NEW');
  });
  it('specific user option overrides survive live default changes',()=>{
    let d=syntheticDraft();d=updateMobileQuoteDesign(d,d.windows[0].id,{fabric:'SYNTHETIC DEFAULT'});expect(lineInputs(d.windows[0]).colorFabric).toBe('SYNTHETIC');
  });
  it('a saved opening price survives a family/manufacturer correction without being copied',()=>{
    let d=syntheticDraft(),id=d.windows[0].id;d=setMobileQuoteLinePrice(d,id,87);d=selectSupplierFamily(d,id,'Shutters');expect(d.windows[0].manualAllInPrice).toBe('87.00');
    d=selectSupplierManufacturer(d,id,'Onyx');expect(d.windows[0].manualAllInPrice).toBe('87.00');d=addMobileQuoteWindow(d);d=selectSupplierFamily(d,d.windows[1].id,'Shutters');expect(d.windows[1].manualAllInPrice).toBeUndefined();
  });
  it('frozen model guards also protect direct room, configuration and manual-price mutations',()=>{
    const d=syntheticDraft(),id=d.windows[0].id;d.draftJob!.submittedSpec=buildSupplierSpec(d);
    expect(selectMobileQuoteRoom(d,id,'Kitchen')).toBe(d);expect(updateMobileQuoteDesign(d,id,{fabric:'WRONG'})).toBe(d);expect(setMobileQuoteLinePrice(d,id,12)).toBe(d);expect(addMobileQuoteWindow(d)).toBe(d);
  });
  it('canonical fingerprints ignore JSON object property order',()=>expect(canonicalJson({b:2,a:1})).toBe(canonicalJson({a:1,b:2})));
});
