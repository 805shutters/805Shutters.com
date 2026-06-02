import { MetadataRoute } from "next";
import { allPages, site } from "@/lib/site-data";

export default function sitemap(): MetadataRoute.Sitemap {
  return allPages.map((page) => ({
    url: `${site.baseUrl}${page.path}`,
    lastModified: new Date(),
    changeFrequency: page.path === "/" ? "weekly" : "monthly",
    priority: page.path === "/" ? 1 : 0.7
  }));
}
