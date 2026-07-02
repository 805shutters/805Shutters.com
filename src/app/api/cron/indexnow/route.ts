import { NextRequest, NextResponse } from "next/server";
import { buildSitemapEntries } from "@/lib/sitemap-xml";
import { site } from "@/lib/site-data";

export const runtime = "nodejs";

// IndexNow pushes the sitemap's URLs to Bing (whose index powers ChatGPT
// search) and other participating engines, so new and changed pages are
// discovered in hours instead of whenever the next crawl happens.
const INDEXNOW_KEY = "97ee8e516362dc16bdd25d2a9ec15a72";
const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";

function requireCronAccess(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

async function run(request: NextRequest) {
  if (!requireCronAccess(request)) {
    return NextResponse.json({ error: "IndexNow cron is not authorized." }, { status: 401 });
  }

  const host = new URL(site.baseUrl).host;
  const urlList = buildSitemapEntries().map((entry) => entry.url);

  const response = await fetch(INDEXNOW_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      host,
      key: INDEXNOW_KEY,
      keyLocation: `${site.baseUrl}/${INDEXNOW_KEY}.txt`,
      urlList
    })
  });

  return NextResponse.json({
    submitted: urlList.length,
    indexNowStatus: response.status
  });
}

export async function GET(request: NextRequest) {
  return run(request);
}

export async function POST(request: NextRequest) {
  return run(request);
}
