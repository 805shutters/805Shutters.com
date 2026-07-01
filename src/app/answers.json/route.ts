import { buildAnswerCitationFeed } from "@/lib/ai-search-data";

export function GET() {
  return Response.json(buildAnswerCitationFeed(), {
    headers: {
      "Cache-Control": "public, max-age=3600"
    }
  });
}
