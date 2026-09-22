// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import type { Session } from "@supabase/supabase-js";
import { ExistingAppointmentCustomer } from "./ExistingAppointmentCustomer";

const fixture = {jobId:"return-job",name:"Morgan Nelson",phone:"8055550142",email:"morgan@example.test",address:"42 Sample Lane",city:"Ventura",productInterest:"Roller Shades",assignedTo:"Jessica",leadSource:"Referral",notes:"Side gate",status:"completed"};
const roots: ReturnType<typeof createRoot>[] = [];
afterEach(async()=> {for(const root of roots.splice(0)) await act(async()=>root.unmount()); document.body.innerHTML="";vi.unstubAllGlobals();vi.useRealTimers();});
async function mount() {
 (globalThis as Record<string,unknown>).IS_REACT_ACT_ENVIRONMENT=true;
 vi.useFakeTimers(); const container=document.createElement("div");document.body.append(container);const root=createRoot(container); roots.push(root);const select=vi.fn();
 await act(async()=>root.render(createElement(ExistingAppointmentCustomer,{session:{access_token:"fixture"} as Session,selected:null,onSelect:select})));
 await act(async()=>container.querySelector('button')!.click());
 return {container,select};
}
async function search(container: HTMLElement, query: string) {
 const input=container.querySelector('input')!;
 await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,query);input.dispatchEvent(new Event('input',{bubbles:true}));});
 await act(async()=>vi.advanceTimersByTimeAsync(300));
}
it('selects an exact job, displays distinguishing details and paginates',async()=>{
 const fetcher=vi.fn().mockResolvedValue({ok:true,json:async()=>({results:[fixture],nextCursor:'30'})});vi.stubGlobal('fetch',fetcher);
 const {container,select}=await mount();await search(container,'nel');
 expect(fetcher.mock.calls[0][1].headers.Authorization).toBe('Bearer fixture');expect(container.textContent).toContain('42 Sample Lane, Ventura');
 await act(async()=>[...container.querySelectorAll('button')].find(b=>b.textContent==='More results')!.click());await act(async()=>vi.advanceTimersByTimeAsync(300));expect(fetcher.mock.calls[1][0]).toContain('cursor=30');
 await act(async()=>container.querySelector('li button')!.dispatchEvent(new MouseEvent('click',{bubbles:true})));expect(select).toHaveBeenCalledWith(fixture);expect(container.querySelector('input')).toBeNull();
});
it('ignores stale search replies and shows recoverable failures',async()=>{
 let resolveOld!: (value:unknown)=>void;
 const fetcher=vi.fn().mockImplementationOnce(()=>new Promise(resolve=>{resolveOld=resolve})).mockResolvedValueOnce({ok:false});vi.stubGlobal('fetch',fetcher);
 const {container,select}=await mount();await search(container,'old');await search(container,'new');
 await act(async()=>resolveOld({ok:true,json:async()=>({results:[fixture],nextCursor:null})}));
 expect(container.textContent).toContain('could not load');expect(container.querySelector('li')).toBeNull();expect(select).not.toHaveBeenCalled();expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true);
});
