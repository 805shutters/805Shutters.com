// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { PrintButton } from "./PrintButton";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); document.body.innerHTML = ""; });

it.each([true, false])("waits for artwork before opening print; decode succeeds: %s", async (success) => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  const contract = document.createElement("main");
  contract.className = "customer-contract-print-root";
  const illustration = document.createElement("img");
  contract.append(illustration);
  document.body.append(contract, host);
  let resolve!: () => void, reject!: (reason: Error) => void;
  const decoded = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  vi.spyOn(illustration, "decode").mockReturnValue(decoded);
  const print = vi.fn();
  vi.stubGlobal("print", print);
  const root = createRoot(host);
  try {
    await act(async () => root.render(createElement(PrintButton)));
    await act(async () => host.querySelector("button")!.click());
    expect(print).not.toHaveBeenCalled();
    expect(host.querySelector("button")!.disabled).toBe(true);
    expect(illustration.loading).toBe("eager");
    await act(async () => { if (success) resolve(); else reject(new Error("image unavailable")); });
    expect(print).toHaveBeenCalledTimes(success ? 1 : 0);
    expect(host.querySelector("button")!.disabled).toBe(false);
    expect(Boolean(host.querySelector('[role="alert"]'))).toBe(!success);
  } finally { await act(async () => root.unmount()); }
});
