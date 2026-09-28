// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { ConsultationConfirmation } from "./ConsultationConfirmation";

it("falls back to the initial on a failed portrait and retries when the portrait changes", async () => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement("div");
  const root = createRoot(host);
  const props = { date: "2026-09-28", time: "10:30", dateLabel: "Monday, September 28", timeLabel: "10:30 AM", address: "601 Carmen Drive",
    followUpRequested: false };
  try {
    await act(async () => root.render(createElement(ConsultationConfirmation, props)));
    expect(host.querySelector("img")).toBeNull();
    await act(async () => root.render(createElement(ConsultationConfirmation, { ...props, photoSrc: "/portrait.jpg" })));
    expect(host.querySelector("img")?.getAttribute("alt")).toBe("Jessica, your design consultant");
    await act(async () => host.querySelector("img")!.dispatchEvent(new Event("error")));
    expect(host.querySelector("img")).toBeNull();
    expect([...host.querySelectorAll("span")].some(span => span.textContent === "J")).toBe(true);
    await act(async () => root.render(createElement(ConsultationConfirmation, { ...props, photoSrc: "/new-portrait.jpg" })));
    expect(host.querySelector("img")?.getAttribute("src")).toBe("/new-portrait.jpg");
    const calendar = host.querySelector<HTMLAnchorElement>('a[target="_blank"]')!;
    expect(calendar.textContent).toContain("Add to Google Calendar");
    expect(calendar.rel).toBe("noopener noreferrer");
    expect(new URL(calendar.href).searchParams.get("dates")).toBe("20260928T173000Z/20260928T183000Z");
    expect(host.textContent).not.toContain("Book another appointment");
  } finally {
    await act(async () => root.unmount());
  }
});
