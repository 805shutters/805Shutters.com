import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getAnswerPage } from "./llm-search-pages";
import { getPageByPath, homePage, site } from "./site-data";

function pageLinks(path: string) {
  return getPageByPath(path)?.sections.flatMap((section) => section.links ?? []) ?? [];
}

describe("approved public SEO surfaces", () => {
  it("presents the existing motorized route as the Ventura County product hub", () => {
    const page = getAnswerPage("motorized-window-shades-ventura-county");

    expect(page).toMatchObject({
      path: "/motorized-window-shades-ventura-county/",
      title: "Motorized Window Shades Ventura County | 805 Shutters",
      h1: "Motorized Window Shades in Ventura County"
    });
    expect(page?.description).toContain("measured and installed across Ventura County");
    expect(page?.sections.map((section) => section.heading)).toContain(
      "When Are Motorized Window Shades Worth It?"
    );
  });

  it("links the motorized hub and booking route from natural service surfaces", () => {
    const shadesLinks = pageLinks("/shades/");
    const homeLinks = homePage.sections.flatMap((section) => section.links ?? []);

    expect(shadesLinks).toContainEqual({
      label: "Motorized window shades",
      href: "/motorized-window-shades-ventura-county/"
    });
    expect(shadesLinks.some((link) => link.href === "/book-consultation/")).toBe(true);
    expect(homeLinks).toEqual(
      expect.arrayContaining([
        { label: "Motorized window shades", href: "/motorized-window-shades-ventura-county/" },
        { label: "Book a free in-home consultation", href: "/book-consultation/" }
      ])
    );
  });

  it("uses the descriptive booking H1 and the verified Maps CID link", () => {
    const bookingSource = readFileSync("src/app/book-consultation/page.tsx", "utf8");
    const reviewLinks = pageLinks("/reviews/");

    expect(bookingSource).toContain("<h1>Book a Free In-Home Consultation in Ventura County</h1>");
    expect(reviewLinks).toContainEqual({
      label: "805 Shutters on Google Maps",
      href: site.googleMaps.url
    });
  });
});
