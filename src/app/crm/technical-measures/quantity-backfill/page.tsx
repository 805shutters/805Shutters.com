"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

type Report = {
  candidate_forms: number;
  candidate_lines: number;
  eligible_forms: number;
  skipped_forms: number;
  candidates: Array<{
    form_id: string;
    customer_name: string;
    quote_number: string;
    status: string;
    candidate_line_count: number;
    source_window_count: number;
    resulting_window_count: number;
    eligible: boolean;
    reason: string | null;
  }>;
};

async function request(session: Session, method: "GET" | "POST") {
  const response = await fetch("/api/crm/technical-measures/quantity-backfill", {
    method,
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    body: method === "POST"
      ? JSON.stringify({ confirmation: "EXPAND_DRAFT_TECHNICAL_MEASURE_QUANTITIES" })
      : undefined,
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.message || "Quantity backfill failed.");
  return body;
}

export default function TechnicalMeasureQuantityBackfillPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [result, setResult] = useState<unknown>(null);
  const [message, setMessage] = useState("Loading authenticated audit…");
  const [working, setWorking] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setMessage("CRM authentication is unavailable.");
      return;
    }
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) {
        setMessage("Sign in through the 805 CRM first.");
        return;
      }
      setSession(data.session);
      try {
        const body = await request(data.session, "GET");
        setReport(body.report);
        setMessage("Audit complete. No changes have been made.");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Audit failed.");
      }
    });
  }, []);

  async function apply() {
    if (!session || !report || report.eligible_forms === 0) return;
    setWorking(true);
    setMessage("Applying rollback-backed expansion…");
    try {
      const body = await request(session, "POST");
      setResult(body.result);
      setReport(body.result.remaining);
      setMessage("Backfill complete and re-audited.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Backfill failed.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <main style={{ maxWidth: 760, margin: "40px auto", padding: 24, fontFamily: "sans-serif" }}>
      <h1>Technical Measure Quantity Backfill</h1>
      <p>{message}</p>
      {report ? (
        <>
          <dl>
            <dt>Candidate forms</dt><dd>{report.candidate_forms}</dd>
            <dt>Candidate lines</dt><dd>{report.candidate_lines}</dd>
            <dt>Eligible forms</dt><dd>{report.eligible_forms}</dd>
            <dt>Skipped forms</dt><dd>{report.skipped_forms}</dd>
          </dl>
          <ul>
            {report.candidates.map((candidate) => (
              <li key={candidate.form_id}>
                <strong>{candidate.customer_name} · {candidate.quote_number}</strong>
                {" — "}
                {candidate.eligible
                  ? `${candidate.source_window_count} grouped line(s) → ${candidate.resulting_window_count} windows`
                  : `Skipped: ${candidate.reason}`}
              </li>
            ))}
          </ul>
          <button type="button" disabled={working || report.eligible_forms === 0} onClick={apply}>
            {working ? "Applying…" : "Apply Eligible Draft Backfill"}
          </button>
        </>
      ) : null}
      {result ? <pre>{JSON.stringify(result, null, 2)}</pre> : null}
    </main>
  );
}
