// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  delete window.fbq;
  vi.resetModules();
});

it("queues page views, expedites a conversion, and loads the browser library only once", async () => {
  vi.resetModules();
  vi.useFakeTimers();
  history.replaceState(null, "", "/book-consultation/");
  vi.spyOn(document, "readyState", "get").mockReturnValue("loading");
  const append = vi.spyOn(document.head, "appendChild").mockImplementation(node => node);
  const { metaPixel } = await import("./meta-pixel");
  metaPixel("track", "PageView", {}, { eventID: "page-event" });
  expect(append).not.toHaveBeenCalled();
  metaPixel("track", "Schedule", {}, { eventID: "saved-booking" });
  expect(append).toHaveBeenCalledTimes(1);
  expect((append.mock.calls[0][0] as HTMLScriptElement).src).toBe("https://connect.facebook.net/en_US/fbevents.js");
  window.dispatchEvent(new Event("load"));
  await vi.runAllTimersAsync();
  expect(append).toHaveBeenCalledTimes(1);
  expect((window.fbq as unknown as { queue: unknown[][] }).queue.at(-1)).toEqual(["track", "Schedule", {}, { eventID: "saved-booking" }]);
});

it("does not add a second library when a pixel queue already exists", async () => {
  history.replaceState(null, "", "/book-consultation/");
  window.fbq = vi.fn();
  const append = vi.spyOn(document.head, "appendChild").mockImplementation(node => node);
  const { metaPixel } = await import("./meta-pixel");
  metaPixel("track", "Contact");
  expect(append).not.toHaveBeenCalled();
  expect(window.fbq).toHaveBeenCalledWith("track", "Contact");
});
