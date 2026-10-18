import {describe,it,expect} from 'vitest';
import {syntheticDraft} from './mobile-supplier-test-fixture';
import {mobileQuoteFieldPurpose} from '@/lib/quote/mobile-quote-field-policy';
import {mobileControlSidePolicy} from '@/lib/quote/mobile-control-side';
import {applyMobileSharedSelections} from './mobile-quote-shared-selections';
import {addMobileQuoteWindow,updateMobileQuoteDesign} from './mobile-quote-draft';
import {v2CustomerConfigurationOptions} from './sales-quote-v2-customer-configuration';
import {lineInputs,buildSupplierSpec} from './mobile-supplier-spec';
describe('quick quote product policies',()=>{
 it('distinguishes price identity, required contract detail and omitted build detail',()=>{
 expect(mobileQuoteFieldPurpose('lift_system')).toBe('pricing');expect(mobileQuoteFieldPurpose('json:control_side')).toBe('contract');expect(mobileQuoteFieldPurpose('sundance_blind_wand')).toBe('contract');expect(mobileQuoteFieldPurpose('sundance_blind_assembly')).toBe('build');expect(mobileQuoteFieldPurpose('contract_wand_drop_inches')).toBe('build');expect(mobileQuoteFieldPurpose('unverified_new_field')).toBe('review');
 });
 it('requires a side for faux wood and continuous loop cellular, but not a cordless shade',()=>{
 const d=syntheticDraft().windows[0].families.roller.design;d.product_type='Faux Wood Blinds';expect(mobileControlSidePolicy(d,'Cordless').required).toBe(true);d.product_type='Honeycomb Shades';expect(mobileControlSidePolicy(d,'Continuous Cord Loop')).toMatchObject({required:true,choices:['Left','Right']});expect(mobileControlSidePolicy(d,'Cordless')).toMatchObject({required:false,choices:['Not applicable']});d.supplier='Sundance';d.options_json.catalog_product_id='sundance_basicvue';d.product_type='Faux Wood Blinds';expect(mobileControlSidePolicy(d,'Cordless')).toMatchObject({required:true,choices:['Left']});
 });
 it('native Sundance side supersedes stale supplement and survives supplier serialization',()=>{
 let draft=syntheticDraft();const line=draft.windows[0];line.supplierInputs!.controlSide='Left';line.families.roller.design.supplier='Sundance';draft=updateMobileQuoteDesign(draft,line.id,{options_json:{...line.families.roller.design.options_json,sundance_blind_wand:'Right'}},true);expect(lineInputs(draft.windows[0]).controlSide).toBe('Right');expect(buildSupplierSpec(draft).lines[0].configuration.control_side).toBe('Right');expect(v2CustomerConfigurationOptions({manufacturerId:'sundance',selections:{control_side:'Right'}})).toContain('Control side: Right');
 });
 it('Apply to All copies choices, preserves room and size, and never copies manual prices',()=>{
 let draft=syntheticDraft();draft.draftJob!.selectionMode='all';draft=addMobileQuoteWindow(draft);const target=draft.windows[1];target.room='Second room';target.widthWhole=45;target.heightWhole=70;draft.windows[0].families.roller.design.options_json.manual_price_override=true;const result=applyMobileSharedSelections(draft,draft.windows[0].id);expect(result.windows[1]).toMatchObject({room:'Second room',widthWhole:45,heightWhole:70,activeProductId:'roller'});expect(result.windows[1].families.roller.design.options_json.manual_price_override).toBeUndefined();expect(result.windows[1].families.roller.design.unit_price).toBe(0);draft.draftJob!.selectionMode='individual';expect(applyMobileSharedSelections(draft,draft.windows[0].id)).toBe(draft);
 });
});
