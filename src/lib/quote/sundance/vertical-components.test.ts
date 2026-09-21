import{expect,it}from'vitest';
import{createElement}from'react';
import{renderToStaticMarkup}from'react-dom/server';
import{SundanceVerticalComponents}from'@/components/crm/SundanceVerticalComponents';
import{getQuoteDesignDetails}from'@mts/lib/quoteDesignDetails';
import type{SalesQuoteDesign}from'@mts/types/quote';
import{sundanceVerticalSource}from'./vertical-assortment';
import{sundanceVerticalComponentEvidence as evidence,lookupSundanceVaneSource,sundanceVaneSchedules,sundanceVerticalStackRows,sundanceVerticalStackReference,SUNDANCE_VERTICAL_COMPONENT_KEY as KEY}from'./vertical-components';
import{sundanceVerticalOptionEvidence}from'./vertical-configuration';
import{sundanceChateauWandReference}from'./horizontal-configuration';
function config(group='1',kind='Vanes only',length=60,quantity=2){const m=sundanceVerticalSource.rows.find(r=>r.priceGroup===group)!;return{fabric_color_id:m.id,catalog_program_id:m.programId,sundance_vertical_fulfillment:kind,[KEY]:{version:1,kind,fabricId:m.id,lengthInches:length,quantity,sizeBasis:'Net component size'}};}
it.each([['1',11,24],['1A',12,28],['2',14,34],['3',15,42],['4',15,43],['5',19,58],['6',23,70]])('uses exact first/last vane-column entries for group%s', (group,first,last)=>{
 expect(lookupSundanceVaneSource(String(group),36)).toMatchObject({unitSource:first,gridHeight:36});
 expect(lookupSundanceVaneSource(String(group),144)?.unitSource).toBe(last);
 if(group!=='5')expect(evidence(config(String(group),'Vanes only',36,1))).toMatchObject({sourceAmount:first,sourceBasis:'unverified',customerPriceEligible:false});
 else expect(sundanceVerticalSource.rows.some(r=>r.priceGroup==='5')).toBe(false);
});
it('preserves97.5-inch row and independently measured component quantity',()=>{
 expect(evidence(config('2','Vanes only',97.5,3))).toMatchObject({gridHeight:97.5,sourceUnitPrice:26,sourceAmount:78});
 expect(evidence(config('2','Vanes only',97.5625,3))).toMatchObject({gridHeight:108,sourceUnitPrice:27,sourceAmount:81});
 expect(sundanceVaneSchedules.every(s=>s.prices.length===10)).toBe(true);
});
it('prices each measured track with its own36-inch minimum and does not use opening width',()=>{
 const c=config('1','Track only',20,2);expect(evidence(c)).toMatchObject({sourceUnitPrice:34.199999999999996,sourceBasis:'net'});expect(evidence(c).sourceAmount).toBeCloseTo(68.4);
 expect(sundanceVerticalOptionEvidence(c,192).netSubtotal).toBeCloseTo(68.4);
 expect(evidence(config('1','Track only',96,1)).sourceAmount).toBeCloseTo(91.2);
});
it('keeps deductions, stale identities, invalid quantities and malformed records held',()=>{
 for(const c of [config('1','Vanes only',0),config('1','Vanes only',145),config('1','Vanes only',60,1.5),{...config(),fabric_color_id:'other'}])expect(evidence(c).sourceAmount).toBeNull();
 const c=config();c[KEY].sizeBasis='Opening size — factory deduction required';expect(evidence(c).issues[0]).toContain('confirmed component size');expect(evidence(c).sourceAmount).toBeNull();
 c[KEY].version=2;expect(evidence(c).sourceAmount).toBeNull();
});
it('retains exact source approximate stacking rows without invented interpolation',()=>{
 expect(sundanceVerticalStackRows).toHaveLength(45);expect(sundanceVerticalStackReference(18)).toEqual({width:18,vanes:6,approximateStack:4.5});expect(sundanceVerticalStackReference(192)).toEqual({width:192,vanes:62,approximateStack:29});expect(sundanceVerticalStackReference(42)).toEqual({width:42,vanes:14,approximateStack:8});expect(sundanceVerticalStackReference(42.0625)).toBeNull();
});
it('shows separate component inputs and hides internal identities from customer details',()=>{
 const c=config('2','Vanes only',60,14),html=renderToStaticMarkup(createElement(SundanceVerticalComponents,{options:c,widthInches:42,onChange:()=>{}}));expect(html).toContain('Sundance vertical component size basis');expect(html).toContain('252.00');expect(html).toContain('retail/net basis requires confirmation');expect(html).toContain('approximately 8-inch stack');
 const details=getQuoteDesignDetails({options_json:{[KEY]:c[KEY]}} as unknown as SalesQuoteDesign);expect(details).toEqual([{label:'Vertical component',value:'Vanes only: 14 × 60 inches'}]);
 expect(evidence(JSON.parse(JSON.stringify(c)))).toEqual(evidence(c));
});
it('shows the Chateau wood wand schedule only within its documented height range',()=>{
 for(const[h,w]of [[12,18],[42,18],[42.0625,24],[54,24],[66,30],[72,36],[78,42],[84,48],[96,54]])expect(sundanceChateauWandReference(h)?.wandLength).toBe(w);
 expect(sundanceChateauWandReference(96.0625)).toBeNull();expect(sundanceChateauWandReference(0)).toBeNull();
});
