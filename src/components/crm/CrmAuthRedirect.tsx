"use client";

import { useEffect } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

function hasSupabaseAuthReturn(url: URL) {
  const hashParams = new URLSearchParams(url.hash.replace(/^#/, ""));

  return (
    hashParams.has("access_token") ||
    hashParams.has("refresh_token") ||
    hashParams.has("error") ||
    url.searchParams.has("code")
  );
}

function crmUrl() {
  const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  const origin = configuredSiteUrl || window.location.origin;
  return `${origin}/crm/`;
}

export function CrmAuthRedirect() {
  useEffect(() => {
    const current = new URL(window.location.href);

    if (current.pathname.startsWith("/crm") || !hasSupabaseAuthReturn(current)) {
      return;
    }

    const supabase = getSupabaseBrowserClient();

    if (!supabase) {
      window.location.replace(`${crmUrl()}?crmAuthError=supabase-auth-not-configured`);
      return;
    }

    let cancelled = false;

    supabase.auth.getSession().finally(() => {
      if (!cancelled) {
        window.location.replace(crmUrl());
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
