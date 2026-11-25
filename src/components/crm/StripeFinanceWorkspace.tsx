"use client";
import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import Link from "next/link";
import "./stripe-finance.css";
type Row = {
  id: string;
  kind?: string;
  status?: string;
  purpose?: string;
  amount_cents?: number;
  fee_cents?: number;
  session_id?: string;
  error?: string;
  processed_at?: string;
  last_finished_at?: string;
  payout_id?: string;
  created_at?: string;
  details?: {
    refunded_cents?: number;
    disputed?: boolean;
    automatic?: boolean;
    composition_complete?: boolean;
    composition_net_cents?: number;
  };
};
type Evidence = {
  account: string;
  livemode: boolean;
  canReview: boolean;
  truncated: boolean;
  requests: Row[];
  objects: Row[];
  events: Row[];
  sync: Row[];
  alerts?: Row[];
  bank_matches: { payout_id: string }[];
};
const money = (n: number | undefined) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    (n || 0) / 100,
  );
export function StripeFinanceWorkspace({ session }: { session: Session }) {
  const [selected, setSelected] = useState<Row | null>(null),
    [bankId, setBankId] = useState(""),
    [bankDate, setBankDate] = useState(""),
    [evidence, setEvidence] = useState("");
  const [data, setData] = useState<Evidence | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const r = await fetch("/api/crm/stripe/", {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const body = await r.json();
    if (!r.ok) throw new Error(body.message || "Stripe evidence unavailable.");
    setData(body);
  }, [session.access_token]);
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [load]);
  async function updateStripe(action: { action: "sync" } | { action: "expire"; sessionId: string }) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/crm/stripe/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(action),
      });
      if (!r.ok) {
        const result = await r.json().catch(() => null);
        throw new Error(result?.message || result?.error || "Stripe request needs review.");
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to reconcile.");
    } finally {
      setBusy(false);
    }
  }
  function exportEvidence() {
    if (!data) return;
    const cell = (value: unknown) => {
      const raw = String(value ?? "");
      return `"${(/^[=+\-@\t\r]/.test(raw) ? "'" : "") + raw.replaceAll('"', '""')}"`;
    };
    const rows = [
      [
        "Account",
        "Mode",
        "Type",
        "Reference",
        "Amount cents",
        "Fee cents",
        "Status",
        "Payout",
        "Bank matched",
      ],
      ...data.objects
        .slice(0, 500)
        .map((r) => [
          data.account,
          data.livemode ? "live" : "test",
          r.kind,
          r.id,
          r.amount_cents,
          r.fee_cents,
          r.status,
          r.payout_id,
          data.bank_matches.some((b) => b.payout_id === r.id),
        ]),
    ];
    const url = URL.createObjectURL(
      new Blob([rows.map((r) => r.map(cell).join(",")).join("\r\n")], {
        type: "text/csv;charset=utf-8;",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "stripe-visible-evidence.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function saveBank() {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/crm/stripe/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          action: "bank",
          payoutId: selected.id,
          amountCents: Number(selected.amount_cents),
          bankTransactionId: bankId,
          bankDate,
          evidence,
        }),
      });
      if (!r.ok)
        throw new Error("Bank evidence did not match. Nothing was confirmed.");
      await load();
      setSelected(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save bank match.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="stripe-finance">
      <Link href="/crm/" className="underline">
        Back to CRM
      </Link>
      <h1 className="mt-6 text-3xl font-semibold">
        Stripe payments and Mercury payouts
      </h1>
      <p className="my-4">
        Customer payments reduce the job balance once. Fees, refunds, disputes,
        and transfers are separate records. A payout is bank-confirmed only
        after matching the Mercury transaction.
      </p>
      <p>
        <Link href="/crm/stripe/clearance/" className="underline">
          Review Square clearances
        </Link>
      </p>
      {error && (
        <p role="alert" className="rounded border border-red-300 p-3">
          {error}
        </p>
      )}
      {!data && !error && <p>Loading payment evidence…</p>}
      {data && (
        <>
          <p>
            {data.livemode
              ? "Live account"
              : "Test mode — no customer ledger credits"}{" "}
            · {data.account}
          </p>
          <p className="mt-2 text-sm">
            Last recovery checkpoint:{" "}
            {data.sync[0]?.last_finished_at
              ? new Date(data.sync[0].last_finished_at).toLocaleString()
              : "Not yet recorded"}
            . A checkpoint does not mean every record is reconciled.
          </p>
          <button className="my-3 mr-4 underline" onClick={exportEvidence}>
            Export visible evidence
          </button>
          {data.canReview && (
            <button
              onClick={() => updateStripe({ action: "sync" })}
              disabled={busy}
              className="my-4 rounded bg-slate-900 px-4 py-2 text-white"
            >
              {busy ? "Reconciling…" : "Reconcile Stripe"}
            </button>
          )}
          {data.truncated && (
            <p role="alert">
              This view is limited to 500 records per section. Do not use it as
              a complete account total.
            </p>
          )}
          {data.sync.some((r) => r.error) && (
            <p role="alert">
              Recovery is incomplete. Review before relying on these balances.
            </p>
          )}
          <h2 className="my-5 text-xl font-semibold">Payment requests</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr>
                  <th className="p-2">Request</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Review</th>
                </tr>
              </thead>
              <tbody>
                {data.requests.slice(0, 500).map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="p-2">
                      {r.purpose}
                      <span className="block text-xs">{r.id}</span>
                    </td>
                    <td>{money(r.amount_cents)}</td>
                    <td>{r.status}</td>
                    <td>
                      {r.error}
                      {data.canReview && r.status === "open" && r.session_id ? (
                        <button
                          type="button"
                          disabled={busy}
                          className="block underline"
                          onClick={() => {
                            if (r.session_id && window.confirm(
                              `Expire the ${money(r.amount_cents)} checkout for request ${r.id}? The current link will stop accepting payment.`,
                            )) {
                              void updateStripe({ action: "expire", sessionId: r.session_id });
                            }
                          }}
                        >
                          Expire checkout
                        </button>
                      ) : r.error ? null : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h2 className="my-5 text-xl font-semibold">Processor evidence</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr>
                  <th className="p-2">Type / reference</th>
                  <th>Amount</th>
                  <th>Fee</th>
                  <th>Status</th>
                  <th>Bank match / review</th>
                </tr>
              </thead>
              <tbody>
                {data.objects.slice(0, 500).map((r) => (
                  <tr id={r.id} key={`${r.kind}-${r.id}`} className="border-t">
                    <td className="p-2">
                      {r.kind}
                      <span className="block text-xs">{r.id}</span>
                    </td>
                    <td>{money(r.amount_cents)}</td>
                    <td>
                      {r.fee_cents == null ? "Pending" : money(r.fee_cents)}
                    </td>
                    <td>{r.status}</td>
                    <td>
                      {r.kind === "payout" ? (
                        <div>
                          {r.details?.composition_complete ? (
                            <span className="block">Contents reconciled</span>
                          ) : (
                            <span className="block">
                              {r.details?.automatic === false
                                ? "Manual payout — statement review"
                                : "Payout contents pending review"}
                            </span>
                          )}
                          {data.bank_matches.some(
                            (b) => b.payout_id === r.id,
                          ) ? (
                            "Bank matched"
                          ) : (
                            <button
                              className="underline"
                              disabled={
                                !data.canReview ||
                                !data.livemode ||
                                r.status !== "paid"
                              }
                              onClick={() => {
                                setSelected(r);
                                setBankId("");
                                setBankDate("");
                                setEvidence("");
                              }}
                            >
                              Match Mercury transaction
                            </button>
                          )}
                        </div>
                      ) : r.details?.disputed || r.details?.refunded_cents ? (
                        "Review adjustment"
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {selected && (
            <form
              className="my-6 grid gap-3 rounded border p-4"
              onSubmit={(e) => {
                e.preventDefault();
                void saveBank();
              }}
            >
              {error && <p role="alert">{error}</p>}
              <h2 className="text-xl font-semibold">
                Match {money(selected.amount_cents)} to Mercury
              </h2>
              <p>
                Confirm the exact posted bank transaction for payout{" "}
                {selected.id}. This records evidence; it does not move money.
              </p>
              <label>
                Mercury transaction reference
                <input
                  className="block w-full rounded border p-2"
                  required
                  minLength={3}
                  value={bankId}
                  onChange={(e) => setBankId(e.target.value)}
                />
              </label>
              <label>
                Bank posting date
                <input
                  className="block rounded border p-2"
                  type="date"
                  required
                  value={bankDate}
                  onChange={(e) => setBankDate(e.target.value)}
                />
              </label>
              <label>
                Supporting statement evidence
                <textarea
                  className="block w-full rounded border p-2"
                  required
                  minLength={8}
                  maxLength={2000}
                  value={evidence}
                  onChange={(e) => setEvidence(e.target.value)}
                />
              </label>
              <button
                disabled={busy}
                className="rounded bg-slate-900 px-4 py-2 text-white"
              >
                Confirm exact bank match
              </button>
              <button type="button" onClick={() => setSelected(null)}>
                Cancel
              </button>
            </form>
          )}
          <h2 className="my-5 text-xl font-semibold">Owner payment alerts</h2>
          <p>Queued, accepted, and delivered are separate states.</p>
          {(data.alerts || []).map((a) => (
            <p className="my-2" key={a.id}>
              {a.status} · {a.id}
              {a.error ? ` · ${a.error}` : ""}
            </p>
          ))}
          <p className="mt-5">
            {data.events.filter((e) => !e.processed_at).length} queued
            notifications.{" "}
            {data.canReview ? (
              <Link href="/crm/stripe/clearance/" className="underline">
                Review Square clearances
              </Link>
            ) : null}
            {data.canReview ? " · " : null}
            <Link href="/crm/square/" className="underline">
              Review historical Square activity
            </Link>
            .
          </p>
        </>
      )}
    </main>
  );
}
