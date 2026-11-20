"use client";

import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import Link from "next/link";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import type { SquareClearanceReviewRequest, SquareClearanceReviewRow } from "@/lib/crm/stripe-clearance-review";
import "./stripe-finance.css";

const money = (cents: number | null) =>
  cents == null
    ? "Amount not stored"
    : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

function clearanceLabel(row: SquareClearanceReviewRow) {
  if (row.clearance.state === "none") return "No clearance recorded";
  const reviewed = row.clearance.reviewedThrough ? new Date(row.clearance.reviewedThrough).toLocaleString() : "an earlier time";
  return `Recorded clearance does not cover every stored Square request (reviewed through ${reviewed})`;
}

function requestStatus(request: SquareClearanceReviewRequest) {
  return request.status || "Not stored";
}

export function SquareClearanceReview() {
  const supabase = getSupabaseBrowserClient();
  const [session, setSession] = useState<Session | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [rows, setRows] = useState<SquareClearanceReviewRow[] | null>(null);
  const [error, setError] = useState("");
  const [openQuoteId, setOpenQuoteId] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [evidence, setEvidence] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!supabase) {
      setSessionReady(true);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setSessionReady(true);
    });
  }, [supabase]);

  const load = useCallback(async (accessToken: string) => {
    const response = await fetch("/api/crm/stripe/clearance-review/", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.message || "Square clearance review is unavailable.");
    setRows(Array.isArray(body.rows) ? body.rows : []);
  }, []);

  useEffect(() => {
    if (!session) return;
    load(session.access_token).catch((reason) => setError(reason instanceof Error ? reason.message : "Square clearance review is unavailable."));
  }, [load, session]);

  function openClearance(quoteId: string) {
    setOpenQuoteId(quoteId);
    setConfirmed(false);
    setEvidence("");
    setError("");
  }

  async function recordClearance(quoteId: string) {
    if (!session || !confirmed || evidence.trim().length < 20) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/crm/stripe/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          action: "clearance",
          targetId: quoteId,
          confirmObligationsResolved: true,
          evidence,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message || "Historical obligation clearance could not be recorded.");
      setOpenQuoteId(null);
      setConfirmed(false);
      setEvidence("");
      await load(session.access_token);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Historical obligation clearance could not be recorded.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="stripe-finance">
      <Link href="/crm/stripe/" className="underline">Back to Stripe reconciliation</Link>
      <h1>Square clearance review</h1>
      <p>
        Signed quotes with an open balance and a stored production Square request stay blocked from Stripe until you record a clearance for that quote.
        This list only reads CRM records. It does not contact Square or Stripe, and it does not change a quote until you submit that quote&apos;s own clearance.
      </p>
      {error ? <p role="alert">{error}</p> : null}
      {sessionReady && !session ? <p>Sign in to the CRM to review Square clearances.</p> : null}
      {session && !rows && !error ? <p>Loading Square clearance review…</p> : null}
      {rows ? <p role="status">{rows.length === 1 ? "1 quote needs a clearance." : `${rows.length} quotes need a clearance.`}</p> : null}
      {rows?.length === 0 ? <p>No signed open-balance quotes are waiting on a Square clearance.</p> : null}
      {rows && rows.length > 0 ? (
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Quote</th>
                <th>Amounts</th>
                <th>Stored Square requests</th>
                <th>Clearance</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.quoteId}>
                  <td>
                    {row.quoteNumber || "No quote number"}
                    <span>{row.customerName}</span>
                    <span>{row.quoteId}</span>
                  </td>
                  <td>
                    Open {money(row.openBalanceCents)}
                    <span>Quote total {money(row.quoteTotalCents)}</span>
                  </td>
                  <td>
                    {row.squareRequests.map((request) => (
                      <span key={request.id}>
                        {request.id}
                        {request.orderId ? ` · order ${request.orderId}` : ""}
                        {" · "}
                        {money(request.amountCents)}
                        {request.paymentType ? ` · ${request.paymentType}` : ""}
                        {" · status "}
                        {requestStatus(request)}
                        {request.url ? <> · <a href={request.url} target="_blank" rel="noreferrer">Stored link</a></> : null}
                      </span>
                    ))}
                  </td>
                  <td>
                    {clearanceLabel(row)}
                    <button type="button" onClick={() => openClearance(row.quoteId)}>
                      Record clearance for this quote
                    </button>
                    {openQuoteId === row.quoteId ? (
                      <form
                        onSubmit={(event) => {
                          event.preventDefault();
                          void recordClearance(row.quoteId);
                        }}
                      >
                        <p>This records evidence for {row.quoteNumber || row.customerName} only.</p>
                        <label>
                          <input
                            type="checkbox"
                            checked={confirmed}
                            onChange={(event) => setConfirmed(event.target.checked)}
                          />{" "}
                          All historical Square links, invoices, and mandates for this quote were resolved.
                        </label>
                        <label>
                          Exact evidence
                          <textarea
                            required
                            minLength={20}
                            value={evidence}
                            onChange={(event) => setEvidence(event.target.value)}
                          />
                        </label>
                        <button type="submit" disabled={busy || !confirmed || evidence.trim().length < 20}>
                          {busy ? "Recording…" : "Record this quote's clearance"}
                        </button>
                        <button type="button" onClick={() => setOpenQuoteId(null)}>Cancel</button>
                      </form>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </main>
  );
}
