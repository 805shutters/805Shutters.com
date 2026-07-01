import { MetadataRoute } from "next";
import { buildSitemapEntries } from "@/lib/sitemap-xml";

export default function sitemap(): MetadataRoute.Sitemap {
  return buildSitemapEntries();
}
