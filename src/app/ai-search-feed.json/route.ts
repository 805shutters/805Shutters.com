import { buildAiSearchFeed } from "@/lib/ai-search-data";

export function GET() {
  return Response.json(buildAiSearchFeed(), {
    headers: {
      "Cache-Control": "public, max-age=3600"
    }
  });
}
