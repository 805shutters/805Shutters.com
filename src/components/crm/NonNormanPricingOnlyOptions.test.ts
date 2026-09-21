import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LotusRollerOptions } from './LotusRollerOptions';
import { SundanceCellularConfiguration } from './SundanceCellularConfiguration';
import { SundanceHorizontalConfiguration } from './SundanceHorizontalConfiguration';
import { SundanceWaldenConfiguration } from './SundanceWaldenConfiguration';
import { SundanceVerticalConfiguration } from './SundanceVerticalConfiguration';
import { SundanceSheerviewOptions } from './SundanceSheerviewOptions';
import { SundancePortfolioOptions } from './SundancePortfolioOptions';
import type { SalesQuoteDesign } from '@mts/types/quote';

const common = { widthInches: 36, heightInches: 60, onUpdateFields: () => { throw new Error('Rendering must preserve the saved design'); } };
const render = (pricingOnly: boolean, product: string) => {
  const options = Object.freeze({ mount_type: 'Inside', sundance_cellular_system: 'Verticell', sundance_walden_style: 'Standard', sundance_blind_depth: 4, sundance_portfolio_mount_depth: 2 });
  switch (product) {
    case 'lotus': return renderToStaticMarkup(createElement(LotusRollerOptions, { ...common, pricingOnly, programId: 'lotus_rs_1pct_custom', design: { mount_type: 'Inside Mount', valance: 'Smooth valance', options_json: { lotus_roller_fit: 'Flush', lotus_recess_depth_inches: 4 } } as unknown as SalesQuoteDesign }));
    case 'cellular': return renderToStaticMarkup(createElement(SundanceCellularConfiguration, { ...common, pricingOnly, options }));
    case 'horizontal': return renderToStaticMarkup(createElement(SundanceHorizontalConfiguration, { ...common, pricingOnly, options, productId: 'sundance_chateau_woods' }));
    case 'walden': return renderToStaticMarkup(createElement(SundanceWaldenConfiguration, { ...common, pricingOnly, options, productId: 'sundance_walden_premier' }));
    case 'vertical': return renderToStaticMarkup(createElement(SundanceVerticalConfiguration, { ...common, pricingOnly, options }));
    case 'sheerview': return renderToStaticMarkup(createElement(SundanceSheerviewOptions, { ...common, pricingOnly, options }));
    default: return renderToStaticMarkup(createElement(SundancePortfolioOptions, { ...common, pricingOnly, options }));
  }
};
describe('pricing panels omit installation measurements while retaining priced choices', () => {
  it.each([
    ['lotus', 'Lotus roller recess depth', 'Lotus roller valance'],
    ['cellular', 'Sundance cellular mount depth', 'Sundance cellular operating system'],
    ['horizontal', 'Sundance blind Mounting depth in inches', 'Sundance blind Chateau valance'],
    ['walden', 'Sundance Walden Mounting depth in inches', 'Sundance Walden operating system'],
    ['vertical', 'Sundance vertical mounting depth or surface', 'Sundance vertical Components'],
    ['sheerview', 'Sundance SheerView mount depth', 'Sundance SheerView control'],
    ['portfolio', 'Sundance Portfolio mount depth', 'Sundance Portfolio liner'],
  ])('%s keeps order mode separate from quoting', (product, orderField, pricedField) => {
    const quote = render(true, product), order = render(false, product);
    expect(quote).not.toContain(`aria-label="${orderField}"`);
    expect(order).toContain(`aria-label="${orderField}"`);
    expect(quote).toContain(`aria-label="${pricedField}"`);
  });
});
