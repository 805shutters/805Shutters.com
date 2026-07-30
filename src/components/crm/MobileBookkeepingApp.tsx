"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  ArrowLeft,
  BriefcaseBusiness,
  Check,
  ChevronRight,
  CircleDollarSign,
  Loader2,
  ReceiptText,
  Save,
  Search,
  UserRound,
  X
} from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import type {
  CrmBookkeepingPaymentType,
  CrmBookkeepingRow,
  CrmCustomerFile,
  CrmDashboardData,
  CrmJob
} from "@/lib/crm/types";

type MobileBookkeepingRecord = {
  key: string;
  row: CrmBookkeepingRow | null;
  job: CrmJob | null;
};

export type MobileBookkeepingDraft = {
  total: string;
  cogs: string;
  depositDue: string;
  depositPaid: string;
  balancePaid: string;
  paymentType: CrmBookkeepingPaymentType;
  manufacturerName: string;
  manufacturerOrderRef: string;
  notes: string;
};

const paymentTypes: Array<{ value: CrmBookkeepingPaymentType; label: string }> = [
  { value: "check", label: "Check" },
  { value: "credit_card", label: "Credit card" },
  { value: "zelle", label: "Zelle" },
  { value: "venmo", label: "Venmo" },
  { value: "cash", label: "Cash" },
  { value: "other", label: "Other" }
];

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(Number(value) || 0);
}

function numeric(value: string) {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.max(amount, 0) : 0;
}

function todayInputValue() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function recordDate(record: MobileBookkeepingRecord) {
  return record.row?.soldDate || record.job?.appointment_start || record.job?.created_at || "";
}

function fileSearchText(file: CrmCustomerFile) {
  return [
    file.customerName,
    file.phone,
    file.email,
    file.address,
    file.city,
    ...file.jobs.flatMap((job) => [job.customer_name, job.phone, job.email, job.address, job.city]),
    ...file.bookkeepingRows.flatMap((row) => [row.customerName, row.customerPhone, row.quoteNumber])
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function matchesMobileBookkeepingFile(file: CrmCustomerFile, query: string) {
  const normalized = query.trim().toLowerCase();
  return !normalized || fileSearchText(file).includes(normalized);
}

export function mobileBookkeepingRemaining(draft: MobileBookkeepingDraft) {
  return Math.max(numeric(draft.total) - numeric(draft.depositPaid) - numeric(draft.balancePaid), 0);
}

export function buildMobileBookkeepingPatch(row: CrmBookkeepingRow, draft: MobileBookkeepingDraft) {
  const shared = {
    deposit_required: numeric(draft.depositDue),
    deposit_paid_target: numeric(draft.depositPaid),
    balance_paid_target: numeric(draft.balancePaid),
    payment_type: draft.paymentType,
    manufacturer_name: draft.manufacturerName.trim(),
    manufacturer_order_ref: draft.manufacturerOrderRef.trim()
  };

  return row.source === "crm_quote"
    ? {
        ...shared,
        quote_total: numeric(draft.total),
        manual_total_override: true,
        materials_cost: numeric(draft.cogs),
        bookkeeping_notes: draft.notes.trim()
      }
    : {
        ...shared,
        total_amount: numeric(draft.total),
        cogs_amount: numeric(draft.cogs),
        notes: draft.notes.trim()
      };
}

export function recordsForFile(file: CrmCustomerFile): MobileBookkeepingRecord[] {
  const jobsById = new Map(file.jobs.map((job) => [job.id, job]));
  const rowJobIds = new Set(file.bookkeepingRows.map((row) => row.jobId).filter(Boolean));
  const records = [
    ...file.bookkeepingRows.map((row) => ({
      key: `row:${row.id}`,
      row,
      job: row.jobId ? jobsById.get(row.jobId) || null : null
    })),
    ...file.jobs
      .filter((job) => !rowJobIds.has(job.id))
      .map((job) => ({ key: `job:${job.id}`, row: null, job }))
  ];

  return records.sort((left, right) => recordDate(right).localeCompare(recordDate(left)));
}

export function draftForRecord(record: MobileBookkeepingRecord): MobileBookkeepingDraft {
  const row = record.row;
  const jobTotal = Number(record.job?.quote_total || record.job?.estimated_total || 0);
  return {
    total: String(row?.total || jobTotal || ""),
    cogs: String(row?.cogs || ""),
    depositDue: String(row?.depositDue || ""),
    depositPaid: String(row?.depositPaid || record.job?.deposit_paid || ""),
    balancePaid: String(row?.balancePaid || ""),
    paymentType: row?.paymentType || "check",
    manufacturerName: row?.manufacturerName || "",
    manufacturerOrderRef: row?.manufacturerOrderRef || "",
    notes: row?.notes || record.job?.notes || ""
  };
}

async function crmFetch<T>(session: Session, path: string, init: RequestInit = {}) {
  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
      ...(init.headers || {})
    }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || "CRM request failed.");
  return body as T;
}

export function MobileBookkeepingApp() {
  const supabase = getSupabaseBrowserClient();
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [data, setData] = useState<CrmDashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<CrmCustomerFile | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [selectedRecordKey, setSelectedRecordKey] = useState<string | null>(null);
  const [draft, setDraft] = useState<MobileBookkeepingDraft | null>(null);

  useEffect(() => {
    if (!supabase) {
      setAuthLoading(false);
      setMessage("Supabase auth is not configured.");
      return;
    }
    let mounted = true;
    supabase.auth.getSession().then(({ data: authData }) => {
      if (!mounted) return;
      setSession(authData.session);
      setAuthLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });
    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, [supabase]);

  async function load(activeSession = session) {
    if (!activeSession) return;
    setLoading(true);
    setMessage(null);
    try {
      setData(await crmFetch<CrmDashboardData>(activeSession, "/api/crm/jobs/"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Bookkeeping files could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.access_token]);

  const files = useMemo(
    () =>
      [...(data?.customerFiles || [])].sort((left, right) => {
        const dateOrder = String(right.latestSoldDate || "").localeCompare(String(left.latestSoldDate || ""));
        return dateOrder || left.customerName.localeCompare(right.customerName);
      }),
    [data?.customerFiles]
  );
  const visibleFiles = useMemo(
    () => files.filter((file) => matchesMobileBookkeepingFile(file, query)).slice(0, query.trim() ? 30 : 12),
    [files, query]
  );
  const selectedRecords = selectedFile ? recordsForFile(selectedFile) : [];
  const selectedRecord =
    selectedRecords.find((record) => record.key === selectedRecordKey) || selectedRecords[0] || null;

  async function hydrateFile(fileId: string, activeSession = session) {
    if (!activeSession) return null;
    setDetailLoading(true);
    setDetailError(null);
    try {
      const result = await crmFetch<{ file: CrmCustomerFile }>(
        activeSession,
        `/api/crm/mobile/bookkeeping/${encodeURIComponent(fileId)}`
      );
      const records = recordsForFile(result.file);
      setSelectedFile(result.file);
      setSelectedRecordKey(records[0]?.key || null);
      setDraft(records[0] ? draftForRecord(records[0]) : null);
      return result.file;
    } catch (error) {
      setSelectedFile(null);
      setSelectedRecordKey(null);
      setDraft(null);
      setDetailError(error instanceof Error ? error.message : "Customer financial details could not be loaded.");
      return null;
    } finally {
      setDetailLoading(false);
    }
  }

  function selectFile(file: CrmCustomerFile) {
    setSelectedFileId(file.id);
    setSelectedFile(null);
    setSelectedRecordKey(null);
    setDraft(null);
    setMessage(null);
    void hydrateFile(file.id);
  }

  function selectRecord(key: string) {
    const record = selectedRecords.find((item) => item.key === key);
    if (!record) return;
    setSelectedRecordKey(key);
    setDraft(draftForRecord(record));
    setMessage(null);
  }

  function updateDraft<K extends keyof MobileBookkeepingDraft>(key: K, value: MobileBookkeepingDraft[K]) {
    setDraft((current) => (current ? { ...current, [key]: value } : current));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || !selectedFile || !selectedRecord || !draft) return;
    setSaving(true);
    setMessage(null);
    try {
      if (selectedRecord.row) {
        const path =
          selectedRecord.row.source === "crm_quote" && selectedRecord.row.quoteId
            ? `/api/crm/quotes/${selectedRecord.row.quoteId}/`
            : `/api/crm/bookkeeping/${selectedRecord.row.id}/`;
        await crmFetch(session, path, {
          method: "PATCH",
          body: JSON.stringify(buildMobileBookkeepingPatch(selectedRecord.row, draft))
        });
      } else if (selectedRecord.job) {
        await crmFetch(session, "/api/crm/bookkeeping/", {
          method: "POST",
          body: JSON.stringify({
            job_id: selectedRecord.job.id,
            customer_name: selectedRecord.job.customer_name || selectedFile.customerName,
            sold_date: todayInputValue(),
            total_amount: numeric(draft.total),
            cogs_amount: numeric(draft.cogs),
            deposit_required: numeric(draft.depositDue),
            deposit_paid: numeric(draft.depositPaid),
            balance_paid: numeric(draft.balancePaid),
            payment_type: draft.paymentType,
            sales_owner: selectedRecord.job.sales_owner,
            manufacturer_name: draft.manufacturerName.trim(),
            manufacturer_order_ref: draft.manufacturerOrderRef.trim(),
            notes: draft.notes.trim()
          })
        });
      }

      await load(session);
      await hydrateFile(selectedFile.id, session);
      setMessage(`${selectedFile.customerName}'s financial file was saved.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Financial file could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  if (authLoading) {
    return <main className="mobile-bookkeeping-shell mobile-bookkeeping-centered"><Loader2 className="spin" /><p>Checking session...</p></main>;
  }

  if (!session) {
    return (
      <main className="mobile-crm-login">
        <section>
          <div className="mobile-crm-logo">
            <img src="/brand/805-shutters-logo.png" alt="805 Shutters" width="286" height="270" />
          </div>
          <h1>Bookkeeping</h1>
          <p>Sign in with an approved 805 Shutters Google account.</p>
          {message ? <em>{message}</em> : null}
          <a className="mobile-crm-google-button" href={`/api/crm/oauth/google?redirectTo=${encodeURIComponent("/crm/mobile/bookkeeping")}`}>
            <span aria-hidden="true"><b>G</b></span>
            Continue with Google
          </a>
        </section>
      </main>
    );
  }

  return (
    <main className="mobile-bookkeeping-shell">
      <header className="mobile-bookkeeping-header">
        <a href="/crm/mobile" aria-label="Back to mobile CRM"><ArrowLeft /></a>
        <div>
          <span>805 CRM</span>
          <h1>Bookkeeping</h1>
          <p>Update customer financial files</p>
        </div>
      </header>

      {!selectedFileId ? (
        <>
          <section className="mobile-bookkeeping-search">
            <label htmlFor="mobile-bookkeeping-customer-search">Find customer or job</label>
            <div>
              <Search />
              <input
                id="mobile-bookkeeping-customer-search"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search customer name, phone, or quote #"
                autoComplete="off"
              />
              {query ? <button type="button" aria-label="Clear search" onClick={() => setQuery("")}><X /></button> : null}
            </div>
            <p>{query.trim() ? `${visibleFiles.length} matching financial files` : "Recent customer financial files"}</p>
          </section>

          {loading ? <div className="mobile-bookkeeping-loading"><Loader2 className="spin" /> Loading financial files...</div> : null}
          {message ? <p className="mobile-bookkeeping-message">{message}</p> : null}
          <section className="mobile-bookkeeping-results">
            {visibleFiles.map((file) => {
              const fileRows = recordsForFile(file);
              const total = file.bookkeepingRows.reduce((sum, row) => sum + row.total, 0);
              const balance = file.bookkeepingRows.reduce((sum, row) => sum + row.balance, 0);
              return (
                <button type="button" key={file.id} onClick={() => selectFile(file)}>
                  <UserRound />
                  <div>
                    <strong>{file.customerName}</strong>
                    <span>{fileRows.length} job{fileRows.length === 1 ? "" : "s"} · {money(total)} total</span>
                    <em>{balance > 0 ? `${money(balance)} open` : file.latestStatus || "Ready to update"}</em>
                  </div>
                  <ChevronRight />
                </button>
              );
            })}
            {!loading && !visibleFiles.length ? <p>No matching customer financial files.</p> : null}
          </section>
        </>
      ) : detailLoading ? (
        <div className="mobile-bookkeeping-loading" role="status">
          <Loader2 className="spin" /> Loading customer financial details...
        </div>
      ) : detailError ? (
        <section className="mobile-bookkeeping-message" role="alert">
          <p>{detailError}</p>
          <button type="button" onClick={() => void hydrateFile(selectedFileId)}>Try again</button>
          <button
            type="button"
            onClick={() => {
              setSelectedFileId(null);
              setDetailError(null);
            }}
          >
            Back to search
          </button>
        </section>
      ) : selectedFile && selectedRecord && draft ? (
        <>
          <section className="mobile-bookkeeping-customer-bar">
            <button type="button" onClick={() => {
              setSelectedFileId(null);
              setSelectedFile(null);
              setSelectedRecordKey(null);
              setDraft(null);
              setDetailError(null);
            }}>
              <ArrowLeft /> Search
            </button>
            <div><span>Financial file</span><h2>{selectedFile.customerName}</h2><p>{selectedFile.phone || selectedFile.email || "Customer contact not set"}</p></div>
          </section>

          {selectedRecords.length > 1 ? (
            <label className="mobile-bookkeeping-job-select">
              Job or quote
              <select value={selectedRecord.key} onChange={(event) => selectRecord(event.target.value)}>
                {selectedRecords.map((record, index) => (
                  <option value={record.key} key={record.key}>
                    {record.row?.quoteNumber || record.job?.product_interest || `Job ${index + 1}`} · {recordDate(record).slice(0, 10) || "No date"}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <section className="mobile-bookkeeping-summary">
            <div><span>Job total</span><strong>{money(numeric(draft.total))}</strong></div>
            <div><span>Collected</span><strong>{money(numeric(draft.depositPaid) + numeric(draft.balancePaid))}</strong></div>
            <div className={mobileBookkeepingRemaining(draft) > 0 ? "warning" : ""}>
              <span>Balance</span><strong>{money(mobileBookkeepingRemaining(draft))}</strong>
            </div>
            <div className={numeric(draft.cogs) <= 0 ? "warning" : ""}><span>COGS</span><strong>{money(numeric(draft.cogs))}</strong></div>
          </section>

          {message ? <p className="mobile-bookkeeping-message">{message}</p> : null}
          <form className="mobile-bookkeeping-form" onSubmit={save}>
            <fieldset>
              <legend><CircleDollarSign /> Customer payments</legend>
              <div className="mobile-bookkeeping-money-grid">
                <label>Job total<input type="number" inputMode="decimal" min="0" step="0.01" value={draft.total} onChange={(event) => updateDraft("total", event.target.value)} /></label>
                <label>Deposit required<input type="number" inputMode="decimal" min="0" step="0.01" value={draft.depositDue} onChange={(event) => updateDraft("depositDue", event.target.value)} /></label>
                <label>Deposit made<input type="number" inputMode="decimal" min="0" step="0.01" value={draft.depositPaid} onChange={(event) => updateDraft("depositPaid", event.target.value)} /></label>
                <label>Balance made<input type="number" inputMode="decimal" min="0" step="0.01" value={draft.balancePaid} onChange={(event) => updateDraft("balancePaid", event.target.value)} /></label>
              </div>
              <label>Payment method
                <select value={draft.paymentType} onChange={(event) => updateDraft("paymentType", event.target.value as CrmBookkeepingPaymentType)}>
                  {paymentTypes.map((type) => <option value={type.value} key={type.value}>{type.label}</option>)}
                </select>
              </label>
            </fieldset>

            <fieldset>
              <legend><ReceiptText /> Job costs and order</legend>
              <label>COGS<input type="number" inputMode="decimal" min="0" step="0.01" value={draft.cogs} onChange={(event) => updateDraft("cogs", event.target.value)} placeholder="Manufacturer cost" /></label>
              <label>Manufacturer<input value={draft.manufacturerName} onChange={(event) => updateDraft("manufacturerName", event.target.value)} placeholder="Norman, Onyx, Polar..." /></label>
              <label>Order / work order #<input value={draft.manufacturerOrderRef} onChange={(event) => updateDraft("manufacturerOrderRef", event.target.value)} /></label>
            </fieldset>

            <fieldset>
              <legend><BriefcaseBusiness /> Job details</legend>
              <label>Financial notes<textarea rows={4} value={draft.notes} onChange={(event) => updateDraft("notes", event.target.value)} placeholder="Payment details, order notes, exceptions..." /></label>
            </fieldset>

            {!selectedRecord.row ? <p className="mobile-bookkeeping-new-row"><Check /> Saving will create a bookkeeping file linked to this job.</p> : null}
            <button className="mobile-bookkeeping-save" type="submit" disabled={saving}>
              {saving ? <Loader2 className="spin" /> : <Save />}
              {saving ? "Saving..." : "Save financial file"}
            </button>
          </form>
        </>
      ) : (
        <section className="mobile-bookkeeping-message" role="status">
          <p>This customer does not have a bookkeeping record or job to update yet.</p>
          <button type="button" onClick={() => {
            setSelectedFileId(null);
            setSelectedFile(null);
          }}>Back to search</button>
        </section>
      )}
    </main>
  );
}
