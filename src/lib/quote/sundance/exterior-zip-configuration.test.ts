import { expect,it } from 'vitest';
import { getCatalogRestrictionWarnings } from '@/mts-quote/lib/catalogRestrictionWarnings';
import { sundanceExteriorZipColors,sundanceExteriorZipColorPatch } from './exterior-zip';
import { validateSundanceExteriorZipConfiguration as validate } from './exterior-zip-configuration';
const configuration=sundanceExteriorZipColorPatch({},sundanceExteriorZipColors[0].id)!;
it('accepts published Zip endpoints without treating the absent grid as an oversize violation',()=>{
 for(const [widthInches,heightInches] of [[96,84],[220,110]]){
  expect(validate({widthInches,heightInches,programId:null,configuration})).toEqual([]);
  expect(getCatalogRestrictionWarnings({productId:'sundance_exterior_zip',widthInches,heightInches,programId:null})).toEqual([]);
 }
});
it('enforces the independent published 220 by 110 envelope',()=>{
 expect(validate({widthInches:220.125,heightInches:110.125,programId:null,configuration}).map(i=>i.ruleId)).toEqual(['sundance-zip-max-width','sundance-zip-max-height']);
 expect(validate({widthInches:NaN,heightInches:84,programId:null,configuration}).map(i=>i.ruleId)).toContain('sundance-zip-positive-dimensions');
});
it('rejects stale grids and mismatched material identities without granting customer price eligibility',()=>{
 expect(validate({widthInches:96,heightInches:84,programId:'stale-grid',configuration}).map(i=>i.ruleId)).toContain('sundance-zip-material-route');
 expect(validate({widthInches:96,heightInches:84,programId:null,configuration:{...configuration,sundance_exterior_price_class:'Premium'}}).map(i=>i.ruleId)).toContain('sundance-zip-material-route');
});
