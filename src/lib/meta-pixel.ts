"use client";
import { getMetaPixelId } from "./tracking-config";

import { clickIdPattern, marketingPath } from "./meta-event-context";

function metaTrackingAllowed() {
  return !(navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl && Boolean(marketingPath(window.location.pathname));
}

type Pixel = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void;
  queue?: unknown[][];
  push?: Pixel;
  loaded?: boolean;
  version?: string;
};
let initialized = false;
let scriptRequested = false;

function loadPixelScript() {
  if (scriptRequested || !metaTrackingAllowed()) return;
  scriptRequested = true;
  const script = document.createElement("script");
  script.async = true;
  script.src = "https://connect.facebook.net/en_US/fbevents.js";
  document.head.appendChild(script);
}

function deferPixelScript() {
  const schedule = () => {
    if ("requestIdleCallback" in window) {
      window.requestIdleCallback(loadPixelScript, { timeout: 1500 });
    } else {
      setTimeout(loadPixelScript, 0);
    }
  };
  if (document.readyState === "complete") schedule();
  else window.addEventListener("load", schedule, { once: true });
}

// Install the queue synchronously so route and conversion events are retained
// while Meta's external script downloads. Private CRM routes never call this.
export function metaPixel(...args: unknown[]) {
  if (typeof window === "undefined" || !metaTrackingAllowed()) return;
  if (!initialized) {
    if (!window.fbq) {
      const queue: Pixel = (...items) => queue.callMethod
        ? queue.callMethod(...items) : void queue.queue!.push(items);
      queue.queue = [];
      queue.push = queue;
      queue.loaded = true;
      queue.version = "2.0";
      window.fbq = queue;
      (window as Window & { _fbq?: Pixel })._fbq = queue;
      deferPixelScript();
    } else {
      // An existing pixel owns its loader; do not inject a second copy.
      scriptRequested = true;
    }
    window.fbq("init", getMetaPixelId());
    initialized = true;
  }
  window.fbq?.(...args);
  // Conversion/contact events must not wait for an idle slot. Queued page views
  // keep their original event IDs, including the IDs used by server-side events.
  if (args[0] === "track" && args[1] !== "PageView") loadPixelScript();
}

export function trackPairedInteraction(eventName: "PageView" | "Contact", pathname: string) {
  const pagePath = marketingPath(pathname);
  if (!pagePath || !metaTrackingAllowed()) return;
  // Seed the first-party browser ID before the first server PageView races the pixel download.
  const cookies = document.cookie.split(/;\s*/);
  if (!cookies.some(cookie => cookie.startsWith("_fbp="))) {
    const random = crypto.getRandomValues(new Uint32Array(1))[0];
    document.cookie = `_fbp=fb.1.${Date.now()}.${random}; Path=/; Max-Age=7776000; SameSite=Lax; Secure`;
  }
  const click = new URLSearchParams(window.location.search).get("fbclid");
  if (click && clickIdPattern.test(click)) {
    const current = cookies.find(cookie => cookie.startsWith("_fbc="));
    if (current?.split(".").at(-1) !== click) {
      document.cookie = `_fbc=fb.1.${Date.now()}.${click}; Path=/; Max-Age=7776000; SameSite=Lax; Secure`;
    }
  }
  const eventId = crypto.randomUUID();
  metaPixel("track", eventName, {}, { eventID: eventId });
  void fetch("/api/meta-events/", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ eventName, eventId, pagePath }), keepalive: true,
  }).catch(() => {});
}
