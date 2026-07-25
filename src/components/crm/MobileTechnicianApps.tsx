"use client";

import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { ArrowLeft, ChevronRight, ClipboardList, Files, Search } from "lucide-react";
import { buildMobileContractItems, buildMobileJobBuckets, filterMobileContracts } from "@/lib/crm/mobile-technician";
import type { CrmDashboardData } from "@/lib/crm/types";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

async function fetchDashboard(session: Session) {
  const response = await fetch("/api/crm/jobs", {
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof body?.message === "string" ? body.message : "CRM data could not be loaded.");
  return body as CrmDashboardData;
}

function useMobileDashboard() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [data, setData] = useState<CrmDashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) {
      setError("Supabase auth is not configured.");
      setAuthLoading(false);
      return;
    }
    let mounted = true;
    supabase.auth.getSession().then(({ data: authData }) => {
      if (!mounted) return;
      setSession(authData.session);
      setAuthLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    if (!session) return;
    setError(null);
    fetchDashboard(session).then(setData).catch((reason) => {
      setError(reason instanceof Error ? reason.message : "CRM data could not be loaded.");
    });
  }, [session]);

  return { session, authLoading, data, error };
}

function MobilePageHeader({ icon, eyebrow, title }: { icon: React.ReactNode; eyebrow: string; title: string }) {
  return (
    <header className="mobile-tech-header">
      <a href="/crm/mobile" aria-label="Back to mobile CRM"><ArrowLeft /></a>
      <div className="mobile-tech-title-icon">{icon}</div>
      <div>
        <span>{eyebrow}</span>
        <h1>{title}</h1>
      </div>
    </header>
  );
}

function MobileState({ text }: { text: string }) {
  return <div className="mobile-tech-state">{text}</div>;
}

export function MobileJobStatusApp() {
  const { session, authLoading, data, error } = useMobileDashboard();
  const buckets = useMemo(() => buildMobileJobBuckets(data?.jobs || []), [data?.jobs]);

  if (authLoading) return <main className="mobile-tech-shell"><MobileState text="Loading…" /></main>;
  if (!session) return <main className="mobile-tech-shell"><MobileState text="Sign in from the Mobile CRM to view job status." /></main>;

  return (
    <main className="mobile-tech-shell">
      <MobilePageHeader icon={<ClipboardList />} eyebrow="Technician app" title="Job Status" />
      {error ? <MobileState text={error} /> : null}
      {!data && !error ? <MobileState text="Loading jobs…" /> : null}
      {data && buckets.length === 0 ? <MobileState text="No jobs found." /> : null}
      <div className="mobile-job-buckets">
        {buckets.map((bucket) => (
          <section className="mobile-job-bucket" key={bucket.id}>
            <div className="mobile-job-bucket-heading">
              <h2>{bucket.label}</h2>
              <span>{bucket.jobs.length}</span>
            </div>
            <div className="mobile-job-list">
              {bucket.jobs.map((job) => (
                <article className="mobile-job-card" key={job.id}>
                  <div>
                    <strong>{job.customer_name}</strong>
                    <span>{job.product_interest || "Product not listed"}</span>
                  </div>
                  <span className="mobile-job-status-pill">{bucket.label}</span>
                  {job.address ? <p>{job.address}{job.city ? `, ${job.city}` : ""}</p> : null}
                  {job.next_action ? <p><b>Next:</b> {job.next_action}</p> : null}
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}

export function MobileContractsApp() {
  const { session, authLoading, data, error } = useMobileDashboard();
  const [query, setQuery] = useState("");
  const contracts = useMemo(() => buildMobileContractItems(data?.customerFiles || []), [data?.customerFiles]);
  const visibleContracts = useMemo(() => filterMobileContracts(contracts, query), [contracts, query]);

  if (authLoading) return <main className="mobile-tech-shell"><MobileState text="Loading…" /></main>;
  if (!session) return <main className="mobile-tech-shell"><MobileState text="Sign in from the Mobile CRM to view contracts." /></main>;

  return (
    <main className="mobile-tech-shell">
      <MobilePageHeader icon={<Files />} eyebrow="Technician app" title="Contracts" />
      <label className="mobile-contract-search">
        <Search />
        <span className="sr-only">Search by customer name</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search customer name"
          autoComplete="off"
        />
      </label>
      <p className="mobile-contract-count">{visibleContracts.length} {visibleContracts.length === 1 ? "contract" : "contracts"}</p>
      {error ? <MobileState text={error} /> : null}
      {!data && !error ? <MobileState text="Loading contracts…" /> : null}
      {data && visibleContracts.length === 0 ? <MobileState text={query ? "No contracts match that customer." : "No contracts found."} /> : null}
      <div className="mobile-contract-list">
        {visibleContracts.map((contract) => {
          const content = (
            <>
              <div>
                <strong>{contract.customerName}</strong>
                <span>{contract.title}</span>
                <small>{contract.status || "Contract"}{contract.signedAt ? ` · Signed ${new Date(contract.signedAt).toLocaleDateString()}` : ""}</small>
              </div>
              {contract.url ? <ChevronRight /> : <span className="mobile-contract-unavailable">No link</span>}
            </>
          );
          return contract.url
            ? <a className="mobile-contract-card" href={contract.url} key={contract.id}>{content}</a>
            : <div className="mobile-contract-card" key={contract.id}>{content}</div>;
        })}
      </div>
    </main>
  );
}
