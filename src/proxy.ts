import { NextRequest, NextResponse } from "next/server";
import { quoterServiceGuard } from "@/lib/crm/quoter-service-auth";
import { crossesMarketingBoundary } from "@/lib/marketing-tracking";

export function proxy(request: NextRequest) {
  // Only Mercury POST bypasses the existing slash canonicalization. Keeping
  // this method check here avoids relying on a caller-controlled header.
  if (request.nextUrl.pathname === "/api/webhooks/mercury" && request.method !== "POST") {
    const canonical = new URL(request.url);
    canonical.pathname += "/";
    return NextResponse.redirect(canonical, 308);
  }
  const quoterDenied = quoterServiceGuard(request);
  if (quoterDenied) return quoterDenied;

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
