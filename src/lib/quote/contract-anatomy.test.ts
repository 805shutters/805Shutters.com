import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { anatomyReferenceArtwork } from './anatomy-reference-artwork';
import { ContractAnatomy } from '@/components/quote/ContractAnatomy';
import { contractAnatomy, contractAnatomyLabels, anatomySelectionGroup } from './contract-anatomy';
import { anatomyPreviewProduct, anatomyProductIndex } from './contract-anatomy-catalog';
import { catalog } from './catalog';
import { PRODUCT_TYPES } from '@mts/lib/quoteConstants';

describe('visual contract catalog and saved selections', () => {
  it('balances crowded shutter details into facing rows without dropping selections', () => {
    const options = ['Material: Bassia','Color: 100_Pure White','Hinge Color: Match','Tilt: standard','Split Tilt: No','Louver Size: 3 1/2 inch','Frame: Z Crest FS','Panel Configuration: LR','Mount Type: Inside mount','Shutter Type: arch_shutters','Divider Rail Count: 0','Divider Rail: No','T-post Count: 0','Style: Basswood'];
    const model = contractAnatomyLabels('Shutters', options);
    const left = model.callouts.filter(c => c.side === 'left'), right = model.callouts.filter(c => c.side === 'right');
    expect(Math.abs(left.length - right.length)).toBeLessThanOrEqual(1);
    expect(left.length).toBeGreaterThan(1);
    const details = model.callouts.flatMap(c => c.details);
    for (const detail of model.specifications) expect(details).toContainEqual(detail);
    const html = renderToStaticMarkup(createElement(ContractAnatomy, {productType:'Shutters',room:'Primary Bedroom',layout:'grouped',options}));
    for (const [side, cards] of [['left', left], ['right', right]] as const) for (let row = 0; row < cards.length; row++) expect(html).toContain(`data-label-row="${row}" data-label-side="${side}"`);
  });
  it('balances all catalog product configurations while preserving complete category cards', () => {
    for (const product of anatomyProductIndex()) {
      const p = anatomyPreviewProduct(product.id)!;
      for (const group of p.groups) for (const choice of group.choices) {
        const model = contractAnatomyLabels(p.productType, [`Manufacturer: ${p.manufacturer}`, ...choice.options]);
        const left = model.callouts.filter(c => c.side === 'left').length;
        const right = model.callouts.length - left;
        expect(Math.abs(left - right), `${p.id}:${choice.id}`).toBeLessThanOrEqual(1);
        for (const card of model.callouts) expect(new Set(card.details.map(d => anatomySelectionGroup(d.label))).size).toBe(1);
      }
    }
  });

  it('groups visual, operating and construction details without losing unfamiliar selections', () => {
    expect(anatomySelectionGroup('Light control')).toBe('Design & color');
    expect(anatomySelectionGroup('Hinge color')).toBe('Design & color');
    expect(anatomySelectionGroup('Split Tilt')).toBe('Operation');
    expect(anatomySelectionGroup('Divider Rail')).toBe('Construction & fit');
    expect(anatomySelectionGroup('Custom treatment note')).toBe('Additional details');
    const html=renderToStaticMarkup(createElement(ContractAnatomy,{productType:'Shutters',room:'Bedroom',layout:'grouped',summaryStyle:'recap',options:['Color: Pure White','Tilt Type: Hidden Tilt','Split Tilt: Yes','Louver Size: 3 1/2 inch','Mount Type: Inside mount','Custom treatment note: Keep clear of handle']}));
    for(const text of ['Design &amp; color','Operation','Construction &amp; fit','Notes','Pure White','Hidden Tilt','Keep clear of handle']) expect(html).toContain(text);
    expect(html).not.toContain('data-selection-number=');
    expect(html).not.toContain('aria-label="Selection recap"');
    expect(html).not.toContain('aria-label="Fabric and finish description"');
    expect(html).toContain('>Tilt Type</span><strong>Hidden Tilt</strong>');
  });
  it('gives valances their own section and keeps fabric and color in Design & color', () => {
    for (const label of ['Valance', 'Cassette', 'Fascia', 'Top treatment']) expect(anatomySelectionGroup(label)).toBe('Valance');
    for (const label of ['Fabric', 'Fabric Color', 'Valance Color']) expect(anatomySelectionGroup(label)).toBe('Design & color');
    const html = renderToStaticMarkup(createElement(ContractAnatomy, {productType:'Roller Shades', room:'Office', layout:'grouped', options:['Valance: No Valance','Fabric: Flow 1%','Fabric Color: Polar White','Control Type: Cordless']}));
    const valanceSection = html.match(/<section[^>]*aria-label="Valance"[\s\S]*?<\/section>/)?.[0];
    const designSection = html.match(/<section[^>]*aria-label="Design &amp; color"[\s\S]*?<\/section>/)?.[0];
    expect(valanceSection).toContain('No Valance');
    expect(designSection).toContain('Flow 1%');
    expect(designSection).toContain('Polar White');
    expect(designSection).not.toContain('No Valance');
  });
  it('keeps notes once at the bottom, separate from visual option labels', () => {
    for (const productType of ['Roller Shades', 'Shutters', 'Honeycomb Shades']) {
      const html = renderToStaticMarkup(createElement(ContractAnatomy, {productType, room:'Office', layout:'grouped', options:['Color: Pure White','Notes: Keep sill clear','Installation notes: Call before arrival']}));
      const footer = html.indexOf('data-contract-notes="true"');
      expect(footer).toBeGreaterThan(html.lastIndexOf('data-callout-part='));
      expect(html.slice(0, footer)).not.toContain('Keep sill clear');
      expect(html.match(/Keep sill clear/g)).toHaveLength(1);
      expect(html.slice(footer)).toContain('Call before arrival');
      expect(html).not.toContain('aria-label="Additional details"');
    }
    const html = renderToStaticMarkup(createElement(ContractAnatomy, {productType:'Roller Shades', room:'Office', layout:'grouped', options:['Color: Pure White']}));
    expect(html).not.toContain('data-contract-notes=');
  });
  it('omits absent options while retaining fabric performance in label-only layouts', () => {
    const html=renderToStaticMarkup(createElement(ContractAnatomy,{productType:'Roller Shades',room:'Bedroom',layout:'grouped',summaryStyle:'cards',options:['Valance: None','Fabric: Amelia RD (Room Darkening)','Lift System: Motorized','Mount Type: Outside mount']}));
    expect(html).not.toContain('>Valance</span><strong>None</strong>');
    expect(html).toContain('Room-darkening fabric');
    expect(html).toContain('Remote control');
    expect(html).toContain('>Outside mount</strong>');
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
  it.each(['Wood Blinds', 'Faux Wood Blinds', 'Mini Blinds'])('attaches %s control leaders to the visible wand in every label layout', productType => {
    for (const side of ['Left', 'Right']) for (const layout of ['grouped', 'centered', 'classic', 'compact', 'bordered'] as const) {
      const options = [`Control Side: ${side}`, 'Material: 2 inch slats', 'Color: Limed White', 'Mount Type: Inside Mount'];
      const model = contractAnatomyLabels(productType, options, undefined, layout);
      const control = model.callouts.find(c => c.part === 'control')!;
      expect(control.anchor).toBe('wand');
      expect(control.point[0] < 50).toBe(side === 'Left');
      expect(control.point[1]).toBe(40);
      const html = renderToStaticMarkup(createElement(ContractAnatomy, {productType, room:'Office', layout, options}));
      expect(html).toContain('data-anatomy-anchor="wand"');
    }
  });
  it('does not attach a wand leader to unrecorded or conflicting blind controls', () => {
    for (const options of [[], ['Control Side: Both'], ['Control Side: Left', 'Wand Side: Right']]) {
      expect(contractAnatomy('Wood Blinds', options).callouts.some(c => c.anchor === 'wand')).toBe(false);
    }
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
  it('connects saved Operating System selections to the actual control instead of extra details',()=>{
    for(const label of ['Operating System','Honeycomb Operating System','Lift / Control']){
      const options=[`${label}: Cordless`,'Hem Bar: Fabric Covered','Mount Type: Inside Mount'];
      const model=contractAnatomyLabels('Roller Shades',options);
      const control=model.callouts.find(c=>c.details.some(d=>d.label===label));
      expect(anatomySelectionGroup(label)).toBe('Operation');
      expect(control).toMatchObject({part:'control',anchor:'pull-tab'});
      expect(control?.noLeader).not.toBe(true);
      const html=renderToStaticMarkup(createElement(ContractAnatomy,{productType:'Roller Shades',room:'Office',layout:'grouped',options}));
      expect(html).toContain('data-anatomy-anchor="pull-tab"');
      expect(html).toContain('Center pull tab');
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
  it('places mount in construction and fit without a separate pointer', () => {
    for (const mount of ['Inside mount','Outside mount']) {
      const html = renderToStaticMarkup(createElement(ContractAnatomy,{productType:'Roller Shades',room:'Living Room',layout:'grouped',options:['Lift System: Cordless','Hem Bar: Fabric Covered',`Mount Type: ${mount}`]}));
      expect(html).toContain('aria-label="Construction &amp; fit"');
      expect(html).toContain(`>Mount Type</span><strong>${mount}</strong>`);
      expect(html.match(new RegExp(mount, 'g'))).toHaveLength(1);
      expect(html).not.toContain(` (${mount})`);
      expect(html).not.toContain('data-callout-part="frame"');
      expect(html).toContain('data-callout-part="bottom"');
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
  it('retains unfamiliar options and omits absent structural selections', () => {
    const options = ['Split Tilt: No','Divider Rail: No','Valance: None','Custom treatment note: Customer selection','Pricing Source: internal'];
    const model = contractAnatomy('Shutters',options);
    expect(model.specifications).toEqual(expect.arrayContaining([
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
    expect(html).toContain('/c-v1/shutter-center-split.webp');
    expect(html).toContain('Standard Tilt · Yes');
    expect(html).not.toContain('shutter-center-split-divider.webp');
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

it('omits absent features from all sketch detail layouts without changing saved options',()=>{
 const options=['Panel Config: LR','Tilt Type: Hidden Tilt','Split Tilt: No','Divider Rail: No','Divider Rail Count: 0','Frame: None'];
 for(const layout of ['grouped','centered','compact','classic','bordered'] as const){
 const html=renderToStaticMarkup(createElement(ContractAnatomy,{productType:'Shutters',room:'Office',options,layout}));
 expect(html).not.toContain('Divider Rail');
 expect(html).not.toContain('Split Tilt');
 expect(html).not.toContain('<dd>No</dd>');
 }
 expect(options).toContain('Divider Rail: No');
});
