// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import type { Session } from "@supabase/supabase-js";
import { expect, it, vi } from "vitest";
import { useCalendarSnapshot } from "./useCalendarSnapshot";

it("ignores an obsolete week response and hides the prior account's appointments", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const requests: Array<(value: Response) => void> = [];
  vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(resolve => requests.push(resolve))));
  const host = document.createElement("div");
  const root = createRoot(host);
  function Probe({ owner, date }: { owner: string; date: string }) {
    const result = useCalendarSnapshot({ user: { id: owner }, access_token: owner } as Session, true, date);
    return createElement("span", null, JSON.stringify(result.snapshot));
  }
  const render = async (owner: string, date: string) => { await act(async () => root.render(createElement(Probe, { owner, date }))); };
  const respond = async (index: number, id: string) => { await act(async () => requests[index](new Response(JSON.stringify({ events: [{ id }], jobs: [] })))); };
  try {
    await render("first", "2026-11-22");
    await render("first", "2026-11-29");
    await respond(1, "current-week");
    await respond(0, "obsolete-week");
    expect(host.textContent).toContain("current-week");
    expect(host.textContent).not.toContain("obsolete-week");
    await render("second", "2026-11-29");
    expect(host.textContent).toBe("null");
    await respond(2, "second-account");
    expect(host.textContent).toContain("second-account");
  } finally { await act(async () => root.unmount()); vi.unstubAllGlobals(); }
});
