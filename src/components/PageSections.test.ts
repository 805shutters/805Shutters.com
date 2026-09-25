import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Window } from "happy-dom";
import { describe, expect, it } from "vitest";
import { PageSections } from "./PageSections";
import { CommercialModeProvider } from "./CommercialModeProvider";
import { getPageBySlug, slugForPath } from "@/lib/site-data";

describe("product hub links in server-rendered content", () => {
  it.each([
    ["/shutters/", "/shutters/plantation/", "plantation shutters"],
    ["/shutters/", "/recent-projects/", "recent shutter projects"],
    ["/shutters/", "/motorized-window-shades-ventura-county/", "motorized shades"],
    ["/blinds/", "/motorized-window-shades-ventura-county/", "motorized shades"]
  ])("%s renders a visible content anchor to %s", (source, destination, label) => {
    const page = getPageBySlug(slugForPath(source));
    expect(page).toBeDefined();
    // Render the actual hub with its normal initial provider state, without
    // hydration or clicks. Script data alone must never satisfy this check.
    const html = renderToStaticMarkup(createElement(
      CommercialModeProvider,
      { children: createElement(PageSections, { page: page! }) }
    ));
    const window = new Window();
    try {
      window.document.body.innerHTML = html;
      const anchor = window.document.querySelector(`p > a[href="${destination}"]`);
      expect(anchor?.textContent).toBe(label);
      expect(anchor?.closest("script, nav, footer, details, [hidden], [aria-hidden='true']")).toBeNull();
    } finally {
      window.close();
    }
  });

  it.each(["/shutters/plantation/", "/recent-projects/"])("%s is an existing page", (path) => {
    expect(getPageBySlug(slugForPath(path))?.path).toBe(path);
  });
});
