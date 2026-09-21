import {expect,it}from'vitest';
import {createElement}from'react';
import {renderToStaticMarkup}from'react-dom/server';
import type{SelectionContext,SelectionRecord}from'@/lib/quote-v2/core';
import type{SalesQuoteDesign}from'@mts/types/quote';
import {getQuoteDesignDetails}from'@mts/lib/quoteDesignDetails';
import {SundanceEuropanelLayout}from'@/components/crm/SundanceEuropanelLayout';
import{createSundanceEuropanelLayout,readSundanceEuropanelLayout,sundanceEuropanelLayoutIssues,validateSundanceEuropanelLayout,SUNDANCE_EUROPANEL_LAYOUT_KEY as KEY}from'./europanel-layout';
import{validateSundanceShadeConfiguration}from'./shade-configuration';
function context(productId='sundance_europanels'):Pick<SelectionContext,'productId'|'programId'|'configuration'|'widthInches'|'heightInches'>{return{productId,programId:null,widthInches:96,heightInches:84,configuration:{fabric_color_id:'exact-test-color',sundance_shade_panel_count:'4',sundance_shade_channels:'4'}};}
function layout(s= context()){
 const r=createSundanceEuropanelLayout(s.productId,s.configuration,96,84,['a','b','c','d'])!;
 r.panels.forEach((p,i)=>{p.width=27;p.height=82;p.channel=i+1;});s.configuration={...s.configuration,[KEY]:r as unknown as SelectionRecord};return{s,r};
}
it('preserves independently measured panels without equating their summed width or height with the opening',()=>{
 const{s,r}=layout();expect(sundanceEuropanelLayoutIssues(s)).toEqual([]);expect(readSundanceEuropanelLayout(JSON.parse(JSON.stringify(r)))).toEqual(r);
 expect(r.panels.reduce((sum,p)=>sum+p.width!,0)).toBe(108);expect(s.widthInches).toBe(96);
 r.panels[1].width=29.125;expect(sundanceEuropanelLayoutIssues(s)).toEqual([]);
});
it.each(['sundance_europanels','sundance_louvolite_europanels'])('enforces selected panel counts and channel bounds in %s',productId=>{
 const{s,r}=layout(context(productId));r.panels[3].channel=5;expect(validateSundanceEuropanelLayout(s)[0]).toMatchObject({severity:'hard_block'});
 expect(validateSundanceShadeConfiguration(s).some(i=>i.ruleId.startsWith('sundance.europanel.layout'))).toBe(true);
 s.configuration={...s.configuration,sundance_shade_channels:'5'};expect(sundanceEuropanelLayoutIssues(s)).toEqual([]);
 // No source says all panels must occupy unique channels, so do not invent that constraint.
 r.panels[3].channel=1;expect(sundanceEuropanelLayoutIssues(s)).toEqual([]);
 r.panels.pop();expect(sundanceEuropanelLayoutIssues(s)[0]).toContain('selected two to five');
});
it('makes stale fabric/opening records explicit without silently replacing entered measurements',()=>{
 const{s,r}=layout();s.widthInches=97;s.configuration={...s.configuration,fabric_color_id:'other'};expect(sundanceEuropanelLayoutIssues(s)[0]).toContain('different product, fabric or opening');expect(r.panels[0].width).toBe(27);
});
it('rejects malformed layouts, duplicate panel IDs, nonpositive measurements and fractional channels',()=>{
 expect(readSundanceEuropanelLayout({version:2})).toBeNull();const{s,r}=layout();r.panels[1].id='a';r.panels[0].width=0;r.panels[2].channel=1.5;
 expect(sundanceEuropanelLayoutIssues(s)).toHaveLength(3);
 r.panels[0].width=NaN;expect(sundanceEuropanelLayoutIssues(s).some(i=>i.includes('positive measured'))).toBe(true);
});
it('initializes exact panel identities with blank dimensions and no inferred channels',()=>{
 const s=context(),r=createSundanceEuropanelLayout(s.productId,s.configuration,96,84,['a','b','c','d'])!;
 expect(r.panels[0]).toEqual({id:'a',width:null,height:null,channel:null});expect(createSundanceEuropanelLayout(s.productId,s.configuration,96,84,['a','a','c','d'])).toBeNull();
 expect(sundanceEuropanelLayoutIssues(s)).toEqual([]);
 const html=renderToStaticMarkup(createElement(SundanceEuropanelLayout,{productId:s.productId,options:{...s.configuration,[KEY]:r},widthInches:96,heightInches:84,onChange:()=>{}}));expect(html).toContain('Sundance Europanel 4 width');expect(html).toContain('guide does not provide overlap');expect(html).toContain('Unconfirmed');
});
it('formats only the entered physical panel dimensions and channel, keeping internal notes and IDs private',()=>{
 const{s,r}=layout();r.notes='Internal factory confirmation pending';const details=getQuoteDesignDetails({options_json:{[KEY]:s.configuration[KEY]}} as unknown as SalesQuoteDesign);
 expect(details).toHaveLength(4);expect(details[0]).toEqual({label:'Panel 1',value:'27 × 82 inches; track channel 1'});expect(JSON.stringify(details)).not.toContain('Internal factory');
});
