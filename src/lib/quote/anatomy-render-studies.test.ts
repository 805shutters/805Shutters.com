import { describe, expect, it } from 'vitest';
import { anatomyPreviewProduct, anatomyProductIndex } from './contract-anatomy-catalog';
import { applyRenderStudy, optionRenderStudy, renderDrawingIdentity, scopedRenderProduct } from './anatomy-render-studies';
import { catalogueChoiceKey } from './anatomy-catalogue-selection';
const roller=()=>anatomyPreviewProduct('roller')!;
describe('selected option render studies',()=>{
  it('replaces aliases of the same selection instead of producing contradictory drawings',()=>{
    const options=applyRenderStudy(['Lift System: Cordless','Manufacturer: Norman','Control Side: Left'],['Lift / control: Continuous Cord Loop','Chain Location: Right']);
    expect(options).toEqual(['Manufacturer: Norman','Lift System: Continuous Cord Loop','Control Side: Right']);
    expect(renderDrawingIdentity('Roller Shades',options)).toContain('loop-right.webp');
  });
  it('does not count an unchanged generic picture as a frame or roll direction drawing',()=>{
    for(const [label,value] of [['Frame Type','Z Crest'],['Roll Type','Reverse Roll']]) {
      const p=label==='Frame Type'?anatomyPreviewProduct('norman_shutters')!:roller();
      const c={id:value,label:value,options:[`${label}: ${value}`]};
      expect(optionRenderStudy(p,{id:label,label,source:'test',choices:[c]},c).coverage).toBe('needs-artwork');
    }
  });
  it('renders visible controls and labels finishes without calling labels separate artwork',()=>{
    for(const [label,value,coverage] of [['Lift System','Continuous Cord Loop','drawing'],['Lift System','Motorized','drawing'],['Color','White','named-detail']]) {
      const c={id:value,label:value,options:[`${label}: ${value}`]};
      expect(optionRenderStudy(roller(),{id:label,label,source:'test',choices:[c]},c).coverage).toBe(coverage);
    }
  });
  it('preserves explicit option subsets and base-only scope',()=>{
    const p=roller(),g=p.groups[0],c=g.choices[0];
    const limited=scopedRenderProduct(p,{scope:'selected',choices:[catalogueChoiceKey(g.id,c.id)]});
    expect(limited.groups.flatMap(g=>g.choices)).toEqual([c]);
    expect(scopedRenderProduct(p,{scope:'selected',choices:[]}).groups).toEqual([]);
  });
  it('includes supplier menus that the generic catalogue omits without mixing product identities',()=>{
    const onyx=anatomyPreviewProduct('onyx_signature_roller')!;
    expect(onyx.groups.find(g=>g.label==='Cassette')?.choices.map(c=>c.label)).toContain('Full Enclosed');
    expect(roller().groups.some(g=>g.source.startsWith('Onyx'))).toBe(false);
    expect(anatomyPreviewProduct('onyx_woven')!.groups.find(g=>g.label==='Edge binding')?.choices.length).toBeGreaterThan(3);
    expect(anatomyPreviewProduct('norman_roller_valance_only')!.groups.some(g=>g.label==='Valance profile')).toBe(true);
    expect(anatomyPreviewProduct('type:SmartFold Shades')!.groups.length).toBeGreaterThan(0);
  });
  it('assigns coverage to every option with unique stable choice IDs',()=>{
    for(const p of anatomyProductIndex()) {
      const product=anatomyPreviewProduct(p.id)!;
      for(const group of product.groups) {
        expect(new Set(group.choices.map(c=>c.id)).size,`${p.id}/${group.id}`).toBe(group.choices.length);
        for(const choice of group.choices)expect(['drawing','named-detail','needs-artwork']).toContain(optionRenderStudy(product,group,choice).coverage);
      }
    }
  },60000);
});
