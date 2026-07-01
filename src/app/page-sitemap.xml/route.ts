import { buildSitemapEntries, renderSitemapUrlset } from "@/lib/sitemap-xml";

export function GET() {
  return new Response(renderSitemapUrlset(buildSitemapEntries()), {
    headers: {
      "Cache-Control": "public, max-age=0, must-revalidate",
      "Content-Type": "application/xml; charset=utf-8"
    }
  });
}
