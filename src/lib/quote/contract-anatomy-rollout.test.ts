import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { QuoteLineItemCard } from '@/components/quote/QuoteLineItemCard';
import { contractAnatomyLabels, anatomySelectionGroup, isMountDetail } from './contract-anatomy';
import { anatomyPreviewProduct, anatomyProductIndex } from './contract-anatomy-catalog';
import { anatomyExampleSelections } from './anatomy-examples';
import { catalogueChoiceKey, type CatalogueSelection } from './anatomy-catalogue-selection';

const scope: CatalogueSelection = JSON.parse(readFileSync('src/lib/quote/fixtures/anatomy-catalogue-selection.json','utf8')).selection;
const products = anatomyProductIndex().filter(p=>scope[p.id]);
describe('approved contract layout for the complete selected catalogue',()=>{
  it('retains every customer-safe option in exactly its category or mount header',()=>{
    let choices=0;
    for(const summary of products){
      const p=anatomyPreviewProduct(summary.id)!;
      for(const group of p.groups) for(const choice of group.choices){
        if(scope[p.id].scope==='selected'&&!scope[p.id].choices.includes(catalogueChoiceKey(group.id,choice.id))) continue;
        const model=contractAnatomyLabels(p.name,[`Manufacturer: ${p.manufacturer}`,...choice.options]);
        for(const c of model.callouts) expect(new Set(c.details.map(d=>anatomySelectionGroup(d.label))).size,`${p.id}/${choice.id}`).toBe(1);
        for(const d of model.specifications){
          if(isMountDetail(d)&&/^(inside|outside) mount$/i.test(d.value)) continue;
          expect(model.callouts.flatMap(c=>c.details).filter(x=>x.label===d.label&&x.value===d.value),`${p.id}/${choice.id}/${d.label}`).toHaveLength(1);
        }
        choices++;
      }
    }
    expect(products).toHaveLength(84);
    expect(choices).toBeGreaterThan(10000);
  },60000);
  it.each(products.map(p=>[p.id,p] as const))('uses the real contract card for %s',(_,summary)=>{
    const p=anatomyPreviewProduct(summary.id)!;
    const selected=anatomyExampleSelections(p);
    const options=[`Manufacturer: ${p.manufacturer}`,...p.groups.flatMap(g=>g.choices.find(c=>c.id===selected[g.id])?.options||[])];
    const original=[...options];
    const html=renderToStaticMarkup(createElement(QuoteLineItemCard,{lineNumber:1,room:'Example room',productType:p.name,options,price:'$123.45',quantity:1,dimensions:'70" × 45"'}));
    expect(html).toContain('data-contract-layout="grouped"');
    expect(html).toContain('$123.45');
    expect(html).not.toContain('Selection recap');
    expect(html).not.toContain('Numbered selection summary');
    expect(html).not.toContain('45″');
    expect(options).toEqual(original);
  });
});
