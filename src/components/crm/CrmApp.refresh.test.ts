// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@supabase/supabase-js";
import type { CrmDashboardData } from "@/lib/crm/types";

const harness = vi.hoisted(() => ({
  session: { access_token: "test-token", user: { id: "test-user" } } as Session,
  authChanged: (_event: string, _session: Session | null) => {},
  view: null as Record<string, unknown> | null,
  navigation: null as Record<string, unknown> | null,
}));
vi.mock("@/lib/supabase-browser", () => {
  const client = { auth: {
    getSession: async () => ({ data: { session: harness.session } }),
    onAuthStateChange: (callback: typeof harness.authChanged) => {
      harness.authChanged = callback;
      return { data: { listener: undefined, subscription: { unsubscribe() {} } } };
    },
    signOut: async () => { harness.authChanged("SIGNED_OUT", null); },
  } };
  return { getSupabaseBrowserClient: () => client };
});
vi.mock("./CrmNavigation", () => ({
  CrmNavigation: (props: Record<string, unknown>) => { harness.navigation = props; return null; },
}));
vi.mock("./OperationsOverview", () => ({
  JobStatusOverview: (props: Record<string, unknown>) => { harness.view = props; return null; },
  OperationsDashboard: () => null,
  BackToStatus: () => null,
}));
import { CrmApp } from "./CrmApp";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
const reads: { url: string; resolve: (body: unknown, status?: number) => void }[] = [];
function dashboard(asOf = "initial") {
  return { asOf, summary: {}, jobs: [], quotes: [], events: [], customers: [], customerProducts: [],
    customerContracts: [], customerFiles: [], bookkeepingRows: [], orderCogsEmails: [],
    installationInvoiceEmails: [], vendorOrderTasks: [], accountability: [],
  } as unknown as CrmDashboardData;
}
async function settle(index: number, value: unknown, status = 200) {
  await act(async () => { reads[index].resolve(value, status); });
}
async function focusBurst() {
  await act(async () => {
    window.dispatchEvent(new Event("focus"));
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("focus"));
  });
}
async function mount(activeOnly = false) {
  window.history.replaceState({}, "", activeOnly ? "/crm/" : "/crm/?full=1");
  await act(async () => { root.render(React.createElement(CrmApp)); });
  expect(reads).toHaveLength(1);
  await settle(0, activeOnly ? { items: [], asOf: "initial" } : dashboard());
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  harness.session = { access_token: "test-token", user: { id: "test-user" } } as Session;
  harness.view = null; harness.navigation = null;
  reads.length = 0;
  vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => {
    if (url.includes("/session/")) return Promise.resolve(Response.json({ email: "805@805shutters.com" }));
    if (init?.method && init.method !== "GET") return Promise.resolve(Response.json({ ok: true }));
    if (url.includes("/jobs/")) return new Promise<Response>(resolve => {
      reads.push({ url, resolve: (body, status = 200) => resolve(Response.json(body, { status })) });
    });
    return Promise.resolve(Response.json({}));
  }));
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove();
  vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals();
});

describe("CRM background refresh coordination", () => {
  it("retains startup protection when auth reports the initial session again", async () => {
    window.history.replaceState({}, "", "/crm/");
    await act(async () => root.render(React.createElement(CrmApp)));
    await act(async () => {
      harness.authChanged("INITIAL_SESSION", harness.session);
      harness.authChanged("SIGNED_IN", harness.session);
    });
    expect(reads).toHaveLength(1);
    await settle(0, { items: [], asOf: "initial" });
    expect(harness.navigation).not.toBeNull();
  });

  it.each([false, true])("shares focus, visibility and interval reads (active-only: %s)", async activeOnly => {
    await mount(activeOnly);
    await focusBurst();
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(reads).toHaveLength(2);
    expect(reads[1].url.includes("scope=active")).toBe(activeOnly);
    await settle(1, activeOnly ? { items: [], asOf: "updated" } : dashboard("updated"));
    expect(activeOnly ? harness.view?.activeSnapshot : harness.view?.data).toMatchObject({ asOf: "updated" });
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(reads).toHaveLength(3); // Existing 30-second schedule, no result cache.
  });

  it("makes a fresh post-save read and rejects a late pre-save response", async () => {
    await mount();
    await focusBurst();
    let saving!: Promise<unknown>;
    await act(async () => {
      const save = harness.view!.onSaveCost as (item: unknown, patch: unknown) => Promise<unknown>;
      saving = save({ job: { id: "test-job" }, customerName: "Test Customer" }, { job: { next_action: "Saved note" } });
    });
    expect(reads).toHaveLength(3);
    await settle(2, dashboard("after-save"));
    await act(async () => { await saving; });
    await settle(1, dashboard("stale-before-save"));
    expect(harness.view?.data).toMatchObject({ asOf: "after-save" });
  });

  it("keeps active and full reads separate when opening the full workspace", async () => {
    await mount(true); await focusBurst();
    let upgrade!: Promise<unknown>;
    await act(async () => {
      const load = harness.view!.onLoadAll as () => Promise<unknown>;
      upgrade = load();
      expect(load()).toBe(upgrade);
    });
    expect(reads).toHaveLength(3);
    expect(reads[1].url).toContain("scope=active");
    expect(reads[2].url).not.toContain("scope=active");
    await settle(2, dashboard("full"));
    await act(async () => { await upgrade; });
    await settle(1, { items: [], asOf: "old-active" });
    expect(harness.view?.data).toMatchObject({ asOf: "full" });
    expect(harness.view?.activeSnapshot).toMatchObject({ asOf: "initial" });
  });

  it("lets a foreground refresh finish despite a focus burst", async () => {
    await mount();
    await act(async () => { (harness.navigation!.onRefresh as () => void)(); });
    await focusBurst();
    expect(reads).toHaveLength(2);
    await settle(1, dashboard("foreground"));
    expect(harness.view?.data).toMatchObject({ asOf: "foreground" });
  });

  it("retries failed polls instead of retaining a rejected promise", async () => {
    await mount(); await focusBurst();
    await settle(1, { message: "Unavailable" }, 503);
    expect(harness.view?.data).toBeNull(); // Existing stale-data warning behavior.
    await focusBurst(); expect(reads).toHaveLength(3);
    await settle(2, dashboard("recovered"));
    expect(harness.view?.data).toMatchObject({ asOf: "recovered" });
  });

  it("does not apply a poll from an old token after session refresh", async () => {
    await mount(); await focusBurst();
    await act(async () => harness.authChanged("TOKEN_REFRESHED", { ...harness.session, access_token: "new-test-token" }));
    await focusBurst(); expect(reads).toHaveLength(3);
    await settle(2, dashboard("new-session"));
    await settle(1, dashboard("old-session"));
    expect(harness.view?.data).toMatchObject({ asOf: "new-session" });
  });

  it("stops polling after sign-out and ignores the outstanding response", async () => {
    await mount(); await focusBurst();
    await act(async () => { (harness.navigation!.onSignOut as () => void)(); });
    await settle(1, dashboard("late-response"));
    await focusBurst();
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(reads).toHaveLength(2);
    expect(host.textContent).toContain("CRM login.");
  });

  it("does not poll a hidden tab", async () => {
    await mount();
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    await focusBurst();
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(reads).toHaveLength(1);
  });
});
