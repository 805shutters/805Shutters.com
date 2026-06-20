import { MetadataRoute } from "next";
import { site } from "@/lib/site-data";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: [
          "OAI-SearchBot",
          "ChatGPT-User",
          "PerplexityBot",
          "Perplexity-User",
          "Googlebot",
          "Bingbot"
        ],
        allow: "/"
      },
      {
        userAgent: "*",
        allow: "/"
      }
    ],
    sitemap: `${site.baseUrl}/sitemap.xml`
  };
}
