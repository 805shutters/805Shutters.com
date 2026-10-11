import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { anatomyReferenceArtwork } from './anatomy-reference-artwork';
import { ContractAnatomy } from '@/components/quote/ContractAnatomy';
import { contractAnatomy, anatomySelectionGroup } from './contract-anatomy';
import { anatomyPreviewProduct, anatomyProductIndex } from './contract-anatomy-catalog';
import { catalog } from './catalog';
import { PRODUCT_TYPES } from '@mts/lib/quoteConstants';

describe('visual contract catalog and saved selections', () => {
  it('groups visual, operating and construction details without losing unfamiliar selections', () => {
    expect(anatomySelectionGroup('Light control')).toBe('Design & color');
    expect(anatomySelectionGroup('Hinge color')).toBe('Design & color');
    expect(anatomySelectionGroup('Split Tilt')).toBe('Operation');
    expect(anatomySelectionGroup('Divider Rail')).toBe('Construction & fit');
    expect(anatomySelectionGroup('Custom treatment note')).toBe('Additional details');
    const html=renderToStaticMarkup(createElement(ContractAnatomy,{productType:'Shutters',room:'Bedroom',layout:'grouped',summaryStyle:'recap',options:['Color: Pure White','Tilt Type: Hidden Tilt','Split Tilt: Yes','Louver Size: 3 1/2 inch','Mount Type: Inside mount','Custom treatment note: Keep clear of handle']}));
    for(const text of ['Design &amp; color','Operation','Construction &amp; fit','Additional details','Pure White','Hidden Tilt','Keep clear of handle']) expect(html).toContain(text);
    expect(html).not.toContain('data-selection-number=');
    expect(html).not.toContain('aria-label="Selection recap"');
    expect(html).not.toContain('aria-label="Fabric and finish description"');
    expect(html).toContain('>Tilt Type</span><strong>Hidden Tilt</strong>');
  });
  it('retains negative options and emphasized fabric performance in label-only layouts', () => {
    const html=renderToStaticMarkup(createElement(ContractAnatomy,{productType:'Roller Shades',room:'Bedroom',layout:'grouped',summaryStyle:'cards',options:['Valance: None','Fabric: Amelia RD (Room Darkening)','Lift System: Motorized','Mount Type: Outside mount']}));
    expect(html).toContain('>Valance</span><strong>None</strong>');
    expect(html).toContain('Room-darkening fabric');
    expect(html).toContain('Remote control');
    expect(html).toContain('(Outside mount)');
    expect(html).not.toContain('Numbered selection summary');
  });
  it('points motorized operation to the remote without a second mechanism label', () => {
    const model=contractAnatomy('Roller Shades',['Manufacturer: Norman','Lift System: Motorized','Valance: Modern Wood Valance']);
    expect(model.callouts.find(c=>c.part==='remote')?.anchor).toBe('remote');
    expect(model.callouts.some(c=>c.part==='control')).toBe(false);
    expect(contractAnatomy('Roller Shades',['Lift System: Cordless']).callouts.some(c=>c.part==='remote')).toBe(false);
    const html=renderToStaticMarkup(createElement(ContractAnatomy,{productType:'Roller Shades',room:'Living Room',options:['Lift System: Motorized']}));
    expect(html).toContain('data-anatomy-anchor="remote"');
  });
  it('identifies small cordless pull tabs and both cord-loop sides', () => {
    for (const productType of ['Roller Shades','Honeycomb Shades','Roman Shades','Sheer Shades']) {
      const options=['Lift System: Cordless'];
      const model=contractAnatomy(productType,options);
      expect(model.callouts.find(c=>c.part==='control')?.anchor).toBe('pull-tab');
      const html=renderToStaticMarkup(createElement(ContractAnatomy,{productType,room:'Bedroom',options}));
      expect(html).toContain('data-anatomy-anchor="pull-tab"');
    }
    for (const side of ['Left','Right']) {
      const model=contractAnatomy('Roller Shades',['Lift System: Continuous Cord Loop',`Control Side: ${side}`]);
      expect(model.callouts.find(c=>c.part==='control')?.point[0]).toBe(side==='Left'?13:87);
    }
  });
  it('omits default standard roll but retains reverse roll', () => {
    const base=['Lift System: Cordless'];
    for(const value of ['Standard','Standard Roll']) {
      const model=contractAnatomy('Roller Shades',[...base,`Roll Type: ${value}`]);
      expect(model.specifications.some(d=>/roll/i.test(d.label))).toBe(false);
      expect(model.callouts.some(c=>c.part==='roll')).toBe(false);
    }
    expect(contractAnatomy('Roller Shades',[...base,'Roll Type: Reverse']).callouts.find(c=>c.part==='roll')?.details[0].value).toBe('Reverse');
  });
  it('places mount beside the product and excludes a separate mount row', () => {
    for(const mount of ['Inside mount','Outside mount']) {
      const html=renderToStaticMarkup(createElement(ContractAnatomy,{productType:'Roller Shades',room:'Living Room',options:['Lift System: Cordless',`Mount Type: ${mount}`]}));
      expect(html).toContain(` (${mount})`);
      expect(html).not.toContain('<dt>Mount Type</dt>');
      expect(html).not.toContain('data-callout-part="frame"');
    }
  });
  it('preserves numbered selections and fabric performance in every summary design', () => {
    const options=['Manufacturer: Norman','Valance: Modern Wood Valance','Fabric: Amelia RD (Room Darkening)','Color: F1774 Mist Gray','Lift System: Motorized','Mount Type: Inside mount','Roll Type: Standard'];
    for(const summaryStyle of ['numbered','cards','strip','grid','legend'] as const) {
      const html=renderToStaticMarkup(createElement(ContractAnatomy,{productType:'Roller Shades',room:'Living Room',options,summaryStyle}));
      expect(html).toContain('Numbered selection summary');
      expect(html).toContain('data-selection-number="1"');
      expect(html).toContain('data-selection-number="5"');
      expect(html).toContain('Control type');
      expect(html).toContain('Room-darkening fabric');
      expect(html).not.toContain('Standard');
      expect(html).toContain('data-line-routing="around"');
    }
  });
  it('covers every catalog product and every main quote type', () => {
    const index = anatomyProductIndex();
    for (const p of catalog.products) expect(index.some(i => i.id === p.id)).toBe(true);
    for (const type of PRODUCT_TYPES) expect(index.some(i => i.productType === type)).toBe(true);
  });
  it('retains unfamiliar options and explicit negative structural selections', () => {
    const options = ['Split Tilt: No','Divider Rail: No','Valance: None','Custom treatment note: Customer selection','Pricing Source: internal'];
    const model = contractAnatomy('Shutters',options);
    expect(model.specifications).toEqual(expect.arrayContaining([
      {label:'Split Tilt',value:'No'},{label:'Divider Rail',value:'No'},{label:'Valance',value:'None'},
      {label:'Custom treatment note',value:'Customer selection'},
    ]));
    expect(model.specifications.some(d => /pricing/i.test(d.label))).toBe(false);
    expect(options).toHaveLength(5);
  });
  it('does not claim missing operating details have an exact configured sketch', () => {
    expect(contractAnatomy('Roller Shades',[]).reference).toBe(true);
    expect(contractAnatomy('Roller Shades',['Lift System: Continuous Cord Loop','Control Side: Right']).reference).toBe(false);
    expect(contractAnatomy('Honeycomb Shades',['Application: Skylight']).reference).toBe(true);
  });
  it('keeps split tilt and divider independent through the real sketch', () => {
    const html = renderToStaticMarkup(createElement(ContractAnatomy,{productType:'Shutters',room:'Bedroom',width:70,height:45,options:['Panel Config: LR','Tilt Type: Standard Tilt','Split Tilt: Yes','Divider Rail: No']}));
    expect(html).toContain('data-sketch-split="true"');
    expect(html).toContain('data-louver-section="lower-more-closed"');
    expect(html).toContain('data-louver-close-direction="up"');
    expect(html).not.toContain('data-divider-rail="true"');
    expect(html).toContain('70″');
    expect(html).not.toContain('45″');
    expect(html).not.toContain('Width × height');
  });
  it('classifies every option study, renders every product, and records reference coverage', () => {
    const audit:{id:string;name:string;groups:number;choices:number;referenceChoices:number}[]=[];
    for (const summary of anatomyProductIndex()) {
      const p=anatomyPreviewProduct(summary.id)!;
      expect(p).not.toBeNull();
      let count=0, refs=0;
      for (const group of p.groups) {
        expect(new Set(group.choices.map(c => c.id)).size,group.id).toBe(group.choices.length);
        for (const choice of group.choices) {
          const options=[`Manufacturer: ${p.manufacturer}`,...choice.options];
          const model=contractAnatomy(p.productType,options);
          expect(model.family,p.id).not.toBe('custom');
          expect(model.coverageNote).toBeTruthy();
          count++; if(model.reference) refs++;
        }
      }
      const html=renderToStaticMarkup(createElement(ContractAnatomy,{productType:p.productType,room:'Example room',options:[]}));
      expect(html,p.id).toContain('data-contract-anatomy=');
      expect(html,p.id).toMatch(/<img |<svg /);
      const reference=anatomyReferenceArtwork(p.name,[]);
      if(reference) expect(existsSync('public'+reference.src),reference.src).toBe(true);
      audit.push({id:p.id,name:p.name,groups:p.groups.length,choices:count,referenceChoices:refs});
    }
    mkdirSync('artifacts/visual-contract',{recursive:true});
    writeFileSync('artifacts/visual-contract/coverage.json',JSON.stringify({products:audit.length,choices:audit.reduce((n,p)=>n+p.choices,0),audit},null,2));
  },60000);
});
