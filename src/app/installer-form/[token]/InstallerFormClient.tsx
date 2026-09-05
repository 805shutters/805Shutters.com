"use client";

import { useMemo, useState } from "react";
import type {
  InstallerFormPublic,
  InstallerOutcome,
} from "@/lib/crm/installer-forms";

type Issue = { lineId: string; notInstalled: boolean; details: string };

export function InstallerFormClient({ form }: { form: InstallerFormPublic }) {
  const [issues, setIssues] = useState<Issue[]>(() =>
    form.issues.map((issue) => ({ ...issue })),
  );
  const [signerName, setSignerName] = useState(form.signer_name || "");
  const [accepted, setAccepted] = useState(form.accepted);
  const [outcome, setOutcome] = useState<InstallerOutcome>(form.workflow.outcome);
  const [reasonCode, setReasonCode] = useState(form.workflow.reasonCode);
  const [notes, setNotes] = useState(form.workflow.notes);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<null | {
    outcome: InstallerOutcome;
    revision: number;
    savedAt: string;
    status: string;
    reportEmail?: {sent:boolean};
  }>(null);
  const [error, setError] = useState("");

  const byLine = useMemo(() => new Map(issues.map((issue) => [issue.lineId, issue])), [issues]);
  const update = (lineId: string, patch: Partial<Issue>) => {
    setIssues((current) => {
      const existing = current.find((issue) => issue.lineId === lineId) || { lineId, notInstalled: false, details: "" };
      return [...current.filter((issue) => issue.lineId !== lineId), { ...existing, ...patch }];
    });
  };

  async function submit() {
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/installer-forms/${encodeURIComponent(form.public_token)}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedRevision: result?.revision ?? form.workflow.revision,
          accepted,
          signerName,
          issues,
          outcome,
          reasonCode,
          notes,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "The installation report could not be submitted.");
      setResult(body);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The installation report could not be submitted.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <section style={card}>
        <h2 style={heading}>Job outcome</h2>
        {form.workflow.updatedAt || result ? (
          <p style={savedBanner}>
            Current saved report: {outcomeLabel(result?.outcome || form.workflow.outcome)}
            {" · "}Revision {result?.revision || form.workflow.revision}
            {result && <><br/>Submitted and saved by the server. Office notification: {result.reportEmail?.sent ? "accepted by email provider; delivery not confirmed" : "not confirmed — report is saved for office review"}.</>}
          </p>
        ) : (
          <p style={muted}>Choose the overall outcome for this installation.</p>
        )}
        <label style={{ display: "grid", gap: 6, fontWeight: 700 }}>
          Status / outcome
          <select
            value={outcome}
            onChange={(event) => setOutcome(event.target.value as InstallerOutcome)}
            style={input}
          >
            <option value="completed">Completed</option>
            <option value="partially_completed">Partially completed</option>
            <option value="incomplete">Incomplete</option>
          </select>
        </label>
        {outcome !== "completed" ? (
          <label style={{ display: "grid", gap: 6, marginTop: 14, fontWeight: 700 }}>
            Primary reason
            <select value={reasonCode} onChange={(event) => setReasonCode(event.target.value)} style={input}>
              <option value="">Choose a reason</option>
              <option value="missing_product">Missing product</option>
              <option value="damaged_product">Damaged product</option>
              <option value="wrong_product">Wrong product</option>
              <option value="fit_or_measurement">Fit or measurement issue</option>
              <option value="site_access">Site access issue</option>
              <option value="customer_request">Customer request</option>
              <option value="other">Other</option>
            </select>
          </label>
        ) : null}
        <label style={{ display: "grid", gap: 6, marginTop: 14, fontWeight: 700 }}>
          Technician notes
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={4}
            style={input}
            placeholder="Describe work completed, remaining work, parts needed, or follow-up instructions."
          />
        </label>
      </section>

      <section style={card}>
        <h2 style={heading}>Installation line items</h2>
        {form.lines.map((line, index) => {
          const issue = byLine.get(line.id);
          const open = Boolean(issue);
          return (
            <article key={line.id} style={lineCard}>
              <div style={{ display: "flex", gap: 12, justifyContent: "space-between", alignItems: "start" }}>
                <div>
                  <strong>{index + 1}. {line.room}</strong>
                  <div>{line.productName}{line.styleName ? ` — ${line.styleName}` : ""}</div>
                  <div style={muted}>Quantity: {line.quantity}</div>
                </div>
                <button type="button" style={issueButton} onClick={() => open ? setIssues((all) => all.filter((item) => item.lineId !== line.id)) : update(line.id, {})}>
                  {open ? "Remove issue" : "□ Report issue"}
                </button>
              </div>
              {line.options.length ? <ul style={{ margin: "10px 0 0", paddingLeft: 20 }}>{line.options.map((option) => <li key={option}>{option}</li>)}</ul> : null}
              {open ? (
                <div style={issuePanel}>
                  <label style={{ display: "flex", gap: 9, alignItems: "center", fontWeight: 750 }}>
                    <input type="checkbox" checked={issue?.notInstalled || false} onChange={(event) => update(line.id, { notInstalled: event.target.checked })} />
                    This line item was not installed
                  </label>
                  <p style={muted}>Check this when the line item still requires product, repair, or a return visit.</p>
                  <label style={{ display: "grid", gap: 6, fontWeight: 700 }}>
                    What is wrong with this line item?
                    <textarea value={issue?.details || ""} onChange={(event) => update(line.id, { details: event.target.value })} rows={4} style={input} />
                  </label>
                </div>
              ) : null}
            </article>
          );
        })}
      </section>

      <section style={card}>
        <h2 style={heading}>Installer sign-off</h2>
        <p>I confirm that the installed items were reviewed with the customer and every exception is reported above.</p>
        <label style={{ display: "grid", gap: 6, fontWeight: 700 }}>
          Installer name
          <input value={signerName} onChange={(event) => setSignerName(event.target.value)} style={input} />
        </label>
        <label style={{ display: "flex", gap: 9, marginTop: 14, alignItems: "start", fontWeight: 700 }}>
          <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} />
          I accept and submit this installation report.
        </label>
      </section>

      <section style={{ ...card, borderWidth: 2 }}>
        {result ? (
          <div style={{ marginBottom: 14 }}>
            <p style={{ color: "#176a3a", fontWeight: 750, margin: 0 }}>
              Installation report saved as {outcomeLabel(result.outcome)}.
            </p>
            <p style={muted}>Revision {result.revision}. You can keep editing and save another update.</p>
          </div>
        ) : null}
        {error ? <p style={{ color: "#a11", fontWeight: 700 }}>{error}</p> : null}
        <button type="button" disabled={saving} onClick={submit} style={submitButton}>
          {saving ? "Saving…" : form.workflow.revision || result ? "Save report update" : "Submit installation report"}
        </button>
      </section>
    </>
  );
}

function outcomeLabel(outcome: InstallerOutcome) {
  if (outcome === "partially_completed") return "partially completed";
  return outcome;
}

const card = { border: "1px solid #b8b6ae", borderRadius: 12, padding: 18, marginBottom: 18, background: "#fff" } as const;
const lineCard = { borderTop: "1px solid #d8d8d2", padding: "16px 0" } as const;
const heading = { margin: "0 0 12px", fontSize: 21 } as const;
const muted = { color: "#555", fontSize: 13, lineHeight: 1.45 } as const;
const savedBanner = { margin: "0 0 14px", borderRadius: 8, padding: 12, background: "#edf7f0", color: "#176a3a", fontWeight: 750 } as const;
const issueButton = { border: "1px solid #111", borderRadius: 7, padding: "9px 11px", background: "#fff", fontWeight: 750, cursor: "pointer" } as const;
const issuePanel = { marginTop: 14, padding: 14, background: "#f4f4f2", borderRadius: 8 } as const;
const input = { boxSizing: "border-box", width: "100%", border: "1px solid #888", borderRadius: 6, padding: 10, font: "inherit" } as const;
const submitButton = { width: "100%", marginTop: 15, border: 0, borderRadius: 8, padding: 14, background: "#111", color: "#fff", fontSize: 16, fontWeight: 800, cursor: "pointer" } as const;
