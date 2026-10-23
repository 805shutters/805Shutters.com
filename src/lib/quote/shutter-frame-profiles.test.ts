import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ContractProductIllustration } from '@/components/quote/ContractProductIllustration';
import { ContractAnatomy } from '@/components/quote/ContractAnatomy';
import { SHUTTER_FRAME_PROFILES, shutterFrameProfile } from './shutter-frame-profiles';
describe('approved contract frame pencil sketches',()=>{
 it('matches all 40 approved drawings and menu aliases to their own artwork',()=>{
  expect(SHUTTER_FRAME_PROFILES).toHaveLength(40);
  expect(new Set(SHUTTER_FRAME_PROFILES.map(p=>p.approvalId)).size).toBe(40);
  for(const p of SHUTTER_FRAME_PROFILES){
   expect(shutterFrameProfile('Shutters',[`Manufacturer: ${p.manufacturer}`,`Frame Type: ${p.label}`])?.id).toBe(p.id);
   expect(existsSync(`public${p.src}`)).toBe(true);
   expect(p.src).toContain("frame-profiles-approved-v1/");
   for(const alias of p.aliases) {
    expect(shutterFrameProfile("Shutters",[`Manufacturer: ${p.manufacturer}`, `Product style: ${p.aquashield ? "Woodlore Aquashield" : ""}`,`Frame Type: ${alias}`])?.id).toBe(p.id);
   }
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
 it('applies saved frame profiles to the configured pencil assembly',()=>{
  const options=['Manufacturer: Norman','Panel Config: L R','Tilt Type: Invisible Tilt','Frame Type: 1 1/2" Bullnose Z Frame'];
  const profile=shutterFrameProfile('Shutters',options)!;
  expect(profile.approvalId).toBe('N17');
  expect(profile.src).toMatch(/frame-profiles-approved-v1\/norman-bullnose-z-1-5\.webp$/);
  for(const extra of [[],['Split Tilt: No','Divider Rail: No']]){
   const html=renderToStaticMarkup(createElement(ContractProductIllustration,{productType:'Shutters',options:[...options,...extra],size:'anatomy'}));
   expect(html).toContain('/c-v1/shutter-hidden-plain.webp');
   expect(html).toContain('data-shutter-assembly="shared-frame"');
  }
  const plain=renderToStaticMarkup(createElement(ContractProductIllustration,{productType:'Shutters',options:[...options.slice(0,3),'Frame Type: Plain L Frame'],size:'anatomy'}));
  expect(plain).not.toContain('data-frame-face="bullnose-z"');
 });

 it('matches saved Norman buildout and light-block menu labels without flattening the variants',()=>{
  const cases=[['Beaded L Frame with 1/4" Light Block','N02'],['Beaded L Frame with 1/2" Buildout *','N03'],['Beaded L Frame with 1" Buildout *','N04'],['Vintage L Frame with 1/4" Light Block','N06'],['Vintage L Frame with 1/2" Buildout *','N07'],['Vintage L Frame with 1" Buildout *','N08'],['Colonial L Frame with 1/4" Light Block','N10'],['Colonial L Frame with 1/2" Buildout *','N11']];
  for(const [label,id] of cases)expect(shutterFrameProfile('Shutters',['Supplier: Norman',`Frame Type: ${label}`])?.approvalId).toBe(id);
 });
 it('keeps AquaShield drawings distinct using saved product style or public contract styleName',()=>{
  const cases=[['Vintage L Frame','A01'],['Vintage L Frame with 1/2" Buildout *','A02'],['Deep Plain L frame *','A03'],['2" Camber Deco Frame','A04'],['1 1/2" Deep Bullnose Z frame *','A05'],['7/8" Traditional Hang Strip','A06']];
  for(const [label,id] of cases){
   const opts=[`Frame Type: ${label}`];
   expect(shutterFrameProfile('Shutters',[...opts,'Product style: Woodlore Aquashield'])?.approvalId).toBe(id);
   expect(shutterFrameProfile('Shutters',opts,'Woodlore Aquashield')?.approvalId).toBe(id);
  }
  expect(shutterFrameProfile('Shutters',['Frame: Vintage L Frame'])?.approvalId).toBe('N05');
  // AquaShield Beaded L has no approved AquaShield-specific drawing in this packet.
  expect(shutterFrameProfile('Shutters',['Frame: Beaded L Frame'],'Woodlore Aquashield')).toBeNull();
 });
 it('omits no-frame selections, unsupported profiles and unrelated suppliers',()=>{
  for(const frame of ['Direct Mount (No Frame)','Panel Only','L Inside','Z Crest FS','VL Outside FS','VZ Fine','VZ Crest'])expect(shutterFrameProfile('Shutters',[`Frame Type: ${frame}`])).toBeNull();
  expect(shutterFrameProfile('Shutters',['Manufacturer: Polar','Frame: Beaded L Frame'])).toBeNull();
 });
 it('includes the correct approved drawing in shared contract markup after a selection changes',()=>{
  for(const [frame,id] of [['Beaded L Frame','norman-beaded-l'],['Plain L Frame','norman-plain-l']]){
   const html=renderToStaticMarkup(createElement(ContractAnatomy,{productType:'Shutters',room:'Office',layout:'grouped',options:[`Frame Type: ${frame}`]}));
   expect(html).toContain(`data-frame-profile="${id}"`);
   expect(html).toContain(`frame-profiles-approved-v1/${id}.webp`);
   expect(html).toContain(`${frame}</strong><span>Side profile`);
  }
  const html=renderToStaticMarkup(createElement(ContractAnatomy,{productType:'Shutters',room:'Office',layout:'grouped',styleName:'Woodlore Aquashield',options:['Frame Type: Vintage L Frame']}));
  expect(html).toContain('data-frame-profile="norman-aquashield-vintage-l"');
 });
});

it('uses the selected hidden split-tilt panel in the large preview',()=>{
 const html=renderToStaticMarkup(createElement(ContractProductIllustration,{productType:'Shutters',size:'anatomy',options:['Panel Config: LR','Tilt Type: Invisible Tilt','Split Tilt: Yes','Divider Rail: No']}));
 expect(html).toContain('/c-v1/shutter-hidden-split.webp');
 expect(html).toContain('data-shutter-assembly="shared-frame"');
 expect(html).not.toContain('louver-up.webp');
});
