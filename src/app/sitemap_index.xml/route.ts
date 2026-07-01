import { CONTENT_LAST_UPDATED, renderSitemapIndex } from "@/lib/sitemap-xml";
import { site } from "@/lib/site-data";

export function GET() {
  return new Response(
    renderSitemapIndex([
      {
        url: `${site.baseUrl}/sitemap.xml`,
        lastModified: CONTENT_LAST_UPDATED
      }
    ]),
    {
      headers: {
        "Cache-Control": "public, max-age=0, must-revalidate",
        "Content-Type": "application/xml; charset=utf-8"
      }
    }
  );
}
