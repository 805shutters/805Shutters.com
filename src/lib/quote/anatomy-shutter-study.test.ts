import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { anatomyShutterStudy } from './anatomy-shutter-study';
import { SpecialtyShutterSketch } from '@/components/quote/SpecialtyShutterSketch';
import { shutterIllustrationGeometry } from './shutter-illustration-geometry';
import { anatomyPreviewProduct } from './contract-anatomy-catalog';
import { optionRenderStudy, renderStudyDefaults } from './anatomy-render-studies';
import { renderOptionsFromSelection } from './anatomy-render-studies';
import { anatomyExampleSelections } from './anatomy-examples';
const base=['Panel Config: LR','Tilt Type: Offset Tilt','Split Tilt: Yes','Divider Rail: No'];
const draw=(options:string[])=>renderToStaticMarkup(createElement(SpecialtyShutterSketch,{sketch:anatomyShutterStudy('Shutters',options)!,geometry:shutterIllustrationGeometry(70,45,options)}));
describe('parametric rectangle option studies',()=>{
  it('starts the shutter preview with a complete, explicitly labeled example',()=>{
    const product=anatomyPreviewProduct('norman_shutters')!;
    const options=renderOptionsFromSelection(product,anatomyExampleSelections(product));
    expect(anatomyShutterStudy(product.name,options)).toMatchObject({layout:'LR',split:true,divider:false});
    expect(product.groups.some(g=>g.label==='Suppliers')).toBe(false);
  });
  it('rebuilds blade rows from measured louver size and keeps closure upward',()=>{
    const small=draw([...base,'Louver Size: 2 1/2"']),large=draw([...base,'Louver Size: 4 1/2"']);
    expect((small.match(/data-louver-close-direction="up"/g)||[]).length).toBeGreaterThan((large.match(/data-louver-close-direction="up"/g)||[]).length);
    expect(small).toContain('lower-more-closed');expect(small).toContain('upper-open');
    expect(small).toContain('data-front-tilt-rod="offset"');
    expect(small).not.toContain('data-divider-rail="true"');
    expect(small).toContain('data-opening-aspect-ratio="1.555');
  });
  it('shows divider independently and removes rods for hidden tilt',()=>{
    const markup=draw(['Panel Config: LTR','Tilt Type: Hidden Tilt','Split Tilt: No','Divider Rail: Yes']);
    expect(markup).toContain('data-divider-rail="true"');expect(markup).not.toContain('data-front-tilt-rod');expect(markup).not.toContain('lower-more-closed');
    expect(markup).toContain('data-specialty-post="true"');
  });
  it('does not substitute a rectangle for unspecified or specialty construction',()=>{
    for(const options of [[],[...base,'Specialty Shape: Arch'],[...base,'Shutter Type: French Door'],[...base,'Track Type: Bypass'],base.filter(o=>!o.startsWith('Split'))])expect(anatomyShutterStudy('Shutters',options)).toBeNull();
    expect(anatomyShutterStudy('French Door Shutters',base)).toBeNull();
  });
  it('counts louver-size variants only when the value can drive geometry',()=>{
    const p=anatomyPreviewProduct('norman_shutters')!;
    for(const [value,coverage] of [['4 1/2"','drawing'],['Custom','needs-artwork']]){
      const c={id:value,label:value,options:[`Louver Size: ${value}`]};
      expect(optionRenderStudy(p,{id:'louver',label:'Louver size',source:'test',choices:[c]},c,renderStudyDefaults(p)).coverage).toBe(coverage);
    }
  });
});
