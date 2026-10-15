import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DRAPERY_STYLES, DRAPERY_CATALOG_PRODUCT, draperySketch, draperyReferencePhoto, draperyStyleOptions, parseDraperyPrice } from './drapery';
import { contractIllustration } from './contract-illustrations';
import { ContractProductIllustration } from '@/components/quote/ContractProductIllustration';
import { customerConfigurationFromSelection, v2CustomerConfigurationOptions } from '@/lib/crm/sales-quote-v2-customer-configuration';
import { describeDesign } from '@/lib/crm/public-quote';
import { getQuoteDesignDetails } from '@mts/lib/quoteDesignDetails';
import { captureQuoteDesignEdit, applyQuoteDesignEdit } from '@mts/lib/quoteDesignEdit';
import { quoteV2DesignPatch } from '@mts/lib/quoteV2ServerClient';
import { buildCatalogSelectionPatch } from '@mts/components/crm/quote-builder/DesignCard';
import type { SalesQuoteDesign } from '@mts/types/quote';
import type { SelectionContext } from '@/lib/quote-v2/core';

describe('manual drapery quote integration', () => {
  it('starts unpriced with no borrowed supplier/catalog pricing configuration', () => {
    expect(buildCatalogSelectionPatch({}, DRAPERY_CATALOG_PRODUCT)).toEqual({ supplier:null, material:null, fabric:null, unit_price:0, options_json:{} });
  });
  it.each(DRAPERY_STYLES)('round-trips $title into customer contract artwork and descriptions', style => {
    const configuration = draperyStyleOptions(style.id, {fabric:'Natural linen', internal_cost:1234});
    const customer = customerConfigurationFromSelection({manufacturerId:'custom', configuration, options:{}} as unknown as SelectionContext);
    const options = v2CustomerConfigurationOptions(JSON.parse(JSON.stringify(customer)));
    expect(options).toContain(`Drapery style: ${style.title}`);
    expect(options).toContain(`Description: ${style.description}`);
    expect(options.join(' ')).not.toMatch(/internal_cost|1234/);
    const illustration = contractIllustration('Drapery', options);
    expect(illustration?.src).toBe(draperySketch(style));
    expect(existsSync(`public${draperySketch(style)}`)).toBe(true);
    expect(renderToStaticMarkup(createElement(ContractProductIllustration, {productType:"Drapery", options}))).toContain(draperySketch(style));
    const photo = draperyReferencePhoto(style);
    if (photo) expect(existsSync(`public${photo}`)).toBe(true);
    const customerDesign = describeDesign({product_id:'custom',program_id:'custom',fabric:'Custom pricing',details:{quote_v2_customer_configuration:customer}} as never);
    expect(customerDesign.productName).toBe('Drapery');
    expect(customerDesign.styleName).toBe('Natural linen');
    expect(contractIllustration(customerDesign.productName, customerDesign.options)?.src).toBe(draperySketch(style));
  });
  it.each(['', ' ', '-1', '1e3', 'NaN', '$100', '10.001'])('rejects invalid/empty price %j', value => expect(parseDraperyPrice(value)).toBeNull());
  it.each([['0',0],['12.34',12.34],['1000',1000]])('accepts explicit manual price %s', (value, expected) => expect(parseDraperyPrice(String(value))).toBe(expected));
  it('preserves the saved manual price while editing style/details, and omits pricing internals from contract', () => {
    const original: SalesQuoteDesign = {id:'d',line_item_id:'l',variant:'A',product_type:'Drapery',supplier:null,material:null,louver_size:null,tilt_type:null,hinge_color:null,panel_config:null,mount_type:null,shade_type:null,lift_system:null,valance:null,fabric:null,motor_type:null,remote_type:null,hard_surface_install:false,ladder_over_15ft:false,requires_takedown:false,notes:null,created_at:'',unit_price:123.45,options_json:{...draperyStyleOptions('grommet',{}),manual_price_override:true,manual_merchandise_unit_price:123.45}};
    const edit = captureQuoteDesignEdit({line_item_id:'l',variant:'A',options_json:draperyStyleOptions('modern-ring-top', original.options_json)}, original);
    const saved = {...original,...applyQuoteDesignEdit(edit,original)};
    expect(saved.unit_price).toBe(123.45);
    expect(saved.options_json.manual_price_override).toBe(true);
    const patch = quoteV2DesignPatch(saved);
    expect(patch.optionsJson).toMatchObject({drapery_style:'Modern Ring Top'});
    expect(patch.optionsJson).not.toHaveProperty('manual_price_override');
    const details = getQuoteDesignDetails(saved);
    expect(details).toContainEqual({label:'Drapery style',value:'Modern Ring Top'});
    expect(JSON.stringify(details)).not.toMatch(/manual_price|manual_merchandise/);
  });
  it('keeps custom descriptions and hardware when selecting another style or the same style again', () => {
    const options = {...draperyStyleOptions('grommet', {}), drapery_description:'Custom linen and hem', drapery_hardware:'Customer pole'};
    for (const id of ['grommet', 'modern-ring-top']) expect(draperyStyleOptions(id, options)).toMatchObject({drapery_description:'Custom linen and hem', drapery_hardware:'Customer pole'});
    expect(draperyStyleOptions('modern-ring-top', draperyStyleOptions('grommet', {}))).toMatchObject({drapery_description:DRAPERY_STYLES[7].description});
  });
  it('does not invent a style for unselected/unknown drapery or change Smart Drapes artwork', () => {
    expect(contractIllustration('Drapery', [])).toBeNull();
    expect(contractIllustration('Drapery', ['Drapery style: Unknown'])).toBeNull();
    expect(contractIllustration('Smart Drapes', [])?.src).toContain('smart-drapes.webp');
    expect(draperyReferencePhoto({id:'modern-ring-top'})).toBeNull();
  });
});
