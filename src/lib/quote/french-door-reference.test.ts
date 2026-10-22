import { existsSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ContractProductIllustration } from '@/components/quote/ContractProductIllustration';
import { frenchDoorReferenceArtwork } from './anatomy-reference-artwork';
import { contractAnatomy } from './contract-anatomy';

const options = ['Color: 100_Pure White', 'Tilt Type: Invisible Tilt', 'Panel Config: L', 'Panel direction: L', 'Shutter Type: French Door', 'Louver Size: 3 1/2"', 'French Door Cutout: Handle cutout (type not specified)'];

describe('French-door shutter photo fallback', () => {
  it.each(['compact', 'anatomy'] as const)('shows the photo for incomplete cutout details at %s size', size => {
    const before = [...options];
    const html = renderToStaticMarkup(createElement(ContractProductIllustration, { productType: 'Shutters', options, size }));
    const reference = frenchDoorReferenceArtwork('Shutters', options)!;
    expect(existsSync(`public${reference.src}`)).toBe(true);
    expect(html).toContain(reference.src);
    expect(html).toContain('photo reference');
    expect(html).not.toContain('data-product-reference="custom"');
    expect(html).not.toContain('data-french-door-cutout=');
    expect(contractAnatomy('Shutters', options).coverageNote).toBe(reference.referenceNote);
    expect(options).toEqual(before);
  });

  it('preserves the selected cutout drawing when its identity is recorded', () => {
    const selected = options.filter(option => !option.startsWith('French Door Cutout:')).concat(['French-door cutout type: Type A', 'Handle side: Right', 'Top shape: Rectangular']);
    const html = renderToStaticMarkup(createElement(ContractProductIllustration, { productType: 'Shutters', options: selected, size: 'anatomy' }));
    expect(html).toContain('data-french-door-cutout="YS33"');
    expect(html).not.toContain('/door-french.jpg');
    expect(contractAnatomy('Shutters', selected).coverageNote).not.toContain('photo reference');
  });

  it('does not select a French-door photo from room names, notes or a different product family', () => {
    expect(frenchDoorReferenceArtwork('Shutters', ['Room: French Door', 'Notes: French door nearby'])).toBeNull();
    expect(frenchDoorReferenceArtwork('Roller Shades', ['Application: French Door'])).toBeNull();
    expect(frenchDoorReferenceArtwork('Shutters', ['Shutter Type: Regular'])).toBeNull();
    expect(frenchDoorReferenceArtwork('Shutters', ['Application: French Door'])?.src).toContain('door-french.jpg');
  });
});
