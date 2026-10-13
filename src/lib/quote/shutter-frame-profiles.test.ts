import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ContractProductIllustration } from '@/components/quote/ContractProductIllustration';
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
 it('uses a true projecting Z lip and carries the selected bullnose onto both shutter renderers',()=>{
  const options=['Manufacturer: Norman','Panel Config: L R','Tilt Type: Invisible Tilt','Frame Type: 1 1/2" Bullnose Z Frame'];
  const profile=shutterFrameProfile('Shutters',options)!;
  expect(profile.src).toMatch(/\.svg$/);
  const drawing=readFileSync(`public${profile.src}`,'utf8');
  // Supplier section: the upper face projects beyond the 1.5-inch back leg.
  expect(drawing).toContain('212.5 37.5H150V183');
  for(const extra of [[],['Split Tilt: No','Divider Rail: No']]){
   const html=renderToStaticMarkup(createElement(ContractProductIllustration,{productType:'Shutters',options:[...options,...extra],size:'anatomy'}));
   expect(html).toContain('data-selected-frame="norman-bullnose-z-1-5"');
   expect(html).toContain('data-frame-face="bullnose-z"');
  }
  const plain=renderToStaticMarkup(createElement(ContractProductIllustration,{productType:'Shutters',options:[...options.slice(0,3),'Frame Type: Plain L Frame'],size:'anatomy'}));
  expect(plain).not.toContain('data-frame-face="bullnose-z"');
 });

});
