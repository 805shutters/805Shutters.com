"use client";
import { useMemo, useState } from "react";
import {
  buildOperationsReports,
  businessDate,
} from "@/lib/crm/operations-reports";
import type { CrmDashboardData, CrmActivitySnapshot } from "@/lib/crm/types";
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
    [selected, setSelected] = useState("actions"),
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
      className="crm-workspace"
      aria-label="Operations reports"
      style={{ display: "block", padding: 20 }}
    >
      <div className="crm-section-head">
        <div>
          <p className="eyebrow">Source-backed reports</p>
          <h2>Operations & reporting</h2>
          <p>
            As of{" "}
            {new Date(asOf).toLocaleString("en-US", {
              timeZone: "America/Los_Angeles",
            })}{" "}
            Pacific. Order counts and distinct parent jobs are shown separately.
          </p>
        </div>
      </div>
      {stale ? (
        <p role="alert">
          Snapshot is stale. Refresh is pending; these figures are not current.
        </p>
      ) : null}
      {(data.integrationHealth || [])
        .filter((h) => h.state !== "succeeded")
        .map((h) => (
          <p role="status" key={h.processor}>
            {h.processor}: {h.state} — integration freshness is separate from
            this page refresh.
          </p>
        ))}
      {data.loadWarnings?.length ? (
        <p role="alert">{data.loadWarnings.join(" ")}</p>
      ) : null}
      <div
        style={{ display: "flex", gap: 16, flexWrap: "wrap", margin: "16px 0" }}
      >
        <label>
          Cohort from{" "}
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
        <span>Snapshot queues use the current as-of date.</span>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))",
          gap: 10,
        }}
        aria-label="Report totals"
      >
        {reports.map((original) => {
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
              style={{
                color: "#172d2a",
                textAlign: "left",
                padding: 14,
                border: `2px solid ${selected === r.id ? "#236c77" : "#d8dedb"}`,
                background: selected === r.id ? "#eaf3f1" : "white",
                borderRadius: 8,
              }}
            >
              <strong>{r.title}</strong>
              <div style={{ fontSize: 22 }}>
                {r.value === null
                  ? "Unavailable"
                  : r.format === "money"
                    ? currency(r.value)
                    : r.format === "percent"
                      ? `${r.value.toFixed(1)}%`
                      : r.value}
              </div>
              <small>
                {r.records.length} {r.records.length === 1 ? r.unit : r.unit === "opportunity" ? "opportunities" : `${r.unit}s`} · {r.jobCount} parent jobs ·{" "}
                {r.status}
              </small>
            </button>
          );
        })}
      </div>
      <section
        aria-label={`${report.title} contributing records`}
        style={{ marginTop: 24 }}
      >
        <h3>{report.title}</h3>
        <p>{report.definition}</p>
        <p>
          <strong>Date basis:</strong> {report.dateBasis}. America/Los_Angeles.
        </p>
        {report.notes.map((n, index) => (
          <p key={index}>{n}</p>
        ))}
        <div
          style={{
            display: "flex",
            gap: 16,
            alignItems: "center",
            flexWrap: "wrap",
            margin: "16px 0",
          }}
        >
          <label>
            Search contributing records{" "}
            <input value={search} onChange={(e) => setSearch(e.target.value)} />
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
            {rows.length} contributing records
            {report.format === "money" && report.status !== "unavailable"
              ? ` · ${currency(filteredAmount)}`
              : ""}
          </strong>
        </div>
        {report.status === "unavailable" ? (
          <p role="alert">
            This source-dependent total is unavailable. Any records below are
            partial evidence and must not be treated as a complete result.
          </p>
        ) : null}
        <div style={{ overflowX: "auto", maxHeight: 650 }}>
          <table
            className="crm-ledger-table"
            style={{ minWidth: 1100, width: "100%" }}
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
                  <th key={t} style={{ textAlign: "left", padding: 10 }}>
                    {t}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td
                    style={{
                      position: "sticky",
                      left: 0,
                      background: "white",
                      padding: 10,
                    }}
                  >
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
