"use client";

import { useState } from "react";

export function SignQuote({ token, customerName, total, selectedLineIds, done: doneFromParent, onSigned, onBusyChange, onConflict, placement = "bottom", compact = false }: {
  token: string; customerName: string; total: number; selectedLineIds?: string[];
  done?: boolean; onSigned?: () => void; onBusyChange?: (busy: boolean) => void; onConflict?: (message: string) => void; placement?: "top" | "bottom"; compact?: boolean;
}) {
  const [name, setName] = useState(customerName && customerName !== "Valued customer" ? customerName : "");
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [localDone, setLocalDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!name.trim()) {
      setError("Please type your full name to sign.");
      return;
    }
    if (!agree) {
      setError("Please check the authorization box to continue.");
      return;
    }
    if (busy) return;
    setBusy(true);
    onBusyChange?.(true);
    setError(null);
    try {
      const res = await fetch(`/api/quote/${token}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Send the exact total shown on this page so the server can reject the
        // signature if the quote was edited after we rendered it (consent guard).
        // selectedLineIds carries the customer's "Purchase some" subset (if any).
        body: JSON.stringify({ printedName: name.trim(), signature: name.trim(), acknowledgedTotal: total, ...(selectedLineIds ? { selectedLineIds } : {}) }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const message = body.message || body.error || "We couldn't record your signature.";
        if (res.status === 409 && onConflict) {
          onConflict(message);
          return;
        }
        throw new Error(message);
      }
      setLocalDone(true);
      onSigned?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
      onBusyChange?.(false);
    }
  }

  const done = doneFromParent ?? localDone;

  if (done) {
    return (
      <div style={{ background: "#f4f4f2", border: "1px solid #b8b6ae", borderRadius: 10, padding: compact ? 14 : 20, marginTop: compact ? 0 : 20 }}>
        <h3 style={{ margin: "0 0 6px" }}>Your contract is signed.</h3>
        <p style={{ margin: 0 }}>Continue below to make your deposit.</p>
      </div>
    );
  }

  return (
    <div style={compact ? { margin: 0 } : { border: "1px solid #d8d8d2", borderRadius: 10, padding: 20, marginTop: 20 }}>
      {!compact ? (
        <>
          <div style={{ marginBottom: 8, fontSize: 12, fontWeight: 800, letterSpacing: 0.7, textTransform: "uppercase", opacity: 0.65 }}>
            {placement === "top" ? "Start here" : "Ready to proceed?"}
          </div>
          <h3 style={{ marginTop: 0 }}>Review &amp; sign this contract</h3>
        </>
      ) : null}
      <p style={{ margin: compact ? "0 0 10px" : undefined, fontSize: compact ? 13 : 14, lineHeight: 1.45, opacity: 0.8 }}>
        Type your full legal name to electronically sign and approve the total shown on this contract.
      </p>
      {error ? <p style={{ color: "#4d4d49" }}>{error}</p> : null}
      <label style={{ display: "block", marginBottom: compact ? 9 : 12 }}>
        <span style={{ display: "block", fontSize: 13, marginBottom: 4 }}>Full name (your signature)</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Jane Smith"
          style={{ width: "100%", maxWidth: compact ? "none" : 360, boxSizing: "border-box", padding: "10px 12px", fontSize: 16, border: "1px solid #d8d8d2", borderRadius: 8, fontFamily: "cursive" }}
        />
      </label>
      <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: compact ? 12 : 14, lineHeight: 1.4, marginBottom: compact ? 12 : 16 }}>
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} style={{ flex: "0 0 18px", width: 18, height: 18, marginTop: 2 }} />
        <span>I have reviewed my contract and agreed to the details and terms.</span>
      </label>
      <button
        type="button"
        onClick={submit}
        disabled={busy}
        style={{ width: compact ? "100%" : undefined, background: "#0b0b0b", color: "#ffffff", border: "none", borderRadius: 8, padding: "12px 22px", fontSize: 16, cursor: "pointer", opacity: busy ? 0.6 : 1 }}
      >
        {busy ? "Submitting…" : "Sign & approve"}
      </button>
    </div>
  );
}
