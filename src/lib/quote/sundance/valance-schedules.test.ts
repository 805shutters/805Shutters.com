import {expect,it} from 'vitest';
import {lookupSundanceValanceSource,sundanceValanceSchedules} from './valance-schedules';
it('keeps all five width schedules and 61 cells separate from shade programs',()=>{
 expect(sundanceValanceSchedules).toHaveLength(5);expect(sundanceValanceSchedules.reduce((n,row)=>n+row.widths.length,0)).toBe(61);
});
it.each([['a',275,580],['b',303,618],['c',313,631],['d',346,709]])('matches independently read Portfolio %s first/last rates',(group,first,last)=>{
 const id=`sundance_portfolio_roman_valance_p25_t1_${group}`;
 expect(lookupSundanceValanceSource(id,24,18)?.sourceRetail).toBe(first);
 expect(lookupSundanceValanceSource(id,96,18)?.sourceRetail).toBe(last);
 expect(lookupSundanceValanceSource(id,96,18,true)?.sourceRetail).toBe(Math.round(Number(last)*1.1*100)/100);
 expect(lookupSundanceValanceSource(id,96,18.0625)).toBeNull();expect(lookupSundanceValanceSource(id,96)).toBeNull();expect(lookupSundanceValanceSource(id,96.0625,18)).toBeNull();
});
it('matches independently read SheerView values and fractional width boundaries',()=>{
 const id='sundance_sheerview_valance_p24_t3';
 expect(lookupSundanceValanceSource(id,24)).toMatchObject({sourceRetail:26,customerPriceEligible:false});
 expect(lookupSundanceValanceSource(id,24.0625)).toMatchObject({sourceRetail:37,gridWidth:30});
 expect(lookupSundanceValanceSource(id,116)?.sourceRetail).toBe(152);
 for(const width of [0,-1,NaN,116.0625])expect(lookupSundanceValanceSource(id,width)).toBeNull();
 expect(lookupSundanceValanceSource(id,24,undefined,true)).toBeNull();
});
