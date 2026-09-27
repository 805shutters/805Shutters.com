// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { act, createElement, StrictMode } from "react";
import { createRoot } from "react-dom/client";
const state = vi.hoisted(() => ({ pathname: "/book-consultation/" }));
vi.mock("next/navigation", () => ({ usePathname: () => state.pathname }));
vi.mock("@vercel/analytics", () => ({ track: vi.fn() }));
import { RouteTracking } from "@/components/RouteTracking";
import { captureFirstTouchAttribution, getLeadAttribution, trackBookingEvent } from "./client-tracking";
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); window.sessionStorage.clear(); });

it("queues one PageView per public route even before the Meta script loads, then a deduplicatable Schedule", async () => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  delete window.fbq;
  vi.spyOn(document.head, "appendChild").mockImplementation(node => node);
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  const render = () => act(async () => root.render(createElement(StrictMode, null, createElement(RouteTracking))));
  await render();
  const queue = (window.fbq as unknown as { queue: unknown[][] }).queue;
  expect(queue).toEqual([["init", "117872572252906"], ["track", "PageView"]]);
  state.pathname = "/shutters/";
  await render();
  expect(queue.filter(args => args[1] === "PageView")).toHaveLength(2);
  state.pathname = "/crm/";
  await render();
  expect(queue.filter(args => args[1] === "PageView")).toHaveLength(2);
  trackBookingEvent({ eventId: "saved-lead-id", productTypes: ["Roman Shades"] });
  expect(queue.at(-1)).toEqual(["track", "Schedule", expect.any(Object), {eventID:"saved-lead-id"}]);
  expect(queue.filter(args => args[1] === "Lead")).toHaveLength(0);
  const count = queue.length;
  trackBookingEvent({});
  expect(queue).toHaveLength(count);
  await act(async () => root.unmount()); host.remove();
});

it("uses the booking landing campaign even when an older campaign is in session storage", () => {
  history.replaceState(null, "", "/?utm_source=old&utm_medium=old&utm_campaign=old&utm_content=old");
  captureFirstTouchAttribution();
  history.replaceState(null, "", "/book-consultation/?utm_source=test&utm_medium=cpc&utm_campaign=verify&utm_content=roman-book-now");
  expect(getLeadAttribution()).toMatchObject({ utm_source:"test",utm_medium:"cpc",utm_campaign:"verify",utm_content:"roman-book-now" });
});
