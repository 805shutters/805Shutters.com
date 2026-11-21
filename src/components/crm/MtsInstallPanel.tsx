import { Fragment } from "react";
import { readMtsInstallLink, MTS_INSTALL_MATCH_BASIS_LABEL, MTS_INSTALL_REFERENCE_LABEL, MTS_INSTALL_REFERENCE_FIELDS } from "@/lib/crm/mts-install-link";
import styles from "./JobRecordDetail.module.css";

const money = (amount: number) => amount.toLocaleString("en-US", { style: "currency", currency: "USD" });

function calendarDate(value: string | null, empty: string) {
  if (!value) return empty;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function verifiedWhen(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Los_Angeles",
  });
}

export function MtsInstallPanel({ link }: { link?: unknown }) {
  const summary = readMtsInstallLink(link);
  const jobLabel = [summary?.mts_job_number, summary?.mts_job_id].filter(Boolean).join(" · ");
  return (
    <section className={`${styles.box} ${styles.mtsInstall}`} aria-label="MTS install">
      <h3>MTS install</h3>
      {!summary ? <p>No linked MTS install summary.</p> : (
        <dl>
          <dt>MTS job</dt>
          <dd>{jobLabel || "Not recorded"}</dd>
          <dt>Scheduled install</dt>
          <dd>{summary.scheduled_install_date ? <time dateTime={summary.scheduled_install_date}>{calendarDate(summary.scheduled_install_date, "Not scheduled")}</time> : "Not scheduled"}</dd>
          <dt>Install status</dt>
          <dd>{summary.install_status || "Not reported"}</dd>
          <dt>Verified completion</dt>
          <dd>{summary.verified_completion_date ? <time dateTime={summary.verified_completion_date}>{calendarDate(summary.verified_completion_date, "Not verified")}</time> : "Not verified"}</dd>
          <dt>Open issues</dt>
          <dd>{summary.open_issues.length ? <ul>{summary.open_issues.map((issue, index) => <li key={`${index}-${issue}`}>{issue}</li>)}</ul> : "None open"}</dd>
          <dt>Install charge to 805</dt>
          <dd>{summary.charge_amount === null || !summary.charge_basis ? "Not recorded" : `${money(summary.charge_amount)} · ${summary.charge_basis}`}</dd>
          <dt>Match</dt>
          <dd className={summary.match_status === "ambiguous" ? styles.ambiguous : undefined}>
            {summary.match_status === "ambiguous" ? "Ambiguous match" : "Matched"} on {MTS_INSTALL_MATCH_BASIS_LABEL[summary.match_basis]}
          </dd>
          {MTS_INSTALL_REFERENCE_FIELDS.map((key) => {
            const value = summary.record_references[key];
            if (!value) return null;
            return <Fragment key={key}><dt>{MTS_INSTALL_REFERENCE_LABEL[key]}</dt><dd>{value}</dd></Fragment>;
          })}
          <dt>Last verified</dt>
          <dd><time dateTime={summary.last_verified_at}>{verifiedWhen(summary.last_verified_at)}</time> · {summary.verified_by}</dd>
        </dl>
      )}
    </section>
  );
}
