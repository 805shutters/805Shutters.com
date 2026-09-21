import {describe,it,expect} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {quoteQuantityLabel} from './quantity-label';
import {PricingAuditPanel} from '@/mts-quote/components/crm/quote-builder/PricingAuditPanel';
import {PricingAuditPanel as LegacyAudit} from '@/mts-quote-v1/components/crm/quote-builder/PricingAuditPanel';
const cases=[['norman_smartdrape_replacement_vanes','', 'packs'],['norman_roman_fabric_by_yard','', 'fabric cuts'],['norman_roman_pillow_covers','', 'pillow covers'],['lotus_vertical_blinds','lotus_cvh_steel_headrail_custom','headrails'],['lotus_vertical_blinds','lotus_cvv_vertical_vanes_custom','vanes'],['honeycomb','','windows']];
describe('natural quantity presentation',()=>{
 it.each(cases)('labels %s / %s without changing amounts', (product,program,plural)=>{
 const options={catalog_product_id:product,catalog_program_id:program,base_price:100};
 expect(quoteQuantityLabel(2,options)).toBe(`2 ${plural}`);
 for(const component of [PricingAuditPanel,LegacyAudit]){
 const html=renderToStaticMarkup(createElement(component,{productType:'Test',supplier:'Norman',programName:'Test',widthIn:0,heightIn:0,rawSqft:null,billableSqft:null,quantity:2,savedUnitPrice:100,options,currentRetailPerSqft:null,wholesaleRate:null,authoritativeWholesaleCost:null,tariffPercent:0,surcharges:[]}));
 expect(html).toContain(`Line total (2 ${plural})`);expect(html).toContain('$200');expect(html).toContain('$100');
 }
 });
});
