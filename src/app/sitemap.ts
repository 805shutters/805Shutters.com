import { MetadataRoute } from "next";
import { answerPages } from "@/lib/llm-search-pages";
import { allPages, site } from "@/lib/site-data";

export default function sitemap(): MetadataRoute.Sitemap {
  const pageEntries: MetadataRoute.Sitemap = allPages.filter((page) => !page.noIndex).map((page) => {
    const isCommercialFocusPage = page.path === "/commercial-window-coverings/";
    const isCommercialPage = page.path.includes("commercial");

    return {
      url: `${site.baseUrl}${page.path}`,
      lastModified: new Date(),
      changeFrequency: page.path === "/" || isCommercialPage ? "weekly" : "monthly",
      priority: page.path === "/" ? 1 : isCommercialFocusPage ? 0.9 : isCommercialPage ? 0.8 : 0.7
    };
  });

  const bookingEntry: MetadataRoute.Sitemap[number] = {
    url: `${site.baseUrl}/book-consultation/`,
    lastModified: new Date(),
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
