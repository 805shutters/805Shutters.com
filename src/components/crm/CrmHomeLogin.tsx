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

  async function signIn() {
    if (!supabase) return;

    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/crm`
      }
    });
  }

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
        <button type="button" onClick={signIn} disabled={!configured}>
          Google Login
        </button>
      )}
    </section>
  );
}
