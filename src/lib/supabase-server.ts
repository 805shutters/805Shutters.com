import { createClient } from "@supabase/supabase-js";

export function getSupabaseServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    return null;
  }

  // Preview must never read or mutate the production CRM, including cron jobs.
  if (process.env.VERCEL_ENV === "preview") {
    try {
      if (new URL(url).hostname === "evuxqsaucmvgyuvjpqlo.supabase.co") return null;
    } catch { return null; }
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}
