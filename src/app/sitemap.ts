import { MetadataRoute } from "next";
import { answerPages } from "@/lib/llm-search-pages";
import { allPages, site } from "@/lib/site-data";

// Stable date for the marketing/service pages. Bump this when their content
// is meaningfully updated. Using a fixed date (instead of `new Date()`) keeps
// <lastmod> honest — a sitemap that claims every page changed "right now" on
// every crawl trains Google to ignore the lastmod signal.
const CONTENT_LAST_UPDATED = new Date("2026-06-24");

export default function sitemap(): MetadataRoute.Sitemap {
  const pageEntries: MetadataRoute.Sitemap = allPages.filter((page) => !page.noIndex).map((page) => {
    const isCommercialFocusPage = page.path === "/commercial-window-coverings/";
    const isCommercialPage = page.path.includes("commercial");

    return {
      url: `${site.baseUrl}${page.path}`,
      lastModified: CONTENT_LAST_UPDATED,
      changeFrequency: page.path === "/" || isCommercialPage ? "weekly" : "monthly",
      priority: page.path === "/" ? 1 : isCommercialFocusPage ? 0.9 : isCommercialPage ? 0.8 : 0.7
    };
  });

  const bookingEntry: MetadataRoute.Sitemap[number] = {
    url: `${site.baseUrl}/book-consultation/`,
    lastModified: CONTENT_LAST_UPDATED,
    changeFrequency: "weekly",
    priority: 0.9
  };

  const answerEntries: MetadataRoute.Sitemap = answerPages.map((page) => ({
    url: `${site.baseUrl}${page.path}`,
    lastModified: new Date(page.updated),
    changeFrequency: "monthly",
    priority: 0.82
  }));

  return [...pageEntries, ...answerEntries, bookingEntry];
}
