import { NextRequest, NextResponse } from "next/server";
import { getCrmGoogleOAuthStatus } from "@/lib/crm/oauth";

export const runtime = "nodejs";

function getCanonicalSiteOrigin(request: NextRequest) {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "");

  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      return request.nextUrl.origin;
    }
  }

  return request.nextUrl.origin;
}

function normalizeRedirectPath(path: string) {
  const parsed = new URL(path, "https://805shutters.local");

  if (parsed.pathname === "/crm") {
    parsed.pathname = "/crm/";
  }

  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

function getSafeRedirectPath(request: NextRequest) {
  const requested = request.nextUrl.searchParams.get("redirectTo") || "/crm/";

  if (requested.startsWith("/") && !requested.startsWith("//")) {
    return normalizeRedirectPath(requested);
  }

  try {
    const parsed = new URL(requested);
    if (parsed.origin === request.nextUrl.origin) {
      return normalizeRedirectPath(`${parsed.pathname}${parsed.search}${parsed.hash}`);
    }
  } catch {
    return "/crm/";
  }

  return "/crm/";
}

function redirectWithError(request: NextRequest, code: string) {
  const target = new URL("/crm/", getCanonicalSiteOrigin(request));
  target.searchParams.set("crmAuthError", code);
  return NextResponse.redirect(target);
}

export async function GET(request: NextRequest) {
  const redirectPath = getSafeRedirectPath(request);
  const redirectTo = new URL(redirectPath, getCanonicalSiteOrigin(request)).toString();
  const status = await getCrmGoogleOAuthStatus(redirectTo);

  if (!status.configured) {
    return redirectWithError(request, "supabase-auth-not-configured");
  }

  if (!status.enabled || !status.authorizeUrl) {
    return redirectWithError(request, "google-provider-disabled");
  }

  return NextResponse.redirect(status.authorizeUrl);
}
