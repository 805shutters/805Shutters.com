import { existsSync, readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { OFFICIAL_SKETCH_CATEGORIES, OFFICIAL_FRENCH_DOOR_SKETCH, OFFICIAL_SPECIALTY_SKETCHES, OFFICIAL_CUTOUT_SKETCHES } from './official-sketch-catalog';
import { SPECIALTY_SHUTTER_SKETCHES } from './specialty-shutter-illustrations';
import { ContractProductIllustration } from '@/components/quote/ContractProductIllustration';
import { QuoteLineItemCard } from '@/components/quote/QuoteLineItemCard';
import { contractAnatomy } from './contract-anatomy';

describe('saved official sketch catalog', () => {
  it('keeps every category and all 52 specialty profiles as durable local artwork', () => {
    expect(OFFICIAL_SKETCH_CATEGORIES).toHaveLength(24);
    expect(OFFICIAL_SPECIALTY_SKETCHES).toHaveLength(46);
    expect(OFFICIAL_CUTOUT_SKETCHES).toHaveLength(6);
    const profiles=[...OFFICIAL_SPECIALTY_SKETCHES,...OFFICIAL_CUTOUT_SKETCHES];
    expect(profiles.map(p=>p.id).sort()).toEqual(SPECIALTY_SHUTTER_SKETCHES.map(([id])=>id).sort());
    for(const art of [OFFICIAL_FRENCH_DOOR_SKETCH,...OFFICIAL_SKETCH_CATEGORIES,...profiles]) {
      expect(existsSync(`public${art.src}`),art.src).toBe(true);
    }
    const exported=JSON.parse(readFileSync('public/images/contract-illustrations/catalog-v1/catalog.json','utf8'));
    expect(exported.shapes.map((p:{code:string})=>p.code)).toEqual(SPECIALTY_SHUTTER_SKETCHES.map(([id])=>id));
  });
  it.each(OFFICIAL_CUTOUT_SKETCHES)('builds $id clearance into the stile instead of painting a notch over louvers', profile => {
    const html=renderToStaticMarkup(createElement(ContractProductIllustration,{productType:'Shutters',options:[`French-door cutout type: ${profile.label}`,'Handle side: Right','Panel Config: L','Tilt: Invisible Tilt']}));
    expect(html).toContain('data-shaped-cutout-stile="true"');
    expect(html).toMatch(/<mask[^>]+clearance/);
    expect(html).not.toMatch(/d="M65 143Q109 169 65 195Z" fill="#fff"/);
  });
  it('keeps all screenshot specifications and money when using the finished French-door artwork', () => {
    const options=['Color: 100_Pure White','Tilt Type: Invisible Tilt','Panel Config: L','Panel direction: L','Shutter Type: French Door','Louver Size: 3 1/2"','French Door Cutout: Handle cutout (type not specified)','Hinge Color: Pure White','Sqft Rate: 36'];
    const before=structuredClone(options);
    const specifications=contractAnatomy('Shutters',options).specifications;
    const html=renderToStaticMarkup(createElement(QuoteLineItemCard,{lineNumber:1,room:'French Door (replacement panel)',productType:'Shutters',options,price:'$743.00',quantity:1,dimensions:'25" W × 78" H'}));
    expect(html).toContain(OFFICIAL_FRENCH_DOOR_SKETCH.src);
    expect(html).toContain('$743.00');
    for(const detail of specifications)expect(html).toContain(detail.value.replaceAll('"','&quot;'));
    expect(html).not.toContain('Type A');
    expect(options).toEqual(before);
  });
});
