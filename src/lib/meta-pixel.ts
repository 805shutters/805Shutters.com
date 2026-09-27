"use client";
import { getMetaPixelId } from "./tracking-config";

type Pixel = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void;
  queue?: unknown[][];
  push?: Pixel;
  loaded?: boolean;
  version?: string;
};
let initialized = false;

// Install the queue synchronously so route and conversion events are retained
// while Meta's external script downloads. Private CRM routes never call this.
export function metaPixel(...args: unknown[]) {
  if (typeof window === "undefined") return;
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
      const script = document.createElement("script");
      script.async = true;
      script.src = "https://connect.facebook.net/en_US/fbevents.js";
      document.head.appendChild(script);
    }
    window.fbq("init", getMetaPixelId());
    initialized = true;
  }
  window.fbq?.(...args);
}
