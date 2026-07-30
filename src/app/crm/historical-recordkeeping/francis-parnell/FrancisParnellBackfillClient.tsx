"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

export function FrancisParnellBackfillClient() {
  const [state, setState] = useState<"idle" | "posting" | "done" | "error">("idle");
  const [result, setResult] = useState("");
  const [session, setSession] = useState<Session | null>(null);
  const supabase = getSupabaseBrowserClient();

  useEffect(() => {
    supabase?.auth.getSession().then(({ data }) => setSession(data.session));
  }, [supabase]);

  async function postHistoricalRecordkeeping() {
    if (!session) {
      setState("error");
      setResult('{"message":"Authenticated CRM session is required."}');
      return;
    }
    setState("posting");
    setResult("");
    const response = await fetch("/api/crm/historical-recordkeeping/francis-parnell", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ mode: "historical_recordkeeping_only" }),
    });
    const text = await response.text();
    setResult(text);
    setState(response.ok ? "done" : "error");
  }

  return (
    <main style={{ maxWidth: 760, margin: "48px auto", padding: 24, fontFamily: "system-ui" }}>
      <h1>Francis Parnell historical recordkeeping</h1>
      <p>
        Exact source: 805-0180 · Francis Parnell · 1422 Torero Drive, Oxnard · 8054826677.
      </p>
      <p>
        This guarded action posts only the $814 linked bookkeeping projection, two $407 check
        records, Mike ownership, and Ken&apos;s automatic unpaid ledger amount. It creates no
        appointment, operational job, installer form, notification, or transfer.
      </p>
      <button
        type="button"
        onClick={postHistoricalRecordkeeping}
        disabled={!session || state === "posting" || state === "done"}
        style={{ padding: "12px 18px", fontWeight: 700 }}
      >
        {state === "posting"
          ? "Posting…"
          : state === "done"
            ? "Historical recordkeeping posted"
            : "Post Francis historical recordkeeping"}
      </button>
      {result ? (
        <pre
          aria-label="Historical recordkeeping result"
          style={{ marginTop: 24, padding: 16, whiteSpace: "pre-wrap", background: "#f3f4f6" }}
        >
          {result}
        </pre>
      ) : null}
    </main>
  );
}
