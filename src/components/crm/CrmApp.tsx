"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { formatPaymentType } from "@/lib/crm/bookkeeping";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import {
  CrmAccountabilityItem,
  CrmBookkeepingPaymentType,
  CrmBookkeepingRow,
  CrmCalendarEvent,
  CrmCustomerFile,
  CrmDashboardData,
  CrmJob,
  CrmJobStatus,
  CrmProfileRole,
  CrmQuote,
  CrmQuoteStatus,
  crmJobStatuses,
  crmQuoteStatuses
} from "@/lib/crm/types";

type CrmTab = "va" | "command" | "customers" | "jobs" | "bookkeeping" | "orders" | "calendar";

type CrmUser = {
  email: string;
  displayName: string | null;
  role: CrmProfileRole;
  allowedEmails?: string[];
  vaEmails?: string[];
};

type CrmWorkspaceConfig = {
  kind: "standard" | "va";
  personName?: string;
  defaultOwner?: string;
  redirectPath?: string;
  defaultTab?: CrmTab;
  title?: string;
  eyebrow?: string;
};

const jobColumns: Array<{ status: CrmJobStatus; label: string }> = [
  { status: "new", label: "New" },
  { status: "follow_up", label: "Follow Up" },
  { status: "scheduled", label: "Scheduled" },
  { status: "quoted", label: "Quoted" },
  { status: "sold", label: "Sold" },
  { status: "ordered", label: "Ordered" },
  { status: "installed", label: "Installed" }
];

const productOptions = ["Shutters", "Shades", "Blinds", "Drapery", "Exterior Shades", "Mixed"];
const baseOwnerOptions = ["Mike", "Jessica", "Unassigned"];
const paymentTypes: Array<{ value: CrmBookkeepingPaymentType; label: string }> = [
  { value: "zelle", label: "Zelle" },
  { value: "cash", label: "Cash" },
  { value: "check", label: "Check" },
  { value: "credit_card", label: "Credit Card" },
  { value: "other", label: "Other" }
];

function buildOwnerOptions(defaultOwner?: string) {
  const owner = defaultOwner?.trim();
  if (!owner || baseOwnerOptions.includes(owner)) return baseOwnerOptions;

  return [...baseOwnerOptions.filter((item) => item !== "Unassigned"), owner, "Unassigned"];
}

function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

function toCurrency(value: number | undefined) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(value || 0);
}

function formatDate(value: string | null | undefined) {
  if (!value) return "No date";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatShortDate(value: string | null | undefined) {
  if (!value) return "Open";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "2-digit"
  }).format(new Date(value));
}

function formString(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
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

  if (!response.ok) {
    throw new Error(body.message || "CRM request failed.");
  }

  return body as T;
}

export function CrmApp({ workspace }: { workspace?: Partial<CrmWorkspaceConfig> } = {}) {
  const workspaceConfig: CrmWorkspaceConfig = {
    kind: workspace?.kind || "standard",
    personName: workspace?.personName,
    defaultOwner: workspace?.defaultOwner,
    redirectPath: workspace?.redirectPath || "/crm",
    defaultTab: workspace?.defaultTab || (workspace?.kind === "va" ? "va" : "command"),
    title: workspace?.title || "CRM Command",
    eyebrow: workspace?.eyebrow || "805 Shutters"
  };
  const supabase = getSupabaseBrowserClient();
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<CrmUser | null>(null);
  const [data, setData] = useState<CrmDashboardData | null>(null);
  const [activeTab, setActiveTab] = useState<CrmTab>(workspaceConfig.defaultTab || "command");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [googleLoginUrl, setGoogleLoginUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isVaWorkspace = workspaceConfig.kind === "va";
  const configured = Boolean(supabase);
  const jobs = useMemo(() => data?.jobs || [], [data]);
  const quotes = useMemo(() => data?.quotes || [], [data]);
  const events = useMemo(() => data?.events || [], [data]);
  const rows = useMemo(() => data?.bookkeepingRows || [], [data]);
  const customerFiles = useMemo(() => data?.customerFiles || [], [data]);
  const accountability = useMemo(() => data?.accountability || [], [data]);
  const ownerOptions = useMemo(() => buildOwnerOptions(workspaceConfig.defaultOwner), [workspaceConfig.defaultOwner]);

  async function signIn() {
    if (!supabase) return;
    if (googleLoginUrl) {
      window.location.assign(googleLoginUrl);
      return;
    }

    setMessage(null);
    const { data: oauthData, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}${workspaceConfig.redirectPath || "/crm"}`,
        skipBrowserRedirect: true
      }
    });

    if (error) {
      setMessage(error.message || "Google login could not be started.");
      return;
    }

    if (!oauthData.url) {
      setMessage("Google login could not be started from the dedicated Supabase project.");
      return;
    }

    window.location.assign(oauthData.url);
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setData(null);
  }

  async function loadCrm(activeSession: Session) {
    setMessage(null);
    const sessionResult = await crmFetch<CrmUser>(activeSession, "/api/crm/session");
    const dashboardResult = await crmFetch<CrmDashboardData>(activeSession, "/api/crm/jobs");
    setUser(sessionResult);
    setData(dashboardResult);
  }

  async function refresh() {
    if (!session) return;
    const dashboardResult = await crmFetch<CrmDashboardData>(session, "/api/crm/jobs");
    setData(dashboardResult);
  }

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    let mounted = true;

    supabase.auth.getSession().then(async ({ data: authData }) => {
      if (!mounted) return;
      setSession(authData.session);

      if (authData.session) {
        try {
          await loadCrm(authData.session);
        } catch (error) {
          setMessage(error instanceof Error ? error.message : "CRM failed to load.");
        }
      }

      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (nextSession) {
        setLoading(true);
        loadCrm(nextSession)
          .catch((error) => {
            setMessage(error instanceof Error ? error.message : "CRM failed to load.");
          })
          .finally(() => setLoading(false));
      } else {
        setUser(null);
        setData(null);
      }
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    if (!supabase || session || loading) return;

    let mounted = true;
    setGoogleLoginUrl(null);

    supabase.auth
      .signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}${workspaceConfig.redirectPath || "/crm"}`,
          skipBrowserRedirect: true
        }
      })
      .then(({ data: oauthData, error }) => {
        if (!mounted) return;
        if (error) {
          setMessage(error.message || "Google login could not be prepared.");
          return;
        }
        setGoogleLoginUrl(oauthData.url || null);
      })
      .catch(() => {
        if (mounted) setMessage("Google login could not be prepared.");
      });

    return () => {
      mounted = false;
    };
  }, [loading, session, supabase, workspaceConfig.redirectPath]);

  async function createJob(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) return;

    const formData = new FormData(event.currentTarget);
    setBusy(true);
    setMessage(null);

    try {
      await crmFetch<{ job: CrmJob }>(session, "/api/crm/jobs", {
        method: "POST",
        body: JSON.stringify({
          customer_name: formString(formData, "customer_name"),
          phone: formString(formData, "phone"),
          email: formString(formData, "email"),
          city: formString(formData, "city"),
          address: formString(formData, "address"),
          product_interest: formString(formData, "product_interest").toLowerCase(),
          sales_owner: formString(formData, "sales_owner") || workspaceConfig.defaultOwner || "Unassigned",
          priority: formString(formData, "priority") || "normal",
          next_action: formString(formData, "next_action") || "Call customer",
          next_action_due: formString(formData, "next_action_due") || null,
          estimated_total: Number(formString(formData, "estimated_total") || 0),
          notes: formString(formData, "notes")
        })
      });
      event.currentTarget.reset();
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "CRM job could not be created.");
    } finally {
      setBusy(false);
    }
  }

  async function updateJobStatus(job: CrmJob, status: CrmJobStatus) {
    if (!session) return;

    setData((current) =>
      current
        ? {
            ...current,
            jobs: current.jobs.map((item) => (item.id === job.id ? { ...item, status } : item))
          }
        : current
    );

    try {
      await crmFetch<{ job: CrmJob }>(session, `/api/crm/jobs/${job.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status })
      });
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "CRM job could not be updated.");
      await refresh();
    }
  }

  async function createQuote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) return;

    const formData = new FormData(event.currentTarget);
    const job = jobs.find((item) => item.id === formString(formData, "job_id"));
    setBusy(true);
    setMessage(null);

    try {
      await crmFetch<{ quote: CrmQuote }>(session, "/api/crm/quotes", {
        method: "POST",
        body: JSON.stringify({
          job_id: formString(formData, "job_id"),
          customer_name: job?.customer_name,
          status: formString(formData, "status") || "sold",
          quote_number: formString(formData, "quote_number"),
          quote_total: Number(formString(formData, "quote_total") || 0),
          deposit_paid: Number(formString(formData, "deposit_paid") || 0),
          balance_paid: Number(formString(formData, "balance_paid") || 0),
          materials_cost: Number(formString(formData, "materials_cost") || 0),
          labor_cost: Number(formString(formData, "labor_cost") || 0),
          payment_type: formString(formData, "payment_type"),
          sold_by: formString(formData, "sold_by"),
          manufacturer_name: formString(formData, "manufacturer_name"),
          manufacturer_order_ref: formString(formData, "manufacturer_order_ref"),
          manufacturer_order_url: formString(formData, "manufacturer_order_url"),
          notes: formString(formData, "notes")
        })
      });
      event.currentTarget.reset();
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Quote could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  async function createBookkeepingEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) return;

    const formData = new FormData(event.currentTarget);
    setBusy(true);
    setMessage(null);

    try {
      await crmFetch<{ entry: unknown }>(session, "/api/crm/bookkeeping", {
        method: "POST",
        body: JSON.stringify({
          source: formString(formData, "source"),
          customer_name: formString(formData, "customer_name"),
          sold_date: formString(formData, "sold_date"),
          total_amount: Number(formString(formData, "total_amount") || 0),
          deposit_paid: Number(formString(formData, "deposit_paid") || 0),
          balance_paid: Number(formString(formData, "balance_paid") || 0),
          payment_type: formString(formData, "payment_type"),
          cogs_amount: Number(formString(formData, "cogs_amount") || 0),
          sales_owner: formString(formData, "sales_owner"),
          manufacturer_name: formString(formData, "manufacturer_name"),
          manufacturer_order_ref: formString(formData, "manufacturer_order_ref"),
          manufacturer_order_url: formString(formData, "manufacturer_order_url"),
          installation_invoice_amount: Number(formString(formData, "installation_invoice_amount") || 0),
          installation_invoice_number: formString(formData, "installation_invoice_number"),
          installation_complete: formData.get("installation_complete") === "on",
          jessica_commission_paid: formData.get("jessica_commission_paid") === "on",
          notes: formString(formData, "notes")
        })
      });
      event.currentTarget.reset();
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Bookkeeping row could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  async function updateQuote(event: FormEvent<HTMLFormElement>, quote: CrmQuote) {
    event.preventDefault();
    if (!session) return;

    const formData = new FormData(event.currentTarget);
    setBusy(true);
    setMessage(null);

    try {
      await crmFetch<{ quote: CrmQuote }>(session, `/api/crm/quotes/${quote.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: formString(formData, "status"),
          materials_cost: Number(formString(formData, "materials_cost") || 0),
          manufacturer_name: formString(formData, "manufacturer_name"),
          manufacturer_order_ref: formString(formData, "manufacturer_order_ref"),
          manufacturer_order_url: formString(formData, "manufacturer_order_url"),
          manufacturer_document_url: formString(formData, "manufacturer_document_url"),
          notes: formString(formData, "notes")
        })
      });
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Quote could not be updated.");
    } finally {
      setBusy(false);
    }
  }

  async function createEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) return;

    const formData = new FormData(event.currentTarget);
    const date = formString(formData, "date");
    const time = formString(formData, "time");
    const duration = Number(formString(formData, "duration") || 90);
    const start = new Date(`${date}T${time || "09:00"}`);
    const end = new Date(start.getTime() + duration * 60 * 1000);
    const jobId = formString(formData, "job_id");
    const job = jobs.find((item) => item.id === jobId);

    setBusy(true);
    setMessage(null);

    try {
      await crmFetch<{ event: CrmCalendarEvent }>(session, "/api/crm/calendar", {
        method: "POST",
        body: JSON.stringify({
          job_id: jobId || null,
          title: formString(formData, "title") || (job ? `${job.customer_name} consultation` : "Sales appointment"),
          event_type: formString(formData, "event_type") || "sales_consult",
          assigned_to: formString(formData, "assigned_to") || workspaceConfig.defaultOwner || "Unassigned",
          start_at: start.toISOString(),
          end_at: end.toISOString(),
          location: formString(formData, "location") || job?.address,
          notes: formString(formData, "notes")
        })
      });
      event.currentTarget.reset();
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Calendar event could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  if (!configured) {
    return (
      <div className="crm-app-shell">
        <section className="crm-login-panel">
          <p className="eyebrow">Dedicated Supabase required</p>
          <h1>805 CRM is ready for its own Supabase project.</h1>
          <p>Add the 805 project URL, anon key, and service-role key to `.env.local`, then enable Google auth.</p>
        </section>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="crm-app-shell">
        <section className="crm-login-panel">
          <p className="eyebrow">805 CRM</p>
          <h1>Loading CRM.</h1>
        </section>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="crm-app-shell">
        <section className="crm-login-panel">
          <p className="eyebrow">{isVaWorkspace ? `${workspaceConfig.personName} VA Access` : "Private CRM"}</p>
          <h1>{isVaWorkspace ? `${workspaceConfig.personName} VA login.` : "Google login only."}</h1>
          <p>
            Use an approved 805 Shutters Google account to access sales jobs, quotes, bookkeeping, calendar, and
            accountability.
          </p>
          {googleLoginUrl ? (
            <a className="button primary" href={googleLoginUrl}>
              Continue with Google
            </a>
          ) : (
            <button type="button" onClick={signIn}>
              Continue with Google
            </button>
          )}
        </section>
      </div>
    );
  }

  if (message && !data) {
    return (
      <div className="crm-app-shell">
        <section className="crm-login-panel">
          <p className="eyebrow">805 CRM</p>
          <h1>CRM access is blocked.</h1>
          <p>{message}</p>
          <button type="button" onClick={signOut}>
            Sign Out
          </button>
        </section>
      </div>
    );
  }

  const crmTabs: Array<[CrmTab, string]> = [
    ...(isVaWorkspace ? ([["va", `${workspaceConfig.personName || "VA"} Desk`]] as Array<[CrmTab, string]>) : []),
    ["command", "Command Center"],
    ["customers", "Customer Files"],
    ["jobs", "Sales Jobs"],
    ["bookkeeping", "Bookkeeping"],
    ["orders", "Orders"],
    ["calendar", "Calendar"]
  ];

  return (
    <div className="crm-app-shell">
      <header className="crm-topbar">
        <div>
          <p className="eyebrow">{workspaceConfig.eyebrow}</p>
          <h1>{workspaceConfig.title}</h1>
        </div>
        <div className="crm-user">
          <span>{user?.displayName || user?.email}</span>
          <button type="button" className="crm-ghost-button" onClick={refresh}>
            Refresh
          </button>
          <button type="button" className="crm-ghost-button" onClick={signOut}>
            Sign Out
          </button>
        </div>
      </header>

      {message ? <p className="crm-alert">{message}</p> : null}

      {isVaWorkspace && data ? (
        <VaSetupStrip
          user={user}
          personName={workspaceConfig.personName || "VA"}
          jobs={jobs}
          events={events}
          accountability={accountability}
        />
      ) : null}

      <section className="crm-metrics" aria-label="CRM summary">
        <Metric label="Open Jobs" value={data?.summary.openJobs || 0} />
        <Metric label="Sold Jobs" value={data?.summary.soldJobs || 0} />
        <Metric label="Pipeline" value={toCurrency(data?.summary.quotePipeline)} />
        <Metric label="Open Balance" value={toCurrency(data?.summary.openBalance)} />
        <Metric label="Needs Order" value={data?.summary.needsOrder || 0} />
        <Metric label="Missing COGS" value={data?.summary.missingCogs || 0} />
        <Metric label="Ready Install" value={data?.summary.readyToInstall || 0} />
        <Metric label="Customer Files" value={data?.summary.customerFiles || 0} />
        <Metric label="Jessica Owed" value={toCurrency(data?.bookkeepingTotals.jessicaCommissionOwed)} />
      </section>

      <nav className="crm-tabs" aria-label="CRM sections">
        {crmTabs.map(([tab, label]) => (
          <button
            type="button"
            key={tab}
            className={activeTab === tab ? "active" : ""}
            onClick={() => setActiveTab(tab as CrmTab)}
          >
            {label}
          </button>
        ))}
      </nav>

      {activeTab === "va" ? (
        <VaWorkbench
          personName={workspaceConfig.personName || "VA"}
          jobs={jobs}
          events={events}
          accountability={accountability}
        />
      ) : null}

      {activeTab === "command" ? (
        <section className="crm-command-grid">
          <AccountabilityBoard items={accountability} />
          <BookkeepingSnapshot rows={rows} />
        </section>
      ) : null}

      {activeTab === "customers" ? <CustomerFilesView files={customerFiles} /> : null}

      {activeTab === "jobs" ? (
        <section className="crm-workspace">
          <aside className="crm-panel">
            <h2>New Sales Job</h2>
            <form className="crm-form" onSubmit={createJob}>
              <label>
                Customer
                <input name="customer_name" required placeholder="Customer name" />
              </label>
              <label>
                Phone
                <input name="phone" required placeholder="805-000-0000" />
              </label>
              <label>
                Email
                <input name="email" type="email" placeholder="customer@email.com" />
              </label>
              <label>
                City
                <input name="city" placeholder="Ventura" />
              </label>
              <label>
                Address
                <input name="address" placeholder="Project address" />
              </label>
              <div className="crm-field-row">
                <label>
                  Product
                  <select name="product_interest" defaultValue="Shutters">
                    {productOptions.map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Owner
                  <select name="sales_owner" defaultValue={workspaceConfig.defaultOwner || "Unassigned"}>
                    {ownerOptions.map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="crm-field-row">
                <label>
                  Priority
                  <select name="priority" defaultValue="normal">
                    <option value="normal">Normal</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                    <option value="low">Low</option>
                  </select>
                </label>
                <label>
                  Due
                  <input name="next_action_due" type="date" defaultValue={todayInputValue()} />
                </label>
              </div>
              <label>
                Next Action
                <input name="next_action" defaultValue="Call customer" />
              </label>
              <label>
                Estimate
                <input name="estimated_total" type="number" min="0" step="50" placeholder="0" />
              </label>
              <label>
                Notes
                <textarea name="notes" rows={4} placeholder="Rooms, products, source, timing..." />
              </label>
              <button type="submit" disabled={busy}>
                Add Job
              </button>
            </form>
          </aside>

          <div className="crm-kanban">
            {jobColumns.map((column) => (
              <section className="crm-column" key={column.status}>
                <div className="crm-column-head">
                  <h2>{column.label}</h2>
                  <span>{jobs.filter((job) => job.status === column.status).length}</span>
                </div>
                <div className="crm-card-stack">
                  {jobs
                    .filter((job) => job.status === column.status)
                    .map((job) => (
                      <JobCard job={job} key={job.id} onStatusChange={updateJobStatus} />
                    ))}
                </div>
              </section>
            ))}
          </div>
        </section>
      ) : null}

      {activeTab === "bookkeeping" ? (
        <section className="crm-workspace crm-bookkeeping-workspace">
          <aside className="crm-panel">
            <h2>Add Spreadsheet Row</h2>
            <form className="crm-form" onSubmit={createBookkeepingEntry}>
              <div className="crm-field-row">
                <label>
                  Source
                  <select name="source" defaultValue="manual">
                    <option value="manual">Manual</option>
                    <option value="legacy_sheet">Legacy Sheet</option>
                  </select>
                </label>
                <label>
                  Sold Date
                  <input name="sold_date" type="date" defaultValue={todayInputValue()} />
                </label>
              </div>
              <label>
                Customer
                <input name="customer_name" required placeholder="Customer name" />
              </label>
              <div className="crm-field-row">
                <label>
                  Total
                  <input name="total_amount" type="number" min="0" step="0.01" required />
                </label>
                <label>
                  COGS
                  <input name="cogs_amount" type="number" min="0" step="0.01" />
                </label>
              </div>
              <div className="crm-field-row">
                <label>
                  Deposit Paid
                  <input name="deposit_paid" type="number" min="0" step="0.01" />
                </label>
                <label>
                  Balance Paid
                  <input name="balance_paid" type="number" min="0" step="0.01" />
                </label>
              </div>
              <div className="crm-field-row">
                <label>
                  Payment
                  <select name="payment_type" defaultValue="other">
                    {paymentTypes.map((item) => (
                      <option value={item.value} key={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Sales Owner
                  <select name="sales_owner" defaultValue="mike">
                    <option value="mike">Mike</option>
                    <option value="jessica">Jessica</option>
                  </select>
                </label>
              </div>
              <div className="crm-field-row">
                <label>
                  Manufacturer
                  <input name="manufacturer_name" placeholder="Norman, Alta, Horizon..." />
                </label>
                <label>
                  Order #
                  <input name="manufacturer_order_ref" placeholder="Manufacturer order" />
                </label>
              </div>
              <label>
                Order Link
                <input name="manufacturer_order_url" placeholder="https://..." />
              </label>
              <div className="crm-field-row">
                <label>
                  Install Invoice
                  <input name="installation_invoice_amount" type="number" min="0" step="0.01" />
                </label>
                <label>
                  Invoice #
                  <input name="installation_invoice_number" placeholder="Invoice number" />
                </label>
              </div>
              <label className="crm-checkbox">
                <input name="installation_complete" type="checkbox" />
                Installation complete
              </label>
              <label className="crm-checkbox">
                <input name="jessica_commission_paid" type="checkbox" />
                Jessica commission paid
              </label>
              <label>
                Notes
                <textarea name="notes" rows={4} placeholder="Payment notes, order details, install status..." />
              </label>
              <button type="submit" disabled={busy}>
                Save Row
              </button>
            </form>
          </aside>

          <BookkeepingSpreadsheet rows={rows} totals={data?.bookkeepingTotals} />
        </section>
      ) : null}

      {activeTab === "orders" ? (
        <section className="crm-workspace crm-workspace-wide">
          <aside className="crm-panel">
            <h2>New Quote / Sold Job</h2>
            <form className="crm-form" onSubmit={createQuote}>
              <label>
                Job
                <select name="job_id" required>
                  <option value="">Choose job</option>
                  {jobs.map((job) => (
                    <option value={job.id} key={job.id}>
                      {job.customer_name} - {job.product_interest}
                    </option>
                  ))}
                </select>
              </label>
              <div className="crm-field-row">
                <label>
                  Status
                  <select name="status" defaultValue="sold">
                    {crmQuoteStatuses.map((status) => (
                      <option value={status} key={status}>
                        {status.replace("_", " ")}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Sold By
                  <select name="sold_by" defaultValue="Mike">
                    {ownerOptions.map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                  </select>
                </label>
              </div>
              <label>
                Quote Number
                <input name="quote_number" placeholder="805-1001" />
              </label>
              <div className="crm-field-row">
                <label>
                  Quote Total
                  <input name="quote_total" type="number" min="0" step="0.01" required />
                </label>
                <label>
                  COGS
                  <input name="materials_cost" type="number" min="0" step="0.01" />
                </label>
              </div>
              <div className="crm-field-row">
                <label>
                  Deposit Paid
                  <input name="deposit_paid" type="number" min="0" step="0.01" />
                </label>
                <label>
                  Balance Paid
                  <input name="balance_paid" type="number" min="0" step="0.01" />
                </label>
              </div>
              <label>
                Payment Type
                <select name="payment_type" defaultValue="other">
                  {paymentTypes.map((item) => (
                    <option value={item.value} key={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="crm-field-row">
                <label>
                  Manufacturer
                  <input name="manufacturer_name" placeholder="Norman, Alta, Horizon..." />
                </label>
                <label>
                  Order #
                  <input name="manufacturer_order_ref" placeholder="Manufacturer order" />
                </label>
              </div>
              <label>
                Order Link
                <input name="manufacturer_order_url" placeholder="https://..." />
              </label>
              <label>
                Notes
                <textarea name="notes" rows={4} placeholder="Fabric, vendor, payment notes, commission notes..." />
              </label>
              <button type="submit" disabled={busy}>
                Save Quote
              </button>
            </form>
          </aside>

          <OrderBoard quotes={quotes} onUpdate={updateQuote} busy={busy} />
        </section>
      ) : null}

      {activeTab === "calendar" ? (
        <section className="crm-workspace crm-workspace-wide">
          <aside className="crm-panel">
            <h2>Schedule</h2>
            <form className="crm-form" onSubmit={createEvent}>
              <label>
                Job
                <select name="job_id">
                  <option value="">No linked job</option>
                  {jobs.map((job) => (
                    <option value={job.id} key={job.id}>
                      {job.customer_name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Title
                <input name="title" placeholder="Sales consultation" />
              </label>
              <div className="crm-field-row">
                <label>
                  Date
                  <input name="date" type="date" required defaultValue={todayInputValue()} />
                </label>
                <label>
                  Time
                  <input name="time" type="time" required defaultValue="09:00" />
                </label>
              </div>
              <div className="crm-field-row">
                <label>
                  Duration
                  <select name="duration" defaultValue="90">
                    <option value="60">1 hour</option>
                    <option value="90">1.5 hours</option>
                    <option value="120">2 hours</option>
                    <option value="180">3 hours</option>
                  </select>
                </label>
                <label>
                  Assigned
                  <select name="assigned_to" defaultValue={workspaceConfig.defaultOwner || "Unassigned"}>
                    {ownerOptions.map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                  </select>
                </label>
              </div>
              <label>
                Location
                <input name="location" placeholder="Customer address" />
              </label>
              <label>
                Notes
                <textarea name="notes" rows={4} placeholder="Gate code, rooms, samples to bring..." />
              </label>
              <button type="submit" disabled={busy}>
                Add Event
              </button>
            </form>
          </aside>

          <CalendarAgenda events={events} />
        </section>
      ) : null}
    </div>
  );
}

function matchesPerson(value: string | null | undefined, personName: string) {
  return (value || "").trim().toLowerCase() === personName.trim().toLowerCase();
}

function VaSetupStrip({
  user,
  personName,
  jobs,
  events,
  accountability
}: {
  user: CrmUser | null;
  personName: string;
  jobs: CrmJob[];
  events: CrmCalendarEvent[];
  accountability: CrmAccountabilityItem[];
}) {
  const assignedJobs = jobs.filter((job) => matchesPerson(job.sales_owner, personName));
  const assignedEvents = events.filter((event) => matchesPerson(event.assigned_to, personName));
  const checks = [
    {
      label: "Google Login",
      detail: user?.email || "No active session",
      status: user ? "Ready" : "Waiting",
      warning: !user
    },
    {
      label: "VA Profile",
      detail: user?.role === "va" ? `${personName} is set as VA` : `Current role: ${user?.role || "none"}`,
      status: user?.role === "va" ? "Ready" : "Needs Role",
      warning: user?.role !== "va"
    },
    {
      label: "Scheduling",
      detail: `${assignedEvents.length} assigned event${assignedEvents.length === 1 ? "" : "s"}`,
      status: "Ready",
      warning: false
    },
    {
      label: "Accountability",
      detail: `${accountability.length} open item${accountability.length === 1 ? "" : "s"}`,
      status: "Ready",
      warning: false
    },
    {
      label: "Sales Queue",
      detail: `${assignedJobs.length} assigned job${assignedJobs.length === 1 ? "" : "s"}`,
      status: "Ready",
      warning: false
    }
  ];

  return (
    <section className="crm-va-setup" aria-label={`${personName} setup status`}>
      {checks.map((check) => (
        <article className={check.warning ? "warning" : ""} key={check.label}>
          <span>{check.label}</span>
          <strong>{check.status}</strong>
          <p>{check.detail}</p>
        </article>
      ))}
    </section>
  );
}

function VaWorkbench({
  personName,
  jobs,
  events,
  accountability
}: {
  personName: string;
  jobs: CrmJob[];
  events: CrmCalendarEvent[];
  accountability: CrmAccountabilityItem[];
}) {
  const activeStatuses = new Set<CrmJobStatus>(["new", "follow_up", "scheduled", "quoted"]);
  const assignedEvents = events.filter((event) => matchesPerson(event.assigned_to, personName)).slice(0, 10);
  const followUpJobs = jobs
    .filter((job) => activeStatuses.has(job.status))
    .filter((job) => matchesPerson(job.sales_owner, personName) || job.sales_owner === "Unassigned")
    .slice(0, 12);
  const vaAccountability = accountability.slice(0, 12);

  return (
    <section className="crm-va-grid">
      <section className="crm-ledger">
        <div className="crm-section-head">
          <div>
            <p className="eyebrow">{personName}</p>
            <h2>Assigned Schedule</h2>
          </div>
          <strong>{assignedEvents.length}</strong>
        </div>
        <div className="crm-agenda">
          {assignedEvents.map((event) => (
            <article className="crm-event-card" key={event.id}>
              <time>{formatDate(event.start_at)}</time>
              <div>
                <h3>{event.title}</h3>
                <p>{event.customer_name || event.location || "805 Shutters"}</p>
              </div>
              <span>{event.status}</span>
            </article>
          ))}
          {!assignedEvents.length ? <p className="crm-empty">No assigned calendar events yet.</p> : null}
        </div>
      </section>

      <section className="crm-ledger">
        <div className="crm-section-head">
          <div>
            <p className="eyebrow">VA Follow-Up</p>
            <h2>Sales Queue</h2>
          </div>
          <strong>{followUpJobs.length}</strong>
        </div>
        <div className="crm-va-list">
          {followUpJobs.map((job) => (
            <article key={job.id}>
              <div>
                <strong>{job.customer_name}</strong>
                <span>{job.next_action || "Call customer"}</span>
              </div>
              <em>{job.next_action_due || "Open"}</em>
            </article>
          ))}
          {!followUpJobs.length ? <p className="crm-empty">No open VA follow-up jobs.</p> : null}
        </div>
      </section>

      <section className="crm-ledger">
        <div className="crm-section-head">
          <div>
            <p className="eyebrow">Accountability</p>
            <h2>Open Work</h2>
          </div>
          <strong>{vaAccountability.length}</strong>
        </div>
        <div className="crm-accountability-list">
          {vaAccountability.map((item) => (
            <article className={`crm-accountability-card ${item.urgency}`} key={item.id}>
              <div>
                <span>{item.label}</span>
                <h3>{item.detail}</h3>
              </div>
              <strong>{item.owner}</strong>
            </article>
          ))}
          {!vaAccountability.length ? <p className="crm-empty">No accountability items. The board is clean.</p> : null}
        </div>
      </section>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="crm-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function AccountabilityBoard({ items }: { items: CrmAccountabilityItem[] }) {
  const featured = items.slice(0, 18);

  return (
    <section className="crm-ledger">
      <div className="crm-section-head">
        <div>
          <p className="eyebrow">Accountability</p>
          <h2>What Needs Attention</h2>
        </div>
        <strong>{items.length} open</strong>
      </div>
      <div className="crm-accountability-list">
        {featured.map((item) => (
          <article className={`crm-accountability-card ${item.urgency}`} key={item.id}>
            <div>
              <span>{item.label}</span>
              <h3>{item.detail}</h3>
            </div>
            <strong>{item.owner}</strong>
          </article>
        ))}
        {!featured.length ? <p className="crm-empty">No accountability items. The board is clean.</p> : null}
      </div>
    </section>
  );
}

function BookkeepingSnapshot({ rows }: { rows: CrmBookkeepingRow[] }) {
  const needsOrder = rows.filter((row) => (row.status === "sold" || row.status === "approved") && !row.manufacturerOrderRef);
  const readyInstall = rows.filter((row) => row.status === "received");
  const openBalances = rows.filter((row) => row.balance > 0).slice(0, 8);

  return (
    <section className="crm-ledger">
      <div className="crm-section-head">
        <div>
          <p className="eyebrow">Sales Organizer</p>
          <h2>Job Movement</h2>
        </div>
      </div>
      <div className="crm-snapshot-grid">
        <SnapshotColumn title="Needs Ordered" rows={needsOrder} empty="No sold jobs waiting on orders." />
        <SnapshotColumn title="Ready To Install" rows={readyInstall} empty="No jobs are waiting for install scheduling." />
        <SnapshotColumn title="Payment Follow-Up" rows={openBalances} empty="No open balances in the active ledger." />
      </div>
    </section>
  );
}

function CustomerFilesView({ files }: { files: CrmCustomerFile[] }) {
  return (
    <section className="crm-customer-files">
      <div className="crm-section-head">
        <div>
          <p className="eyebrow">Customer Files</p>
          <h2>Bookkeeping Customers</h2>
        </div>
        <strong>{files.length}</strong>
      </div>
      <div className="crm-customer-grid">
        {files.map((file) => (
          <article className="crm-customer-card" key={file.id}>
            <header className="crm-customer-card-head">
              <div>
                <h3>{file.customerName}</h3>
                <p>{[file.phone, file.email, file.city].filter(Boolean).join(" / ") || "Contact details pending"}</p>
              </div>
              <strong>{toCurrency(file.lifetimeValue)}</strong>
            </header>

            <dl className="crm-customer-facts">
              <div>
                <dt>Open Balance</dt>
                <dd className={file.openBalance > 0 ? "warn" : ""}>{toCurrency(file.openBalance)}</dd>
              </div>
              <div>
                <dt>Latest Status</dt>
                <dd>{file.latestStatus || "Open"}</dd>
              </div>
              <div>
                <dt>Sold Date</dt>
                <dd>{formatShortDate(file.latestSoldDate)}</dd>
              </div>
              <div>
                <dt>Contracts</dt>
                <dd>{file.contracts.length}</dd>
              </div>
            </dl>

            {file.address ? <p className="crm-customer-address">{file.address}</p> : null}

            <div className="crm-customer-section">
              <h4>Products</h4>
              <div className="crm-customer-list">
                {file.products.map((product) => (
                  <div key={product.id}>
                    <strong>
                      {product.room ? `${product.room} / ` : ""}
                      {product.product_type}
                    </strong>
                    <span>
                      {[product.description, product.fabric, product.material, product.control_type, product.mount_type]
                        .filter(Boolean)
                        .join(" / ") || "Product details pending"}
                    </span>
                    <em>
                      {product.quantity} item{product.quantity === 1 ? "" : "s"}
                      {product.total_price ? ` / ${toCurrency(product.total_price)}` : ""}
                    </em>
                  </div>
                ))}
                {!file.products.length ? <p>No product details imported yet.</p> : null}
              </div>
            </div>

            <div className="crm-customer-section">
              <h4>Contracts + Documents</h4>
              <div className="crm-document-list">
                {file.contracts.map((contract) =>
                  contract.contract_url ? (
                    <a href={contract.contract_url} target="_blank" rel="noreferrer" key={contract.id}>
                      {contract.title}
                      <span>{contract.status || "Document"}</span>
                    </a>
                  ) : (
                    <div key={contract.id}>
                      {contract.title}
                      <span>{contract.status || "No link"}</span>
                    </div>
                  )
                )}
                {!file.contracts.length ? <p>No contract or document link attached.</p> : null}
              </div>
            </div>

            <div className="crm-customer-section">
              <h4>Jobs + Bookkeeping</h4>
              <div className="crm-customer-list compact">
                {file.bookkeepingRows.slice(0, 4).map((row) => (
                  <div key={`${row.source}-${row.id}`}>
                    <strong>{row.quoteNumber || row.source.replace("_", " ")}</strong>
                    <span>{row.manufacturerName || row.status}</span>
                    <em>
                      {toCurrency(row.total)} / balance {toCurrency(row.balance)}
                    </em>
                  </div>
                ))}
                {!file.bookkeepingRows.length ? <p>No bookkeeping row attached.</p> : null}
              </div>
            </div>

            {file.notes.length ? (
              <div className="crm-customer-notes">
                <h4>Notes</h4>
                <p>{file.notes.slice(0, 3).join(" / ")}</p>
              </div>
            ) : null}
          </article>
        ))}
      </div>
      {!files.length ? <p className="crm-empty">No customer files yet. Bookkeeping rows will appear here automatically.</p> : null}
    </section>
  );
}

function SnapshotColumn({
  title,
  rows,
  empty
}: {
  title: string;
  rows: CrmBookkeepingRow[];
  empty: string;
}) {
  return (
    <div className="crm-snapshot-column">
      <h3>{title}</h3>
      {rows.map((row) => (
        <article key={`${title}-${row.id}`}>
          <strong>{row.customerName}</strong>
          <span>{row.manufacturerName || row.manufacturerOrderRef || formatShortDate(row.soldDate)}</span>
          <em>{row.balance > 0 ? toCurrency(row.balance) : row.status}</em>
        </article>
      ))}
      {!rows.length ? <p>{empty}</p> : null}
    </div>
  );
}

function JobCard({
  job,
  onStatusChange
}: {
  job: CrmJob;
  onStatusChange: (job: CrmJob, status: CrmJobStatus) => void;
}) {
  return (
    <article className="crm-job-card">
      <div className="crm-job-card-head">
        <h3>{job.customer_name}</h3>
        <span>{job.priority}</span>
      </div>
      <p>{job.product_interest}</p>
      <dl>
        <div>
          <dt>Phone</dt>
          <dd>{job.phone}</dd>
        </div>
        <div>
          <dt>Owner</dt>
          <dd>{job.sales_owner}</dd>
        </div>
        <div>
          <dt>Next</dt>
          <dd>{job.next_action || "Call customer"}</dd>
        </div>
        <div>
          <dt>Due</dt>
          <dd>{job.next_action_due || "Open"}</dd>
        </div>
      </dl>
      <div className="crm-card-footer">
        <strong>{toCurrency(job.quote_total || job.estimated_total)}</strong>
        <select value={job.status} onChange={(event) => onStatusChange(job, event.target.value as CrmJobStatus)}>
          {crmJobStatuses.map((status) => (
            <option value={status} key={status}>
              {status.replace("_", " ")}
            </option>
          ))}
        </select>
      </div>
    </article>
  );
}

function BookkeepingSpreadsheet({
  rows,
  totals
}: {
  rows: CrmBookkeepingRow[];
  totals: CrmDashboardData["bookkeepingTotals"] | undefined;
}) {
  return (
    <section className="crm-ledger crm-bookkeeping-ledger">
      <div className="crm-section-head">
        <div>
          <p className="eyebrow">Bookkeeping</p>
          <h2>805 Spreadsheet</h2>
        </div>
        <div className="crm-ledger-totals">
          <span>Total {toCurrency(totals?.total)}</span>
          <span>Paid {toCurrency(totals?.paidTotal)}</span>
          <span>Balance {toCurrency(totals?.balance)}</span>
          <span>COGS {toCurrency(totals?.cogs)}</span>
          <span>Ken {toCurrency(totals?.kenCut)}</span>
          <span>Mike {toCurrency(totals?.mikeProfit)}</span>
          <span>Jessica {toCurrency(totals?.jessicaCommissionOwed)}</span>
        </div>
      </div>
      <div className="crm-bookkeeping-table-wrap">
        <table className="crm-bookkeeping-table">
          <thead>
            <tr>
              <th>Customer / Quote</th>
              <th>Sold Date</th>
              <th>Total</th>
              <th>Deposit Due</th>
              <th>Deposit Paid</th>
              <th>Balance Paid</th>
              <th>Paid Total</th>
              <th>Credit In</th>
              <th>Credit Out</th>
              <th>Payment Type</th>
              <th>COGS</th>
              <th>Balance</th>
              <th>Ken Cut</th>
              <th>Mike Profit</th>
              <th>Sales Owner</th>
              <th>Installation</th>
              <th>Jessica</th>
              <th>Jessica Owed</th>
              <th>Manufacturer</th>
              <th>Order Ref</th>
              <th>Status</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.source}-${row.id}`}>
                <td>
                  <strong>{row.customerName}</strong>
                  <span>{row.quoteNumber || row.source.replace("_", " ")}</span>
                </td>
                <td>{formatShortDate(row.soldDate)}</td>
                <td>{toCurrency(row.total)}</td>
                <td>{toCurrency(row.depositDue)}</td>
                <td>{toCurrency(row.depositPaid)}</td>
                <td>{toCurrency(row.balancePaid)}</td>
                <td>{toCurrency(row.paidTotal)}</td>
                <td>{toCurrency(row.creditIn)}</td>
                <td>{toCurrency(row.creditOut)}</td>
                <td>{formatPaymentType(row.paymentType)}</td>
                <td className={row.cogs <= 0 ? "crm-warning-cell" : ""}>{row.cogs <= 0 ? "Missing" : toCurrency(row.cogs)}</td>
                <td className={row.balance > 0 ? "crm-warning-cell" : "crm-complete-cell"}>{toCurrency(row.balance)}</td>
                <td>{toCurrency(row.kenCut)}</td>
                <td>{toCurrency(row.mikeProfit)}</td>
                <td>{row.salesOwner || "Unassigned"}</td>
                <td>
                  <strong>{toCurrency(row.installationInvoiceAmount)}</strong>
                  <span>{row.isInstallationComplete ? "Complete" : row.installationMatchStatus}</span>
                </td>
                <td>{toCurrency(row.jessicaCommission)}</td>
                <td className={row.jessicaCommissionOwed > 0 ? "crm-warning-cell" : ""}>{toCurrency(row.jessicaCommissionOwed)}</td>
                <td>{row.manufacturerName || "Open"}</td>
                <td>{row.manufacturerOrderRef || "Needs order"}</td>
                <td>{row.status}</td>
                <td>{row.notes || ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length ? <p className="crm-empty">No bookkeeping rows yet.</p> : null}
      </div>
    </section>
  );
}

function OrderBoard({
  quotes,
  onUpdate,
  busy
}: {
  quotes: CrmQuote[];
  onUpdate: (event: FormEvent<HTMLFormElement>, quote: CrmQuote) => Promise<void>;
  busy: boolean;
}) {
  return (
    <section className="crm-ledger">
      <div className="crm-section-head">
        <div>
          <p className="eyebrow">Orders</p>
          <h2>Sold Job Tracking</h2>
        </div>
      </div>
      <div className="crm-order-grid">
        {quotes.map((quote) => (
          <article className="crm-order-card" key={quote.id}>
            <div className="crm-order-card-head">
              <div>
                <h3>{quote.customer_name || "Linked job"}</h3>
                <span>{quote.quote_number || quote.id.slice(0, 8)}</span>
              </div>
              <strong>{toCurrency(quote.quote_total)}</strong>
            </div>
            <form className="crm-order-form" onSubmit={(event) => onUpdate(event, quote)}>
              <div className="crm-field-row">
                <label>
                  Status
                  <select name="status" defaultValue={quote.status}>
                    {crmQuoteStatuses.map((status) => (
                      <option value={status} key={status}>
                        {status.replace("_", " ")}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  COGS
                  <input name="materials_cost" type="number" min="0" step="0.01" defaultValue={quote.materials_cost || ""} />
                </label>
              </div>
              <div className="crm-field-row">
                <label>
                  Manufacturer
                  <input name="manufacturer_name" defaultValue={quote.manufacturer_name || ""} />
                </label>
                <label>
                  Order #
                  <input name="manufacturer_order_ref" defaultValue={quote.manufacturer_order_ref || ""} />
                </label>
              </div>
              <label>
                Order Link
                <input name="manufacturer_order_url" defaultValue={quote.manufacturer_order_url || ""} />
              </label>
              <label>
                Document Link
                <input name="manufacturer_document_url" defaultValue={quote.manufacturer_document_url || ""} />
              </label>
              <label>
                Notes
                <textarea name="notes" rows={3} defaultValue={quote.notes || ""} />
              </label>
              <button type="submit" disabled={busy}>
                Update Order
              </button>
            </form>
          </article>
        ))}
        {!quotes.length ? <p className="crm-empty">No quotes or sold jobs yet.</p> : null}
      </div>
    </section>
  );
}

function CalendarAgenda({ events }: { events: CrmCalendarEvent[] }) {
  return (
    <section className="crm-ledger">
      <div className="crm-section-head">
        <p className="eyebrow">Calendar</p>
        <h2>Upcoming Sales Work</h2>
      </div>
      <div className="crm-agenda">
        {events.map((event) => (
          <article className="crm-event-card" key={event.id}>
            <time>{formatDate(event.start_at)}</time>
            <div>
              <h3>{event.title}</h3>
              <p>{event.customer_name || event.location || "805 Shutters"}</p>
            </div>
            <span>{event.assigned_to}</span>
          </article>
        ))}
        {!events.length ? <p className="crm-empty">No calendar events yet.</p> : null}
      </div>
    </section>
  );
}
