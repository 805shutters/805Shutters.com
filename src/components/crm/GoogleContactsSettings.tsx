"use client";
import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

export function GoogleContactsSettings() {
  const [status, setStatus] = useState<{ connected: boolean; configured: boolean; storageReady: boolean; statuses: Record<string,number> } | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [counts, setCounts] = useState<Record<string, number | boolean> | null>(null);
  async function call(path = "", body?: object) {
    const session = (await getSupabaseBrowserClient()?.auth.getSession())?.data.session;
    if (!session) throw new Error("Sign in to the CRM as Mike to connect the shared address book.");
    const response = await fetch(`/api/crm/google-contacts${path}`, { method: body ? "POST" : "GET", headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || "Contacts request failed.");
    return data;
  }
  useEffect(() => { call().then(setStatus).catch(e => setMessage(e.message)); }, []);
  async function run(action: "connect" | "dryRun" | "backfill" | "process") {
    setBusy(true); setMessage("");
    try {
      if (action === "connect") { const data = await call("/connect",{}); window.location.assign(data.url); return; }
      if (action === "dryRun") { const data = await call(`?dryRun=true${status?.connected ? "" : "&crmOnly=true"}`); setCounts(data.counts); }
      else { const data = await call("",{ action }); setMessage(action === "backfill" ? `${data.queuedPopulation} CRM customers prepared. The sync processes them in resumable batches.` : `${data.processed} customers synced in this batch.`); }
      setStatus(await call());
    } catch (e) { setMessage(e instanceof Error ? e.message : "Contacts request failed."); }
    finally { setBusy(false); }
  }
  return <main style={{ maxWidth: 760, margin: "3rem auto", padding: "0 24px" }}>
    <a href="/crm">← 805 CRM</a>
    <p className="eyebrow" style={{ marginTop: 32 }}>Shared business address book</p>
    <h1>805 Google Contacts</h1>
    <p>Customer contacts sync to <strong>805@805shutters.com</strong>. Existing CRM customers are included; future sold contracts queue automatically. Existing personal contact details are preserved.</p>
    <p role="status">{status ? status.connected ? "Google account connected." : "Google Contacts authorization is needed." : "Checking connection…"}</p>
    {status && !status.configured && <p>Server setup is needed before Google authorization can open.</p>}
    {status && !status.storageReady && <p>Contacts database migration is needed.</p>}
    <div style={{ display: "flex", flexWrap: "wrap", gap: 12, margin: "24px 0" }}>
      <button className="button primary" disabled={busy || !status?.configured || !status?.storageReady} onClick={() => run("connect")}>{status?.connected ? "Reconnect Google" : "Connect 805 Google account"}</button>
      <button className="button secondary" disabled={busy} onClick={() => run("dryRun")}>Review dry run</button>
      {status?.connected && <><button className="button secondary" disabled={busy} onClick={() => run("backfill")}>Resume all customers</button><button className="button secondary" disabled={busy} onClick={() => run("process")}>Sync next batch</button></>}
    </div>
    {message && <p role="status">{message}</p>}
    {counts && <><h2>Backfill review</h2><dl>{Object.entries(counts).map(([key,value]) => <div key={key} style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #ddd", padding: 8 }}><dt>{key.replace(/([A-Z])/g," $1")}</dt><dd>{String(value)}</dd></div>)}</dl></>}
    {!!Object.keys(status?.statuses || {}).length && <p>Sync status: {Object.entries(status!.statuses).map(([key,value]) => `${key}: ${value}`).join(" · ")}</p>}
    <h2>Connect the phones</h2>
    <p>On Mike’s iPhone: Settings → Apps → Contacts → Contacts Accounts → Add Account → Google. Sign in as 805@805shutters.com and enable Contacts. Leave personal accounts and the default account unchanged; Mail and Calendars are optional.</p>
    <p>Jessica can add the same business account and enable Contacts on her phone. If she uses Android, add it under Settings → Accounts → Add account → Google, then enable Contacts sync. Each person completes Google sign-in securely on their own device.</p>
    <p>After syncing, open Contacts and search for a customer verified in the Google address book. Both phones still need this check before device sync can be marked complete.</p>
  </main>;
}
