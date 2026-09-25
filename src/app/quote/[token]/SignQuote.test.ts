// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
const submit = vi.hoisted(() => vi.fn());
vi.mock("./submit-signature", async original => ({ ...await original<typeof import("./submit-signature")>(), submitSignature: submit }));
import { SignQuote } from "./SignQuote";
let root: Root; let host: HTMLDivElement;
const context = { fillStyle: "", strokeStyle: "", lineWidth: 0, lineCap: "", lineJoin: "", fillRect: vi.fn(), beginPath: vi.fn(), arc: vi.fn(), fill: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn() };
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/png;base64,c3ludGhldGlj");
  HTMLCanvasElement.prototype.setPointerCapture = vi.fn();
  HTMLCanvasElement.prototype.hasPointerCapture = () => true;
  HTMLCanvasElement.prototype.releasePointerCapture = vi.fn();
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  submit.mockReset();
});
afterEach(async () => { await act(() => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function render(total=450) { await act(() => root.render(createElement(SignQuote, { token: "synthetic", customerName: "Synthetic Customer", total }))); }
async function click(element: Element) { await act(() => (element as HTMLElement).click()); }
function button(text: string) { return [...host.querySelectorAll("button")].find(b => b.textContent === text)!; }
async function draw(pointerType="mouse") {
  const canvas = host.querySelector("canvas")!;
  vi.spyOn(canvas,"getBoundingClientRect").mockReturnValue({left:0,top:0,width:500,height:180} as DOMRect);
  for (const type of ["pointerdown","pointermove","pointerup"]) {
    await act(() => canvas.dispatchEvent(new PointerEvent(type,{bubbles:true,pointerId:1,pointerType,isPrimary:true,button:0,clientX:type === "pointerdown" ? 50 : 200,clientY:60})));
  }
}
it.each(["mouse", "touch", "pen"])("requires ink and consent with %s, then sends PNG and the reviewed total", async pointerType => {
  await render(); await click(host.querySelectorAll('input[type=radio]')[1]);
  await click(button("Sign & approve")); expect(submit).not.toHaveBeenCalled(); expect(host.textContent).toContain("Please draw");
  await draw(pointerType); await click(button("Sign & approve")); expect(submit).not.toHaveBeenCalled();
  await click(host.querySelector('input[type=checkbox]')!);
  submit.mockResolvedValue(undefined); await click(button("Sign & approve"));
  expect(submit).toHaveBeenCalledWith("synthetic",{printedName:"Synthetic Customer",signature:"data:image/png;base64,c3ludGhldGlj",acknowledgedTotal:450});
  expect(host.textContent).toContain("Your contract is signed");
});
it("clear and price changes invalidate ink; failed submission retains ink for retry", async () => {
  await render(); await click(host.querySelectorAll('input[type=radio]')[1]); await draw();
  await click(button("Clear signature")); await click(host.querySelector('input[type=checkbox]')!); await click(button("Sign & approve"));
  expect(submit).not.toHaveBeenCalled();
  await draw(); submit.mockRejectedValueOnce(new Error("Connection failed")); await click(button("Sign & approve"));
  expect(host.textContent).toContain("Connection failed");
  submit.mockResolvedValue(undefined); await click(button("Sign & approve")); expect(submit).toHaveBeenCalledTimes(2);
});
it("requires fresh consent and signature after the reviewed total changes", async()=>{
 await render();await click(host.querySelectorAll('input[type=radio]')[1]);await draw();await click(host.querySelector('input[type=checkbox]')!);
 await render(500);expect((host.querySelector('input[type=checkbox]') as HTMLInputElement).checked).toBe(false);
 await click(host.querySelector('input[type=checkbox]')!);await click(button('Sign & approve'));expect(submit).not.toHaveBeenCalled();
});
it("keeps the typed signature option and prevents double submission",async()=>{
 await render();await click(host.querySelector('input[type=checkbox]')!);
 let finish!:()=>void;submit.mockImplementation(()=>new Promise<void>(resolve=>{finish=resolve;}));
 await click(button('Sign & approve'));await click(button('Submitting…'));
 expect(submit).toHaveBeenCalledTimes(1);expect(submit.mock.calls[0][1].signature).toBe('Synthetic Customer');
 await act(()=>finish());expect(host.textContent).toContain('Your contract is signed');
});
