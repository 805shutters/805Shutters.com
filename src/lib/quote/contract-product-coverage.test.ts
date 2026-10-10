import { existsSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ContractProductIllustration } from '@/components/quote/ContractProductIllustration';
import { QuoteLineItemCard } from '@/components/quote/QuoteLineItemCard';
import { customerQuoteProductName } from '@/lib/crm/customer-quote-branding';
import { catalog } from './catalog';
import { contractIllustration } from './contract-illustrations';
import { contractProductFamily } from './contract-product-family';
import { valanceIllustration } from './valance-illustrations';

const render = (productType: string, options: string[] = []) =>
  renderToStaticMarkup(createElement(ContractProductIllustration, { productType, options }));

describe('every catalog product has a contract sketch', () => {
  it.each(catalog.products.map(product => [product.id, product] as const))('covers raw, customer-facing and staff names for %s', (_, product) => {
    for (const name of [product.name, customerQuoteProductName(product.name), product.productType]) {
      expect(contractProductFamily(name), name).not.toBe('custom');
      const html = render(name);
      expect(html, name).toContain('data-contract-illustration="c-v1"');
      expect(html, name).toMatch(/<img |<svg /);
      expect(html).not.toMatch(/\b(?:Norman|Onyx|Polar|Lotus|Soluna|SmartPrivacy|Ultimate|CityLights)\b/i);
      for (const src of html.matchAll(/src="([^"]+)"/g)) expect(existsSync(`public${src[1]}`), src[1]).toBe(true);
    }
  });

  it('restores the screenshot item through the actual public contract card', () => {
    const options = ['Operating system: Cordless', 'Control side: Left', 'Mount type: Inside Mount', 'Draw direction: Left'];
    const before = [...options];
    const html = renderToStaticMarkup(createElement(QuoteLineItemCard, {
      lineNumber: 2, room: 'Living Room', productType: 'Cordless Faux Wood Blinds',
      options, price: '$253.07', quantity: 1,
    }));
    expect(html).toContain('/faux-wood.webp');
    expect(html).toContain('Wand tilt · left');
    expect(html).not.toContain('data-product-reference=');
    expect(html).toContain('$253.07');
    expect(options).toEqual(before);
  });

  it.each(['Ultimate Cordless Faux Wood Blinds', 'SmartPrivacy Cordless Faux Wood Blinds', 'Contract Cordless Faux Wood Blinds'])('preserves configured control side and valance for %s', name => {
    expect(contractIllustration(name, ['Operating system: Cordless', 'Control side: Right'])?.src).toContain('faux-wood-wand-right.webp');
    expect(valanceIllustration(name, ['Manufacturer: Norman', 'Valance: Contempo'])).toBe('norman-contempo');
  });

  it.each([
    ['Portrait Vertical Honeycomb Shades', 'vertical-honeycomb'],
    ['Soluna Roller Valance Only', 'valance'],
    ['SmartDrape Extra / Replacement Vane Packs', 'vanes'],
    ['Centerpiece Roman Fabric by Yard', 'fabric'],
    ['Polar Motorized Drapery Track', 'track'],
    ['Polar Premium Pro Awning', 'awning'],
  ])('keeps %s distinct from a complete standard shade', (name, family) => {
    expect(contractIllustration(name)).toBeNull();
    expect(render(name)).toContain(`data-product-reference="${family}"`);
  });

  it.each([
    ['Faux Wood Blinds', ['Control Side: Left', 'Chain Location: Right']],
    ['Roller Shades', ['Lift System: Cordless', 'Operating System: Motorized']],
    ['Shutters', ['Shutter Type: Arch']],
    ['Honeycomb Shades', ['Application: Skylight']],
  ] as const)('uses a labeled reference without inventing configuration for %s %j', (name, options) => {
    expect(contractIllustration(name, options)).toBeNull();
    const html = render(name, [...options]);
    expect(html).toContain('data-product-reference=');
    expect(html).toContain('See specifications for configuration');
    expect(html).not.toContain('remote.webp');
    expect(html).not.toContain('data-shutter-assembly=');
  });

  it('provides a neutral reference for future custom product names', () => {
    expect(render('Custom treatment')).toContain('data-product-reference="custom"');
  });
});
