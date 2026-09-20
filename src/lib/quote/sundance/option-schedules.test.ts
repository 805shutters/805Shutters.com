import {expect,it} from 'vitest';
import {sundanceOptionEvidence,sundanceAccessoryIssues,clearSundanceAccessoryQuantities} from './option-schedules';
it('keeps SheerView control, valance and oversize retail evidence separate from price eligibility',()=>{
 const v=sundanceOptionEvidence('sheerview',{sundance_sheerview_control:'Continuous Cord Loop',sundance_sheerview_headrail:'Flat Square',sundance_sheerview_cord_option:'Safe Wand',sundance_sheerview_assembly:'Single'},36);
 expect(v.entries.map(e=>e.sourceRetail)).toEqual([63,47]);expect(v.sourceRetailSubtotal).toBe(110);expect(v.customerPriceEligible).toBe(false);
 const cordless={sundance_sheerview_control:'Cordless',sundance_sheerview_headrail:'No Drill',sundance_sheerview_pole_qty:2};
 expect(sundanceOptionEvidence('sheerview',cordless,36).sourceRetailSubtotal).toBe(231);
 expect(sundanceOptionEvidence('sheerview',{},93).entries).toEqual([]);expect(sundanceOptionEvidence('sheerview',{},93.125).entries[0].sourceRetail).toBe(110);
});
it('retains source motor and accessory quantities including asymmetric Somfy switch prices',()=>{
 expect(sundanceOptionEvidence('sheerview',{sundance_sheerview_control:'Rechargeable Motor with Wand',sundance_sheerview_multi_remote_qty:1,sundance_sheerview_usb10_qty:2},36).sourceRetailSubtotal).toBe(688);
 const p=sundanceOptionEvidence('portfolio',{roman_style:'Knife Pleat',sundance_portfolio_control:'Somfy Sonesse Ultra 30',sundance_portfolio_somfy_wall1_qty:1,sundance_portfolio_somfy_wall5_qty:1,sundance_portfolio_somfy_charger_qty:2},36);
 expect(p.entries.map(e=>e.sourceRetail)).toEqual([556,380,40,80]);expect(p.sourceRetailSubtotal).toBe(1136);expect(p.priceBasis).toBe('suggested_retail');
 expect(sundanceOptionEvidence('portfolio',{roman_style:'Hobbled',sundance_portfolio_control:'Power Lift',sundance_portfolio_drop:'Waterfall',sundance_portfolio_front_valance:'Added',sundance_portfolio_li_charger_qty:1},36).sourceRetailSubtotal).toBe(538);
});
it('rejects negative/fractional and incompatible accessory quantities and clears stale quantities',()=>{
 expect(sundanceAccessoryIssues('sheerview',{sundance_sheerview_control:'Cordless',sundance_sheerview_usb6_qty:1})).toEqual(['USB 6-foot cable with charger: incompatible control']);
 for(const q of [-1,.5,Infinity,'bad'])expect(sundanceAccessoryIssues('portfolio',{sundance_portfolio_control:'Power Lift',sundance_portfolio_li_charger_qty:q})).toHaveLength(1);
 expect(clearSundanceAccessoryQuantities('portfolio',{fabric_color_code:'ASE01',sundance_portfolio_li_charger_qty:2})).toMatchObject({fabric_color_code:'ASE01',sundance_portfolio_li_charger_qty:null});
});
it('does not silently price unresolved multi-shade or liner aggregation',()=>{
 const p=sundanceOptionEvidence('portfolio',{sundance_portfolio_assembly:'Two on one',sundance_portfolio_liner:'BO01 Black-Out White'},36);expect(p.unresolved).toHaveLength(2);expect(p.customerPriceEligible).toBe(false);
});
