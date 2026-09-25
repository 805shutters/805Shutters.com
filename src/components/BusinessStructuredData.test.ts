import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import { BusinessStructuredData } from "./BusinessStructuredData";
import { localBusinessJsonLd } from "@/lib/structured-data";
import { normalizeStructuredData } from "@/lib/structured-data-identity";

const route = vi.hoisted(() => ({ pathname: "/shutters/" }));
vi.mock("next/navigation", () => ({ usePathname: () => route.pathname }));
beforeEach(() => { route.pathname = "/shutters/"; });
const original = JSON.stringify(localBusinessJsonLd());
const corrected = JSON.stringify(normalizeStructuredData(localBusinessJsonLd(), "/shutters/"));
const render = () => renderToStaticMarkup(createElement(BusinessStructuredData, { original, corrected, paths: ["/", "/shades/", "/shutters/"] }));
it("includes the corrected business in server HTML without executing browser JavaScript", () => {
  const html = render();
  const business = JSON.parse(html.match(/<script[^>]*>(.*)<\/script>/s)![1])["@graph"][0];
  expect(business).toMatchObject({ name: "805 Shutters", telephone: "+1-805-806-9344", email: "805@805shutters.com", url: "https://www.805shutters.com/" });
});
it.each(["/", "/shades", "/shades/", "/crm/"])("keeps original schema on %s", (path) => {
  route.pathname = path;
  expect(render()).toBe(`<script type="application/ld+json">${original}</script>`);
});
