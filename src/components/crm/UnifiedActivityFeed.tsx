"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, DollarSign, Pencil, Clock, MessageSquare } from "lucide-react";
import type {
  CrmActivitySnapshot,
  CrmCalendarEvent,
  CrmBookkeepingRow,
  CrmCustomer,
  CrmCustomerFile,
  CrmJob,
  CrmQuote
} from "@/lib/crm/types";
import {
  buildUnifiedActivityFeed,
  filterUnifiedActivity,
  reconcileDisplayedActivity,
  type UnifiedActivityEvent,
  type UnifiedActivityFilter
} from "@/lib/crm/unified-activity";

const activityTabs: Array<{ value: UnifiedActivityFilter; label: string }> = [
  { value: "operations", label: "Operational timeline" },
  { value: "all", label: "Raw audit" },
  { value: "payments", label: "Payments" },
  { value: "updates", label: "Updates" },
  { value: "notes", label: "Notes" },
  { value: "follow_ups", label: "Follow-ups" },
  { value: "signed_contracts", label: "Signed contracts" }
];

const activityIcons = { payment: DollarSign, update: Pencil, note: MessageSquare, follow_up: Clock, signed_contract: Check };

function displaySource(event: UnifiedActivityEvent) {
  if (event.actorEmail?.startsWith("automation:")) return "Automation";
  if (event.source.toLowerCase() === "805shutters") return "Office";
  return event.source;
}

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const timestamp = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "America/Los_Angeles"
});
const dateOnlyTimestamp = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC"
});

function normalizeCustomerName(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function displayTimestamp(value: string) {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = new Date(dateOnly ? `${value}T12:00:00.000Z` : value);
  return Number.isNaN(date.getTime()) ? value : dateOnly ? dateOnlyTimestamp.format(date) : timestamp.format(date);
}

function isUnlinkedCustomer(value: string) {
  return value === "Unlinked customer";
}

function customerMatches(event: UnifiedActivityEvent, customerName: string) {
  if (isUnlinkedCustomer(customerName)) return false;
  return normalizeCustomerName(event.customerName) === normalizeCustomerName(customerName);
}

export function UnifiedActivityFeed({
  snapshot,
  events = [],
  jobs,
  quotes,
  rows,
  customers,
  customerFiles,
  loading,
  error,
  onOpenCustomer
}: {
  snapshot: CrmActivitySnapshot | null;
  events?: CrmCalendarEvent[];
  jobs: CrmJob[];
  quotes: CrmQuote[];
  rows: CrmBookkeepingRow[];
  customers: CrmCustomer[];
  customerFiles: CrmCustomerFile[];
  loading?: boolean;
  error?: string | null;
  onOpenCustomer: (customerName: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const latestFeedRef = useRef<UnifiedActivityEvent[]>([]);
  const [activeFilter, setActiveFilter] = useState<UnifiedActivityFilter>("operations");
  const [displayedFeed, setDisplayedFeed] = useState<UnifiedActivityEvent[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [selectedCustomer, setSelectedCustomer] = useState<string | null>(null);

  const feed = useMemo(
    () => buildUnifiedActivityFeed({
      activityEvents: snapshot?.activityEvents || [],
      payments: snapshot?.payments || [],
      signedContracts: snapshot?.signedContracts || [],
      rows,
      jobs,
      quotes,
      customers
    }),
    [customers, jobs, quotes, rows, snapshot]
  );

  useEffect(() => {
    latestFeedRef.current = feed;
    const next = reconcileDisplayedActivity(displayedFeed, feed, scrollRef.current?.scrollTop || 0);
    setDisplayedFeed(next.feed);
    setPendingCount(next.pendingCount);
  }, [displayedFeed, feed]);

  const visibleFeed = useMemo(
    () => filterUnifiedActivity(displayedFeed, activeFilter),
    [activeFilter, displayedFeed]
  );
  const counts = useMemo(
    () => new Map(activityTabs.map((tab) => [tab.value, filterUnifiedActivity(displayedFeed, tab.value).length])),
    [displayedFeed]
  );
  const selectedTimeline = useMemo(
    () => selectedCustomer ? feed.filter((event) => customerMatches(event, selectedCustomer)) : [],
    [feed, selectedCustomer]
  );
  const selectedFile = useMemo(
    () => selectedCustomer
      ? customerFiles.find((file) => normalizeCustomerName(file.customerName) === normalizeCustomerName(selectedCustomer)) || null
      : null,
    [customerFiles, selectedCustomer]
  );
  const selectedJobs = useMemo(
    () => selectedCustomer
      ? jobs.filter((job) => normalizeCustomerName(job.customer_name) === normalizeCustomerName(selectedCustomer))
      : [],
    [jobs, selectedCustomer]
  );
  const selectedPayments = selectedTimeline.filter((event) => event.category === "payment");
  const selectedNotes = selectedFile?.notes || selectedJobs.map((job) => job.notes).filter((note): note is string => Boolean(note));
  const currentStatus = selectedFile?.latestStatus || selectedJobs[0]?.status || "Unknown";
  const followUpJobs = selectedJobs.filter((job) => job.next_action || job.next_action_due || job.status === "follow_up");

  function revealPendingActivity() {
    setDisplayedFeed(latestFeedRef.current);
    setPendingCount(0);
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }

  function selectEvent(event: UnifiedActivityEvent) {
    if (isUnlinkedCustomer(event.customerName)) return;
    setSelectedCustomer(event.customerName);
  }

  return (
    <section className="crm-activity-dashboard" aria-labelledby="crm-activity-title">
      <div className="crm-section-head crm-activity-head">
        <div>
          <p className="eyebrow">Live CRM</p>
          <h2 id="crm-activity-title">Activity Dashboard</h2>
          <p>Payments, customer updates, notes, and follow-ups in one timeline.</p>
        </div>
        <strong>{visibleFeed.length} events</strong>
      </div>

      <details style={{marginBottom:16}}><summary>Planned appointments · {events.filter(e => ["scheduled","rescheduled"].includes(e.status) && Date.parse(e.start_at) >= Date.now()).length}</summary><p>Future commitments are separate from completed events. Dates are Pacific time.</p>{events.filter(e => ["scheduled","rescheduled"].includes(e.status) && Date.parse(e.start_at) >= Date.now()).sort((a,b)=>a.start_at.localeCompare(b.start_at)).map(e=><p key={e.id}>{e.title} · {e.event_type.replaceAll('_',' ')} · {displayTimestamp(e.start_at)} · {e.assigned_to || 'Unassigned'}</p>)}</details>
      <div className="crm-activity-tabs" role="tablist" aria-label="Activity filters">
        {activityTabs.map((tab) => (
          <button
            type="button"
            role="tab"
            aria-selected={activeFilter === tab.value}
            className={activeFilter === tab.value ? "active" : ""}
            onClick={() => setActiveFilter(tab.value)}
            key={tab.value}
          >
            {tab.label}<span>{counts.get(tab.value) || 0}</span>
          </button>
        ))}
      </div>

      {pendingCount ? (
        <button type="button" className="crm-activity-new" onClick={revealPendingActivity}>
          {pendingCount} new activity {pendingCount === 1 ? "event" : "events"} · Jump to top
        </button>
      ) : null}

      {snapshot?.warnings?.length ? <p className="crm-activity-warning">{snapshot.warnings.join(" ")}</p> : null}
      {error ? <p className="crm-activity-warning">Live refresh paused: {error}</p> : null}

      <div className={`crm-activity-layout${selectedCustomer ? " has-selection" : ""}`}>
        <div className="crm-activity-scroll" ref={scrollRef} role="feed" aria-busy={loading || undefined}>
          {visibleFeed.map((event) => {
            const Icon = activityIcons[event.category];
            return (
            <button
              type="button"
              className={`crm-activity-row${selectedCustomer && customerMatches(event, selectedCustomer) ? " selected" : ""}`}
              onClick={() => selectEvent(event)}
              aria-label={`${event.typeLabel} for ${event.displayCustomer}: ${event.description}`}
              key={event.id}
            >
              <span className={`crm-activity-icon ${event.category}`} aria-hidden="true"><Icon size={17} /></span>
              <span className="crm-activity-body">
                <span className="crm-activity-customer">{isUnlinkedCustomer(event.displayCustomer) ? "General activity" : event.displayCustomer}</span>
                <span className="crm-activity-description">{event.description}</span>
                <span className="crm-activity-meta"><span className="crm-activity-type">{event.typeLabel}</span><span className="crm-activity-source" title={event.source}>{displaySource(event)}</span>{(event.groupedSourceIds?.length || 0) > 1 && <span>{event.groupedSourceIds!.length} related entries</span>}</span>
              </span>
              <span className="crm-activity-trailing">
                <time className="crm-activity-time" dateTime={event.timestamp}>{displayTimestamp(event.timestamp)}</time>
                {event.amount !== null ? <strong className="crm-activity-amount">{currency.format(event.amount)}</strong> : null}
              </span>
            </button>
          ); })}
          {!visibleFeed.length && !loading ? <p className="crm-empty">No activity matches this filter yet.</p> : null}
          {loading && !displayedFeed.length ? <p className="crm-empty">Loading live activity…</p> : null}
        </div>

        {selectedCustomer ? (
          <aside className="crm-activity-customer-view" aria-label={`${selectedCustomer} activity details`}>
            <div className="crm-activity-customer-head">
              <div><p className="eyebrow">Customer view</p><h3>{selectedCustomer}</h3></div>
              <button type="button" className="crm-ghost-button" onClick={() => setSelectedCustomer(null)}>Close</button>
            </div>
            <dl className="crm-activity-facts">
              <div><dt>Current status</dt><dd>{String(currentStatus).replaceAll("_", " ")}</dd></div>
              <div><dt>Follow-up state</dt><dd>{followUpJobs.length ? followUpJobs.map((job) => [job.next_action, job.next_action_due].filter(Boolean).join(" · ") || "Follow-up needed").join("; ") : "No open follow-up"}</dd></div>
              <div><dt>Payment history</dt><dd>{selectedPayments.length ? `${selectedPayments.length} payments · ${currency.format(selectedPayments.reduce((sum, event) => sum + (event.amount || 0), 0))}` : "No payments recorded"}</dd></div>
            </dl>
            <section><h4>Customer notes</h4>{selectedNotes.length ? <ul>{Array.from(new Set(selectedNotes)).map((note) => <li key={note}>{note}</li>)}</ul> : <p>None recorded.</p>}</section>
            <section><h4>Complete timeline</h4><ol className="crm-activity-mini-timeline">{selectedTimeline.map((event) => <li key={`detail-${event.id}`}><time dateTime={event.timestamp}>{displayTimestamp(event.timestamp)}</time><strong>{event.typeLabel}</strong><span>{event.description}</span>{event.amount !== null ? <em>{currency.format(event.amount)}</em> : null}</li>)}</ol></section>
            <button type="button" className="button secondary" onClick={() => onOpenCustomer(selectedCustomer)}>Open full customer file</button>
          </aside>
        ) : null}
      </div>
    </section>
  );
}
