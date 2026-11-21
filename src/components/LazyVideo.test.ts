// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { LazyVideo } from "./LazyVideo";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("defers the poster until near the viewport and respects reduced motion", async () => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  let intersect: IntersectionObserverCallback = () => {};
  const disconnect = vi.fn();
  vi.stubGlobal("IntersectionObserver", class {
    constructor(callback: IntersectionObserverCallback) { intersect = callback; }
    observe() {}
    disconnect = disconnect;
  });
  vi.spyOn(window, "matchMedia").mockReturnValue({ matches: true } as MediaQueryList);
  const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  const host = document.createElement("div");
  const root = createRoot(host);
  await act(async () => root.render(createElement(LazyVideo, { src: "/video.mp4", poster: "/poster.jpg" })));
  const video = host.querySelector("video")!;
  expect(video.getAttribute("poster")).toBeNull();
  expect(video.preload).toBe("none");
  intersect([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
  expect(video.getAttribute("poster")).toBe("/poster.jpg");
  expect(play).not.toHaveBeenCalled();
  vi.mocked(window.matchMedia).mockReturnValue({ matches: false } as MediaQueryList);
  intersect([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
  expect(play).toHaveBeenCalledOnce();
  await act(async () => root.unmount());
  expect(disconnect).toHaveBeenCalledOnce();
});
