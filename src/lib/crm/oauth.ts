export type CrmGoogleOAuthStatus = {
  configured: boolean;
  enabled: boolean;
  authorizeUrl: string | null;
  error: string | null;
};

export function buildCrmGoogleAuthorizeUrl(redirectTo: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) return null;

  const authorizeUrl = new URL("/auth/v1/authorize", supabaseUrl);
  authorizeUrl.searchParams.set("provider", "google");
  authorizeUrl.searchParams.set("redirect_to", redirectTo);

  return authorizeUrl.toString();
}

export async function getCrmGoogleOAuthStatus(redirectTo: string): Promise<CrmGoogleOAuthStatus> {
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const authorizeUrl = buildCrmGoogleAuthorizeUrl(redirectTo);

  if (!authorizeUrl || !anonKey) {
    return {
      configured: false,
      enabled: false,
      authorizeUrl: null,
      error: "Supabase URL and anon key are required before Google login can start."
    };
  }

  const response = await fetch(authorizeUrl, {
    headers: {
      apikey: anonKey
    },
    redirect: "manual"
  });

  if (response.status >= 300 && response.status < 400 && response.headers.get("location")) {
    return {
      configured: true,
      enabled: true,
      authorizeUrl,
      error: null
    };
  }

  const body = await response.json().catch(() => null);
  const message = typeof body?.msg === "string" ? body.msg : "Google login provider is not enabled.";

  return {
    configured: true,
    enabled: false,
    authorizeUrl,
    error: message
  };
}
