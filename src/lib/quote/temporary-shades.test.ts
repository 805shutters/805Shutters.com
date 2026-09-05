import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { ContractProductIllustration } from '@/components/quote/ContractProductIllustration';
import { temporaryShadeSelected } from './temporary-shades';
import { getQuoteDesignDetails } from '@mts/lib/quoteDesignDetails';
import type { SalesQuoteDesign } from '@mts/types/quote';
import { quoteV2DesignPatch } from '@mts/lib/quoteV2ServerClient';
import { selectionContextFromExactInterface } from '@/lib/quote-v2/exact-interface-adapter';
import { customerConfigurationFromSelection, v2CustomerConfigurationOptions } from '@/lib/crm/sales-quote-v2-customer-configuration';
import { customerQuoteOptions } from '@/lib/crm/customer-quote-branding';
import { buildCleanCatalogSelectionOptions } from '@mts/components/crm/quote-builder/DesignCard';

describe('temporary shade companion', () => {
  it.each(['Temporary Shade: Yes', 'Complimentary temporary shade: Free', 'Complementary temporary paper shade: Free'])('retains included shades across label revisions: %s', option => {
    expect(temporaryShadeSelected([option])).toBe(true);
  });
  it.each(['Shutters','Roller Shades','Honeycomb Shades','Roman Shades','Sheer Shades','Faux Wood Blinds','Wood Blinds','Mini Blinds','Vertical Blinds','Smart Drapes','Specialty Product'])('is available even without approved primary art for %s', productType => {
    const html = renderToStaticMarkup(createElement(ContractProductIllustration, {productType,options:['Temporary Shade: Yes']}));
    expect(html).toContain('data-temporary-shade="included"');
    expect(html).toContain('temporary-shade.webp');
    expect(html).toContain('Complementary temporary paper shade');
    expect(html).toContain('Free');
  });
  it.each([[], ['Temporary Shade: No'], ['Temporary Shade: false'], ['Temporary Shade: Maybe'], ['Temporary Shade: Yes','Temporary Shade: No']])('never infers an included item from missing/negative/conflicting selections %j', (...values) => {
    expect(temporaryShadeSelected(values as string[])).toBe(false);
  });
  it('places the companion after the product and remote, with no change to product artwork', () => {
    const html = renderToStaticMarkup(createElement(ContractProductIllustration, {productType:'Roller Shades',options:['Lift System: Motorized','Temporary Shade: Yes']}));
    expect(html.indexOf('data-temporary-shade')).toBeGreaterThan(html.indexOf('class="remote"'));
    expect(html).toContain('roller.webp');
    expect(html).toContain('remote.webp');
  });
  it('survives legacy details and the V2 save/projection boundary without adding a price', () => {
    const design = {product_type:'Roller Shades',options_json:{temporary_shade:true,control_side:'Left'},unit_price:500} as unknown as SalesQuoteDesign;
    const details = getQuoteDesignDetails(design).map(d=>`${d.label}: ${d.value}`);
    expect(temporaryShadeSelected(details)).toBe(true);
    expect(quoteV2DesignPatch(design)).toMatchObject({optionsJson:{temporary_shade:true}});
    const selection = selectionContextFromExactInterface({id:'line',product_type:'Roller Shades',width_whole:36,height_whole:60,width_fraction:'0',height_fraction:'0',quantity:1} as never,design,{productId:'norman-soluna-roller-shades',programId:null});
    const configuration=customerConfigurationFromSelection(selection);
    const publicOptions=customerQuoteOptions(v2CustomerConfigurationOptions(configuration));
    expect(temporaryShadeSelected(publicOptions)).toBe(true);
    expect(publicOptions).toContain('Complementary temporary paper shade: Free');
    expect(design.unit_price).toBe(500);
    expect(selection.options).not.toHaveProperty('temporary_shade');
  });
  it('preserves the optional shade when a manufacturer catalog changes',()=>{
    expect(buildCleanCatalogSelectionOptions({temporary_shade:true},{id:'next-product'},null)).toMatchObject({temporary_shade:true});
  });
});
