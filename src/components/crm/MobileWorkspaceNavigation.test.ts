// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { MobileWorkspaceNavigation } from "./MobileWorkspaceNavigation";

vi.mock("next/navigation", () => ({ usePathname: () => "/crm/mobile/search/" }));
it("keeps all workspaces reachable from the shared tabs and opens an accessible More sheet", async () => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  try {
    await act(async () => root.render(createElement(MobileWorkspaceNavigation)));
    const tabs = host.querySelector('nav[aria-label="805 mobile workspaces"]')!;
    expect([...tabs.querySelectorAll("a")].map(a => a.getAttribute("href"))).toEqual(["/crm/mobile/?appointments=1", "/crm/technical-measures/", "/crm/mobile/quotes/", "/crm/mobile/job-status/"]);
    const more = tabs.querySelector("button")!;
    expect(more.className).toBe("active");
    expect(more.getAttribute("aria-expanded")).toBe("false");
    await act(async () => more.click());
    const dialog = host.querySelector("dialog")!;
    expect(dialog.open).toBe(true);
    expect(more.getAttribute("aria-expanded")).toBe("true");
    expect([...dialog.querySelectorAll("a")].map(a => a.getAttribute("href"))).toEqual(["/crm/mobile/", "/crm/mobile/contracts/", "/crm/mobile/search/"]);
    expect(dialog.querySelector('[aria-current="page"]')?.textContent).toBe("Info & payments");
    await act(async () => dialog.querySelector<HTMLButtonElement>('[aria-label="Close more workspaces"]')!.click());
    expect(dialog.open).toBe(false);
    expect(more.getAttribute("aria-expanded")).toBe("false");
  } finally { await act(async () => root.unmount()); host.remove(); }
});
