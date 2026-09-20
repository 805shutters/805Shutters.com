import { expect, it } from 'vitest';
import { sundanceCellularAccessories, sundanceCellularAccessoryKey as key, sundanceCellularOptionEvidence as evidence, sundanceCellularAccessoryIssues } from './cellular-option-schedules';
import { sundanceCellularSystemPatch } from './cellular-configuration';
it.each([
 ['Cordless',12,163,24],['Cordless',24,163,24],['Cordless',24.0625,187,30],['Cordless',36,194,36],['Cordless',84.0625,326,96],['Cordless',96,326,96],
 ['Cordloop',12,187,24],['Cordloop',36,214,36],['Cordloop',84.0625,326,90],['Cordloop',120,384,120],
])('preserves independent %s source width boundaries %s', (system,width,price,matchedWidth)=>{
 const e=evidence({sundance_cellular_system:system},Number(width));expect(e.retailSubtotal).toBe(price);expect(e.netSubtotal).toBe(0);expect(e.entries[0].matchedWidth).toBe(matchedWidth);expect(e.customerPriceEligible).toBe(false);
});
it('does not manufacture a rate beyond the control schedule or combine retail and net',()=>{
 for(const width of [0,NaN,96.0625])expect(evidence({sundance_cellular_system:'Cordless'},width).unresolved).toHaveLength(1);
 const day=evidence({sundance_cellular_system:'Cordless Day/Night'},36);expect(day.retailSubtotal).toBe(500);expect(day.netSubtotal).toBe(0);expect(day.unresolved[0]).toContain('Both fabrics');
 const sky=evidence({sundance_cellular_system:'Skylight'},36);expect(sky.netSubtotal).toBe(116);expect(sky.retailSubtotal).toBe(0);
});
it('reconciles all22 motor accessory source amounts and preserves mixed controls ambiguity',()=>{
 expect(sundanceCellularAccessories).toHaveLength(22);
 expect(sundanceCellularAccessories.map(a=>a.net)).toEqual([36,110,50,110,66,83,290,154,171,182,80,100,260,22,25,75,50,25,90,90,75,125]);
 const somfy=evidence({sundance_cellular_system:'Somfy Cord Lift WireFree TL25',[key('situo_5')]:1,[key('somfy_charger')]:2},36);expect(somfy.netSubtotal).toBe(375);expect(somfy.retailSubtotal).toBe(0);
 const sim=evidence({sundance_cellular_system:'Simphony Concerto TDBU',[key('concerto_remote')]:1,[key('simphony_charger')]:1},36);expect(sim.netSubtotal).toBe(565);
 const conflict=evidence({sundance_cellular_system:'Somfy Cord Lift WireFree TL25',[key('smoove_multi')]:1},36);expect(conflict.unresolved[0]).toContain('table says5-channel');expect(conflict.entries[1].unitPrice).toBe(100);
});
it('validates quantities and control compatibility; changing motor clears stale allocations',()=>{
 for(const value of [-1,.5,'invalid',Infinity])expect(sundanceCellularAccessoryIssues({sundance_cellular_system:'Somfy Cord Lift WireFree TL25',[key('situo_5')]:value})[0].explanation).toContain('whole number');
 expect(sundanceCellularAccessoryIssues({sundance_cellular_system:'Cordless',[key('situo_5')]:1})[0].explanation).toContain('not a documented accessory');
 const config={sundance_cellular_system:'Somfy Cord Lift WireFree TL25',[key('situo_5')]:1,unrelated:'preserved'};
 const next=sundanceCellularSystemPatch(config,'Cordless');expect(next[key('situo_5')]).toBeUndefined();expect(next.unrelated).toBe('preserved');
 expect(sundanceCellularAccessoryIssues({sundance_cellular_system:'Simphony Cell Shade WireFree',[key('simphony_transformer')]:1})[0].page).toBe(17);
});
it('keeps specialty and non-perfect arch trim net charges separate from fabric bases',()=>{
 const e=evidence({sundance_cellular_system:'Specialty Shape',sundance_cellular_shape:'Standard Arch',sundance_cellular_shape_geometry:'Non-perfect'},36);
 expect(e.netSubtotal).toBe(216);expect(e.retailSubtotal).toBe(0);expect(e.unresolved[0]).toContain('base pricing');
 expect(evidence({sundance_cellular_system:'Specialty Shape',sundance_cellular_shape:'Circle',sundance_cellular_shape_geometry:'Non-perfect'},36).netSubtotal).toBe(116);
});
it('preserves cut-out and both extension-pole net schedules with geometry review',()=>{
 const e=evidence({sundance_cellular_system:'Cordless',sundance_cellular_cutout_qty:2,sundance_cellular_pole_short_qty:1,sundance_cellular_pole_long_qty:1},36);
 expect(e.retailSubtotal).toBe(194);expect(e.netSubtotal).toBe(190);expect(e.unresolved).toContain('Cut-out positions and dimensions require manufacturer/template verification; the $25 net unit surcharge does not approve the geometry.');
 expect(sundanceCellularAccessoryIssues({sundance_cellular_pole_short_qty:.5})[0].explanation).toContain('whole number');
});
