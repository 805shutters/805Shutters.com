"use client";

import { useCallback, useMemo, useState, type FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import type { CrmJob, CrmQuote, CrmQuoteStatus } from "@/lib/crm/types";
import { PricingGuidePanel } from "@/components/crm/PricingGuidePanel";
import { QuoteBuilderPanel } from "@/components/crm/QuoteBuilderPanel";
import { STATUS_LABELS, getNextStatus, getAdvanceLabel } from "@/lib/quote/lifecycle";
import { buildQuoteWorkspaceBuckets } from "@/lib/crm/quote-workspace";

type Props = {
  session: Session;
  jobs: CrmJob[];
  quotes: CrmQuote[];
  onChanged: () => void;
};

type SubTab = "dashboard" | "builder" | "contract" | "pricing" | "calendar";

// Every non-terminal (non-archived/lost) status gets a pipeline column so a
// sold-and-progressed quote (approved/invoiced/paid) never silently vanishes.
const PIPELINE: CrmQuoteStatus[] = ["draft", "sent", "approved", "sold", "ordered", "received", "installed", "invoiced", "paid"];

const PILL: Record<string, { bg: string; fg: string }> = {
  draft: { bg: "#f1f5f9", fg: "#475569" },
  sent: { bg: "#dbeafe", fg: "#1d4ed8" },
  approved: { bg: "#ccfbf1", fg: "#0f766e" },
  sold: { bg: "#d1fae5", fg: "#047857" },
  ordered: { bg: "#fef3c7", fg: "#92400e" },
  received: { bg: "#cffafe", fg: "#0e7490" },
  installed: { bg: "#ede9fe", fg: "#6d28d9" },
  invoiced: { bg: "#e0e7ff", fg: "#4338ca" },
  paid: { bg: "#dcfce7", fg: "#166534" },
  closed: { bg: "#e6e5df", fg: "#272520" },
  archived: { bg: "#f1f5f9", fg: "#64748b" },
  lost: { bg: "#ffe4e6", fg: "#be123c" },
};

const QUOTE_STATUS_LABELS: Record<string, string> = {
  ...STATUS_LABELS,
  closed: "Closed"
};

function money(n: number | null | undefined): string {
  return (Number(n) || 0).toLocaleString("en-US", { style: "currency", currency: "USD" });
}
function when(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : "";
}

function formString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function statusText(status: string): string {
  return status.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

async function api<T>(session: Session, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}`, ...(init.headers || {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { message?: string; error?: string }).message || (body as { error?: string }).error || `Request failed (${res.status})`);
  return body as T;
}

function StatusPill({ status }: { status: string }) {
  const c = PILL[status] || PILL.draft;
  return (
    <span style={{ background: c.bg, color: c.fg, borderRadius: 999, padding: "2px 10px", fontSize: 12, fontWeight: 600, textTransform: "capitalize" }}>
      {QUOTE_STATUS_LABELS[status] || status}
    </span>
  );
}

function quoteDisplayStatus(quote: CrmQuote): string {
  return quote.live_status || quote.status;
}

function quoteLifecycleStatus(quote: CrmQuote): CrmQuoteStatus {
  const liveStatus = quoteDisplayStatus(quote);
  if (liveStatus === "closed") return "paid";
  return PIPELINE.includes(liveStatus as CrmQuoteStatus) || liveStatus === "archived" || liveStatus === "lost"
    ? (liveStatus as CrmQuoteStatus)
    : quote.status;
}

export function QuotesWorkspace({ session, jobs, quotes, onChanged }: Props) {
  const [subtab, setSubtab] = useState<SubTab>("dashboard");
  const [activeQuoteId, setActiveQuoteId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const jobsById = useMemo(() => new Map(jobs.map((j) => [j.id, j])), [jobs]);
  const customerName = useCallback(
    (q: CrmQuote) => q.customer_name || jobsById.get(q.job_id)?.customer_name || q.quote_number || "Quote",
    [jobsById],
  );

  const buckets = useMemo(() => buildQuoteWorkspaceBuckets(jobs, quotes), [jobs, quotes]);
  const activeQuotes = buckets.activeQuotes;
  const activeQuote = useMemo(() => quotes.find((q) => q.id === activeQuoteId) || null, [quotes, activeQuoteId]);

  const openBuilder = useCallback((quoteId: string) => {
    setActiveQuoteId(quoteId);
    setSubtab("builder");
    setError(null);
    setMsg(null);
  }, []);

  const buildForJob = useCallback(
    async (jobId: string) => {
      setBusy(true);
      setError(null);
      try {
        const res = await api<{ quoteId: string }>(session, `/api/crm/jobs/${jobId}/quote`, { method: "POST" });
        onChanged();
        openBuilder(res.quoteId);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not start a quote.");
      } finally {
        setBusy(false);
      }
    },
    [session, onChanged, openBuilder],
  );

  const createQuote = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const form = event.currentTarget;
      const formData = new FormData(form);
      const jobId = formString(formData, "job_id");
      const job = jobId ? jobsById.get(jobId) : null;

      setBusy(true);
      setError(null);
      setMsg(null);
      try {
        const result = await api<{ quote: CrmQuote }>(session, "/api/crm/quotes", {
          method: "POST",
          body: JSON.stringify({
            job_id: jobId || null,
            customer_name: formString(formData, "customer_name") || job?.customer_name,
            phone: formString(formData, "phone") || job?.phone,
            email: formString(formData, "email") || job?.email,
            address: formString(formData, "address") || job?.address,
            city: formString(formData, "city") || job?.city,
            product_interest: formString(formData, "product_interest") || job?.product_interest || "Window Treatments",
            sales_owner: formString(formData, "sales_owner") || job?.sales_owner || "Unassigned",
            status: "draft",
            quote_number: formString(formData, "quote_number"),
            quote_total: 0,
            notes: formString(formData, "notes"),
            meta: { source: "quotes_workspace" },
          }),
        });
        form.reset();
        onChanged();
        openBuilder(result.quote.id);
        setMsg(`Quote ${result.quote.quote_number || result.quote.id.slice(0, 8)} created.`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not create quote.");
      } finally {
        setBusy(false);
      }
    },
    [session, jobsById, onChanged, openBuilder],
  );

  const advance = useCallback(
    async (quoteId: string, status: CrmQuoteStatus) => {
      setBusy(true);
      setError(null);
      try {
        await api(session, `/api/crm/quotes/${quoteId}/status`, { method: "POST", body: JSON.stringify({ status }) });
        onChanged();
        setMsg(`Marked ${STATUS_LABELS[status]}.`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not update status.");
      } finally {
        setBusy(false);
      }
    },
    [session, onChanged],
  );

  const sendToCustomer = useCallback(
    async (quoteId: string) => {
      setBusy(true);
      setError(null);
      setMsg(null);
      try {
        const res = await api<{ url: string; sms: { sent: boolean }; email: { sent: boolean }; status: string }>(session, `/api/crm/quotes/${quoteId}/send`, { method: "POST" });
        onChanged();
        setMsg(`Sent — ${res.sms.sent ? "texted" : "SMS skipped"}, ${res.email.sent ? "emailed" : "email skipped"}. Link: ${res.url}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Send failed.");
      } finally {
        setBusy(false);
      }
    },
    [session, onChanged],
  );

  const openCustomerContract = useCallback(
    async (quoteId: string) => {
      setBusy(true);
      setError(null);
      setMsg(null);
      try {
        const res = await api<{ url: string }>(session, `/api/crm/quotes/${quoteId}/share`, { method: "POST" });
        window.open(res.url, "_blank", "noopener,noreferrer");
        onChanged();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not open the contract link.");
      } finally {
        setBusy(false);
      }
    },
    [session, onChanged],
  );

  const tabBtn = (key: SubTab, label: string, disabled?: boolean) => (
    <button
      type="button"
      onClick={() => !disabled && setSubtab(key)}
      disabled={disabled}
      style={{
        border: "1px solid #cbd5e1",
        borderRadius: 8,
        padding: "8px 16px",
        fontWeight: 600,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.4 : 1,
        background: subtab === key ? "#0f172a" : "#fff",
        color: subtab === key ? "#fff" : "#0f172a",
      }}
    >
      {label}
    </button>
  );

  return (
    <section style={{ padding: 16 }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        {tabBtn("dashboard", "Dashboard")}
        {tabBtn("builder", "Builder", !activeQuoteId)}
        {tabBtn("contract", "Contract", !activeQuoteId)}
        {tabBtn("pricing", "Pricing")}
        {tabBtn("calendar", "Consultations")}
        {activeQuote ? (
          <span style={{ marginLeft: "auto", fontSize: 13, opacity: 0.7 }}>
            Active: <strong>{customerName(activeQuote)}</strong> <StatusPill status={quoteDisplayStatus(activeQuote)} />
          </span>
        ) : null}
      </div>

      {error ? <p style={{ color: "#b91c1c", background: "#fef2f2", padding: "8px 12px", borderRadius: 8 }}>{error}</p> : null}
      {msg ? <p style={{ color: "#166534", background: "#f0fdf4", padding: "8px 12px", borderRadius: 8, wordBreak: "break-all" }}>{msg}</p> : null}

      {subtab === "dashboard" ? (
        <Dashboard
          jobs={jobs}
          quoteByJobId={buckets.quoteByJobId}
          leadsToSchedule={buckets.leadsToSchedule}
          upcomingConsultations={buckets.upcomingConsultations}
          consultationsNeedingQuote={buckets.consultationsNeedingQuote}
          activeQuotes={activeQuotes}
          customerName={customerName}
          busy={busy}
          onCreate={createQuote}
          onBuild={buildForJob}
          onOpen={openBuilder}
          onContract={(id) => { setActiveQuoteId(id); setSubtab("contract"); }}
          onOpenContractLink={openCustomerContract}
        />
      ) : null}

      {subtab === "builder" && activeQuoteId ? (
        <QuoteBuilderPanel embedded session={session} quoteId={activeQuoteId} onClose={() => {}} onChanged={onChanged} onSwitch={setActiveQuoteId} />
      ) : null}

      {subtab === "contract" && activeQuote ? (
        <ContractView
          quote={activeQuote}
          name={customerName(activeQuote)}
          busy={busy}
          onSend={() => sendToCustomer(activeQuote.id)}
          onAdvance={advance}
          onOpenBuilder={() => openBuilder(activeQuote.id)}
          onOpenContract={() => openCustomerContract(activeQuote.id)}
        />
      ) : null}

      {subtab === "pricing" ? <PricingGuidePanel session={session} /> : null}

      {subtab === "calendar" ? (
        <Consultations
          upcomingConsultations={buckets.upcomingConsultations}
          consultationsNeedingQuote={buckets.consultationsNeedingQuote}
          busy={busy}
          onBuild={buildForJob}
        />
      ) : null}
    </section>
  );
}

function Dashboard({
  jobs,
  quoteByJobId,
  leadsToSchedule,
  upcomingConsultations,
  consultationsNeedingQuote,
  activeQuotes,
  customerName,
  busy,
  onCreate,
  onBuild,
  onOpen,
  onContract,
  onOpenContractLink,
}: {
  jobs: CrmJob[];
  quoteByJobId: Map<string, CrmQuote>;
  leadsToSchedule: CrmJob[];
  upcomingConsultations: CrmJob[];
  consultationsNeedingQuote: CrmJob[];
  activeQuotes: CrmQuote[];
  customerName: (q: CrmQuote) => string;
  busy: boolean;
  onCreate: (event: FormEvent<HTMLFormElement>) => void;
  onBuild: (jobId: string) => void;
  onOpen: (quoteId: string) => void;
  onContract: (quoteId: string) => void;
  onOpenContractLink: (quoteId: string) => void;
}) {
  // Render a column for every active status (incl. approved/invoiced/paid and any
  // unexpected one), so a progressed quote never silently disappears from the board.
  const extraStatuses = Array.from(
    new Set(activeQuotes.map(quoteDisplayStatus).filter((status) => !PIPELINE.includes(status as CrmQuoteStatus))),
  );
  const pipelineColumns = [...PIPELINE, ...extraStatuses];
  return (
    <div>
      <CreateQuoteCard jobs={jobs} quoteByJobId={quoteByJobId} busy={busy} onCreate={onCreate} />

      <JobSection
        title="Leads to schedule"
        empty="No new or follow-up leads without quotes."
        jobs={leadsToSchedule}
        busy={busy}
        actionLabel="Start quote"
        onBuild={onBuild}
      />
      <JobSection
        title="Upcoming consultations"
        empty="No today or future consultations without an active quote."
        jobs={upcomingConsultations}
        busy={busy}
        actionLabel="Build Quote"
        onBuild={onBuild}
      />
      <JobSection
        title="Consultations needing quote"
        empty="No past consultations waiting on a quote."
        jobs={consultationsNeedingQuote}
        busy={busy}
        actionLabel="Build Quote"
        onBuild={onBuild}
        highlight
      />

      <h3 style={{ margin: "8px 0" }}>Quote pipeline</h3>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
        {pipelineColumns.map((status) => {
          const list = activeQuotes.filter((q) => quoteDisplayStatus(q) === status);
          return (
            <div key={status} style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: 10, background: "#fff" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <StatusPill status={status} />
                <span style={{ fontSize: 12, opacity: 0.6 }}>{list.length}</span>
              </div>
              {list.length === 0 ? (
                <p style={{ fontSize: 12, opacity: 0.5, margin: 0 }}>—</p>
              ) : (
                list.map((q) => (
                  <div key={q.id} style={{ border: "1px solid #eef2f7", borderRadius: 8, padding: 8, marginBottom: 6 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{customerName(q)}</div>
                    <div style={{ fontSize: 13, opacity: 0.75 }}>{money(q.quote_total)}{q.signed_at ? " · signed ✓" : ""}</div>
                    <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                      <button type="button" style={ghostBtn} onClick={() => onOpen(q.id)}>Build</button>
                      <button type="button" style={ghostBtn} onClick={() => onContract(q.id)}>Contract</button>
                      <button type="button" style={ghostBtn} onClick={() => onOpenContractLink(q.id)}>Open link</button>
                    </div>
                  </div>
                ))
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function JobSection({
  title,
  empty,
  jobs,
  busy,
  actionLabel,
  onBuild,
  highlight,
}: {
  title: string;
  empty: string;
  jobs: CrmJob[];
  busy: boolean;
  actionLabel: string;
  onBuild: (jobId: string) => void;
  highlight?: boolean;
}) {
  return (
    <section style={{ marginBottom: 24 }}>
      <h3 style={{ margin: "8px 0" }}>{title}</h3>
      {jobs.length === 0 ? (
        <p style={{ opacity: 0.6 }}>{empty}</p>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {jobs.map((job) => (
            <JobCard key={job.id} job={job} busy={busy} actionLabel={actionLabel} onBuild={onBuild} highlight={highlight} />
          ))}
        </div>
      )}
    </section>
  );
}

function JobCard({
  job,
  busy,
  actionLabel,
  onBuild,
  highlight,
}: {
  job: CrmJob;
  busy: boolean;
  actionLabel: string;
  onBuild: (jobId: string) => void;
  highlight?: boolean;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, border: `1px solid ${highlight ? "#facc15" : "#e2e8f0"}`, borderRadius: 10, padding: 12, background: highlight ? "#fffbeb" : "#f8fafc" }}>
      <div style={{ flex: 1 }}>
        <strong>{job.customer_name}</strong>
        <div style={{ fontSize: 13, opacity: 0.7 }}>
          {job.appointment_start ? when(job.appointment_start) : statusText(job.status)}
          {job.address ? ` · ${job.address}` : ""}
          {job.next_action ? ` · ${job.next_action}` : ""}
        </div>
      </div>
      <button type="button" disabled={busy} onClick={() => onBuild(job.id)} style={primaryBtn}>
        {actionLabel}
      </button>
    </div>
  );
}

function CreateQuoteCard({
  jobs,
  quoteByJobId,
  busy,
  onCreate,
}: {
  jobs: CrmJob[];
  quoteByJobId: Map<string, CrmQuote>;
  busy: boolean;
  onCreate: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const linkableJobs = jobs
    .filter((job) => job.status !== "closed" && job.status !== "lost" && !quoteByJobId.has(job.id))
    .sort((a, b) => a.customer_name.localeCompare(b.customer_name));

  return (
    <form onSubmit={onCreate} style={{ border: "1px solid #dbe3ee", borderRadius: 10, padding: 14, marginBottom: 20, background: "#f8fafc" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>Create quote</h3>
        <button type="submit" disabled={busy} style={primaryBtn}>
          Create + open builder
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10 }}>
        <label style={formLabel}>
          Existing job
          <select name="job_id" style={formInput}>
            <option value="">Start from customer details</option>
            {linkableJobs.map((job) => (
              <option value={job.id} key={job.id}>
                {job.customer_name} - {job.product_interest}
              </option>
            ))}
          </select>
        </label>
        <label style={formLabel}>
          Customer
          <input name="customer_name" placeholder="Customer name" style={formInput} />
        </label>
        <label style={formLabel}>
          Phone
          <input name="phone" placeholder="805-000-0000" style={formInput} />
        </label>
        <label style={formLabel}>
          Email
          <input name="email" type="email" placeholder="customer@email.com" style={formInput} />
        </label>
        <label style={formLabel}>
          Address
          <input name="address" placeholder="Project address" style={formInput} />
        </label>
        <label style={formLabel}>
          City
          <input name="city" placeholder="Ventura" style={formInput} />
        </label>
        <label style={formLabel}>
          Product
          <input name="product_interest" placeholder="Window Treatments" style={formInput} />
        </label>
        <label style={formLabel}>
          Sales owner
          <select name="sales_owner" defaultValue="Unassigned" style={formInput}>
            <option>Unassigned</option>
            <option>Jessica</option>
            <option>Mike</option>
          </select>
        </label>
        <label style={formLabel}>
          Quote #
          <input name="quote_number" placeholder="Auto if blank" style={formInput} />
        </label>
        <label style={{ ...formLabel, gridColumn: "1 / -1" }}>
          Notes
          <textarea name="notes" rows={2} placeholder="Scope, rooms, install notes..." style={formInput} />
        </label>
      </div>
    </form>
  );
}

function Consultations({
  upcomingConsultations,
  consultationsNeedingQuote,
  busy,
  onBuild,
}: {
  upcomingConsultations: CrmJob[];
  consultationsNeedingQuote: CrmJob[];
  busy: boolean;
  onBuild: (jobId: string) => void;
}) {
  return (
    <div>
      <JobSection
        title="Upcoming consultations"
        empty="No today or future consultations without an active quote."
        jobs={upcomingConsultations}
        busy={busy}
        actionLabel="Build Quote"
        onBuild={onBuild}
      />
      <JobSection
        title="Consultations needing quote"
        empty="No past consultations waiting on a quote."
        jobs={consultationsNeedingQuote}
        busy={busy}
        actionLabel="Build Quote"
        onBuild={onBuild}
        highlight
      />
    </div>
  );
}

function ContractView({
  quote,
  name,
  busy,
  onSend,
  onAdvance,
  onOpenBuilder,
  onOpenContract,
}: {
  quote: CrmQuote;
  name: string;
  busy: boolean;
  onSend: () => void;
  onAdvance: (quoteId: string, status: CrmQuoteStatus) => void;
  onOpenBuilder: () => void;
  onOpenContract: () => void;
}) {
  const displayStatus = quoteDisplayStatus(quote);
  const lifecycleStatus = quoteLifecycleStatus(quote);
  const next = getNextStatus(lifecycleStatus);
  return (
    <div style={{ maxWidth: 640 }}>
      <div style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h3 style={{ margin: 0 }}>{name}</h3>
            <div style={{ fontSize: 14, opacity: 0.75 }}>{money(quote.quote_total)} · <StatusPill status={displayStatus} /></div>
          </div>
          <button type="button" style={ghostBtn} onClick={onOpenBuilder}>Open builder</button>
        </div>

        <div style={{ marginTop: 16, padding: 12, borderRadius: 8, background: quote.signed_at ? "#f0fdf4" : "#f8fafc" }}>
          {quote.signed_at ? (
            <span>✓ Signed by <strong>{quote.customer_printed_name || "customer"}</strong> on {when(quote.signed_at)}</span>
          ) : (
            <span style={{ opacity: 0.75 }}>Not signed yet. Send the quote so the customer can review and e-sign.</span>
          )}
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
          <button type="button" disabled={busy} onClick={onSend} style={primaryBtn}>Send to customer</button>
          <button type="button" disabled={busy} onClick={onOpenContract} style={ghostBtn}>Open customer contract</button>
          {next ? (
            <button type="button" disabled={busy} onClick={() => onAdvance(quote.id, next)} style={ghostBtn}>
              {getAdvanceLabel(lifecycleStatus)}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

const primaryBtn = { border: "none", background: "#2563eb", color: "#fff", borderRadius: 8, padding: "9px 16px", cursor: "pointer", fontWeight: 600 } as const;
const ghostBtn = { border: "1px solid #cbd5e1", background: "#fff", borderRadius: 8, padding: "6px 12px", cursor: "pointer", fontSize: 13 } as const;
const formLabel = { display: "flex", flexDirection: "column", gap: 4, fontSize: 12, fontWeight: 600, color: "#334155" } as const;
const formInput = { border: "1px solid #cbd5e1", borderRadius: 8, padding: "8px 10px", font: "inherit", background: "#fff", color: "#0f172a" } as const;
