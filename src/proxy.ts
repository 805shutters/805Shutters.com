import { NextRequest, NextResponse } from "next/server";
import { crossesMarketingBoundary } from "@/lib/marketing-tracking";

export function proxy(request: NextRequest) {
  // Next's router falls back to a document navigation for a non-RSC response.
  // Apply this to prefetches too, so private content cannot enter the public
  // document's router cache while GTM is running. The document referrer retains
  // the correct boundary even after several navigations within the same SPA.
  const source = request.headers.get("referer") || request.headers.get("next-url");
  const boundaryNavigation = request.method === "GET" && request.headers.get("rsc") === "1"
    && !request.nextUrl.pathname.startsWith("/api/")
    && crossesMarketingBoundary(source, request.nextUrl.pathname);
  const response = boundaryNavigation
    ? new NextResponse("", {
        headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store" },
      })
    : NextResponse.next();
  const host = request.nextUrl.hostname.toLowerCase();

  if (host.endsWith(".vercel.app")) {
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
