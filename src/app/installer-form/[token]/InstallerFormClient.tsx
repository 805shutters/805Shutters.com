"use client";

import { useMemo, useState } from "react";
import type { InstallerFormPublic } from "@/lib/crm/installer-forms";

type Issue = { lineId: string; notInstalled: boolean; details: string };

export function InstallerFormClient({ form }: { form: InstallerFormPublic }) {
  const [issues, setIssues] = useState<Issue[]>(() =>
    form.issues.map((issue) => ({ ...issue })),
  );
  const [signerName, setSignerName] = useState(form.signer_name || "");
  const [accepted, setAccepted] = useState(form.accepted);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<null | { codAdjusted: number; codWithheld: number; status: string }>(null);
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
        body: JSON.stringify({ accepted, signerName, issues }),
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
                  <p style={muted}>When checked, 50% of this line item is withheld from today&apos;s COD and collected after completion.</p>
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
        <div style={muted}>COD to collect before incomplete-item adjustments</div>
        <div style={{ fontSize: 30, fontWeight: 850 }}>${Number(form.cod_original).toFixed(2)}</div>
        {result ? (
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid #c9c7c0" }}>
            <div>Withheld for incomplete items: <strong>${result.codWithheld.toFixed(2)}</strong></div>
            <div style={{ fontSize: 22, marginTop: 5 }}>COD to collect now: <strong>${result.codAdjusted.toFixed(2)}</strong></div>
            <p style={{ color: "#176a3a", fontWeight: 750 }}>Installation report submitted.</p>
          </div>
        ) : null}
        {error ? <p style={{ color: "#a11", fontWeight: 700 }}>{error}</p> : null}
        <button type="button" disabled={saving || Boolean(result)} onClick={submit} style={submitButton}>
          {saving ? "Submitting…" : result ? "Submitted" : "Submit installation report"}
        </button>
      </section>
    </>
  );
}

const card = { border: "1px solid #b8b6ae", borderRadius: 12, padding: 18, marginBottom: 18, background: "#fff" } as const;
const lineCard = { borderTop: "1px solid #d8d8d2", padding: "16px 0" } as const;
const heading = { margin: "0 0 12px", fontSize: 21 } as const;
const muted = { color: "#555", fontSize: 13, lineHeight: 1.45 } as const;
const issueButton = { border: "1px solid #111", borderRadius: 7, padding: "9px 11px", background: "#fff", fontWeight: 750, cursor: "pointer" } as const;
const issuePanel = { marginTop: 14, padding: 14, background: "#f4f4f2", borderRadius: 8 } as const;
const input = { boxSizing: "border-box", width: "100%", border: "1px solid #888", borderRadius: 6, padding: 10, font: "inherit" } as const;
const submitButton = { width: "100%", marginTop: 15, border: 0, borderRadius: 8, padding: 14, background: "#111", color: "#fff", fontSize: 16, fontWeight: 800, cursor: "pointer" } as const;
