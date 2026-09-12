// @vitest-environment happy-dom
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {LineItemPriceInput} from './LineItemPriceInput';
Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
let host:HTMLDivElement,root:ReturnType<typeof createRoot>;
let save:ReturnType<typeof vi.fn<(price: number) => Promise<void>>>;
beforeEach(async()=>{host=document.createElement('div');document.body.append(host);root=createRoot(host);save=vi.fn<(price: number) => Promise<void>>().mockResolvedValue(undefined);await act(()=>root.render(React.createElement(LineItemPriceInput,{value:125,roomName:'Kitchen',onSave:save})));});
afterEach(async()=>{await act(()=>root.unmount());host.remove();});
async function enter(value:string){await act(()=>{const input=host.querySelector('input')!;input.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));});}
async function blur(){await act(async()=>host.querySelector('input')!.blur());}
it('saves a complete zero price on blur, not intermediate typing',async()=>{await enter('0');expect(save).not.toHaveBeenCalled();await blur();expect(save).toHaveBeenCalledExactlyOnceWith(0);});
it('cancels without writing when Escape is pressed',async()=>{await enter('999');await act(()=>host.querySelector('input')!.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})));await blur();expect(save).not.toHaveBeenCalled();expect(host.querySelector('input')!.value).toBe('125.00');});
it('keeps invalid blanks out of persistence',async()=>{await enter('');await blur();expect(save).not.toHaveBeenCalled();expect(host.querySelector('[role=alert]')!.textContent).toContain('$0');});
it('shows failed saves and permits the same price to be retried',async()=>{save.mockRejectedValueOnce(new Error('Connection interrupted'));await enter('25.50');await blur();expect(host.textContent).toContain('Connection interrupted');await enter('25.50');await blur();expect(save).toHaveBeenCalledTimes(2);expect(host.querySelector('[role=alert]')).toBeNull();});

it('pins an explicitly reentered price even when the displayed amount matches',async()=>{await enter('125');await blur();expect(save).toHaveBeenCalledExactlyOnceWith(125);});

it('accepts pasted currency with cents and saves once via the visible button',async()=>{
 await enter('$1,234.56');
 await act(async()=>host.querySelector('button')!.click());
 expect(save).toHaveBeenCalledExactlyOnceWith(1234.56);
 expect(host.textContent).toContain('Price saved');
 await blur();expect(save).toHaveBeenCalledTimes(1);
});
it('preserves a draft across incoming server updates while typing',async()=>{
 await enter('827.45');
 await act(()=>root.render(React.createElement(LineItemPriceInput,{value:200,roomName:'Kitchen',onSave:save})));
 expect(host.querySelector('input')!.value).toBe('827.45');
 await blur();expect(save).toHaveBeenCalledExactlyOnceWith(827.45);
});
it('rejects negative prices and accidental extra decimal places',async()=>{
 await enter('-1');await blur();expect(save).not.toHaveBeenCalled();
 await enter('12.345');await blur();expect(save).not.toHaveBeenCalled();
});
