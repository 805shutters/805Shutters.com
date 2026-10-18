// @vitest-environment happy-dom
import React,{act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {it,expect} from 'vitest';
import {SelectQuickButtonsProvider} from '@mts/components/ui/select';
import {QuickQuoteSelect} from './QuickQuoteSelect';
it('turns small source choices into colored buttons, collapses, and reopens without changing the value',async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});const host=document.createElement('div');document.body.append(host);const root=createRoot(host);let saved='';
 function Harness(){const [value,set]=useState('');return React.createElement(SelectQuickButtonsProvider,{collapseSelected:true},React.createElement(QuickQuoteSelect,{field:"control_side","aria-label":"Side",value,onChange:e=>{saved=e.target.value;set(saved)}},React.createElement("option",{value:""},"Choose"),React.createElement("option",{value:"Left"},"Left"),React.createElement("option",{value:"Right"},"Right")))}
 await act(()=>root.render(React.createElement(Harness)));expect(host.querySelector('select')).toBeNull();expect(host.querySelector('[data-field-purpose=contract]')).not.toBeNull();await act(()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='Right')!.click());expect(saved).toBe('Right');expect(host.querySelector('button')?.getAttribute('aria-label')).toBe('Change Side: Right');await act(()=>host.querySelector('button')!.click());expect(saved).toBe('Right');expect(host.querySelectorAll('[aria-pressed]')).toHaveLength(2);await act(()=>root.unmount());host.remove();
});

it('keeps only color as a dropdown, including longer non-color option lists',async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});const host=document.createElement('div');const root=createRoot(host);
 const options=Array.from({length:7},(_,i)=>React.createElement('option',{key:i,value:String(i)},`Choice ${i}`));
 await act(()=>root.render(React.createElement(SelectQuickButtonsProvider,{},React.createElement(QuickQuoteSelect,{'aria-label':'Operating system',value:''},...options))));
 expect(host.querySelector('select')).toBeNull();expect(host.querySelectorAll('button')).toHaveLength(7);
 await act(()=>root.render(React.createElement(SelectQuickButtonsProvider,{},React.createElement(QuickQuoteSelect,{'aria-label':'Blind color',value:''},...options))));
 expect(host.querySelector('select')).not.toBeNull();await act(()=>root.unmount());
});
