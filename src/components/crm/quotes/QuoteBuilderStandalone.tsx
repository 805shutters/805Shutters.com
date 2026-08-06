"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { QuoteBuilderPanel } from "@/components/crm/quote-v1/QuoteBuilderPanel";

/** Dedicated full-page quote builder. Gets the Supabase session client-side
 *  (same as CrmApp), renders the builder full-screen (no CRM chrome). The X
 *  exits back to /crm. */
export function QuoteBuilderStandalone({ quoteId }: { quoteId: string }) {
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!supabase) {
      router.replace("/crm");
      return;
    }
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      if (data.session) setSession(data.session);
      else router.replace("/crm");
      setReady(true);
    });
    return () => {
      active = false;
    };
  }, [supabase, router]);

  if (!ready) {
    return <div style={{ padding: 40, fontFamily: "system-ui, sans-serif" }}>Loading quote builder…</div>;
  }
  if (!session) return null;

  return (
    <QuoteBuilderPanel
      session={session}
      quoteId={quoteId}
      onClose={() => router.push("/crm")}
      onSwitch={(id) => router.push(`/crm/quote/${id}`)}
    />
  );
}
