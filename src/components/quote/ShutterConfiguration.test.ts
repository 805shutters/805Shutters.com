import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ContractProductIllustration } from './ContractProductIllustration';
import { QuoteLineItemCard } from './QuoteLineItemCard';
import { anatomyAttachmentExamples } from '@/lib/quote/fixtures/anatomy-attachment-examples';

const draw = (options: string[], size: 'compact' | 'anatomy') => renderToStaticMarkup(createElement(ContractProductIllustration, {productType:'Shutters', options, size}));
describe('saved shutter configuration through the displayed quote artwork', () => {
  it.each(['compact','anatomy'] as const)('shows every selected layout and tilt in one %s drawing', size => {
    for (const layout of ['L','R','LL','RR','LR','LRR','LLRR','LLRRR','LLLRRR','LLLRRRR','LLLLRRRR','LRTLR']) {
      for (const tilt of ['Tilt Bar','Tilt Rod','Standard Tilt','C - Front Center Tiltrod','InvisibleTilt','H3 - Hidden Tiltrod In Stile']) {
        const html = draw([`Panel Config: ${layout}`,`Tilt Type: ${tilt}`], size);
        const count = layout.replace(/T/g, '').length;
        expect(html).toContain(`data-panel-count="${count}"`);
        expect(html).toContain(`data-shutter-layout="${layout}"`);
        expect(html.match(/data-shutter-panel=/g)).toHaveLength(count);
        expect(html.match(/data-shutter-frame="outer"/g)).toHaveLength(1);
        expect(html).toContain(/invisible|hidden/i.test(tilt) ? 'shutter-hidden-plain.webp' : 'shutter-center-plain.webp');
        expect(html).not.toContain('/c-v1/shutters.webp');
        expect(html).not.toContain('Front tilt detail');
        expect(html).not.toContain('Divider rail detail');
      }
    }
  });
  it('keeps the Laundry selections and money intact while drawing one left panel with a bar', () => {
    const fixture = anatomyAttachmentExamples.find(e => e.id === 'laundry')!;
    const options = [...fixture.options];
    const before = [...options];
    const html = renderToStaticMarkup(createElement(QuoteLineItemCard, {lineNumber:1,room:'Laundry',productType:'Shutters',options,dimensions:'22.25" × 34.25"',quantity:1,price:'$229.51'}));
    expect(html.match(/data-shutter-panel="L"/g)).toHaveLength(1);
    expect(html).not.toContain('data-shutter-panel="R"');
    expect(html).toContain('/c-v1/shutter-center-plain.webp');
    expect(html).not.toContain('shutter-hidden');
    expect(html).toContain('data-shutter-target="tilt-detail"');
    for (const value of ['$229.51','Tilt Bar','100_Pure White','L Frame']) expect(html).toContain(value);
    expect(options).toEqual(before);
  });
  it('uses a labeled category reference when layout or controls conflict', () => {
    for (const options of [[],['Panel Config: L'],['Panel Config: L','Panel configuration: R','Tilt Type: Tilt Bar'],['Panel Config: LR','Tilt Type: Tilt Bar','Tilt: Hidden Tilt'],['Panel Config: L','Tilt Type: Unknown']]) {
      const html = draw(options, 'anatomy');
      expect(html).toContain('data-family-reference="true"');
      expect(html).toContain('Official 805 category sketch');
      expect(html).not.toContain('data-shutter-assembly=');
    }
  });
});
