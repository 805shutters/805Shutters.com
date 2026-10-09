import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SPECIALTY_SHUTTER_SKETCHES, FRENCH_DOOR_SKETCH_TYPES, pureSunburst, frenchDoorSketch, specialtyShutterSketch } from './specialty-shutter-illustrations';
import { ContractProductIllustration } from '@/components/quote/ContractProductIllustration';
import { customerQuoteOptions } from '@/lib/crm/customer-quote-branding';
import { customerConfigurationFromSelection, v2CustomerConfigurationOptions } from '@/lib/crm/sales-quote-v2-customer-configuration';
import { NORMAN_SHUTTER_PANEL_RECORD } from './norman-shutter-panels';
import { emptyNormanSpecialtyRecord } from './norman-shutter-specialty';
import type { SelectionContext } from '@/lib/quote-v2/core';

const markup=(options:string[])=>renderToStaticMarkup(createElement(ContractProductIllustration,{productType:'Shutters',options}));
const optionsFor=(code:string,label:string)=>[...(frenchDoorSketch(code)?['Shutter type: French Door',`French-door cutout type: ${label}`,'Handle side: Left','Top shape: Rectangular','Panel configuration: L']:[`Specialty shape: ${label}`,'Panel configuration: LR']),'Tilt: Standard Tilt'];
describe('805 specialty shutter contract sketches',()=>{
 it('covers 46 exact window shapes and six door profiles',()=>{expect(SPECIALTY_SHUTTER_SKETCHES).toHaveLength(52);expect(new Set(SPECIALTY_SHUTTER_SKETCHES.map(([code])=>code)).size).toBe(52);});
 it.each(SPECIALTY_SHUTTER_SKETCHES)('draws %s %s through the actual contract component',(code,label)=>{
  const html=markup(optionsFor(code,label));
  expect(html).toContain(`data-specialty-sketch="${code}"`);expect(html).not.toMatch(/undefined|NaN/);expect(html).not.toContain('/images/specialty-shutters/');
  if(pureSunburst(code)){expect(html).toContain('data-radial-sunburst="true"');expect(html).not.toContain('data-front-tilt-rod');}
 });
 it.each(['Standard Tilt','InvisibleTilt','Offset Tilt'])('renders every split/divider combination for %s',tilt=>{
  for(const split of [false,true])for(const divider of [false,true]){
   const html=markup(['Specialty shape: Louvered Arch','Panel configuration: LR',`Tilt: ${tilt}`,`Split tilt: ${split?'Yes':'No'}`,`Divider rail: ${divider?'Yes':'No'}`]);
   expect(html.includes('data-front-tilt-rod')).toBe(tilt!=='InvisibleTilt');
   expect(html.includes('data-divider-rail')).toBe(divider);expect(html.includes('data-louver-section="lower-more-closed"')).toBe(split);
   if(tilt!=='InvisibleTilt')expect((html.match(/data-front-tilt-rod=/g)||[]).length).toBe(split||divider?4:2);
  }
 });
 it('preserves horizontal louvers in the separate standard-unit arch crown',()=>{
  const html=markup(['Specialty shape: Standard Unit with Horizontal Arch Center','Panel configuration: LRTLR','Tilt: Standard Tilt']);
  expect(html).toContain('data-horizontal-arch-crown="true"');expect(html).not.toContain('data-radial-sunburst');
 });
 it.each(FRENCH_DOOR_SKETCH_TYPES)('preserves %s cutout side independently from hinge direction',(code,label)=>{
  for(const side of ['Left','Right']){const html=markup(['Shutter type: French Door',`French-door cutout type: ${label}`,'Panel configuration: L','Top shape: Rectangular',`Handle side: ${side}`,'Tilt: Hidden tilt']);expect(html).toContain(`data-cutout-side="${side.toLowerCase()}"`);expect(html).toContain(`data-french-door-cutout="${code}"`);expect(html.includes('data-door-batten')).toBe(['YS38','YS39'].includes(code));}
 });
 it('does not invent missing tilt, layout or French-door handle side',()=>{
  const shape=markup(['Specialty shape: Half Round with Horizontal Louvers']);expect(shape).toContain('Tilt not recorded');expect(shape).not.toContain('data-front-tilt-rod');
  const door=markup(['Shutter type: French Door','French-door cutout type: Type A']);expect(door).toContain('Cutout side not recorded');expect(door).not.toContain('data-french-door-cutout=');
 });
 it.each([
  ['French-door cutout: No','French-door cutout type: Type A'],['French-door cutout: false','French-door cutout type: Type B'],
  ['Specialty shape: Arch'],['Specialty shape: Raked'],['Specialty shape: YS05','Specialty shape: YS21'],
  ['Specialty shape: YS05','Tilt: Standard Tilt','Tilt: Hidden tilt'],['Specialty shape: YS05','Divider rail: Yes','Divider rail: No'],
  ['Specialty shape: YS05','Panel configuration: T'],['French-door cutout type: Type F','Top shape: Arch'],
  ['French-door cutout type: Type A','Handle side: Left','Handle side: Right'],['French-door cutout type: Type A','Top shape: Quarter arch'],
 ].map(options=>[options] as const))('rejects ambiguous or contradictory selections %j',options=>expect(specialtyShutterSketch('Shutters',options)).toBeNull());
 it('preserves rear crown control and fixed top louver through public sanitization',()=>{
  const selection={manufacturerId:'norman',configuration:{tilt_type:'InvisibleTilt',panel_configuration:'LR',[NORMAN_SHUTTER_PANEL_RECORD]:{version:1,application:'specialty',motor:'none',existingDoorGlassOrSidelight:false,panels:[{heightInches:80,widthInches:24,divider:'none'}],specialty:{...emptyNormanSpecialtyRecord(),shapeCode:'YS05',archStyle:'continuous',curvedTilt:{version:1,control:'rear_standard',topLouverFixed:true}}}},options:{}} as unknown as SelectionContext;
  const configuration=customerConfigurationFromSelection(selection);
  const options=customerQuoteOptions(v2CustomerConfigurationOptions(configuration));
  const sketch=specialtyShutterSketch('Shutters',options);expect(sketch).toMatchObject({code:'YS05',tilt:'hidden',curvedTilt:'rear',fixedTop:true,archStyle:'continuous'});
  const html=markup(options);expect(html).toContain('data-rear-tilt-reference');expect(html).toContain('data-fixed-top-louver');expect(JSON.stringify(configuration)).not.toMatch(/norman_shutter_panels|measurementReference/);
 });
 it('uses identical geometry for Onyx and Norman after customer branding',()=>{
  for(const supplier of ['Norman','Onyx']){const options=customerQuoteOptions(['Specialty shape: Left Angle Top',`Manufacturer: ${supplier}`,'Panel configuration: LR','Tilt: H1 - Hidden Tiltrod Notch On Stile','Split tilt: Yes']);expect(specialtyShutterSketch('Shutters',options)).toMatchObject({code:'YS21',tilt:'hidden',split:true});}
 });
});
