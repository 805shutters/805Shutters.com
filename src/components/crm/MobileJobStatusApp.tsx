"use client";
import { useCallback, useEffect, useState } from "react";
import { Check, ChevronDown, Circle, FileText, RefreshCw, Search } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { jobStatusFilters, type JobStatusFilter } from "@/lib/crm/job-status-filters";
import type { MobileJobStatus } from "@/lib/crm/mobile-job-status";
import styles from "./MobileJobStatusApp.module.css";

const filters = [{ id: "active", label: "Open jobs" }, ...jobStatusFilters, { id: "closed", label: "Closed" }] as const;
const money = (amount: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
export function MobileJobStatusApp() {
  const [rows, setRows] = useState<MobileJobStatus[]>([]);
  const [filter, setFilter] = useState<JobStatusFilter>("active");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [signedOut, setSignedOut] = useState(false);
  const refresh = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const client = getSupabaseBrowserClient();
      const session = client ? (await client.auth.getSession()).data.session : null;
      if (!session) { setSignedOut(true); setRows([]); return; }
      setSignedOut(false);
      const response = await fetch("/api/crm/mobile/job-status/", { cache: "no-store", headers: { Authorization: `Bearer ${session.access_token}` } });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "Job Status could not load.");
      setRows(body.results);
    } catch (error) { setError(error instanceof Error ? error.message : "Job Status could not load."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  const visible = rows.filter(row => row.filters.includes(filter) && `${row.name} ${row.project}`.toLowerCase().includes(query.toLowerCase().trim()));
  return <main className={styles.page}>
    <header className={styles.heading}><div><small>YOUR WORK, AT A GLANCE</small><h1>Job Status</h1><p>From quote to final payment.</p></div><button aria-label="Refresh Job Status" disabled={loading} onClick={() => void refresh()}><RefreshCw size={20} /></button></header>
    {signedOut && <p><a className={styles.primary} href="/api/crm/oauth/google?redirectTo=%2Fcrm%2Fmobile%2Fjob-status%2F">Sign in to Job Status</a></p>}
    <label className={styles.search}><Search size={18} /><input aria-label="Search jobs" placeholder="Customer or contract number" value={query} onChange={event => setQuery(event.target.value)} /></label>
    <nav className={styles.filters} aria-label="Job Status filters">{filters.map(option => <button key={option.id} aria-pressed={option.id === filter} onClick={() => setFilter(option.id)}>{option.label}<span>{rows.filter(row => row.filters.includes(option.id)).length}</span></button>)}</nav>
    {error && <p role="alert" className={styles.error}>{error}<button onClick={() => void refresh()}>Try again</button></p>}
    {loading && <p role="status">Loading current job status…</p>}
    {!loading && !error && !signedOut && <p className={styles.count}>{visible.length} jobs · green checks mean complete</p>}
    {!loading && !error && !signedOut && !visible.length && <p>No jobs match this view.</p>}
    <section className={styles.list} aria-label="Jobs">{visible.map(row => <article className={styles.card} key={row.id}>
      <div className={styles.title}><div><h2>{row.name}</h2><p>{row.project}{row.closed ? " · Closed" : ""}</p></div><strong>{row.balance === null ? "Review balance" : row.balance > 0 ? money(row.balance) + " due" : "No balance due"}</strong></div>
      {row.shippedAndDue && <span className={styles.badge}>Shipped · payment due</span>}
      <div className={styles.checks}>{row.milestones.map(step => <div key={step.label} data-complete={step.complete} aria-label={`${step.label}: ${step.complete ? "complete" : "pending"}`}>{step.complete ? <Check size={20} /> : <Circle size={18} />}<span>{step.label}</span></div>)}</div>
      <details><summary>Products &amp; next steps <ChevronDown size={16} /></summary>
        {row.products.map(product => <div className={styles.product} key={product.id}><strong>{product.name}</strong><span>{[["Ordered", product.ordered], ["Shipped", product.shipped], ["Installed", product.installed]].map(([label, complete]) => <span data-complete={complete} key={String(label)}>{complete ? <Check size={14} /> : <Circle size={12} />}{label}</span>)}</span></div>)}
        <div className={styles.actions}>{row.contractUrl && <a href={row.contractUrl} target="_blank" rel="noreferrer"><FileText size={16} />View contract</a>}<a href={`/crm/mobile/search/?q=${encodeURIComponent(row.name)}`}>Customer info / payments</a><a href="/crm/?view=tracking">Manage workflow on main site</a></div>
      </details>
    </article>)}</section>
  </main>;
}
