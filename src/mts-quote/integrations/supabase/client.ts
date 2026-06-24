// 805 PORT of the MTS Supabase browser client.
//
// The MTS quote builder talks DIRECTLY to the MTS Supabase project
// (djduaqegxwjnmjlzjdor) where 805 Shutters' quotes already live
// (account 72ccf12a-11c0-4261-8ad0-31af8ad0bbfb). This shim recreates the
// MTS browser client inside the Next.js app. The anon/publishable key below
// is the same PUBLIC key MTS already ships in its client bundle, so the
// builder works out of the box; both URL and key may be overridden via env.
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

// Public defaults — identical to MTS src/integrations/supabase/supabaseConfig.ts.
const DEFAULT_MTS_SUPABASE_URL = "https://djduaqegxwjnmjlzjdor.supabase.co";
const DEFAULT_MTS_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRqZHVhcWVneHdqbm1qbHpqZG9yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc5ODkwMjYsImV4cCI6MjA4MzU2NTAyNn0.If7mgQqI-O4adZmnxJGhhhtDqD9rOh_eZ_jXO3woVk4";

export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_MTS_SUPABASE_URL?.trim() || DEFAULT_MTS_SUPABASE_URL;
export const SUPABASE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_MTS_SUPABASE_ANON_KEY?.trim() || DEFAULT_MTS_SUPABASE_ANON_KEY;

const browserStorage =
  typeof window !== "undefined" &&
  window.localStorage &&
  typeof window.localStorage.getItem === "function"
    ? window.localStorage
    : undefined;

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: browserStorage,
    persistSession: !!browserStorage,
    autoRefreshToken: !!browserStorage,
  },
});
