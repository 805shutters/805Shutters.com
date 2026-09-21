import{it,expect}from'vitest';
import{createElement}from'react';
import{renderToStaticMarkup}from'react-dom/server';
import type{SelectionContext}from'@/lib/quote-v2/core';
import{createSundanceWaldenTwin,readSundanceWaldenTwin,sundanceWaldenTwinDescriptions,SUNDANCE_WALDEN_TWIN_KEY,type SundanceWaldenTwin}from'./walden-twin-records';
import{validateSundanceWaldenTwin,sundanceWaldenTwinFlushDepth,sundanceWaldenTwinLinerEvidence,sundanceWaldenTwinControls}from'./walden-twin';
import{sundanceWaldenChoices,sundanceWaldenLinerColors}from'./supplemental-configuration';
import{sundanceWaldenSource}from'./walden-assortment';
import{SundanceWaldenTwinOptions}from'@/components/crm/SundanceWaldenTwinOptions';
import{detailDisplayValue}from'../product-options';
function fixture(p='sundance_walden_premier'){
 const row=sundanceWaldenSource.rows.find(r=>r.productId===p)!,liner=sundanceWaldenChoices(p,'liner')[0];
 const c={fabric_color_id:row.id,catalog_program_id:row.programId,sundance_walden_control:'Cordless',walden_movable_liner:'Yes',catalog_sundance_liner_grid_id:liner.id,walden_liner:liner.name,walden_liner_color:sundanceWaldenLinerColors(p,liner.id)[0],sundance_walden_assembly:'Single',mount_type:'Inside',sundance_walden_flush:'Yes',sundance_walden_depth:p.endsWith('premier')?4.5:4.375};
 const twin=createSundanceWaldenTwin(p,c,36,60,['woven','liner'])!;twin.frontControlSide='Not applicable';twin.liner={...twin.liner,widthInches:36,heightInches:60,control:'Cordless',controlSide:'Not applicable'};
 return{c,twin};
}
function selection(twin:SundanceWaldenTwin,extra:Record<string,unknown>={}){return{productId:twin.productId,widthInches:36,heightInches:60,configuration:{...fixture(twin.productId).c,...extra,[SUNDANCE_WALDEN_TWIN_KEY]:twin}as SelectionContext['configuration']};}
const ids=(t:SundanceWaldenTwin,extra:Record<string,unknown>={})=>validateSundanceWaldenTwin(selection(t,extra)).map(i=>i.ruleId);
it.each(['sundance_walden_premier','sundance_walden_select'])('retains separate %s front and movable liner roles without copying dimensions or accessories',p=>{
 const{c,twin}=fixture(p),blank=createSundanceWaldenTwin(p,c,36,60,['a','b'])!;
 expect(blank.front.widthInches).toBe(36);expect(blank.liner.widthInches).toBeNull();expect(blank.liner.accessoryQuantities).toEqual({});
 expect(readSundanceWaldenTwin(JSON.parse(JSON.stringify(twin)))).toEqual(twin);expect(ids(twin)).toEqual([]);
 expect(sundanceWaldenTwinLinerEvidence(twin).liner?.customerPriceEligible).toBe(false);
});
it.each([
 ['sundance_walden_premier','Cordless',4.5],['sundance_walden_select','Cordless',4.375],
 ['sundance_walden_premier','Clutch and Loop',4.5],['sundance_walden_select','Clutch and Loop',4.5],
 ['sundance_walden_premier','Standard LI Motor',5.5],['sundance_walden_select','Standard LI Motor',6.5],
] as const)('checks independently transcribed %s %s twin flush depth %s', (p,control,depth)=>{
 const{twin}=fixture(p);twin.front.control=control;twin.liner.control=control;
 expect(sundanceWaldenTwinFlushDepth(p,twin)).toBe(depth);
 expect(ids(twin,{sundance_walden_control:control,sundance_walden_depth:depth-.0625})).toContain('sundance.walden.twin_depth');
 expect(ids(twin,{sundance_walden_control:control,sundance_walden_depth:depth})).not.toContain('sundance.walden.twin_depth');
});
it('does not infer mixed-control headrail depth or permit TDBU/Pro Wand twins',()=>{
 const{twin}=fixture();twin.liner.control='Standard LI Motor';expect(sundanceWaldenTwinFlushDepth(twin.productId,twin)).toBeNull();expect(ids(twin)).toContain('sundance.walden.twin_mixed_depth');
 for(const control of ['Pro Wand','Cordless TDBU']){twin.liner.control=control;expect(ids(twin)).toContain('sundance.walden.twin_control');}
 expect(sundanceWaldenTwinControls('sundance_walden_select')).not.toContain('Power Lift LI Motor');
});
it('blocks stale front material/control/size, liner identity and inactive records',()=>{
 const{twin}=fixture();expect(ids(twin,{catalog_program_id:'wrong'})).toContain('sundance.walden.twin_front_snapshot');
 expect(ids(twin,{walden_liner_color:'wrong'})).toContain('sundance.walden.twin_liner_identity');
 expect(ids(twin,{walden_movable_liner:'No'})).toContain('sundance.walden.twin_stale');
 expect(validateSundanceWaldenTwin({...selection(twin),widthInches:42}).map(i=>i.ruleId)).toContain('sundance.walden.twin_front_snapshot');
 twin.liner.id=twin.front.id;expect(ids(twin)).toContain('sundance.walden.twin_records');
});
it('validates independent rear size, control side, chain and source grid',()=>{
 const{twin}=fixture();twin.liner.widthInches=14.9375;expect(ids(twin)).toContain('sundance.walden.twin_dimensions');
 twin.liner.widthInches=96.0625;expect(ids(twin)).toContain('sundance.walden.twin_liner_grid');
 twin.liner.widthInches=36;twin.liner.control='Clutch and Loop';expect(ids(twin)).toContain('sundance.walden.twin_chain');expect(ids(twin)).toContain('sundance.walden.twin_side');
});
it('charges rear motor/accessory evidence once without another base/twin surcharge or copied front accessories',()=>{
 const{twin}=fixture('sundance_walden_select');twin.liner.control='Somfy Sonesse Ultra 30';twin.liner.accessoryQuantities={somfy_charger:1,situo5:1};
 const e=sundanceWaldenTwinLinerEvidence(twin);expect(e.options.entries.map(x=>[x.label,x.retail])).toEqual([['Somfy Sonesse Ultra 30',556],['Somfy Situo 5-channel remote × 1',185],['Somfy charger with 6-foot cable × 1',80]]);expect(e.options.sourceRetailSubtotal).toBe(821);expect(e.options.customerPriceEligible).toBe(false);
 twin.liner.accessoryQuantities.situo5=.5;expect(ids(twin)).toContain('sundance.walden.twin_accessory');twin.liner.accessoryQuantities={unrecognized:1};expect(ids(twin)).toContain('sundance.walden.twin_accessory_key');
});
it('exposes the separate liner control and dimensions without raw supplier financial metadata in customer output',()=>{
 const{c,twin}=fixture();const html=renderToStaticMarkup(createElement(SundanceWaldenTwinOptions,{productId:twin.productId,options:{...c,[SUNDANCE_WALDEN_TWIN_KEY]:twin},widthInches:36,heightInches:60,onUpdateFields:()=>{}}));
 expect(html).toContain('Sundance twin liner width');expect(html).toContain('Sundance twin Liner control');
 const publicText=detailDisplayValue(twin.productId,SUNDANCE_WALDEN_TWIN_KEY,twin)!;expect(publicText).toContain(twin.liner.material);expect(publicText).toContain('36 × 60 inches');expect(publicText).not.toContain(twin.liner.gridId);expect(sundanceWaldenTwinDescriptions(twin)).toHaveLength(2);
});
it('rejects malformed and unsupported record versions',()=>{
 const{twin}=fixture();for(const bad of [{...twin,version:2},{...twin,liner:{...twin.liner,accessoryQuantities:[]}},{...twin,front:null}])expect(readSundanceWaldenTwin(bad)).toBeNull();
});
