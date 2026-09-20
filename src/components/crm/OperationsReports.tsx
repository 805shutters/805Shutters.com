"use client";
import { useMemo, useState } from "react";
import styles from "./ReportingWorkspace.module.css";
import {
  buildOperationsReports,
  businessDate,
} from "@/lib/crm/operations-reports";
import type { CrmDashboardData, CrmActivitySnapshot } from "@/lib/crm/types";
export const OPERATIONS_REPORT_GROUPS = [
  { label: "Sales", ids: ["booked", "pipeline", "conversion", "margin"] },
  { label: "Money", ids: ["collected", "net-collected", "receivables", "invoiced", "refunds", "credits", "overpayments"] },
  { label: "Operations", ids: ["actions", "backlog", "aging", "vendor-delays", "ready", "service", "cancellations"] },
  { label: "Data review", ids: ["grouping", "missing-dates", "documents"] },
];
const coverageLabel = { complete: "Available", incomplete: "Needs review", unavailable: "Unavailable" };
const currency = (v: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    v,
  );
export function OperationsReports({
  data,
  activity,
}: {
  data: CrmDashboardData;
  activity: CrmActivitySnapshot | null;
}) {
  const asOf = data.asOf || new Date().toISOString();
  const today = businessDate(asOf)!;
  const [from, setFrom] = useState(`${today.slice(0, 4)}-01-01`),
    [through, setThrough] = useState(today),
    [selected, setSelected] = useState("booked"),
    [category, setCategory] = useState("Sales"),
    [search, setSearch] = useState(""),
    [status, setStatus] = useState("all");
  const reports = useMemo(
    () => buildOperationsReports(data, { from, through, asOf }, activity),
    [data, from, through, asOf, activity],
  );
  const report = reports.find((r) => r.id === selected)!;
  const rows = report.records.filter(
    (r) =>
      (status === "all" || r.status === status) &&
      [r.name, r.id, r.quoteId, r.reason, r.owner, ...r.flags]
        .join(" ")
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const filteredAmount = rows.reduce((sum, r) => sum + (r.amount || 0), 0);
  const groups = [...new Set(report.records.map((r) => r.status))];
  const stale = Date.now() - Date.parse(asOf) > 90_000;
  return (
    <section
      className={styles.workspace}
      aria-label="Operations reports"
    >
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>805 / OPERATIONS</p>
          <h1>Operations reports</h1>
          <p>
            As of{" "}
            {new Date(asOf).toLocaleString("en-US", {
              timeZone: "America/Los_Angeles",
            })}{" "}
            Pacific · A clear view of sales, cash and job progress.
          </p>
        </div>
      </header>
      {stale ? (
        <p role="alert" className={styles.alert}>
          Snapshot is stale. Refresh is pending; these figures are not current.
        </p>
      ) : null}
      {data.loadWarnings?.length ? (
        <p role="alert" className={styles.alert}>{data.loadWarnings.join(" ")}</p>
      ) : null}
      <div className={styles.filters}>
        <label>
          From{" "}
          <input
            type="date"
            value={from}
            max={through}
            onChange={(e) =>
              setFrom(e.target.value || `${today.slice(0, 4)}-01-01`)
            }
          />
        </label>
        <label>
          Through{" "}
          <input
            type="date"
            value={through}
            min={from}
            max={today}
            onChange={(e) => setThrough(e.target.value || today)}
          />
        </label>
        <span className={styles.filterNote}>Sales and cash use this date range.<br />Work queues show the current snapshot.</span>
      </div>
      <nav className={styles.tabs} aria-label="Report categories">
        {OPERATIONS_REPORT_GROUPS.map(group => <button key={group.label} type="button" aria-pressed={category === group.label} onClick={() => {
          setCategory(group.label); setSelected(group.ids[0]); setSearch(""); setStatus("all");
        }}>{group.label}</button>)}
      </nav>
      <div className={styles.metrics} aria-label="Report totals">
        {OPERATIONS_REPORT_GROUPS.find(group => group.label === category)!.ids.map(id => reports.find(r => r.id === id)!).map((original) => {
          const r =
            original.id === selected
              ? {
                  ...original,
                  records: rows,
                  jobCount: new Set(
                    rows.flatMap((x) => (x.jobId ? [x.jobId] : [])),
                  ).size,
                  value:
                    original.status === "unavailable" || original.value === null
                      ? null
                      : original.format === "money"
                        ? filteredAmount
                        : original.format === "percent"
                          ? rows.length
                            ? (100 *
                                rows.filter((x) => x.status === "accepted")
                                  .length) /
                              rows.length
                            : null
                          : rows.length,
                }
              : original;
          return (
            <button
              type="button"
              key={r.id}
              aria-pressed={selected === r.id}
              onClick={() => {
                setSelected(r.id);
                setSearch("");
                setStatus("all");
              }}
              className={styles.metric}
            >
              <span className={styles.metricLabel}>{r.title}</span>
              <strong className={styles.metricValue}>
                {r.value === null
                  ? "Unavailable"
                  : r.format === "money"
                    ? currency(r.value)
                    : r.format === "percent"
                      ? `${r.value.toFixed(1)}%`
                      : r.value}
              </strong>
              <small>
                {r.records.length} {r.records.length === 1 ? r.unit : r.unit === "opportunity" ? "opportunities" : `${r.unit}s`} · {r.jobCount} {r.jobCount === 1 ? "job" : "jobs"}
              </small>
              <span className={styles.coverage} data-status={r.status}>{coverageLabel[r.status]}</span>
            </button>
          );
        })}
      </div>
      <section
        aria-label={`${report.title} contributing records`}
        className={styles.detail}
      >
        <div className={styles.detailHead}><div><p className={styles.eyebrow}>REPORT DETAILS</p><h2>{report.title}</h2></div><span className={styles.coverage} data-status={report.status}>{coverageLabel[report.status]}</span></div>
        <p className={styles.definition}>Review the records behind this total. Open a customer for the full job.</p>
        <details className={styles.method}><summary>How this report is calculated</summary><p>{report.definition}</p><p>
          <strong>Date basis:</strong> {report.dateBasis}. America/Los_Angeles.
        </p>
        {report.notes.map((n, index) => (
          <p key={index}>{n}</p>
        ))}
        </details>
        <div className={styles.filters}>
          <label>
            Search records{" "}
            <input placeholder="Customer, quote or keyword" value={search} onChange={(e) => setSearch(e.target.value)} />
          </label>
          <label>
            Outcome / stage{" "}
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="all">All</option>
              {groups.map((g) => (
                <option key={g}>{g}</option>
              ))}
            </select>
          </label>
          <strong>
            {rows.length} contributing {rows.length === 1 ? "record" : "records"}
            {report.format === "money" && report.status !== "unavailable"
              ? ` · ${currency(filteredAmount)}`
              : ""}
          </strong>
        </div>
        {report.status === "unavailable" ? (
          <p role="alert" className={styles.alert}>
            This source-dependent total is unavailable. Any records below are
            partial evidence and must not be treated as a complete result.
          </p>
        ) : null}
        <div className={styles.tableWrap}>
          <table
            className={styles.table}
          >
            <thead>
              <tr>
                {[
                  "Customer / source",
                  "State / reason",
                  "Date / basis",
                  "Amount",
                  "Owner / next action",
                  "Evidence & missing information",
                ].map((t) => (
                  <th key={t}>
                    {t}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <a href={r.href}>{r.name}</a>
                    <br />
                    <small>{r.quoteId || r.jobId || r.id}</small>
                  </td>
                  <td>
                    {r.status}
                    <br />
                    {r.reason}
                  </td>
                  <td>
                    {r.date || "Unknown"}
                    <br />
                    <small>{r.dateBasis}</small>
                  </td>
                  <td>{r.amount === null ? "—" : currency(r.amount)}</td>
                  <td>
                    {r.owner || "See linked action"}
                    {r.due ? (
                      <>
                        <br />
                        Due {r.due}
                      </>
                    ) : null}
                    {r.waitingDays != null ? (
                      <>
                        <br />
                        {r.waitingDays} days waiting
                      </>
                    ) : null}
                  </td>
                  <td>
                    {r.flags.length ? <p>{r.flags.join(" · ")}</p> : null}
                    <details>
                      <summary>Source evidence</summary>
                      <p>Stable record ID: {r.id}</p>
                      {r.details?.map((d, index) => (
                        <p key={index}>{d}</p>
                      ))}
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!rows.length ? (
          <p>
            No contributing records in this selection
            {report.status === "unavailable"
              ? "; source coverage is unavailable"
              : ""}
            .
          </p>
        ) : null}
      </section>
    </section>
  );
}
