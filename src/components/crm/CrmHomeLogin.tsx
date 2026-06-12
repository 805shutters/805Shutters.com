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
    <section className="home-crm-login" aria-label="Private CRM login">
      <div>
        <p className="eyebrow">Private</p>
        <h2>805 CRM</h2>
      </div>
      {session ? (
        <a className="button secondary" href="/crm">
          Open CRM
        </a>
      ) : (
        <>
          {configured ? (
            <a className="button primary" href="/api/crm/oauth/google?redirectTo=/crm">
              Google Login
            </a>
          ) : (
            <button type="button" disabled>
              Google Login
            </button>
          )}
        </>
      )}
    </section>
  );
}
