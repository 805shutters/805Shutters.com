import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ userAgent: "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)" }));
vi.mock("@/components/crm/CrmApp", () => ({ CrmApp: () => null }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "user-agent": state.userAgent }) }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));
import CrmPage from "./page";
beforeEach(() => { vi.stubGlobal("React", React); state.userAgent = "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)"; });
afterEach(() => vi.unstubAllGlobals());
describe("iPad access to all saved quotes", () => {
  it("opens the requested full quotes workspace without bouncing back into the mobile wizard", async () => {
    const result = await CrmPage({ searchParams: Promise.resolve({ view: "quotes" }) });
    expect(result.props.initialTab).toBe("quotes");
  });
  it("keeps the normal iPad landing page and existing tracking/report overrides", async () => {
    await expect(CrmPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("redirect:/crm/mobile/");
    for (const view of ["tracking", "reports"]) {
      expect((await CrmPage({ searchParams: Promise.resolve({ view }) })).props.initialTab).toBe(view);
    }
  });
});

it("opens Job Status as the desktop CRM home", async () => {
  state.userAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X)";
  expect((await CrmPage({searchParams: Promise.resolve({})})).props.initialTab).toBe("tracking");
});
