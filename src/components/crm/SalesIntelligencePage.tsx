"use client";

import { useMemo, useState } from "react";
import { buildSalesIntelligenceReport, type SalesIntelligenceRange } from "@/lib/crm/sales-intelligence";
import type { CrmCalendarEvent, CrmJob, CrmQuote } from "@/lib/crm/types";

function dateInputValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

function defaultRange(): SalesIntelligenceRange {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - 29);
  return { start: dateInputValue(start), end: dateInputValue(end) };
}

function currency(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value || 0);
}

function percent(value: number, total: number) {
  return total ? `${Math.round((value / total) * 100)}%` : "0%";
}

function shortDate(value?: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

function setPreset(days: number): SalesIntelligenceRange {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - days + 1);
  return { start: dateInputValue(start), end: dateInputValue(end) };
}

export function SalesIntelligencePage({
  jobs,
  quotes,
  events,
  onOpenCustomer
}: {
  jobs: CrmJob[];
  quotes: CrmQuote[];
  events: CrmCalendarEvent[];
  onOpenCustomer: (job: CrmJob) => void;
}) {
  const [range, setRange] = useState(defaultRange);
  const [sourceFilter, setSourceFilter] = useState("All sources");
  const [ownerFilter, setOwnerFilter] = useState("All reps");
  const [query, setQuery] = useState("");
  const report = useMemo(() => buildSalesIntelligenceReport(jobs, quotes, events, range), [events, jobs, quotes, range]);
  const change = report.priorLeadCount
    ? Math.round(((report.totals.leads - report.priorLeadCount) / report.priorLeadCount) * 100)
    : null;
  const maxSourceLeads = Math.max(1, ...report.sources.map((item) => item.leads));
  const sources = ["All sources", ...report.sources.map((item) => item.source)];
  const owners = ["All reps", ...report.reps.map((item) => item.owner)];
  const visibleLeads = report.leads.filter((lead) => {
    if (sourceFilter !== "All sources" && lead.source !== sourceFilter) return false;
    if (ownerFilter !== "All reps" && lead.owner !== ownerFilter) return false;
    const normalized = query.trim().toLowerCase();
    return !normalized || [lead.job.customer_name, lead.job.phone, lead.job.email, lead.job.city, lead.source, lead.owner]
      .filter(Boolean).some((value) => String(value).toLowerCase().includes(normalized));
  });
  const funnel = [
    { label: "Leads", value: report.totals.leads },
    { label: "Scheduled", value: report.totals.scheduled },
    { label: "Quoted", value: report.totals.quoted },
    { label: "Won", value: report.totals.won }
  ];

  return (
    <main className="crm-si">
      <header className="crm-si-hero">
        <div>
          <p className="crm-si-eyebrow">Sales performance</p>
          <h2>Sales Intelligence</h2>
          <p>Trace every lead from its source through follow-up, pipeline progress, outcome, and revenue.</p>
        </div>
        <div className="crm-si-date-controls" aria-label="Reporting period">
          <div className="crm-si-presets">
            {[7, 30, 90].map((days) => (
              <button type="button" key={days} onClick={() => setRange(setPreset(days))}>
                {days} days
              </button>
            ))}
          </div>
          <label>From<input type="date" value={range.start} max={range.end} onChange={(event) => setRange((current) => ({ ...current, start: event.target.value }))} /></label>
          <label>To<input type="date" value={range.end} min={range.start} onChange={(event) => setRange((current) => ({ ...current, end: event.target.value }))} /></label>
        </div>
      </header>

      <section className="crm-si-kpis" aria-label="Performance summary">
        <article><span>New leads</span><strong>{report.totals.leads}</strong><small>{change === null ? "No prior-period baseline" : `${change >= 0 ? "+" : ""}${change}% vs prior period`}</small></article>
        <article><span>Lead-source coverage</span><strong>{percent(report.totals.attributed, report.totals.leads)}</strong><small>{report.totals.leads - report.totals.attributed} missing attribution</small></article>
        <article><span>Close rate</span><strong>{percent(report.totals.won, report.totals.won + report.totals.lost)}</strong><small>{report.totals.won} won · {report.totals.lost} lost</small></article>
        <article><span>Won revenue</span><strong>{currency(report.totals.revenue)}</strong><small>{currency(report.totals.pipeline)} open pipeline</small></article>
        <article className={report.totals.overdue ? "crm-si-kpi-alert" : ""}><span>Overdue follow-ups</span><strong>{report.totals.overdue}</strong><small>{report.totals.missingFollowUp} open leads missing a next action</small></article>
      </section>

      <section className="crm-si-grid crm-si-grid-top">
        <article className="crm-si-card">
          <div className="crm-si-card-head"><div><span>End-to-end funnel</span><h3>Lead progression</h3></div><small>Selected-period lead cohort</small></div>
          <div className="crm-si-funnel">
            {funnel.map((stage, index) => (
              <div key={stage.label}>
                <div className="crm-si-funnel-bar" style={{ width: `${Math.max(12, report.totals.leads ? (stage.value / report.totals.leads) * 100 : 12)}%` }}>
                  <strong>{stage.value}</strong><span>{stage.label}</span>
                </div>
                {index < funnel.length - 1 ? <small>{percent(funnel[index + 1].value, stage.value)} advanced</small> : null}
              </div>
            ))}
          </div>
        </article>

        <article className="crm-si-card">
          <div className="crm-si-card-head"><div><span>Accountability</span><h3>Follow-up health</h3></div><small>Open leads only</small></div>
          <div className="crm-si-followup">
            <div><strong>{report.totals.overdue}</strong><span>Overdue</span></div>
            <div><strong>{report.totals.missingFollowUp}</strong><span>Missing next action</span></div>
            <div><strong>{report.totals.open}</strong><span>Open outcomes</span></div>
          </div>
          <p className="crm-si-note">A lead is accountable only when both a next action and due date are recorded. Completed and lost leads are excluded.</p>
        </article>
      </section>

      <section className="crm-si-card">
        <div className="crm-si-card-head"><div><span>Traceable attribution</span><h3>Lead source performance</h3></div><small>Leads → wins → revenue</small></div>
        <div className="crm-si-table-wrap">
          <table className="crm-si-table">
            <thead><tr><th>Source</th><th>Lead volume</th><th>Scheduled</th><th>Quoted</th><th>Won</th><th>Close rate</th><th>Revenue</th><th>Pipeline</th></tr></thead>
            <tbody>
              {report.sources.map((source) => (
                <tr key={source.source} className={source.source === "Unknown" ? "crm-si-row-warning" : ""}>
                  <td><strong>{source.source}</strong>{source.source === "Unknown" ? <small>Needs attribution</small> : null}</td>
                  <td><div className="crm-si-source-volume"><span style={{ width: `${(source.leads / maxSourceLeads) * 100}%` }} /> <b>{source.leads}</b></div></td>
                  <td>{source.scheduled}</td><td>{source.quoted}</td><td>{source.won}</td>
                  <td>{percent(source.won, source.won + source.lost)}</td><td>{currency(source.revenue)}</td><td>{currency(source.pipeline)}</td>
                </tr>
              ))}
              {!report.sources.length ? <tr><td colSpan={8} className="crm-si-empty">No leads were created in this reporting period.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="crm-si-card">
        <div className="crm-si-card-head"><div><span>Team performance</span><h3>Rep scorecard</h3></div><small>Ownership on lead record</small></div>
        <div className="crm-si-reps">
          {report.reps.map((rep) => (
            <article key={rep.owner}>
              <div><span>Sales rep</span><h4>{rep.owner}</h4></div>
              <dl>
                <div><dt>Leads</dt><dd>{rep.leads}</dd></div><div><dt>Appointments</dt><dd>{rep.scheduled}</dd></div>
                <div><dt>Quotes</dt><dd>{rep.quoted}</dd></div><div><dt>Wins</dt><dd>{rep.won}</dd></div>
                <div><dt>Close rate</dt><dd>{percent(rep.won, rep.won + rep.lost)}</dd></div><div><dt>Revenue</dt><dd>{currency(rep.revenue)}</dd></div>
              </dl>
              <p className={rep.overdue || rep.missingFollowUp ? "crm-si-rep-alert" : ""}>{rep.overdue} overdue · {rep.missingFollowUp} missing next action</p>
            </article>
          ))}
        </div>
      </section>

      <section className="crm-si-card">
        <div className="crm-si-card-head crm-si-lead-head">
          <div><span>Complete lead ledger</span><h3>Every lead in the period</h3></div>
          <div className="crm-si-filters">
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search customer, phone, city…" />
            <select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}>{sources.map((source) => <option key={source}>{source}</option>)}</select>
            <select value={ownerFilter} onChange={(event) => setOwnerFilter(event.target.value)}>{owners.map((owner) => <option key={owner}>{owner}</option>)}</select>
          </div>
        </div>
        <div className="crm-si-table-wrap">
          <table className="crm-si-table crm-si-lead-table">
            <thead><tr><th>Lead</th><th>Created</th><th>Source</th><th>Rep</th><th>Pipeline stage</th><th>Outcome</th><th>Value</th><th>Next action</th><th>Last activity</th></tr></thead>
            <tbody>
              {visibleLeads.map((lead) => (
                <tr key={lead.job.id}>
                  <td><button type="button" className="crm-si-customer-link" onClick={() => onOpenCustomer(lead.job)}>{lead.job.customer_name}</button><small>{lead.job.phone}{lead.job.city ? ` · ${lead.job.city}` : ""}</small></td>
                  <td>{shortDate(lead.job.created_at)}</td><td className={lead.source === "Unknown" ? "crm-si-cell-warning" : ""}>{lead.source}</td><td>{lead.owner}</td>
                  <td><span className="crm-si-stage">{lead.job.status.replaceAll("_", " ")}</span></td><td><span className={`crm-si-outcome crm-si-outcome-${lead.outcome.toLowerCase()}`}>{lead.outcome}</span></td>
                  <td>{lead.outcome === "Won" ? currency(lead.revenue) : currency(lead.quote?.quote_total || lead.job.estimated_total)}</td>
                  <td><span className={`crm-si-followup-state crm-si-followup-${lead.nextActionState.toLowerCase().replaceAll(" ", "-")}`}>{lead.nextActionState}</span><small>{lead.job.next_action || "No next action"}{lead.job.next_action_due ? ` · ${shortDate(lead.job.next_action_due)}` : ""}</small></td>
                  <td>{shortDate(lead.lastActivityAt)}</td>
                </tr>
              ))}
              {!visibleLeads.length ? <tr><td colSpan={9} className="crm-si-empty">No leads match the current report filters.</td></tr> : null}
            </tbody>
          </table>
        </div>
        <footer className="crm-si-ledger-footer">Showing {visibleLeads.length} of {report.leads.length} leads · Period is based on lead creation date.</footer>
      </section>
    </main>
  );
}
