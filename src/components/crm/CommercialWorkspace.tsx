"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  CommercialAccount,
  CommercialActivity,
  CommercialStatus,
  CommercialWorkspaceData,
  commercialAccountTypes,
  commercialDiscoveryAreas,
  commercialDiscoverySearches,
  commercialPipelineStatuses,
  commercialProspectSources,
  commercialStatusLabels,
  commercialStatuses,
  commercialTypeLabels
} from "@/lib/crm/commercial-types";
import { commercialOutreachTemplates } from "@/lib/crm/commercial-outreach";

type CommercialView = "pipeline" | "find" | "outreach" | "playbook";
type OutreachPreview = {
  accountId: string;
  companyName: string;
  contactName: string | null;
  to: string | null;
  blockedReason: string | null;
  subject: string;
  text: string;
  html: string;
};
type DiscoveryProspect = {
  placeId: string;
  companyName: string;
  address: string | null;
  phone: string | null;
  website: string | null;
  mapsUrl: string | null;
  businessStatus: string | null;
  primaryType: string | null;
  types: string[];
};

async function commercialFetch<T>(session: Session, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
      ...(init?.headers || {})
    }
  });
  const data = (await response.json().catch(() => ({}))) as T & { message?: string };
  if (!response.ok) throw new Error(data.message || `Commercial CRM request failed (${response.status}).`);
  return data;
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value || 0);
}

function dateLabel(value: string | null | undefined) {
  if (!value) return "Not set";
  const date = value.length === 10 ? new Date(`${value}T12:00:00`) : new Date(value);
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function relativeDue(value: string | null) {
  if (!value) return "No due date";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(`${value}T00:00:00`);
  const days = Math.round((due.getTime() - today.getTime()) / 86400000);
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  return `Due in ${days}d`;
}

function splitAddress(value: string | null) {
  if (!value) return { address: "", city: "", state: "CA", postal_code: "" };
  const match = value.match(/^(.+?),\s*([^,]+),\s*([A-Z]{2})\s+(\d{5})(?:-\d{4})?(?:,\s*USA)?$/i);
  if (!match) return { address: value.replace(/,\s*USA$/i, ""), city: "", state: "CA", postal_code: "" };
  return { address: match[1], city: match[2], state: match[3].toUpperCase(), postal_code: match[4] };
}

function parseDelimited(text: string) {
  const delimiter = text.includes("\t") ? "\t" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      row.push(field.trim());
      field = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      field = "";
    } else field += char;
  }
  row.push(field.trim());
  if (row.some(Boolean)) rows.push(row);
  if (rows.length < 2) return [];

  const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const headers = rows[0].map(normalize);
  const pick = (record: Record<string, string>, names: string[]) => names.map(normalize).map((name) => record[name]).find(Boolean) || "";

  return rows.slice(1).map((values, index) => {
    const record = Object.fromEntries(headers.map((header, cell) => [header, values[cell] || ""]));
    const classifications = pick(record, ["classifications", "classification", "class", "license classifications"]);
    const sourceName = pick(record, ["source name", "source"]) || "Commercial CSV import";
    const companyName = pick(record, ["business name", "company name", "company", "organization", "school", "district", "name"]);
    const accountType = classifications.includes("D-52")
      ? "window_covering_partner"
      : classifications.match(/(^|[,;\s])B([,;\s]|$)/)
        ? "general_contractor"
        : "other";
    return {
      company_name: companyName,
      account_type: accountType,
      status: pick(record, ["status"]) || "new",
      priority: pick(record, ["priority"]) || "normal",
      assigned_to: pick(record, ["assigned to", "owner"]) || "Unassigned",
      contact_name: pick(record, ["contact name", "contact", "administrator", "chief business official"]),
      contact_title: pick(record, ["contact title", "title"]),
      email: pick(record, ["email", "email address"]),
      phone: pick(record, ["telephone number", "telephone", "phone number", "phone"]),
      website: pick(record, ["website", "web address", "url"]),
      address: pick(record, ["address", "street address", "mailing address"]),
      city: pick(record, ["city"]),
      state: pick(record, ["state"]) || "CA",
      postal_code: pick(record, ["zip", "zip code", "postal code"]),
      license_number: pick(record, ["license number", "license", "license no"]),
      license_classifications: classifications,
      license_status: pick(record, ["license status"]) || (classifications ? "unverified" : "not_applicable"),
      source_type: "import",
      source_name: sourceName,
      source_url: pick(record, ["source url"]),
      source_checked_at: new Date().toISOString(),
      external_id: pick(record, ["external id", "cds code", "place id"]) || `${sourceName}-${index + 1}-${companyName}`,
      next_action: pick(record, ["next action"]) || "Research the decision-maker",
      next_action_due: pick(record, ["next action due", "due date"]),
      estimated_value: pick(record, ["estimated value", "pipeline value"]) || 0,
      notes: pick(record, ["notes", "description"]),
      tags: pick(record, ["tags"])
    };
  }).filter((row) => row.company_name);
}

function accountTypeFromSearch(searchId: string) {
  const mapping: Record<string, string> = {
    "general-contractors": "general_contractor",
    developers: "developer",
    architects: "architect_designer",
    "property-managers": "property_management",
    schools: "school_district",
    hospitality: "hospitality",
    healthcare: "healthcare",
    "window-coverings": "window_covering_partner"
  };
  return mapping[searchId] || "other";
}

export function CommercialWorkspace({ session }: { session: Session }) {
  const [data, setData] = useState<CommercialWorkspaceData | null>(null);
  const [view, setView] = useState<CommercialView>("pipeline");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<CommercialStatus | "all">("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [detailDraft, setDetailDraft] = useState<CommercialAccount | null>(null);
  const [activityText, setActivityText] = useState("");
  const [activityType, setActivityType] = useState<"note" | "call" | "meeting" | "bid_invite" | "bid_submitted">("note");
  const [templateId, setTemplateId] = useState(commercialOutreachTemplates[0].id);
  const activeTemplate = commercialOutreachTemplates.find((item) => item.id === templateId) || commercialOutreachTemplates[0];
  const [outreachSubject, setOutreachSubject] = useState(activeTemplate.subject);
  const [outreachBody, setOutreachBody] = useState(activeTemplate.body);
  const [previews, setPreviews] = useState<OutreachPreview[]>([]);
  const [discoverySearchId, setDiscoverySearchId] = useState(commercialDiscoverySearches[0].id);
  const [discoveryArea, setDiscoveryArea] = useState<(typeof commercialDiscoveryAreas)[number]>("Ventura");
  const [discoveryResults, setDiscoveryResults] = useState<DiscoveryProspect[]>([]);
  const [manualDraft, setManualDraft] = useState<Record<string, string>>({
    company_name: "",
    account_type: "general_contractor",
    contact_name: "",
    contact_title: "",
    email: "",
    phone: "",
    website: "",
    address: "",
    city: "Ventura",
    state: "CA",
    postal_code: "",
    license_number: "",
    license_classifications: "",
    next_action: "Research the decision-maker",
    notes: ""
  });

  async function refresh(options: { quiet?: boolean } = {}) {
    if (!options.quiet) setLoading(true);
    try {
      const result = await commercialFetch<CommercialWorkspaceData>(session, "/api/crm/commercial");
      setData(result);
      if (!selectedId && result.accounts[0]) setSelectedId(result.accounts[0].id);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Commercial and Referrals could not be loaded.");
    } finally {
      if (!options.quiet) setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.access_token]);

  const accounts = data?.accounts || [];
  const selectedAccount = accounts.find((account) => account.id === selectedId) || null;
  useEffect(() => setDetailDraft(selectedAccount ? { ...selectedAccount } : null), [selectedAccount]);

  const normalizedSearch = search.trim().toLowerCase();
  const visibleAccounts = useMemo(
    () =>
      accounts.filter((account) => {
        if (statusFilter !== "all" && account.status !== statusFilter) return false;
        if (typeFilter !== "all" && account.account_type !== typeFilter) return false;
        if (!normalizedSearch) return true;
        return [account.company_name, account.contact_name, account.email, account.phone, account.city, account.license_number, account.tags.join(" ")]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(normalizedSearch));
      }),
    [accounts, normalizedSearch, statusFilter, typeFilter]
  );

  const accountActivities = useMemo(
    () => (data?.activities || []).filter((activity) => activity.account_id === selectedId),
    [data?.activities, selectedId]
  );

  const selectedForOutreach = useMemo(
    () => accounts.filter((account) => selectedAccountIds.includes(account.id)),
    [accounts, selectedAccountIds]
  );

  function toggleOutreachAccount(id: string) {
    setPreviews([]);
    setSelectedAccountIds((ids) => (ids.includes(id) ? ids.filter((item) => item !== id) : ids.length < 25 ? [...ids, id] : ids));
  }

  function chooseTemplate(id: string) {
    const template = commercialOutreachTemplates.find((item) => item.id === id);
    if (!template) return;
    setTemplateId(id);
    setOutreachSubject(template.subject);
    setOutreachBody(template.body);
    setPreviews([]);
  }

  async function saveDetail(event: FormEvent) {
    event.preventDefault();
    if (!detailDraft) return;
    setBusy(true);
    setMessage(null);
    try {
      await commercialFetch(session, `/api/crm/commercial/${detailDraft.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          company_name: detailDraft.company_name,
          account_type: detailDraft.account_type,
          status: detailDraft.status,
          priority: detailDraft.priority,
          assigned_to: detailDraft.assigned_to,
          contact_name: detailDraft.contact_name,
          contact_title: detailDraft.contact_title,
          email: detailDraft.email,
          phone: detailDraft.phone,
          website: detailDraft.website,
          address: detailDraft.address,
          city: detailDraft.city,
          state: detailDraft.state,
          postal_code: detailDraft.postal_code,
          license_number: detailDraft.license_number,
          license_classifications: detailDraft.license_classifications,
          license_status: detailDraft.license_status,
          license_verified_at: detailDraft.license_verified_at,
          next_action: detailDraft.next_action,
          next_action_due: detailDraft.next_action_due,
          estimated_value: detailDraft.estimated_value,
          notes: detailDraft.notes,
          tags: detailDraft.tags,
          do_not_email: detailDraft.do_not_email
        })
      });
      await refresh({ quiet: true });
      setMessage(`${detailDraft.company_name} saved.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Prospect could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  async function logActivity(event: FormEvent) {
    event.preventDefault();
    if (!selectedAccount || !activityText.trim()) return;
    setBusy(true);
    setMessage(null);
    try {
      await commercialFetch(session, "/api/crm/commercial", {
        method: "POST",
        body: JSON.stringify({
          action: "activity",
          account_id: selectedAccount.id,
          activity_type: activityType,
          body_preview: activityText.trim()
        })
      });
      setActivityText("");
      await refresh({ quiet: true });
      setMessage(`${activityType.replace("_", " ")} logged for ${selectedAccount.company_name}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Activity could not be logged.");
    } finally {
      setBusy(false);
    }
  }

  async function createManualAccount(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const result = await commercialFetch<{ account: CommercialAccount }>(session, "/api/crm/commercial", {
        method: "POST",
        body: JSON.stringify({
          ...manualDraft,
          status: manualDraft.email ? "ready" : "researching",
          priority: "normal",
          assigned_to: "Unassigned",
          license_status: manualDraft.license_number ? "unverified" : "not_applicable",
          source_type: "manual_research",
          source_name: manualDraft.website ? "Prospect website confirmed by 805 Shutters" : "Manual research",
          source_checked_at: new Date().toISOString(),
          tags: "commercial"
        })
      });
      await refresh({ quiet: true });
      setSelectedId(result.account.id);
      setView("pipeline");
      setMessage(`${result.account.company_name} added to the Commercial and Referrals ledger.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Prospect could not be added.");
    } finally {
      setBusy(false);
    }
  }

  async function importFile(file: File | null) {
    if (!file) return;
    setBusy(true);
    setMessage(null);
    try {
      const rows = parseDelimited(await file.text());
      if (!rows.length) throw new Error("No importable rows found. Use CSV or tab-delimited text with a Business Name or Company Name column.");
      const result = await commercialFetch<{ imported: number; skipped: number }>(session, "/api/crm/commercial", {
        method: "POST",
        body: JSON.stringify({ action: "import", rows })
      });
      await refresh({ quiet: true });
      setMessage(`Imported ${result.imported} prospects; skipped ${result.skipped} duplicates.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Prospect import failed.");
    } finally {
      setBusy(false);
    }
  }

  async function discover() {
    setBusy(true);
    setMessage(null);
    try {
      const result = await commercialFetch<{ prospects: DiscoveryProspect[] }>(session, "/api/crm/commercial/discover", {
        method: "POST",
        body: JSON.stringify({ searchId: discoverySearchId, area: discoveryArea })
      });
      setDiscoveryResults(result.prospects);
      setMessage(`Found ${result.prospects.length} live ${discoveryArea} candidates. Confirm each on its own website before saving.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Live prospect search failed.");
    } finally {
      setBusy(false);
    }
  }

  function useDiscoveryProspect(prospect: DiscoveryProspect) {
    const address = splitAddress(prospect.address);
    setManualDraft((draft) => ({
      ...draft,
      company_name: prospect.companyName,
      account_type: accountTypeFromSearch(discoverySearchId),
      phone: prospect.phone || "",
      website: prospect.website || "",
      ...address,
      notes: `Found in a live ${discoveryArea} discovery search. Confirm contact details on the company website before outreach.`
    }));
    document.getElementById("commercial-add-prospect")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function previewOutreach() {
    setBusy(true);
    setMessage(null);
    try {
      const result = await commercialFetch<{ previews: OutreachPreview[] }>(session, "/api/crm/commercial/outreach", {
        method: "POST",
        body: JSON.stringify({ accountIds: selectedAccountIds, subjectTemplate: outreachSubject, bodyTemplate: outreachBody, mode: "preview" })
      });
      setPreviews(result.previews);
      setMessage(`Built ${result.previews.length} personalized previews. Review each one before sending.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Outreach preview failed.");
    } finally {
      setBusy(false);
    }
  }

  async function sendOutreach() {
    const sendable = previews.filter((preview) => !preview.blockedReason && preview.to).length;
    if (!sendable) return;
    if (!window.confirm(`Send ${sendable} reviewed commercial introduction${sendable === 1 ? "" : "s"} now?`)) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await commercialFetch<{ sent: number; skipped: number; errors: number }>(session, "/api/crm/commercial/outreach", {
        method: "POST",
        body: JSON.stringify({
          accountIds: selectedAccountIds,
          subjectTemplate: outreachSubject,
          bodyTemplate: outreachBody,
          mode: "send",
          confirmSend: true
        })
      });
      await refresh({ quiet: true });
      setPreviews([]);
      setSelectedAccountIds([]);
      setMessage(`Outreach complete: ${result.sent} sent, ${result.skipped} skipped, ${result.errors} errors.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Outreach could not be sent.");
    } finally {
      setBusy(false);
    }
  }

  async function syncReplies() {
    setBusy(true);
    setMessage(null);
    try {
      const result = await commercialFetch<{ scanned: number; matched: number; optOuts: number; skipped: number; unmatched: number; errors: number }>(
        session,
        "/api/crm/commercial/replies",
        { method: "POST", body: "{}" }
      );
      await refresh({ quiet: true });
      setMessage(`Reply sync: ${result.matched} matched, ${result.optOuts} opt-outs, ${result.unmatched} unmatched, ${result.skipped} already logged, ${result.errors} errors.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Replies could not be synced.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <section className="commercial-crm-loading">Loading Commercial and Referrals…</section>;
  if (!data) return <section className="commercial-crm-loading">{message || "Commercial and Referrals is unavailable."}</section>;

  return (
    <section className="commercial-crm">
      <header className="commercial-crm-hero">
        <div>
          <p className="eyebrow">805 Commercial</p>
          <h2>Commercial and Referrals</h2>
          <p>Find the right accounts, identify the decision-maker, earn bid invitations, and turn the relationships into a repeatable commercial division.</p>
        </div>
        <div className="commercial-crm-hero-actions">
          <button type="button" className="crm-ghost-button" onClick={() => void syncReplies()} disabled={busy}>
            Sync replies
          </button>
          <button type="button" onClick={() => setView("find")}>Find prospects</button>
        </div>
      </header>

      {message ? <p className="commercial-crm-message">{message}</p> : null}

      <div className="commercial-crm-scoreboard">
        <ScoreCard label="Prospects" value={data.summary.total} />
        <ScoreCard label="Ready now" value={data.summary.readyToContact} />
        <ScoreCard label="Replies" value={data.summary.replies} />
        <ScoreCard label="Active bids" value={data.summary.activeBids} />
        <ScoreCard label="Wins" value={data.summary.wins} />
        <ScoreCard label="Open pipeline" value={money(data.summary.pipelineValue)} />
        <ScoreCard label="Overdue" value={data.summary.overdue} tone={data.summary.overdue ? "warning" : undefined} />
      </div>

      <nav className="commercial-crm-nav" aria-label="Commercial and Referrals sections">
        {([
          ["pipeline", "Pipeline"],
          ["find", "Find prospects"],
          ["outreach", `Outreach${selectedAccountIds.length ? ` (${selectedAccountIds.length})` : ""}`],
          ["playbook", "Commercial playbook"]
        ] as Array<[CommercialView, string]>).map(([id, label]) => (
          <button type="button" className={view === id ? "active" : ""} key={id} onClick={() => setView(id)}>
            {label}
          </button>
        ))}
      </nav>

      {view === "pipeline" ? (
        <div className="commercial-pipeline">
          <div className="commercial-stage-strip" aria-label="Commercial pipeline stages">
            {commercialPipelineStatuses.map((status) => {
              const matches = accounts.filter((account) => account.status === status);
              return (
                <button type="button" key={status} className={statusFilter === status ? "active" : ""} onClick={() => setStatusFilter(statusFilter === status ? "all" : status)}>
                  <span>{commercialStatusLabels[status]}</span>
                  <strong>{matches.length}</strong>
                  <em>{money(matches.reduce((sum, account) => sum + Number(account.estimated_value || 0), 0))}</em>
                </button>
              );
            })}
          </div>

          <div className="commercial-pipeline-toolbar">
            <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search company, contact, phone, city, license…" />
            <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
              <option value="all">All account types</option>
              {commercialAccountTypes.map((type) => <option key={type} value={type}>{commercialTypeLabels[type]}</option>)}
            </select>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as CommercialStatus | "all")}>
              <option value="all">All stages</option>
              {commercialStatuses.map((status) => <option key={status} value={status}>{commercialStatusLabels[status]}</option>)}
            </select>
            <button type="button" className="crm-ghost-button" onClick={() => setView("outreach")} disabled={!selectedAccountIds.length}>
              Email selected ({selectedAccountIds.length})
            </button>
          </div>

          <div className="commercial-pipeline-layout">
            <div className="commercial-account-list">
              <div className="commercial-account-list-head">
                <strong>{visibleAccounts.length} prospects</strong>
                <span>Select up to 25 for personalized outreach</span>
              </div>
              {visibleAccounts.map((account) => (
                <article className={`commercial-account-row${selectedId === account.id ? " active" : ""}`} key={account.id}>
                  <label className="commercial-account-check" title="Select for outreach">
                    <input type="checkbox" checked={selectedAccountIds.includes(account.id)} onChange={() => toggleOutreachAccount(account.id)} />
                    <span className="crm-visually-hidden">Select {account.company_name}</span>
                  </label>
                  <button type="button" className="commercial-account-open" onClick={() => setSelectedId(account.id)}>
                    <span className="commercial-account-main">
                      <strong>{account.company_name}</strong>
                      <small>{commercialTypeLabels[account.account_type]} · {account.city || "Ventura County"}</small>
                    </span>
                    <span className={`commercial-status commercial-status--${account.status}`}>{commercialStatusLabels[account.status]}</span>
                    <span className="commercial-contact-line">{account.contact_name || "Decision-maker needed"}{account.email ? ` · ${account.email}` : " · Email needed"}</span>
                    <span className={`commercial-due${account.next_action_due && account.next_action_due < new Date().toISOString().slice(0, 10) ? " overdue" : ""}`}>
                      {account.next_action || "Set next action"} · {relativeDue(account.next_action_due)}
                    </span>
                  </button>
                </article>
              ))}
              {!visibleAccounts.length ? <p className="crm-empty">No commercial prospects match these filters.</p> : null}
            </div>

            {detailDraft ? (
              <aside className="commercial-account-detail">
                <form onSubmit={saveDetail}>
                  <div className="commercial-detail-head">
                    <div>
                      <span>{commercialTypeLabels[detailDraft.account_type]}</span>
                      <h3>{detailDraft.company_name}</h3>
                    </div>
                    <button type="submit" disabled={busy}>Save</button>
                  </div>
                  <div className="commercial-detail-actions">
                    {detailDraft.phone ? <a href={`tel:${detailDraft.phone}`}>Call</a> : null}
                    {detailDraft.email ? <a href={`mailto:${detailDraft.email}`}>Email</a> : null}
                    {detailDraft.website ? <a href={detailDraft.website} target="_blank" rel="noreferrer">Website</a> : null}
                    {detailDraft.source_url ? <a href={detailDraft.source_url} target="_blank" rel="noreferrer">Source</a> : null}
                    {detailDraft.license_number ? <a href="https://www2.cslb.ca.gov/OnlineServices/CheckLicenseII/CheckLicense.aspx" target="_blank" rel="noreferrer">Verify license</a> : null}
                  </div>
                  <div className="commercial-edit-grid">
                    <label className="wide">Company<input value={detailDraft.company_name} onChange={(event) => setDetailDraft({ ...detailDraft, company_name: event.target.value })} /></label>
                    <label>Stage<select value={detailDraft.status} onChange={(event) => setDetailDraft({ ...detailDraft, status: event.target.value as CommercialStatus })}>{commercialStatuses.map((status) => <option key={status} value={status}>{commercialStatusLabels[status]}</option>)}</select></label>
                    <label>Priority<select value={detailDraft.priority} onChange={(event) => setDetailDraft({ ...detailDraft, priority: event.target.value as CommercialAccount["priority"] })}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="strategic">Strategic</option></select></label>
                    <label>Type<select value={detailDraft.account_type} onChange={(event) => setDetailDraft({ ...detailDraft, account_type: event.target.value as CommercialAccount["account_type"] })}>{commercialAccountTypes.map((type) => <option key={type} value={type}>{commercialTypeLabels[type]}</option>)}</select></label>
                    <label>Owner<input value={detailDraft.assigned_to} onChange={(event) => setDetailDraft({ ...detailDraft, assigned_to: event.target.value })} /></label>
                    <label>Contact<input value={detailDraft.contact_name || ""} onChange={(event) => setDetailDraft({ ...detailDraft, contact_name: event.target.value })} /></label>
                    <label>Title<input value={detailDraft.contact_title || ""} onChange={(event) => setDetailDraft({ ...detailDraft, contact_title: event.target.value })} /></label>
                    <label>Email<input type="email" value={detailDraft.email || ""} onChange={(event) => setDetailDraft({ ...detailDraft, email: event.target.value })} /></label>
                    <label>Phone<input value={detailDraft.phone || ""} onChange={(event) => setDetailDraft({ ...detailDraft, phone: event.target.value })} /></label>
                    <label className="wide">Website<input value={detailDraft.website || ""} onChange={(event) => setDetailDraft({ ...detailDraft, website: event.target.value })} /></label>
                    <label>City<input value={detailDraft.city || ""} onChange={(event) => setDetailDraft({ ...detailDraft, city: event.target.value })} /></label>
                    <label>License #<input value={detailDraft.license_number || ""} onChange={(event) => setDetailDraft({ ...detailDraft, license_number: event.target.value })} /></label>
                    <label>License status<select value={detailDraft.license_status} onChange={(event) => setDetailDraft({ ...detailDraft, license_status: event.target.value as CommercialAccount["license_status"] })}><option value="not_applicable">Not applicable</option><option value="unverified">Unverified</option><option value="active">Active</option><option value="inactive">Inactive</option><option value="expired">Expired</option><option value="suspended">Suspended</option></select></label>
                    <label>Est. value<input type="number" min="0" step="1000" value={detailDraft.estimated_value || 0} onChange={(event) => setDetailDraft({ ...detailDraft, estimated_value: Number(event.target.value) })} /></label>
                    <label className="wide">Next action<input value={detailDraft.next_action || ""} onChange={(event) => setDetailDraft({ ...detailDraft, next_action: event.target.value })} /></label>
                    <label>Due<input type="date" value={detailDraft.next_action_due || ""} onChange={(event) => setDetailDraft({ ...detailDraft, next_action_due: event.target.value })} /></label>
                    <label>Tags<input value={detailDraft.tags.join(", ")} onChange={(event) => setDetailDraft({ ...detailDraft, tags: event.target.value.split(",").map((tag) => tag.trim()).filter(Boolean) })} /></label>
                    <label className="wide">Notes<textarea rows={4} value={detailDraft.notes || ""} onChange={(event) => setDetailDraft({ ...detailDraft, notes: event.target.value })} /></label>
                    <label className="commercial-opt-out wide"><input type="checkbox" checked={detailDraft.do_not_email} onChange={(event) => setDetailDraft({ ...detailDraft, do_not_email: event.target.checked })} /> Do not send commercial email</label>
                  </div>
                </form>

                <form className="commercial-activity-form" onSubmit={logActivity}>
                  <div>
                    <strong>Log activity</strong>
                    <select value={activityType} onChange={(event) => setActivityType(event.target.value as typeof activityType)}>
                      <option value="note">Note</option><option value="call">Call</option><option value="meeting">Meeting</option><option value="bid_invite">Bid invite</option><option value="bid_submitted">Bid submitted</option>
                    </select>
                  </div>
                  <textarea rows={3} value={activityText} onChange={(event) => setActivityText(event.target.value)} placeholder="What happened, who responded, and what is next?" />
                  <button type="submit" disabled={busy || !activityText.trim()}>Add to ledger</button>
                </form>

                <div className="commercial-timeline">
                  <h4>Relationship history</h4>
                  {accountActivities.map((activity) => <ActivityLine key={activity.id} activity={activity} />)}
                  {!accountActivities.length ? <p>No activity yet.</p> : null}
                </div>
              </aside>
            ) : null}
          </div>
        </div>
      ) : null}

      {view === "find" ? (
        <div className="commercial-find-layout">
          <section className="commercial-find-main">
            <div className="commercial-section-heading">
              <div><span>Repeatable discovery</span><h3>Run a fresh Ventura County search</h3></div>
              <p>Live search is for discovery. Confirm the decision-maker and email on the prospect’s own website before adding it to the permanent ledger.</p>
            </div>
            <div className="commercial-discovery-controls">
              <select value={discoverySearchId} onChange={(event) => setDiscoverySearchId(event.target.value as typeof discoverySearchId)}>
                {commercialDiscoverySearches.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
              <select value={discoveryArea} onChange={(event) => setDiscoveryArea(event.target.value as typeof discoveryArea)}>
                {commercialDiscoveryAreas.map((area) => <option key={area}>{area}</option>)}
              </select>
              <button type="button" onClick={() => void discover()} disabled={busy || !data.configuration.googlePlaces}>Run live search</button>
            </div>
            {!data.configuration.googlePlaces ? <p className="commercial-config-note">Live search will turn on when GOOGLE_MAPS_API_KEY is configured in Vercel. The official directories below work now.</p> : null}
            {discoveryResults.length ? (
              <div className="commercial-discovery-results">
                <div className="commercial-google-attribution"><span>Live discovery results</span><img src="https://maps.gstatic.com/mapfiles/api-3/images/powered-by-google-on-white3.png" alt="Powered by Google" /></div>
                {discoveryResults.map((prospect) => (
                  <article key={prospect.placeId}>
                    <div><strong>{prospect.companyName}</strong><span>{prospect.address || discoveryArea}</span><span>{prospect.phone || "Phone not listed"}</span></div>
                    <div className="commercial-result-actions">
                      {prospect.website ? <a href={prospect.website} target="_blank" rel="noreferrer">Confirm website</a> : null}
                      {prospect.mapsUrl ? <a href={prospect.mapsUrl} target="_blank" rel="noreferrer">Map</a> : null}
                      <button type="button" className="crm-ghost-button" onClick={() => useDiscoveryProspect(prospect)}>Use as draft</button>
                    </div>
                  </article>
                ))}
              </div>
            ) : null}

            <div className="commercial-source-grid">
              {commercialProspectSources.map((source) => (
                <article key={source.id}>
                  <span>{source.format.replace("-", " ")}</span>
                  <h4>{source.name}</h4>
                  <p>{source.description}</p>
                  <a href={source.url} target="_blank" rel="noreferrer">{source.action} ↗</a>
                </article>
              ))}
            </div>

            <div className="commercial-import-card">
              <div>
                <span>Bulk ledger import</span>
                <h3>Bring official lists into the CRM</h3>
                <p>Upload CSV or tab-delimited text. CSLB Excel downloads can be opened and saved as CSV first. Recognized columns include Business Name, License Number, Classification, Address, Telephone Number, Email, Website, and Notes.</p>
              </div>
              <label className="commercial-file-button">
                <input type="file" accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values" onChange={(event) => void importFile(event.target.files?.[0] || null)} disabled={busy} />
                Choose list to import
              </label>
            </div>
          </section>

          <aside className="commercial-add-card" id="commercial-add-prospect">
            <span>Confirmed prospect</span>
            <h3>Add to the commercial ledger</h3>
            <form onSubmit={createManualAccount}>
              <label>Company<input required value={manualDraft.company_name} onChange={(event) => setManualDraft({ ...manualDraft, company_name: event.target.value })} /></label>
              <label>Type<select value={manualDraft.account_type} onChange={(event) => setManualDraft({ ...manualDraft, account_type: event.target.value })}>{commercialAccountTypes.map((type) => <option key={type} value={type}>{commercialTypeLabels[type]}</option>)}</select></label>
              <div className="commercial-two-fields"><label>Contact<input value={manualDraft.contact_name} onChange={(event) => setManualDraft({ ...manualDraft, contact_name: event.target.value })} /></label><label>Title<input value={manualDraft.contact_title} onChange={(event) => setManualDraft({ ...manualDraft, contact_title: event.target.value })} /></label></div>
              <label>Email<input type="email" value={manualDraft.email} onChange={(event) => setManualDraft({ ...manualDraft, email: event.target.value })} /></label>
              <label>Phone<input value={manualDraft.phone} onChange={(event) => setManualDraft({ ...manualDraft, phone: event.target.value })} /></label>
              <label>Website<input value={manualDraft.website} onChange={(event) => setManualDraft({ ...manualDraft, website: event.target.value })} /></label>
              <label>Address<input value={manualDraft.address} onChange={(event) => setManualDraft({ ...manualDraft, address: event.target.value })} /></label>
              <div className="commercial-two-fields"><label>City<input value={manualDraft.city} onChange={(event) => setManualDraft({ ...manualDraft, city: event.target.value })} /></label><label>ZIP<input value={manualDraft.postal_code} onChange={(event) => setManualDraft({ ...manualDraft, postal_code: event.target.value })} /></label></div>
              <div className="commercial-two-fields"><label>License #<input value={manualDraft.license_number} onChange={(event) => setManualDraft({ ...manualDraft, license_number: event.target.value })} /></label><label>Classification<input value={manualDraft.license_classifications} onChange={(event) => setManualDraft({ ...manualDraft, license_classifications: event.target.value })} placeholder="B, D-52" /></label></div>
              <label>Next action<input value={manualDraft.next_action} onChange={(event) => setManualDraft({ ...manualDraft, next_action: event.target.value })} /></label>
              <label>Research notes<textarea rows={4} value={manualDraft.notes} onChange={(event) => setManualDraft({ ...manualDraft, notes: event.target.value })} /></label>
              <button type="submit" disabled={busy}>Add prospect</button>
            </form>
          </aside>
        </div>
      ) : null}

      {view === "outreach" ? (
        <div className="commercial-outreach-layout">
          <aside className="commercial-recipient-list">
            <div><span>Recipients</span><strong>{selectedAccountIds.length} / 25 selected</strong></div>
            {accounts.filter((account) => account.email || selectedAccountIds.includes(account.id)).map((account) => (
              <label key={account.id} className={account.do_not_email ? "blocked" : ""}>
                <input type="checkbox" checked={selectedAccountIds.includes(account.id)} onChange={() => toggleOutreachAccount(account.id)} disabled={account.do_not_email} />
                <span><strong>{account.company_name}</strong><small>{account.contact_name || "No named contact"} · {account.email || "Email needed"}</small></span>
              </label>
            ))}
          </aside>
          <section className="commercial-message-builder">
            <div className="commercial-section-heading">
              <div><span>Personalized small batches</span><h3>Write once, review every recipient</h3></div>
              <button type="button" className="crm-ghost-button" onClick={() => void syncReplies()} disabled={busy}>Sync replies</button>
            </div>
            {!data.configuration.postalAddress ? <p className="commercial-config-note">Preview works now. Sending is locked until COMMERCIAL_OUTREACH_POSTAL_ADDRESS is set to a valid business mailing address.</p> : null}
            <div className="commercial-template-row">
              <label>Starting template<select value={templateId} onChange={(event) => chooseTemplate(event.target.value)}>{commercialOutreachTemplates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select></label>
              <div className="commercial-token-help">Tokens: {"{{first_name}} {{company_name}} {{city}} {{contact_title}} {{account_type}}"}</div>
            </div>
            <label>Subject<input value={outreachSubject} onChange={(event) => { setOutreachSubject(event.target.value); setPreviews([]); }} /></label>
            <label>Message<textarea rows={14} value={outreachBody} onChange={(event) => { setOutreachBody(event.target.value); setPreviews([]); }} /></label>
            <div className="commercial-outreach-actions">
              <button type="button" className="crm-ghost-button" onClick={() => void previewOutreach()} disabled={busy || !selectedAccountIds.length}>Build personalized previews</button>
              <button type="button" onClick={() => void sendOutreach()} disabled={busy || !previews.length || !data.configuration.postalAddress}>Send reviewed batch</button>
            </div>
            {previews.length ? (
              <div className="commercial-preview-list">
                {previews.map((preview, index) => (
                  <details key={preview.accountId} open={index === 0} className={preview.blockedReason ? "blocked" : ""}>
                    <summary><span>{preview.companyName}</span><em>{preview.blockedReason || preview.to}</em></summary>
                    <div><strong>{preview.subject}</strong><pre>{preview.text}</pre></div>
                  </details>
                ))}
              </div>
            ) : null}
          </section>
        </div>
      ) : null}

      {view === "playbook" ? <CommercialPlaybook data={data} /> : null}
    </section>
  );
}

function ScoreCard({ label, value, tone }: { label: string; value: string | number; tone?: "warning" }) {
  return <article className={tone ? `warning` : ""}><span>{label}</span><strong>{value}</strong></article>;
}

function ActivityLine({ activity }: { activity: CommercialActivity }) {
  const gmailUrl = typeof activity.meta?.gmailUrl === "string" ? activity.meta.gmailUrl : null;
  return (
    <article>
      <i aria-hidden="true" />
      <div><span>{activity.activity_type.replaceAll("_", " ")} · {dateLabel(activity.occurred_at)}</span><strong>{activity.subject || activity.body_preview || "Activity logged"}</strong>{activity.subject && activity.body_preview ? <p>{activity.body_preview}</p> : null}{gmailUrl ? <a href={gmailUrl} target="_blank" rel="noreferrer">Open reply in Gmail</a> : null}</div>
    </article>
  );
}

function CommercialPlaybook({ data }: { data: CommercialWorkspaceData }) {
  return (
    <div className="commercial-playbook">
      <section className="commercial-launch-card">
        <span>90-day launch</span>
        <h3>Build the relationships before judging the revenue</h3>
        <div className="commercial-launch-phases">
          <article><strong>Days 1–30 · Foundation</strong><p>Load 100 target accounts, identify 40 real decision-makers, register on 5 vendor/bid systems, and complete the commercial capability sheet.</p><em>Current ledger: {data.summary.total} prospects · {data.summary.missingEmail} still need email research</em></article>
          <article><strong>Days 31–60 · Access</strong><p>Book 10 introductions or site walks, earn 8 bid-list invitations, and build at least $250,000 of qualified opportunity value.</p><em>Current replies/meetings: {data.summary.replies}</em></article>
          <article><strong>Days 61–90 · Proof</strong><p>Submit 12 disciplined bids, win the first two projects, document the process, and establish a quarterly follow-up rhythm with every qualified account.</p><em>Current bids: {data.summary.activeBids} · wins: {data.summary.wins}</em></article>
        </div>
      </section>

      <div className="commercial-playbook-grid">
        <section>
          <span>Team weekly rhythm</span>
          <h3>What “good” looks like every week</h3>
          <ol>
            <li><strong>Monday · Build the list</strong><p>Run one city/category search, import one official directory update, and select the 25 best-fit accounts for the week.</p></li>
            <li><strong>Tuesday · Research</strong><p>Find the estimator, project manager, facilities director, purchasing manager, or designer. Confirm email on the organization’s own website.</p></li>
            <li><strong>Wednesday · Outreach</strong><p>Send 10–25 reviewed introductions, make 10 calls, and ask directly for the vendor list, bid portal, or correct decision-maker.</p></li>
            <li><strong>Thursday · Relationships</strong><p>Hold site walks, coffees, product-binder visits, and GC/architect introductions. Log every outcome and next step.</p></li>
            <li><strong>Friday · Bid and follow-up</strong><p>Finish scopes and proposals, follow up on five-day-old outreach, and clear every overdue next action.</p></li>
          </ol>
        </section>

        <section>
          <span>First-call script</span>
          <h3>Ask for access, not a sale</h3>
          <blockquote>“Hi, this is [Your Name] with 805 Shutters. We supply and install commercial shades, blinds, and shutters across Ventura County. I’m calling to find the person who handles Division 12 window-covering scopes, facility replacements, or vendor registration. Who is the best person for me to introduce myself to?”</blockquote>
          <p>If transferred: ask how projects are bid, which portal they use, insurance/licensing requirements, typical project types, and whether a short capability sheet or product binder would be useful.</p>
        </section>

        <section>
          <span>Bid qualification</span>
          <h3>Answer these before pricing</h3>
          <ul>
            <li>Who is the decision-maker and what is the bid deadline?</li>
            <li>Is the scope Division 12, maintenance, tenant improvement, or direct purchase?</li>
            <li>Are plans/specs complete, and is a site walk required?</li>
            <li>Window count, sizes, product/performance requirements, controls, and alternates?</li>
            <li>Prevailing wage, DIR, insurance, bonding, background, or scheduling requirements?</li>
            <li>Access, lift, disposal, patching, electrical, and after-hours responsibilities?</li>
            <li>Lead time, install window, warranty, exclusions, tax, freight, and payment terms?</li>
          </ul>
        </section>

        <section>
          <span>Bid follow-through</span>
          <h3>The seven-step opportunity path</h3>
          <ol className="compact"><li>Confirm receipt and deadline.</li><li>Run site walk / takeoff.</li><li>Resolve scope gaps in writing.</li><li>Price base scope plus useful alternates.</li><li>Submit a clean proposal with exclusions and schedule.</li><li>Follow up in 48 hours and again at award timing.</li><li>Log result, loss reason, and next opportunity.</li></ol>
        </section>

        <section className="wide">
          <span>Capability package checklist</span>
          <h3>What the team should be able to send in under two minutes</h3>
          <div className="commercial-check-grid"><p>Company overview and Ventura County service area</p><p>Commercial products and Division 12 capabilities</p><p>License, insurance, DIR, W-9, and safety documents</p><p>School, office, retail, medical, hospitality, and property examples</p><p>Product samples, data sheets, colors, openness factors, and motor options</p><p>Three references and clear estimating/contact information</p></div>
        </section>
      </div>
    </div>
  );
}
