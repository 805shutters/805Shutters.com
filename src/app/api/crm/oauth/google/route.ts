import { NextRequest, NextResponse } from "next/server";
import { getCrmGoogleOAuthStatus } from "@/lib/crm/oauth";

export const runtime = "nodejs";

function getSafeRedirectPath(request: NextRequest) {
  const requested = request.nextUrl.searchParams.get("redirectTo") || "/crm";

  if (requested.startsWith("/") && !requested.startsWith("//")) {
    return requested;
  }

  try {
    const parsed = new URL(requested);
    if (parsed.origin === request.nextUrl.origin) {
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
  } catch {
    return "/crm";
  }

  return "/crm";
}

function redirectWithError(request: NextRequest, code: string) {
  const target = new URL("/crm", request.nextUrl.origin);
  target.searchParams.set("crmAuthError", code);
  return NextResponse.redirect(target);
}

export async function GET(request: NextRequest) {
  const redirectPath = getSafeRedirectPath(request);
  const redirectTo = new URL(redirectPath, request.nextUrl.origin).toString();
  const status = await getCrmGoogleOAuthStatus(redirectTo);

  if (!status.configured) {
    return redirectWithError(request, "supabase-auth-not-configured");
  }

  if (!status.enabled || !status.authorizeUrl) {
    return redirectWithError(request, "google-provider-disabled");
  }

  return NextResponse.redirect(status.authorizeUrl);
}
