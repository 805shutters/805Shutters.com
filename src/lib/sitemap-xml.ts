import type { MetadataRoute } from "next";
import { answerPages } from "@/lib/llm-search-pages";
import { allPages, site } from "@/lib/site-data";

// Stable date for the marketing/service pages. Bump this when their content
// is meaningfully updated. Using a fixed date (instead of `new Date()`) keeps
// <lastmod> honest — a sitemap that claims every page changed "right now" on
// every crawl trains Google to ignore the lastmod signal.
export const CONTENT_LAST_UPDATED = new Date("2026-06-30");

const COMPARISON_GUIDE_PATH = "/window-treatment-comparison-guide/";

export function buildSitemapEntries(): MetadataRoute.Sitemap {
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

  const comparisonGuideEntry: MetadataRoute.Sitemap[number] = {
    url: `${site.baseUrl}${COMPARISON_GUIDE_PATH}`,
    lastModified: CONTENT_LAST_UPDATED,
    changeFrequency: "monthly",
    priority: 0.86
  };

  const answerEntries: MetadataRoute.Sitemap = answerPages.map((page) => ({
    url: `${site.baseUrl}${page.path}`,
    lastModified: new Date(page.updated),
    changeFrequency: "monthly",
    priority: 0.82
  }));

  return [...pageEntries, ...answerEntries, comparisonGuideEntry, bookingEntry];
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function formatDate(value: Date | string | undefined): string | null {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

export function renderSitemapUrlset(entries: MetadataRoute.Sitemap): string {
  const urls = entries
    .map((entry) => {
      const lastModified = formatDate(entry.lastModified);
      const lastModifiedTag = lastModified ? `\n    <lastmod>${lastModified}</lastmod>` : "";
      const changeFrequencyTag = entry.changeFrequency
        ? `\n    <changefreq>${escapeXml(entry.changeFrequency)}</changefreq>`
        : "";
      const priorityTag = typeof entry.priority === "number" ? `\n    <priority>${entry.priority}</priority>` : "";

      return `  <url>
    <loc>${escapeXml(entry.url)}</loc>${lastModifiedTag}${changeFrequencyTag}${priorityTag}
  </url>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}

export function renderSitemapIndex(entries: Array<{ lastModified?: Date | string; url: string }>): string {
  const sitemaps = entries
    .map((entry) => {
      const lastModified = formatDate(entry.lastModified);
      const lastModifiedTag = lastModified ? `\n    <lastmod>${lastModified}</lastmod>` : "";

      return `  <sitemap>
    <loc>${escapeXml(entry.url)}</loc>${lastModifiedTag}
  </sitemap>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemaps}
</sitemapindex>
`;
}
