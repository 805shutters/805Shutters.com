import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ContractAnatomy } from '@/components/quote/ContractAnatomy';
import { SHUTTER_FRAME_PROFILES, shutterFrameProfile } from './shutter-frame-profiles';
describe('contract Z-frame side profiles',()=>{
 it('matches every documented profile to its own available supplier sketch',()=>{
  for(const p of SHUTTER_FRAME_PROFILES){
   expect(shutterFrameProfile('Shutters',[`Manufacturer: ${p.manufacturer}`,`Frame Type: ${p.label}`])?.id).toBe(p.id);
   expect(existsSync(`public${p.src}`)).toBe(true);
  }
 });
 it('handles exact imported frame names without borrowing an undocumented variant',()=>{
  expect(shutterFrameProfile('Shutters',['Frame: Z Crest'])?.id).toBe('onyx-z-crest');
  expect(shutterFrameProfile('Shutters',['Manufacturer: Onyx','Frame: Z Frame Fine'])?.id).toBe('onyx-z-fine');
  expect(shutterFrameProfile('Shutters',['Manufacturer: Norman','Frame: Z Crest'])).toBeNull();
  for(const frame of ['Z Crest FS','Z Lite','VZ Fine']) expect(shutterFrameProfile('Shutters',[`Frame: ${frame}`])).toBeNull();
  expect(shutterFrameProfile('Roller Shades',['Frame: Z Crest'])).toBeNull();
 });
 it('renders the named profile below the primary shutter, before option labels',()=>{
  const html=renderToStaticMarkup(createElement(ContractAnatomy,{productType:'Shutters',room:'Office',layout:'grouped',options:['Manufacturer: Onyx','Frame: Z Crest','Tilt: standard']}));
  expect(html.indexOf('data-primary-product')).toBeLessThan(html.indexOf('data-frame-profile="onyx-z-crest"'));
  expect(html.indexOf('data-frame-profile="onyx-z-crest"')).toBeLessThan(html.indexOf('data-label-side='));
  expect(html).toContain('Z Crest</strong><span>Side profile');
 });
});
