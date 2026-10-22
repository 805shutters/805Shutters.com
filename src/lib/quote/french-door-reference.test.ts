import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ContractProductIllustration } from '@/components/quote/ContractProductIllustration';
import { specialtyShutterSketch } from './specialty-shutter-illustrations';
import { contractAnatomy } from './contract-anatomy';

const options = ['Color: 100_Pure White', 'Tilt Type: Invisible Tilt', 'Panel Config: L', 'Panel direction: L', 'Shutter Type: French Door', 'Louver Size: 3 1/2"', 'French Door Cutout: Handle cutout (type not specified)'];

describe('French-door Norman pencil rendering', () => {
  it.each(['compact', 'anatomy'] as const)('uses our pencil renderer with incomplete cutout details at %s size', size => {
    const before = [...options];
    const html = renderToStaticMarkup(createElement(ContractProductIllustration, { productType: 'Shutters', options, size, illustrationGeometry: { aspectRatio: 25 / 78 } }));
    expect(html).toContain('data-specialty-sketch="FRENCH_DOOR"');
    expect(html).toContain('pencil-material.webp');
    expect(html).toContain('louver-up.webp');
    expect(html).toContain('data-sketch-tilt="hidden"');
    expect(html).toContain('data-specialty-layout="L"');
    expect(html).not.toContain('data-front-tilt-rod');
    expect(html).not.toContain('data-product-reference="custom"');
    expect(html).not.toContain('data-french-door-cutout=');
    expect(html).not.toContain('/door-french.jpg');
    expect(contractAnatomy('Shutters', options).coverageNote).toContain('Cutout type not recorded');
    expect(options).toEqual(before);
  });

  it('preserves the selected cutout drawing when its identity is recorded', () => {
    const selected = options.filter(option => !option.startsWith('French Door Cutout:')).concat(['French-door cutout type: Type A', 'Handle side: Right', 'Top shape: Rectangular']);
    const html = renderToStaticMarkup(createElement(ContractProductIllustration, { productType: 'Shutters', options: selected, size: 'anatomy' }));
    expect(html).toContain('data-french-door-cutout="YS33"');
    expect(html).not.toContain('/door-french.jpg');
  });

  it('does not invent a cutout from a known handle side or guess conflicting types', () => {
    const pending = [...options, 'Handle side: Right'];
    expect(specialtyShutterSketch('Shutters', pending)?.cutoutSide).toBe('right');
    const html = renderToStaticMarkup(createElement(ContractProductIllustration, { productType: 'Shutters', options: pending }));
    expect(html).not.toContain('data-french-door-cutout=');
    expect(specialtyShutterSketch('Shutters', ['Shutter type: French Door', 'French-door cutout type: Type A', 'French-door cutout type: Type C'])).toBeNull();
    expect(specialtyShutterSketch('Shutters', ['Shutter type: French Door', 'French-door cutout type: Invalid'])).toBeNull();
  });

  it('recognizes the product or application without using room names or notes', () => {
    expect(specialtyShutterSketch('Shutters', ['Room: French Door', 'Notes: French door nearby'])).toBeNull();
    expect(specialtyShutterSketch('Roller Shades', ['Application: French Door'])).toBeNull();
    expect(specialtyShutterSketch('Shutters', ['Shutter Type: Regular'])).toBeNull();
    expect(specialtyShutterSketch('Shutters', ['Application: French Door'])?.code).toBe('FRENCH_DOOR');
    expect(specialtyShutterSketch('French Door Shutters', [])?.code).toBe('FRENCH_DOOR');
  });
});
