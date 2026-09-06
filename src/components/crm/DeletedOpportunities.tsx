"use client";

import { useState } from "react";

export type DeletedOpportunity = {
  id: string;
  customer_name: string;
  product_interest: string | null;
  deleted_at: string;
};

export function DeletedOpportunities({ load, restore, busy }: {
  load: () => Promise<DeletedOpportunity[]>;
  restore: (id: string, deletedAt: string) => Promise<void>;
  busy: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [jobs, setJobs] = useState<DeletedOpportunity[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function showDeleted() {
    if (open) { setOpen(false); return; }
    setOpen(true);
    setLoading(true);
    setError(null);
    try { setJobs(await load()); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Deleted opportunities could not be loaded."); }
    finally { setLoading(false); }
  }

  async function restoreJob(job: DeletedOpportunity) {
    setLoading(true);
    setError(null);
    try {
      await restore(job.id, job.deleted_at);
      setJobs((current) => current.filter((item) => item.id !== job.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Opportunity could not be restored.");
    } finally { setLoading(false); }
  }

  return (
    <div className="crm-deleted-opportunities">
      <button type="button" className="crm-ghost-button" aria-expanded={open} onClick={showDeleted} disabled={busy || loading}>
        {open ? "Hide recently deleted" : "Recently deleted"}
      </button>
      {open ? (
        <section aria-label="Recently deleted opportunities">
          <p>Opportunities removed in the last 30 days can be restored here.</p>
          {error ? <p role="alert">{error}</p> : null}
          {loading ? <p role="status">Loading…</p> : null}
          {!loading && !error && !jobs.length ? <p>No recently deleted opportunities.</p> : null}
          <ul>
            {jobs.map((job) => (
              <li key={job.id}>
                <div><strong>{job.customer_name}</strong><small>{job.product_interest || "Product not listed"}</small></div>
                <button type="button" className="crm-ghost-button" disabled={busy || loading} onClick={() => restoreJob(job)} aria-label={`Restore ${job.product_interest || "opportunity"} for ${job.customer_name}`}>Restore</button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
