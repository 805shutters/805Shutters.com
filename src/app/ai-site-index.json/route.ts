import { buildAiSiteIndexFeed } from "@/lib/ai-search-data";

export function GET() {
  return Response.json(buildAiSiteIndexFeed(), {
    headers: {
      "Cache-Control": "public, max-age=3600"
    }
  });
}
