import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import type { Database } from "./types";

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export type QuoteBuilderSupabaseClient = SupabaseClient<Database>;

function get805SupabaseClient(): QuoteBuilderSupabaseClient {
  const client = getSupabaseBrowserClient();
  if (!client) {
    throw new Error("805 Supabase browser client is not configured.");
  }
  return client as QuoteBuilderSupabaseClient;
}

export const supabase = new Proxy({} as QuoteBuilderSupabaseClient, {
  get(_target, prop) {
    const client = get805SupabaseClient();
    const value = client[prop as keyof QuoteBuilderSupabaseClient];
    return typeof value === "function" ? value.bind(client) : value;
  },
});
