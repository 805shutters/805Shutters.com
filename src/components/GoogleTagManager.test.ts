import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => state.pathname }));
import { GoogleTagManagerHead, GoogleTagManagerBody } from "./GoogleTagManager";

describe("GTM server-rendered snippets", () => {
  it("includes the head bootstrap and no-JavaScript iframe in initial HTML", () => {
    state.pathname = "/book-consultation/";
    const head = renderToStaticMarkup(createElement(GoogleTagManagerHead));
    const body = renderToStaticMarkup(createElement(GoogleTagManagerBody));
    expect(head).toContain('<script id="805-gtm">');
    expect(head).toContain("GTM-MLVF9PP3");
    expect(body).toContain('<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-MLVF9PP3"');
    expect(body).toContain('height="0" width="0"');
    expect(body).toContain("display:none;visibility:hidden");
  });
  it.each(["/crm/", "/quote/token/", "/autopay/token/", "/installer-form/token/", "/quote-lab/"])("renders neither snippet on %s", (pathname) => {
    state.pathname = pathname;
    expect(renderToStaticMarkup(createElement(GoogleTagManagerHead))).toBe("");
    expect(renderToStaticMarkup(createElement(GoogleTagManagerBody))).toBe("");
  });
});
