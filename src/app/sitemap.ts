import { MetadataRoute } from "next";
import { allPages, site } from "@/lib/site-data";

export default function sitemap(): MetadataRoute.Sitemap {
  const pageEntries: MetadataRoute.Sitemap = allPages.filter((page) => !page.noIndex).map((page) => ({
    url: `${site.baseUrl}${page.path}`,
    lastModified: new Date(),
    changeFrequency: page.path === "/" ? "weekly" : "monthly",
    priority: page.path === "/" ? 1 : 0.7
  }));

  const bookingEntry: MetadataRoute.Sitemap[number] = {
    url: `${site.baseUrl}/book-consultation/`,
    lastModified: new Date(),
    changeFrequency: "weekly",
    priority: 0.9
  };

  return [...pageEntries, bookingEntry];
}
