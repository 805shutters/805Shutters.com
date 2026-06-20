"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

export function CrmHomeLogin() {
  const [session, setSession] = useState<Session | null>(null);
  const [configured, setConfigured] = useState(true);
  const supabase = getSupabaseBrowserClient();

  useEffect(() => {
    if (!supabase) {
      setConfigured(false);
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => {
      data.subscription.unsubscribe();
    };
  }, [supabase]);

  return (
    <section className="home-crm-login" aria-label="admin login">
      {session ? (
        <a className="button secondary" href="/crm">
          admin login
        </a>
      ) : (
        <>
          {configured ? (
            <a className="button primary" href="/api/crm/oauth/google?redirectTo=/crm/">
              admin login
            </a>
          ) : (
            <button type="button" disabled>
              admin login
            </button>
          )}
        </>
      )}
    </section>
  );
}
