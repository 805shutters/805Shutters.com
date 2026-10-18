// @vitest-environment happy-dom
import React, {act, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
import {MobileQuoteStepCompletion} from './MobileQuoteStepCompletion';
import {MobileMeasurementKeypad} from './MobileMeasurementKeypad';
it('finishes dimensions on the final fraction choice, never on a partial number',async()=>{
 const done=vi.fn(), host=document.createElement('div');document.body.append(host);
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});const root=createRoot(host);
 function Harness(){const [width,setWidth]=useState(0),[height,setHeight]=useState(0);return React.createElement(MobileQuoteStepCompletion.Provider,{value:done},React.createElement(MobileMeasurementKeypad,{keypadOnly:true,widthWhole:width,heightWhole:height,widthFraction:"0",heightFraction:"0",onWholeChange:(side,n)=>side==='width'?setWidth(n):setHeight(n),onFractionChange:()=>{}}));}
 try {await act(async()=>root.render(React.createElement(Harness)));
 const click=async(text:string)=>{const button=[...host.querySelectorAll('button')].find(b=>b.textContent===text)!;await act(async()=>button.click());};
 expect(host.textContent).not.toContain('Next: height');
 await click('3');await click('6');expect(done).not.toHaveBeenCalled();await click('Even');
 expect(host.querySelector('input')?.getAttribute('aria-label')).toBe('height whole inches');
 await click('6');expect(done).not.toHaveBeenCalled();await click('0');expect(done).not.toHaveBeenCalled();
 await click('Even');expect(done).toHaveBeenCalledTimes(1);
 }finally{await act(async()=>root.unmount());host.remove();}
});

it('finishes room only after selecting a window letter and permits changing a saved letter', async()=>{
 const {MobileRoomSelector}=await import('./MobileRoomSelector');
 const {newMobileQuoteWindow}=await import('@/lib/crm/mobile-quote-draft');
 const done=vi.fn(),host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 function RoomHarness(){const [line,setLine]=useState({...newMobileQuoteWindow(),room:'Living room',roomChoice:'Living room' as const});return React.createElement(MobileQuoteStepCompletion.Provider,{value:done},React.createElement(MobileRoomSelector,{buttonsOnly:true,window:line,onSelectRoom:()=>{},onSelectBedroom:()=>{},onCustomRoomChange:()=>{},onSelectLetter:position=>setLine(current=>({...current,position}))}));}
 try{await act(async()=>root.render(React.createElement(RoomHarness)));expect(done).not.toHaveBeenCalled();
 const letter=()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='A')!;
 await act(async()=>letter().click());expect(done).toHaveBeenCalledTimes(1);
 await act(async()=>letter().click());expect(done).toHaveBeenCalledTimes(1);
 await act(async()=>letter().click());expect(done).toHaveBeenCalledTimes(2);
 }finally{await act(async()=>root.unmount());host.remove();}
});
